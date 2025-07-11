import { Config } from '../config/Config.js';
import { ConversationManager } from '../conversation/ConversationManager.js';
import { PersonalityManager } from '../personality/PersonalityManager.js';
import { AIProvider } from '../ai/AIProvider.js';
import { BotStateManager } from '../state/BotStateManager.js';
import { WASocket, MessageType } from '../types/index.js';

export class BehaviorManager {
  private config: Config;
  private conversationManager: ConversationManager;
  private personalityManager: PersonalityManager;
  private aiProvider: AIProvider;
  private botStateManager: BotStateManager;
  private activeChatIds: Set<string> = new Set();
  private proactiveStats = {
    nextProactiveTime: 0,
    lastProactiveTime: 0,
    proactiveCount: 0,
    nextCheckinTime: 0,
    lastCheckinTime: 0,
    checkinCount: 0
  };

  constructor(
    config: Config,
    conversationManager: ConversationManager,
    personalityManager: PersonalityManager,
    aiProvider: AIProvider,
    botStateManager: BotStateManager
  ) {
    this.config = config;
    this.conversationManager = conversationManager;
    this.personalityManager = personalityManager;
    this.aiProvider = aiProvider;
    this.botStateManager = botStateManager;
  }

  public addActiveChat(chatId: string): void {
    this.activeChatIds.add(chatId);
  }

  public getActiveChatCount(): number {
    return this.activeChatIds.size;
  }

  public getActiveChats(): string[] {
    return Array.from(this.activeChatIds);
  }

  public getProactiveStats() {
    return {
      ...this.proactiveStats,
      enabled: this.config.get('behaviors.proactive.enabled'),
      checkinEnabled: this.config.get('behaviors.checkin.enabled')
    };
  }

  public async sendProactiveMessage(sock: WASocket, chatId: string): Promise<void> {
    if (!this.config.get('behaviors.proactive.enabled')) return;

    try {
      const senderName = this.conversationManager.getLastSender(chatId);
      const mood = this.botStateManager.getMood();
      const prompt = this.personalityManager.getPersonality(senderName, 'proactive', mood);
      const context = this.conversationManager.getContext(chatId);
      
      const delay = this.botStateManager.getResponseDelay();
      await this.sendTyping(sock, chatId, delay);

      const message = await this.aiProvider.generateResponse(prompt, context);
      console.log(`🎲 Proactive message to ${senderName}: "${message}"`);

      this.conversationManager.addMessage(chatId, this.config.get('bot.name'), message);
      await this.sendNaturalResponse(sock, chatId, message);
      
      // Update proactive stats
      this.proactiveStats.lastProactiveTime = Date.now();
      this.proactiveStats.proactiveCount++;
    } catch (error) {
      console.error('Error sending proactive message:', error);
    }
  }

  public async sendCheckInMessage(sock: WASocket, chatId: string): Promise<void> {
    if (!this.config.get('behaviors.checkin.enabled')) return;

    try {
      const senderName = this.conversationManager.getLastSender(chatId);
      const mood = this.botStateManager.getMood();
      const prompt = this.personalityManager.getPersonality(senderName, 'checkin', mood);
      const context = this.conversationManager.getContext(chatId);
      
      const delay = this.botStateManager.getResponseDelay();
      await this.sendTyping(sock, chatId, delay);

      const message = await this.aiProvider.generateResponse(prompt, context);
      console.log(`💭 Check-in message to ${senderName}: "${message}"`);

      this.conversationManager.addMessage(chatId, this.config.get('bot.name'), message);
      await this.sendNaturalResponse(sock, chatId, message);
      
      this.botStateManager.updateLastMessageTime(chatId);
      
      // Update checkin stats
      this.proactiveStats.lastCheckinTime = Date.now();
      this.proactiveStats.checkinCount++;
    } catch (error) {
      console.error('Error sending check-in message:', error);
    }
  }

  public async sendTimeBasedMessage(sock: WASocket, chatId: string, messageType: MessageType): Promise<void> {
    if (!this.config.get('behaviors.timeBasedMessages.enabled')) return;

    try {
      const senderName = this.conversationManager.getLastSender(chatId);
      const mood = this.botStateManager.getMood();
      const prompt = this.personalityManager.getPersonality(senderName, messageType, mood);
      const context = this.conversationManager.getContext(chatId);
      
      const delay = this.botStateManager.getResponseDelay();
      await this.sendTyping(sock, chatId, delay);

      const message = await this.aiProvider.generateResponse(prompt, context);
      
      const timeEmoji = messageType === 'morning' ? '🌅' : messageType === 'evening' ? '🌆' : '🌙';
      console.log(`${timeEmoji} ${messageType} message to ${senderName}: "${message}"`);

      this.conversationManager.addMessage(chatId, this.config.get('bot.name'), message);
      await this.sendNaturalResponse(sock, chatId, message);
    } catch (error) {
      console.error('Error sending time-based message:', error);
    }
  }

