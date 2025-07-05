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
const processingLock = new Map(); // chatId -> boolean to prevent double processing

// Human-like behavior state
const botState = {
    mood: 'normal', // normal, excited, tired, stressed, happy
    currentActivity: null, // gaming, eating, working, driving, sleeping
    activityEndTime: null,
    lastMessageTime: new Map(), // chatId -> timestamp
    dailyInteractions: new Map(), // chatId -> count
    personalMemory: new Map(), // chatId -> personal details
    moodChangeTime: Date.now(),
    workingHours: false
};

// Update bot state based on time and random events
function updateBotState() {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Update working hours (Sunday-Thursday 9-17 in Israel)
    botState.workingHours = (dayOfWeek >= 0 && dayOfWeek <= 4) && (hour >= 9 && hour <= 17);
    
    // Change mood every 2-4 hours
    if (Date.now() - botState.moodChangeTime > (2 + Math.random() * 2) * 60 * 60 * 1000) {
        const moods = ['normal', 'excited', 'tired', 'stressed', 'happy'];
        botState.mood = moods[Math.floor(Math.random() * moods.length)];
        botState.moodChangeTime = Date.now();
        console.log(`🎭 Mood changed to: ${botState.mood}`);
    }
    
    // Random activities
    if (!botState.currentActivity && Math.random() < 0.1) {
        const activities = ['gaming', 'eating', 'working', 'driving'];
        const durations = [30, 10, 60, 15]; // minutes
        const activity = activities[Math.floor(Math.random() * activities.length)];
        const duration = durations[activities.indexOf(activity)];
        
        botState.currentActivity = activity;
        botState.activityEndTime = Date.now() + duration * 60 * 1000;
        console.log(`🎮 Started activity: ${activity} for ${duration} minutes`);
    }
    
    // End current activity
    if (botState.currentActivity && Date.now() > botState.activityEndTime) {
        console.log(`✅ Finished activity: ${botState.currentActivity}`);
        botState.currentActivity = null;
        botState.activityEndTime = null;
    }
}

