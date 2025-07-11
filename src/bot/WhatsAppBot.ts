import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidGroup
} from "baileys";
import fs from "fs";

import { Config } from '../config/Config.js';
import { ConversationManager } from '../conversation/ConversationManager.js';
import { PersonalityManager } from '../personality/PersonalityManager.js';
import { AIProvider } from '../ai/AIProvider.js';
import { BotStateManager } from '../state/BotStateManager.js';
import { BehaviorManager } from '../behaviors/BehaviorManager.js';
import { WASocket, MessageInfo } from '../types/index.js';
import { DebugUtils } from '../utils/debug.js';

export interface BotStats {
  totalMessages: number;
  activeChats: number;
  currentMood: string;
  messagesByUser: Record<string, number>;
  errorCount: number;
  lastActivity: string;
  proactiveStats: {
    enabled: boolean;
    nextProactiveTime: number;
    lastProactiveTime: number;
    proactiveCount: number;
    checkinEnabled: boolean;
    nextCheckinTime: number;
    lastCheckinTime: number;
    checkinCount: number;
  };
}

export class WhatsAppBot {
  private config: Config;
  private conversationManager: ConversationManager;
  private personalityManager: PersonalityManager;
  private aiProvider: AIProvider;
  private botStateManager: BotStateManager;
  private behaviorManager: BehaviorManager;
  private adminServer: any = null; // Will be set from main
  
  private messageTimers: Map<string, NodeJS.Timeout> = new Map();
  private processingLock: Map<string, boolean> = new Map();
  private isReady: boolean = false;
  private sock!: WASocket;
  private allowedGroups: Set<string> = new Set();
  
  // Admin interface stats
  private stats: BotStats = {
    totalMessages: 0,
    activeChats: 0,
    currentMood: 'normal',
    messagesByUser: {},
    errorCount: 0,
    lastActivity: 'Never',
    proactiveStats: {
      enabled: false,
      nextProactiveTime: 0,
      lastProactiveTime: 0,
      proactiveCount: 0,
      checkinEnabled: false,
      nextCheckinTime: 0,
      lastCheckinTime: 0,
      checkinCount: 0
    }
  };

  constructor() {
    this.config = new Config();
    this.conversationManager = new ConversationManager(this.config);
    this.personalityManager = new PersonalityManager(this.config);
    this.aiProvider = new AIProvider(this.config);
    this.botStateManager = new BotStateManager(this.config);
    this.behaviorManager = new BehaviorManager(
      this.config,
      this.conversationManager,
      this.personalityManager,
      this.aiProvider,
      this.botStateManager
    );
  }

