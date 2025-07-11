import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
import { BotConfig } from '../types/index.js';

dotenv.config();

export class Config {
  private config: BotConfig = {} as BotConfig;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    const configPath = path.join(process.cwd(), 'config.json');
    
    // Default configuration
    const aiConfig: BotConfig['ai'] = {
      provider: 'grok',
      model: 'grok-3-latest',
      maxTokens: 50,
      temperature: 0.9
    };

    if (process.env.XAI_API_KEY) {
      aiConfig.apiKey = process.env.XAI_API_KEY;
    }

    this.config = {
      ai: aiConfig,
      bot: {
        name: 'Raju',
        conversationHistoryLimit: 20,
        messageDebounceTime: 3000,
        reconnectDelay: 5000
      },
      behaviors: {
        proactive: {
          enabled: true,
          frequency: { min: 30, max: 60 }, // minutes
          chance: 0.3
        },
        checkin: {
          enabled: true,
          inactivityThreshold: { min: 6, max: 12 }, // hours
          chance: 0.3
        },
        timeBasedMessages: {
          enabled: true,
          morning: { start: 8, end: 10, chance: 0.2 },
          evening: { start: 19, end: 21, chance: 0.3 },
          latenight: { start: 23, end: 1, chance: 0.15 }
        }
      },
      personality: {
        moods: ['normal', 'excited', 'tired', 'stressed', 'happy'],
        moodChangeInterval: { min: 2, max: 4 }, // hours
        workingHours: {
          days: [0, 1, 2, 3, 4], // Sunday-Thursday
          start: 9,
          end: 17
        }
      },
      groupChat: {
        enabled: true,
        requireMention: false,
        allowedGroups: [], // Empty array means all groups allowed
        maxGroupSize: 50 // Don't respond in very large groups
      },
      users: {
        "170128033472737": {
          name: "Adam",
          personalityFile: "adam.txt"
        },
        "264763309310001": {
          name: "Gal",
          personalityFile: "gal.txt"
        }
      }
    };

    // Load custom config if exists
    if (fs.existsSync(configPath)) {
      try {
        const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.config = this.mergeDeep(this.config, customConfig);
      } catch (error) {
        console.error('Error loading config.json:', error);
      }
    }
  }

  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    });
    return output;
  }

  public get(path: string): any {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config as any);
  }

  public set(path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config as any);
    target[lastKey] = value;
  }

  public getConfig(): BotConfig {
    return this.config;
  }
} 