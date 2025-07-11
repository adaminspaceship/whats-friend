import { Config } from '../config/Config.js';
import { ConversationMessage } from '../types/index.js';

export class ConversationManager {
  private config: Config;
  private conversations: Map<string, ConversationMessage[]> = new Map();
  private historyLimit: number;

  constructor(config: Config) {
    this.config = config;
    this.historyLimit = config.get('bot.conversationHistoryLimit');
  }

  public addMessage(chatId: string, sender: string, message: string): void {
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }

    const history = this.conversations.get(chatId)!;
    history.push({
      sender,
      message,
      timestamp: new Date().toISOString()
    });

    // Keep only recent messages
    if (history.length > this.historyLimit) {
      history.splice(0, history.length - this.historyLimit);
    }

    this.conversations.set(chatId, history);
  }

  public getContext(chatId: string): string {
    const history = this.conversations.get(chatId) || [];
    if (history.length === 0) return "";

    let context = "Recent conversation:\n";
    history.forEach(msg => {
      context += `${msg.sender}: ${msg.message}\n`;
    });
    return context;
  }

  public getLastSender(chatId: string): string {
    const history = this.conversations.get(chatId) || [];
    const botName = this.config.get('bot.name');
    
    // Find the most recent message from a user (not from bot)
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].sender !== botName) {
        return history[i].sender;
      }
    }
    return "User";
  }
} 