  public async start(): Promise<void> {
    console.log('🚀 Starting WhatsApp Bot...');
    
    const { state, saveCreds } = await useMultiFileAuthState("auth");

    this.sock = makeWASocket({
      auth: state,
      browser: ["WhatsApp Bot", "Chrome", "1.0.0"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: false,
      logger: this.createLogger()
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("connection.update", this.handleConnection.bind(this));
    this.sock.ev.on("messages.upsert", this.handleMessages.bind(this));

    // Start periodic state updates
    setInterval(() => this.botStateManager.updateState(), 60000);
    this.botStateManager.updateState();
  }

  private createLogger() {
    return {
      level: 'error',
      child: () => this.createLogger(),
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: (msg: any) => {
        if (typeof msg === 'string' && msg.includes('decryption')) {
          console.log('⚠️  Decryption warning (handled gracefully)');
        }
      },
      error: (msg: any) => {
        if (typeof msg === 'object' && msg.err?.message?.includes('SenderKeyRecord')) {
          console.log('🔐 Encryption key missing for message - this is normal for new group members');
        } else {
          console.error('❌ Baileys error:', msg);
        }
      },
      fatal: (msg: any) => console.error('💀 Fatal error:', msg)
    };
  }

  private handleConnection({ connection, lastDisconnect, qr }: any): void {
    if (qr) {
      console.log("QR Code received, scan with your phone:");
      console.log(qr);
    }
    
    if (connection === "open") {
      console.log("✅ Bot is ready!");
      this.isReady = true;
      this.behaviorManager.startProactiveBehaviors(this.sock);
      this.emitToAdmin('connection', 'Bot connected and ready');
    } else if (connection === "close") {
      this.isReady = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("🔌 Disconnected. Reconnecting?", shouldReconnect);
      this.emitToAdmin('connection', `Bot disconnected. Reconnecting: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        console.log(`⏳ Waiting ${this.config.get('bot.reconnectDelay')}ms before reconnecting...`);
        setTimeout(() => this.start(), this.config.get('bot.reconnectDelay'));
      }
    }
  }

  private async handleMessages({ messages, type }: { messages: MessageInfo[]; type: string }): Promise<void> {
    if (type !== "notify" || !this.isReady) return;

    const msg = messages[0];
    
    // Skip if message couldn't be decrypted
    if (!msg || !msg.message) {
      console.log('📵 Skipping message - could not decrypt or no content');
      return;
    }

    const text = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption;

    if (!text) return;

    const chatId = msg.key.remoteJid;
    const senderId = msg.key.participant || msg.key.remoteJid;
    const senderPhone = senderId.split('@')[0];
    
    // Handle group chats carefully
    if (isJidGroup(chatId)) {
      console.log('👥 Group message detected - handling with caution');
      
      // Check if group chat is enabled
      if (!this.config.get('groupChat.enabled')) {
        console.log('📵 Group chat disabled in config');
        return;
      }
      
      // Check if group is in allowed list (if specified)
      const allowedGroups = this.config.get('groupChat.allowedGroups');
      if (allowedGroups.length > 0 && !allowedGroups.includes(chatId)) {
        console.log('📵 Group not in allowed list');
        return;
      }
      
      // Only respond to direct mentions or specific triggers in groups
      const botName = this.config.get('bot.name').toLowerCase();
      const requireMention = this.config.get('groupChat.requireMention');
      const isDirectMention = text.toLowerCase().includes(`@${botName}`) || 
                             text.toLowerCase().includes(botName);
      
      if (requireMention && !isDirectMention && !text.toLowerCase().includes("hello mate")) {
        console.log('📵 Ignoring group message (not mentioned)');
        return;
      }
      
      // Get group metadata to check size
      try {
        const groupMetadata = await this.sock.groupMetadata(chatId);
        const maxGroupSize = this.config.get('groupChat.maxGroupSize');
        
        if (groupMetadata.participants.length > maxGroupSize) {
          console.log(`📵 Group too large (${groupMetadata.participants.length} > ${maxGroupSize})`);
          return;
        }
      } catch (err) {
        console.log('⚠️  Could not get group metadata, proceeding anyway');
      }
    }
    
    // Get sender name from config
    const users = this.config.get('users');
    const userData = users[senderPhone];
    const senderName = userData ? userData.name : "User";
    
    console.log(`📱 Message from ${senderName} (${senderPhone}): ${text}`);

    // Track active chat
    this.behaviorManager.addActiveChat(chatId);
    
    // Add to conversation history
    this.conversationManager.addMessage(chatId, senderName, text);

    // Update stats
    this.updateStats(chatId, senderName);

    // Emit to admin interface
    this.emitMessageToAdmin(chatId, senderName, text);
    this.emitStatsToAdmin();

    // Handle special triggers
    if (text.toLowerCase().includes("hello mate")) {
      await this.handleImageTrigger(chatId);
      return;
    }

    // Debounce messages
    this.debounceMessage(chatId, senderName);
  }

  private async handleImageTrigger(chatId: string): Promise<void> {
    try {
      await this.behaviorManager.sendTyping(this.sock, chatId, 1000 + Math.random() * 2000);
      
      const imageBuffer = fs.readFileSync("./human.png");
      await this.sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: "Hello mate! 👋"
      });
      
      this.conversationManager.addMessage(chatId, this.config.get('bot.name'), "Hello mate! 👋 [sent image]");
    } catch (err) {
      console.error("Error sending image:", err);
      await this.sock.sendMessage(chatId, {
        text: "❌ Couldn't send the image, mate!"
      });
    }
  }

  private debounceMessage(chatId: string, senderName: string): void {
    // Clear existing timer
    if (this.messageTimers.has(chatId)) {
      clearTimeout(this.messageTimers.get(chatId)!);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.messageTimers.delete(chatId);
      
      if (this.processingLock.get(chatId)) {
        console.log(`⏳ Already processing ${chatId}, skipping...`);
        return;
      }
      
      await this.processMessage(chatId, senderName);
    }, this.config.get('bot.messageDebounceTime'));

    this.messageTimers.set(chatId, timer);
  }

  private async processMessage(chatId: string, senderName: string): Promise<void> {
    this.processingLock.set(chatId, true);
    
    try {
      this.botStateManager.updateLastMessageTime(chatId);
      
      const delay = this.botStateManager.getResponseDelay();
      await this.behaviorManager.sendTyping(this.sock, chatId, delay);

      const mood = this.botStateManager.getMood();
      const prompt = this.personalityManager.getPersonality(senderName, 'reply', mood);
      const context = this.conversationManager.getContext(chatId);
      
      const reply = await this.aiProvider.generateResponse(prompt, context);
      
      this.conversationManager.addMessage(chatId, this.config.get('bot.name'), reply);
      await this.behaviorManager.sendNaturalResponse(this.sock, chatId, reply);
      
    } catch (err) {
      console.error("Error processing message:", err);
      this.incrementErrorCount();
      
      // More graceful error handling
      try {
        await this.sock.sendMessage(chatId, {
          text: "❌ לא הצלחתי לקבל תשובה כרגע"
        });
      } catch (sendErr) {
        console.error("Failed to send error message:", sendErr);
      }
    } finally {
      this.processingLock.delete(chatId);
    }
  }

  // Admin interface methods
  public async sendAdminMessage(chatId: string, message: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('Bot not ready');
    }
    
    try {
      await this.sock.sendMessage(chatId, { text: message });
      this.conversationManager.addMessage(chatId, 'Admin', message);
      this.stats.totalMessages++;
      this.stats.lastActivity = new Date().toISOString();
      this.emitMessageToAdmin(chatId, 'Admin', message);
      this.emitStatsToAdmin();
    } catch (error) {
      this.stats.errorCount++;
      this.emitToAdmin('error', `Failed to send admin message: ${error}`);
      throw error;
    }
  }

  public changeMood(mood: string): void {
    // We'll need to add this method to BotStateManager
    this.botStateManager.setMood(mood);
    this.stats.currentMood = mood;
    console.log(`🎭 Admin changed mood to: ${mood}`);
    this.emitToAdmin('mood_change', `Mood changed to: ${mood}`);
    this.emitStatsToAdmin();
  }

  public getStats(): BotStats {
    // Update stats before returning
    this.stats.currentMood = this.botStateManager.getMood();
    this.stats.activeChats = this.behaviorManager.getActiveChatCount();
    
    // Get proactive stats from behavior manager
    const proactiveStats = this.behaviorManager.getProactiveStats();
    this.stats.proactiveStats = {
      enabled: proactiveStats.enabled,
      nextProactiveTime: proactiveStats.nextProactiveTime,
      lastProactiveTime: proactiveStats.lastProactiveTime,
      proactiveCount: proactiveStats.proactiveCount,
      checkinEnabled: proactiveStats.checkinEnabled,
      nextCheckinTime: proactiveStats.nextCheckinTime,
      lastCheckinTime: proactiveStats.lastCheckinTime,
      checkinCount: proactiveStats.checkinCount
    };
    
    return { ...this.stats };
  }

  public async triggerProactiveMessage(chatId: string, type: string = 'proactive'): Promise<void> {
    if (!this.isReady) {
      throw new Error('Bot not ready');
    }

    try {
      console.log(`🎯 Manual trigger: ${type} message to ${chatId}`);
      
      if (type === 'proactive') {
        await this.behaviorManager.sendProactiveMessage(this.sock, chatId);
      } else if (type === 'checkin') {
        await this.behaviorManager.sendCheckInMessage(this.sock, chatId);
      } else if (['morning', 'evening', 'latenight'].includes(type)) {
        await this.behaviorManager.sendTimeBasedMessage(this.sock, chatId, type as any);
      }
      
      this.emitToAdmin('proactive_trigger', `Manually triggered ${type} message to ${chatId}`);
    } catch (error) {
      console.error(`Error triggering ${type} message:`, error);
      this.incrementErrorCount();
      throw error;
    }
  }

  public toggleProactiveBehavior(type: string, enabled: boolean): void {
    try {
      const currentConfig = this.config.getConfig();
      
      if (type === 'proactive') {
        currentConfig.behaviors.proactive.enabled = enabled;
      } else if (type === 'checkin') {
        currentConfig.behaviors.checkin.enabled = enabled;
      } else if (type === 'timeBasedMessages') {
        currentConfig.behaviors.timeBasedMessages.enabled = enabled;
      }
      
      // Update the config
      this.config.set(`behaviors.${type}.enabled`, enabled);
      
      console.log(`🔄 ${type} behavior ${enabled ? 'enabled' : 'disabled'}`);
      this.emitToAdmin('proactive_toggle', `${type} behavior ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error(`Error toggling ${type} behavior:`, error);
      throw error;
    }
  }

  public updateProactiveConfig(type: string, config: any): void {
    try {
      Object.keys(config).forEach(key => {
        this.config.set(`behaviors.${type}.${key}`, config[key]);
      });
      
      console.log(`⚙️ Updated ${type} config:`, config);
      this.emitToAdmin('proactive_config', `Updated ${type} configuration`);
    } catch (error) {
      console.error(`Error updating ${type} config:`, error);
      throw error;
    }
  }

  public updateStats(_chatId: string, senderName: string): void {
    this.stats.totalMessages++;
    this.stats.messagesByUser[senderName] = (this.stats.messagesByUser[senderName] || 0) + 1;
    this.stats.lastActivity = new Date().toISOString();
  }

  public incrementErrorCount(): void {
    this.stats.errorCount++;
    this.emitToAdmin('error', 'Error count incremented');
    this.emitStatsToAdmin();
  }

  public setAdminServer(adminServer: any): void {
    this.adminServer = adminServer;
  }

  private emitToAdmin(event: string, data: any): void {
    if (this.adminServer) {
      this.adminServer.emitLog('info', `${event}: ${JSON.stringify(data)}`);
    }
  }

  private emitStatsToAdmin(): void {
    if (this.adminServer) {
      this.adminServer.emitStats();
    }
  }

  private emitMessageToAdmin(chatId: string, sender: string, message: string): void {
    if (this.adminServer) {
      this.adminServer.emitMessage(chatId, sender, message);
    }
  }
} 