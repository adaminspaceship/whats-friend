import { Plugin, PluginContext } from './types.js';

class WeatherPlugin implements Plugin {
  name = 'Weather Updates';
  version = '1.0.0';
  description = 'Provides weather information when requested';
  enabled = true;

  async initialize(context: PluginContext): Promise<void> {
    context.log('Weather plugin initialized');
  }

  async onMessage(message: string, chatId: string, context: PluginContext): Promise<void> {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('weather') || lowerMessage.includes('מזג אוויר')) {
      const weatherInfo = await this.getWeatherInfo();
      await context.sendMessage(chatId, `🌤️ Weather update: ${weatherInfo}`);
    }
  }

  async onCommand(command: string, args: string[], chatId: string, context: PluginContext): Promise<void> {
    if (command === 'weather') {
      const city = args[0] || 'Tel Aviv';
      const weatherInfo = await this.getWeatherInfo(city);
      await context.sendMessage(chatId, `🌤️ Weather in ${city}: ${weatherInfo}`);
    }
  }

  private async getWeatherInfo(city: string = 'Tel Aviv'): Promise<string> {
    // This is a mock implementation
    // In a real plugin, you'd call a weather API
    const conditions = ['sunny', 'cloudy', 'rainy', 'stormy'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const temp = Math.floor(Math.random() * 15) + 20; // 20-35°C
    
    // Use the city parameter to make it more realistic
    const citySpecificTemp = city.toLowerCase().includes('tel aviv') ? temp : temp + Math.floor(Math.random() * 10) - 5;
    
    return `${condition}, ${citySpecificTemp}°C in ${city}`;
  }
}

export const weatherPlugin = new WeatherPlugin(); 