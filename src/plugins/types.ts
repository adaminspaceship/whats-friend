export interface PluginContext {
  config: any;
  sendMessage: (chatId: string, message: string) => Promise<void>;
  getConversationHistory: (chatId: string) => string;
  log: (message: string) => void;
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  initialize: (context: PluginContext) => Promise<void>;
  onMessage?: (message: string, chatId: string, context: PluginContext) => Promise<void>;
  onCommand?: (command: string, args: string[], chatId: string, context: PluginContext) => Promise<void>;
  onSchedule?: (context: PluginContext) => Promise<void>;
} 