import { Config } from '../config/Config.js';
import { BotState } from '../types/index.js';

export class BotStateManager {
  private state: BotState;
  private moods: string[];
  private moodChangeInterval: { min: number; max: number };
  private workingHoursConfig: { days: number[]; start: number; end: number };

  constructor(config: Config) {
    this.state = {
      mood: 'normal',
      lastMessageTime: new Map(),
      dailyInteractions: new Map(),
      personalMemory: new Map(),
      moodChangeTime: Date.now(),
      workingHours: false
    };
    
    this.moods = config.get('personality.moods');
    this.moodChangeInterval = config.get('personality.moodChangeInterval');
    this.workingHoursConfig = config.get('personality.workingHours');
  }

  public updateState(): void {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Update working hours
    this.state.workingHours = 
      this.workingHoursConfig.days.includes(dayOfWeek) && 
      hour >= this.workingHoursConfig.start && 
      hour <= this.workingHoursConfig.end;

    // Change mood periodically
    const moodChangeMs = (this.moodChangeInterval.min + Math.random() * (this.moodChangeInterval.max - this.moodChangeInterval.min)) * 60 * 60 * 1000;
    
    if (Date.now() - this.state.moodChangeTime > moodChangeMs) {
      this.state.mood = this.moods[Math.floor(Math.random() * this.moods.length)];
      this.state.moodChangeTime = Date.now();
      console.log(`🎭 Mood changed to: ${this.state.mood}`);
    }
  }

  public getMood(): string {
    return this.state.mood;
  }

  public setMood(mood: string): void {
    if (this.moods.includes(mood)) {
      this.state.mood = mood;
      this.state.moodChangeTime = Date.now();
      console.log(`🎭 Mood manually set to: ${mood}`);
    } else {
      console.warn(`⚠️  Invalid mood: ${mood}. Valid moods: ${this.moods.join(', ')}`);
    }
  }

  public updateLastMessageTime(chatId: string): void {
    this.state.lastMessageTime.set(chatId, Date.now());
  }

  public getLastMessageTime(chatId: string): number {
    return this.state.lastMessageTime.get(chatId) || 0;
  }

  public getResponseDelay(): number {
    let baseDelay = 2000;
    if (this.state.mood === 'tired') baseDelay = 8000;
    if (this.state.mood === 'excited') baseDelay = 1000;
    return baseDelay + Math.random() * 4000;
  }

  public getState(): BotState {
    return this.state;
  }
} 