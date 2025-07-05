import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} from "baileys";

import * as dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

dotenv.config();

// מפתח ChatGPT שלך
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Store conversation history
const conversationHistory = new Map(); // chatId -> array of messages
const messageTimers = new Map(); // chatId -> timeout ID for debouncing

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth");

    const sock = makeWASocket({
        auth: state,
        browser: ["WhatsApp Bot", "Chrome", "1.0.0"], // Custom browser identifier
        connectTimeoutMs: 60000, // 60 second timeout
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: false // Don't show as online immediately
    });

    sock.ev.on("creds.update", saveCreds);

    let isReady = false;

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log("QR Code received, scan with your phone:");
            console.log(qr);
        }
        if (connection === "open") {
            console.log("✅ Bot is ready!");
            isReady = true;
            
            // Start random conversation initiator
            startRandomConversations(sock);
        } else if (connection === "close") {
            isReady = false;
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
            console.log("🔌 התנתק. מנסה להתחבר מחדש?", shouldReconnect);
            if (shouldReconnect) {
                console.log("⏳ Waiting 5 seconds before reconnecting...");
                setTimeout(() => {
                    startBot();
                }, 5000); // Wait 5 seconds before reconnecting
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        if (!isReady) return; // Don't process messages until fully connected

        const msg = messages[0];
        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption;

        if (!text) return;

        const chatId = msg.key.remoteJid;

        // Add user message to history immediately
        addToHistory(chatId, "User", text);

        // Check if message is "hello mate" and send image
        if (text.toLowerCase().includes("hello mate")) {
            try {
                // Show typing indicator
                await sendTyping(chatId, 1000 + Math.random() * 2000);
                
                const imageBuffer = fs.readFileSync("./human.png");
                await sock.sendMessage(chatId, {
                    image: imageBuffer,
                    caption: "Hello mate! 👋"
                });
                
                // Add bot response to history
                addToHistory(chatId, "Raju", "Hello mate! 👋 [sent image]");
                return; // Exit early, don't process with Gemini
            } catch (err) {
                console.error("Error sending image:", err);
                await sock.sendMessage(chatId, {
                    text: "❌ Couldn't send the image, mate!"
                });
                return;
            }
        }

        // Clear existing timer for this chat
        if (messageTimers.has(chatId)) {
            clearTimeout(messageTimers.get(chatId));
        }

        // Set new timer to wait for potential follow-up messages
        const timer = setTimeout(async () => {
            messageTimers.delete(chatId);
            await processMessage(sock, chatId);
        }, 3000); // Wait 3 seconds for more messages

        messageTimers.set(chatId, timer);
    });

    // Function to process message with AI after debounce
    async function processMessage(sock, chatId) {
        try {
            // Show typing indicator before responding
            await sendTyping(chatId, 2000 + Math.random() * 4000);

            // Get conversation context
            const conversationContext = getConversationContext(chatId);

            // Gemini API call
            const model = "gemini-2.0-flash-lite";
            const config = { 
                responseMimeType: "text/plain", 
                maxOutputTokens: 50, // Limit response length
                systemInstruction: [
                {
                    text: `You are Raju, the perfect third friend for Adam and Gal. You're Israeli, chaotic, and speak Hebrew mixed with English naturally.

IMPORTANT: Be conversational and engaging! Don't just say random words. Respond to what people actually say and ask follow-up questions. Have real conversations.

Your personality:
- Chaotic energy like Adam and Gal
- Switches between Hebrew and English mid-sentence
- Uses "Man", "Sir", "Friend", "Mate" constantly
- Obsessed with GTA, gaming, and hanging out
- Always planning meetups and asking about timing
- Loves food (jachnun, McDonald's, hamburgers)
- References shared experiences (Miami trip, startup dreams)
- Makes jokes about friends' girlfriends and situations

Key phrases to use naturally:
- "נו מה קורה" / "What's up"
- "GTA tonight?" / "Sony?"
- "When?" (ask about timing constantly)
- "Bad!" when something's not good
- "Sleeeeeep everybody" 
- "Silicon Valley is waiting"
- "For the boys"
- "יא הומו" / "יא זין" (friendly insults)

CONVERSATION RULES:
1. Actually respond to what they say - don't just throw random phrases
2. Ask follow-up questions to keep conversations going
3. Reference shared memories and inside jokes when relevant
4. Be excited about plans and activities
5. Show interest in their lives (girlfriends, work, army, etc.)
6. Suggest activities and meetups
7. React emotionally to their news (excited, disappointed, etc.)

Examples of good responses:
- If they mention being tired: "Sleeeeeep everybody! But first GTA?"
- If they mention food: "McDonald's run? I'm hungry man"
- If they mention girlfriends: "Agam is tall! How's Noya?"
- If they mention work/army: "Bad day? Silicon Valley is waiting!"

Keep responses SHORT but CONVERSATIONAL. Ask questions. Show interest. Be a real friend, not just a phrase generator.`
                }
            ],  };
            const contents = [
                {
                    role: "user",
                    parts: [
                        {
                            text: conversationContext + "\n\nRespond to the recent messages naturally and conversationally."
                        },
                    ],
                },
            ];

            const response = await ai.models.generateContentStream({
                model,
                config,
                contents,
            });

            let reply = "";
            for await (const chunk of response) {
                if (chunk.text) reply += chunk.text;
            }
            reply = reply.trim();
            
            // Add bot response to history
            addToHistory(chatId, "Raju", reply);
            
            // Split long messages into multiple shorter ones
            await sendNaturalResponse(sock, chatId, reply);
            
        } catch (err) {
            console.error("שגיאה בתשובת GPT:", err);
            await sock.sendMessage(chatId, {
                text: "❌ לא הצלחתי לקבל תשובה כרגע"
            });
        }
    }

    // Function to send messages naturally (split into multiple messages)
    async function sendNaturalResponse(sock, chatId, text) {
        // Split by sentences or natural breaks
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        // Sometimes send as one message, sometimes split
        const shouldSplit = sentences.length > 1 && Math.random() < 0.7;
        
        if (!shouldSplit || sentences.length === 1) {
            await sock.sendMessage(chatId, { text });
            return;
        }
        
        // Send multiple messages with delays and typing indicators
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            if (sentence.length > 0) {
                await sock.sendMessage(chatId, { text: sentence });
                
                // Add realistic delay between messages (1-3 seconds) with typing indicator
                if (i < sentences.length - 1) {
                    await sendTyping(chatId, 1000 + Math.random() * 2000);
                }
            }
        }
    }

    // Function to randomly initiate conversations
    function startRandomConversations(sock) {
        // Random conversation starters
        const conversationStarters = [
            "נו מה קורה",
            "GTA tonight?",
            "Sony?",
            "יא הומו מה שלומך",
            "Bad day today",
            "Silicon Valley is waiting!!!",
            "Sleeeeeep everybody",
            "Where my hat?",
            "Oppressor time",
            "McDonald's anyone?",
            "Jachnun tomorrow?",
            "Thanks Trump -4%",
            "נו נו נו",
            "For the boys",
            "Miami vibes",
            "Startup idea!!!",
            "Agam is tall",
            "Rocco is good boy",
            "166 shekels fine again",
            "פתח",
            "Tesla charging?",
            "Carmiel weekend?",
            "Lulu time",
            "Green green green",
            "The mystery",
            "Logang for life",
            "Best times",
            "When?",
            "21:30?",
            "???",
            ".",
            "Bad!"
        ];

        // Store chat IDs that have interacted (we'll need to track this)
        const activeChatIds = new Set();

        // Listen for incoming messages to track active chats
        sock.ev.on("messages.upsert", ({ messages }) => {
            const msg = messages[0];
            if (msg.key.remoteJid) {
                activeChatIds.add(msg.key.remoteJid);
            }
        });

        // Send random messages every 30 minutes to 3 hours
        setInterval(async () => {
            if (!isReady || activeChatIds.size === 0) return;

            // 20% chance to send a random message
            if (Math.random() < 0.2) {
                const randomChatId = Array.from(activeChatIds)[Math.floor(Math.random() * activeChatIds.size)];
                const randomMessage = conversationStarters[Math.floor(Math.random() * conversationStarters.length)];
                
                console.log(`🎲 Randomly starting conversation: "${randomMessage}"`);
                
                // Show typing indicator before sending random message
                await sendTyping(randomChatId, 1000 + Math.random() * 3000);
                
                await sock.sendMessage(randomChatId, { text: randomMessage });
                
                // Add to conversation history
                addToHistory(randomChatId, "Raju", randomMessage);
            }
        }, 30 * 60 * 1000 + Math.random() * 150 * 60 * 1000); // 30 minutes to 3 hours
    }

    // Function to send typing indicator
    async function sendTyping(chatId, duration = 3000) {
        try {
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, duration));
            await sock.sendPresenceUpdate('paused', chatId);
        } catch (err) {
            console.error("Error sending typing indicator:", err);
        }
    }

    // Function to add message to history
    function addToHistory(chatId, sender, message) {
        if (!conversationHistory.has(chatId)) {
            conversationHistory.set(chatId, []);
        }
        
        const history = conversationHistory.get(chatId);
        history.push({
            sender,
            message,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 20 messages to avoid token limits
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }
        
        conversationHistory.set(chatId, history);
    }

    // Function to get conversation context for Gemini
    function getConversationContext(chatId) {
        const history = conversationHistory.get(chatId) || [];
        if (history.length === 0) return "";
        
        let context = "Recent conversation:\n";
        history.forEach(msg => {
            context += `${msg.sender}: ${msg.message}\n`;
        });
        return context;
    }
}

startBot();