  public async sendTyping(sock: WASocket, chatId: string, duration: number = 3000): Promise<void> {
    try {
      await sock.sendPresenceUpdate('composing', chatId);
      await new Promise(resolve => setTimeout(resolve, duration));
      await sock.sendPresenceUpdate('paused', chatId);
    } catch (err) {
      console.error("Error sending typing indicator:", err);
    }
  }

  public async sendNaturalResponse(sock: WASocket, chatId: string, text: string): Promise<void> {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    const shouldSplit = sentences.length > 1 && Math.random() < 0.7;

    if (!shouldSplit || sentences.length === 1) {
      await sock.sendMessage(chatId, { text });
      return;
    }

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length > 0) {
        await sock.sendMessage(chatId, { text: sentence });
        
        if (i < sentences.length - 1) {
          await this.sendTyping(sock, chatId, 1000 + Math.random() * 2000);
        }
      }
    }
  }

  public startProactiveBehaviors(sock: WASocket): void {
    // Random conversations
    const proactiveConfig = this.config.get('behaviors.proactive');
    if (proactiveConfig.enabled) {
      const intervalMs = (proactiveConfig.frequency.min + Math.random() * (proactiveConfig.frequency.max - proactiveConfig.frequency.min)) * 60 * 1000;
      
      // Set next proactive time
      this.proactiveStats.nextProactiveTime = Date.now() + intervalMs;
      
      setInterval(async () => {
        if (this.activeChatIds.size === 0) return;
        
        if (Math.random() < proactiveConfig.chance) {
          const randomChatId = Array.from(this.activeChatIds)[Math.floor(Math.random() * this.activeChatIds.size)];
          await this.sendProactiveMessage(sock, randomChatId);
          
          // Set next proactive time
          const nextIntervalMs = (proactiveConfig.frequency.min + Math.random() * (proactiveConfig.frequency.max - proactiveConfig.frequency.min)) * 60 * 1000;
          this.proactiveStats.nextProactiveTime = Date.now() + nextIntervalMs;
        }
      }, intervalMs);
    }

    // Check-in messages
    const checkinConfig = this.config.get('behaviors.checkin');
    if (checkinConfig.enabled) {
      // Set next checkin time (2 hours from now)
      this.proactiveStats.nextCheckinTime = Date.now() + (2 * 60 * 60 * 1000);
      
      setInterval(async () => {
        const state = this.botStateManager.getState();
        for (const [chatId, lastTime] of state.lastMessageTime.entries()) {
          const timeSinceLastMessage = Date.now() - lastTime;
          const hours = timeSinceLastMessage / (1000 * 60 * 60);
          
          if (hours > checkinConfig.inactivityThreshold.min && 
              hours < checkinConfig.inactivityThreshold.max && 
              Math.random() < checkinConfig.chance) {
            await this.sendCheckInMessage(sock, chatId);
            
            // Set next checkin time
            this.proactiveStats.nextCheckinTime = Date.now() + (2 * 60 * 60 * 1000);
          }
        }
      }, 2 * 60 * 60 * 1000); // Every 2 hours
    }

    // Time-based messages
    const timeBasedConfig = this.config.get('behaviors.timeBasedMessages');
    if (timeBasedConfig.enabled) {
      setInterval(async () => {
        const now = new Date();
        const hour = now.getHours();
        const activeChatIds = Array.from(this.activeChatIds);
        
        if (activeChatIds.length === 0) return;
        
        // Morning messages
        if (hour >= timeBasedConfig.morning.start && hour <= timeBasedConfig.morning.end && Math.random() < timeBasedConfig.morning.chance) {
          const randomChatId = activeChatIds[Math.floor(Math.random() * activeChatIds.length)];
          await this.sendTimeBasedMessage(sock, randomChatId, 'morning');
        }
        
        // Evening messages
        if (hour >= timeBasedConfig.evening.start && hour <= timeBasedConfig.evening.end && Math.random() < timeBasedConfig.evening.chance) {
          const randomChatId = activeChatIds[Math.floor(Math.random() * activeChatIds.length)];
          await this.sendTimeBasedMessage(sock, randomChatId, 'evening');
        }
        
        // Late night messages
        if ((hour >= timeBasedConfig.latenight.start || hour <= timeBasedConfig.latenight.end) && Math.random() < timeBasedConfig.latenight.chance) {
          const randomChatId = activeChatIds[Math.floor(Math.random() * activeChatIds.length)];
          await this.sendTimeBasedMessage(sock, randomChatId, 'latenight');
        }
      }, 30 * 60 * 1000); // Every 30 minutes
    }
  }
} 