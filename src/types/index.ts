export interface BotConfig {
  ai: {
    provider: string;
    apiKey?: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  bot: {
    name: string;
    conversationHistoryLimit: number;
    messageDebounceTime: number;
    reconnectDelay: number;
  };
  behaviors: {
    proactive: {
      enabled: boolean;
      frequency: { min: number; max: number };
      chance: number;
    };
    checkin: {
      enabled: boolean;
      inactivityThreshold: { min: number; max: number };
      chance: number;
    };
    timeBasedMessages: {
      enabled: boolean;
      morning: { start: number; end: number; chance: number };
      evening: { start: number; end: number; chance: number };
      latenight: { start: number; end: number; chance: number };
    };
  };
  personality: {
    moods: string[];
    moodChangeInterval: { min: number; max: number };
    workingHours: {
      days: number[];
      start: number;
      end: number;
    };
  };
  groupChat: {
    enabled: boolean;
    requireMention: boolean;
    allowedGroups: string[];
    maxGroupSize: number;
  };
  users: Record<string, UserConfig>;
}

export interface UserConfig {
  name: string;
  personalityFile: string;
}

export interface ConversationMessage {
  sender: string;
  message: string;
  timestamp: string;
}

export interface BotState {
  mood: string;
  lastMessageTime: Map<string, number>;
  dailyInteractions: Map<string, number>;
  personalMemory: Map<string, any>;
  moodChangeTime: number;
  workingHours: boolean;
}

export type MessageType = 'reply' | 'proactive' | 'checkin' | 'morning' | 'evening' | 'latenight';

// Use the actual Baileys WASocket type
export type WASocket = any;

export interface MessageInfo {
  key: {
    remoteJid: string;
    participant?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    imageMessage?: {
      caption?: string;
    };
  };
} 