// Generate AI response based on context and bot state
async function generateAIResponse(chatId, conversationContext, messageType = 'reply') {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    // Full Raju personality context for all prompts
    const basePersonality = `You are Raju, the perfect third friend for Adam and Gal. You're Israeli, chaotic, and speak Hebrew mixed with English naturally.

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

Keep responses SHORT but CONVERSATIONAL. Ask questions. Show interest. Be a real friend, not just a phrase generator.`;
    
    // Build context for AI based on message type
    let contextPrompt = `${basePersonality}

Current state:
- Mood: ${botState.mood}
- Time: ${hour}:${now.getMinutes().toString().padStart(2, '0')} (${dayOfWeek === 5 ? 'Friday' : dayOfWeek === 6 ? 'Saturday' : 'Weekday'})
- Activity: ${botState.currentActivity || 'free'}
- Working hours: ${botState.workingHours ? 'yes' : 'no'}

Conversation context:
${conversationContext}

Mix Hebrew and English naturally. Keep responses SHORT and conversational.`;

    // Add specific instructions based on message type
    switch (messageType) {
        case 'reply':
            contextPrompt += `\n\nRespond naturally based on your current mood and situation:
- If tired: shorter responses, mention being sleepy
- If excited: more energetic, suggest activities  
- If stressed: mention work/army problems
- If gaming: reference what you're playing
- If eating: mention food
- If working: be less available, mention being busy
- If driving: keep it short, mention traffic
Be conversational and ask follow-up questions.`;
            break;
            
        case 'proactive':
            contextPrompt += `\n\nGenerate a spontaneous message to start conversation. Consider:
- Time of day and what friends might be doing
- Your current mood and activity
- Shared interests (GTA, food, girlfriends, work)
- Inside jokes and references
Examples: "נו מה קורה", "GTA tonight?", "How's Agam?", "Silicon Valley is waiting"`;
            break;
            
        case 'busy':
            contextPrompt += `\n\nYou're currently ${botState.currentActivity}. Generate a brief message explaining you're busy but in a friendly way.
Examples: "In GTA rn", "Eating jachnun", "Tesla driving", "Work stuff"`;
            break;
            
        case 'checkin':
            contextPrompt += `\n\nYou haven't talked in a while. Generate a friendly check-in message.
Examples: "Haven't heard from you", "All good?", "What's up lately?", "Missing our GTA sessions"`;
            break;
            
        case 'morning':
            contextPrompt += `\n\nIt's morning (8-10 AM). Generate a morning greeting or question.
Examples: "Good morning mate", "Coffee time?", "Ready for today?", "Jachnun breakfast?"`;
            break;
            
        case 'evening':
            contextPrompt += `\n\nIt's evening (7-9 PM). Generate an evening message about plans or activities.
Examples: "Evening plans?", "GTA tonight?", "Dinner time", "How was today?"`;
            break;
            
        case 'latenight':
            contextPrompt += `\n\nIt's late night (11 PM - 1 AM). Generate a late night message.
Examples: "Why you awake?", "Sleeeeeep everybody", "Late night gaming?", "Can't sleep?"`;
            break;
    }

    const model = "gemini-2.0-flash-lite";
    const config = { 
        responseMimeType: "text/plain", 
        maxOutputTokens: messageType === 'reply' ? 60 : 30,
        systemInstruction: [{ text: contextPrompt }]
    };
    
    const contents = [{
        role: "user",
        parts: [{ text: `Generate a ${messageType} message` }]
    }];

    const response = await ai.models.generateContentStream({
        model,
        config,
        contents,
    });

    let reply = "";
    for await (const chunk of response) {
        if (chunk.text) reply += chunk.text;
    }
    return reply.trim();
}

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
            
            // Start state updater
            setInterval(updateBotState, 60000); // Update every minute
            updateBotState(); // Initial update
            
            // Start proactive behaviors
            startProactiveBehaviors(sock);
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
            
            // Check if already processing this chat
            if (processingLock.get(chatId)) {
                console.log(`⏳ Already processing ${chatId}, skipping...`);
                return;
            }
            
            await processMessage(sock, chatId);
        }, 3000); // Wait 3 seconds for more messages

        messageTimers.set(chatId, timer);
    });

    // Function to process message with AI after debounce
    async function processMessage(sock, chatId) {
        // Set processing lock
        processingLock.set(chatId, true);
        
        try {
            // Update last message time
            botState.lastMessageTime.set(chatId, Date.now());
            
            // Check if bot is busy with activity
            if (botState.currentActivity) {
                const busyResponses = {
                    gaming: "In GTA rn, give me few mins",
                    eating: "Eating jachnun, hold on",
                    working: "Busy with work stuff, talk later?",
                    driving: "Driving Tesla, can't text much"
                };
                
                // 70% chance to send busy message
                if (Math.random() < 0.7) {
                    await sendTyping(chatId, 1000 + Math.random() * 2000);
                    const busyMessage = await generateAIResponse(chatId, getConversationContext(chatId), 'busy') || 
                                       busyResponses[botState.currentActivity];
                    await sock.sendMessage(chatId, { text: busyMessage });
                    addToHistory(chatId, "Raju", busyMessage);
                    return;
                }
            }
            
            // Smart delay based on activity and mood
            let baseDelay = 2000;
            if (botState.currentActivity === 'gaming') baseDelay = 5000;
            if (botState.currentActivity === 'working') baseDelay = 10000;
            if (botState.mood === 'tired') baseDelay = 8000;
            if (botState.mood === 'excited') baseDelay = 1000;
            
            const delay = baseDelay + Math.random() * 4000;
            await sendTyping(chatId, delay);

            // Get conversation context
            const conversationContext = getConversationContext(chatId);

            // Generate AI response using new system
            const reply = await generateAIResponse(chatId, conversationContext, 'reply');
            
            // Add bot response to history
            addToHistory(chatId, "Raju", reply);
            
            // Split long messages into multiple shorter ones
            await sendNaturalResponse(sock, chatId, reply);
            
        } catch (err) {
            console.error("שגיאה בתשובת GPT:", err);
            await sock.sendMessage(chatId, {
                text: "❌ לא הצלחתי לקבל תשובה כרגע"
            });
        } finally {
            // Always release the lock
            processingLock.delete(chatId);
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
        // Store chat IDs that have interacted (we'll need to track this)
        const activeChatIds = new Set();

        // Listen for incoming messages to track active chats
        sock.ev.on("messages.upsert", ({ messages }) => {
            const msg = messages[0];
            if (msg.key.remoteJid) {
                activeChatIds.add(msg.key.remoteJid);
            }
        });

        // Send random messages more frequently
        setInterval(async () => {
            if (!isReady || activeChatIds.size === 0) return;

            // 60% chance to send a random message
            if (Math.random() < 0.6) {
                const randomChatId = Array.from(activeChatIds)[Math.floor(Math.random() * activeChatIds.size)];
                
                try {
                    // Generate AI conversation starter
                    const randomMessage = await generateAIResponse(randomChatId, getConversationContext(randomChatId), 'proactive');
                    
                    console.log(`🎲 AI-generated random message: "${randomMessage}"`);
                    
                    // Show typing indicator before sending random message
                    await sendTyping(randomChatId, 1000 + Math.random() * 3000);
                    
                    await sock.sendMessage(randomChatId, { text: randomMessage });
                    
                    // Add to conversation history
                    addToHistory(randomChatId, "Raju", randomMessage);
                    
                } catch (err) {
                    console.error("Error generating random message:", err);
                    // Fallback to a simple message if AI fails
                    const fallbackMessages = ["נו מה קורה", "GTA tonight?", "Sony?", "When?", "Bad day"];
                    const fallbackMessage = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
                    
                    await sendTyping(randomChatId, 1000 + Math.random() * 3000);
                    await sock.sendMessage(randomChatId, { text: fallbackMessage });
                    addToHistory(randomChatId, "Raju", fallbackMessage);
                }
            }
        }, 5 * 60 * 1000 + Math.random() * 15 * 60 * 1000); // 5 to 20 minutes
    }

    // Advanced proactive behaviors
    function startProactiveBehaviors(sock) {
        // Check for inactive conversations every 2 hours
        setInterval(async () => {
            if (!isReady) return;
            
            for (const [chatId, lastTime] of botState.lastMessageTime.entries()) {
                const timeSinceLastMessage = Date.now() - lastTime;
                const hours = timeSinceLastMessage / (1000 * 60 * 60);
                
                // If no conversation for 6-12 hours, send check-in message
                if (hours > 6 && hours < 12 && Math.random() < 0.3) {
                    try {
                        const checkInMessage = await generateAIResponse(chatId, getConversationContext(chatId), 'checkin');
                        console.log(`💭 Checking in on inactive chat: "${checkInMessage}"`);
                        
                        await sendTyping(chatId, 2000 + Math.random() * 3000);
                        await sock.sendMessage(chatId, { text: checkInMessage });
                        addToHistory(chatId, "Raju", checkInMessage);
                        
                        // Update last message time
                        botState.lastMessageTime.set(chatId, Date.now());
                    } catch (err) {
                        console.error("Error sending check-in message:", err);
                    }
                }
            }
        }, 2 * 60 * 60 * 1000); // Every 2 hours
        
        // Send time-based messages
        setInterval(async () => {
            if (!isReady) return;
            
            const now = new Date();
            const hour = now.getHours();
            const activeChatIds = Array.from(botState.lastMessageTime.keys());
            
            if (activeChatIds.length === 0) return;
            
            // Morning messages (8-10 AM)
            if (hour >= 8 && hour <= 10 && Math.random() < 0.2) {
                const randomChatId = activeChatIds[Math.floor(Math.random() * activeChatIds.length)];
                try {
                    const morningMessage = await generateAIResponse(randomChatId, getConversationContext(randomChatId), 'morning');
                    console.log(`🌅 Morning message: "${morningMessage}"`);
                    
                    await sendTyping(randomChatId, 1000 + Math.random() * 2000);
                    await sock.sendMessage(randomChatId, { text: morningMessage });
                    addToHistory(randomChatId, "Raju", morningMessage);
                } catch (err) {
                    console.error("Error sending morning message:", err);
                }
            }
            
            // Evening messages (19-21 PM)
            if (hour >= 19 && hour <= 21 && Math.random() < 0.3) {
                const randomChatId = activeChatIds[Math.floor(Math.random() * activeChatIds.length)];
                try {
                    const eveningMessage = await generateAIResponse(randomChatId, getConversationContext(randomChatId), 'evening');
                    console.log(`🌆 Evening message: "${eveningMessage}"`);
                    
                    await sendTyping(randomChatId, 1000 + Math.random() * 2000);
                    await sock.sendMessage(randomChatId, { text: eveningMessage });
                    addToHistory(randomChatId, "Raju", eveningMessage);
                } catch (err) {
                    console.error("Error sending evening message:", err);
                }
            }
            
            // Late night messages (23-1 AM)
            if ((hour >= 23 || hour <= 1) && Math.random() < 0.15) {
                const randomChatId = activeChatIds[Math.floor(Math.random() * activeChatIds.length)];
                try {
                    const lateNightMessage = await generateAIResponse(randomChatId, getConversationContext(randomChatId), 'latenight');
                    console.log(`🌙 Late night message: "${lateNightMessage}"`);
                    
                    await sendTyping(randomChatId, 1000 + Math.random() * 2000);
                    await sock.sendMessage(randomChatId, { text: lateNightMessage });
                    addToHistory(randomChatId, "Raju", lateNightMessage);
                } catch (err) {
                    console.error("Error sending late night message:", err);
                }
            }
        }, 30 * 60 * 1000); // Every 30 minutes
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