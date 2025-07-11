import { Config } from '../config/Config.js';

export class AIProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: Config) {
    this.apiKey = config.get('ai.apiKey');
    this.model = config.get('ai.model');
    this.maxTokens = config.get('ai.maxTokens');
    this.temperature = config.get('ai.temperature');
  }

  public async generateResponse(prompt: string, conversationContext: string = ''): Promise<string> {
    const fullPrompt = conversationContext ? `${prompt}\n\nCurrent conversation context:\n${conversationContext}` : prompt;

    try {
      console.log(`🤖 Generating response with ${this.model} (max tokens: ${this.maxTokens})`);
      
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: fullPrompt
            }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error (${response.status}):`, errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      const generatedResponse = data.choices[0].message.content.trim();
      
      console.log(`✅ Generated response (${generatedResponse.length} chars): "${generatedResponse.substring(0, 100)}${generatedResponse.length > 100 ? '...' : ''}"`);
      
      if (!generatedResponse || generatedResponse.length === 0) {
        console.warn('⚠️  Empty response from AI model, using fallback');
        return "יא אחי מה קורה? 🤔";
      }
      
      return generatedResponse;
    } catch (error) {
      console.error('AI Provider Error:', error);
      return "יא אחי מה קורה? 🤔";
    }
  }
} 