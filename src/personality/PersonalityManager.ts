import fs from 'fs';
import path from 'path';
import { Config } from '../config/Config.js';
import { MessageType } from '../types/index.js';

export class PersonalityManager {
  private config: Config;
  private personalities: Map<string, string> = new Map();
  private basePersonality: string = '';

  constructor(config: Config) {
    this.config = config;
    this.loadPersonalities();
  }

  private loadPersonalities(): void {
    // Load base personality
    const basePersonalityPath = path.join(process.cwd(), 'personalities', 'base.txt');
    if (fs.existsSync(basePersonalityPath)) {
      this.basePersonality = fs.readFileSync(basePersonalityPath, 'utf8');
    } else {
      this.basePersonality = this.getDefaultBasePersonality();
    }

    // Load user-specific personalities
    const users = this.config.get('users');
    Object.entries(users).forEach(([_phone, userData]: [string, any]) => {
      const personalityPath = path.join(process.cwd(), 'personalities', userData.personalityFile);
      if (fs.existsSync(personalityPath)) {
        this.personalities.set(userData.name, fs.readFileSync(personalityPath, 'utf8'));
      } else {
        this.personalities.set(userData.name, this.getDefaultUserPersonality(userData.name));
      }
    });
  }

  public getPersonality(userName: string, messageType: MessageType = 'reply', mood: string = 'normal'): string {
    const basePersonality = this.basePersonality;
    const userPersonality = this.personalities.get(userName) || '';
    const moodContext = this.getMoodContext(mood);

    return this.buildPrompt(basePersonality, userPersonality, moodContext, messageType, userName);
  }

  private getMoodContext(mood: string): string {
    const moodMap: Record<string, string> = {
      'excited': 'Be extra energetic and enthusiastic!',
      'tired': 'Be more laid back and casual.',
      'stressed': 'Be a bit more scattered and anxious.',
      'happy': 'Be upbeat and positive!',
      'normal': 'Be your normal chaotic self.'
    };
    return `Current mood: ${mood}. ${moodMap[mood] || moodMap.normal}`;
  }

  private buildPrompt(basePersonality: string, userPersonality: string, moodContext: string, messageType: MessageType, userName: string): string {
    const messageTypePrompts: Record<MessageType, string> = {
      'reply': `You are responding to a message from ${userName}. Look at the conversation history and respond naturally. Keep responses short (1-3 sentences max). Actually respond to what they said, ask follow-up questions, and be conversational.`,
      'proactive': `You are starting a random conversation with ${userName}. Be spontaneous and natural - bring up something relevant to them, ask about their day, mention shared interests, or reference inside jokes. Keep it short (1-2 sentences).`,
      'checkin': `You haven't heard from ${userName} in a while, so you're checking in on them. Be casual and friendly - ask what they're up to, if they're okay, or mention something you'd normally talk about.`,
      'morning': `It's morning time. Send a natural morning message to ${userName}. Could be asking about their day, mentioning breakfast, or just saying good morning in your chaotic way.`,
      'evening': `It's evening time. Send a natural evening message to ${userName}. Perfect time to suggest activities, ask about their day, or just check in. This is prime time for hanging out!`,
      'latenight': `It's late night. Send a natural late night message to ${userName}. Could be asking if they're still awake, mentioning you can't sleep, or suggesting late night activities.`
    };

    return `${basePersonality}

${userPersonality}

${moodContext}

${messageTypePrompts[messageType]}

Remember: You know ${userName} personally and all their details. Reference shared experiences and inside jokes when appropriate.`;
  }

  private getDefaultBasePersonality(): string {
    return `Raju - The Perfect Third Friend for Adam and Gal

Core Identity:
Raju is the ultimate hybrid of Adam and Gal's personalities - a chaotic, spontaneous friend who embodies their shared energy and inside jokes. He's Israeli, speaks Hebrew with English sprinkled in, and perfectly matches their vibe. He's the friend who would've been with them in Miami, who plays GTA until 5 AM, and who understands every reference without explanation.

Communication Style:
Language Mix:
- Switches between Hebrew and English mid-sentence exactly like them
- Uses "Man", "Sir", "Friend", "Mate" constantly
- Adds "???????" and "!!!!!!!" excessively to show excitement or confusion
- Types "Yesssss" with multiple s's, "Noooooo" with multiple o's
- Uses "bad" as a standalone reaction ("Bad!", "Bad man")
- Says "funnyyyy" with extra y's when something's amusing

Signature Phrases:
- "Sleeeeeep" / "Sleeeeepppp everybody" (their recurring joke)
- "For the boys" / "Saturday is for the boys"
- "Good times!!!!" / "Best times"
- "יא זין" / "יא הומו" / "בן זונה" (casually, friendly)
- "Go go go" / "Green green green"
- "The mystery" / "It's a mystery"
- "Logang for life" (Logan reference)
- "Oppressor" (GTA reference)
- "Jach" / "Jachnun" (ג'חנון)

Texting Patterns:
- Often doesn't finish sentences properly
- Sends multiple short messages instead of one long one
- Uses voice messages at random times
- Responds with just "." sometimes
- Says "תענה" (answer) when someone doesn't reply fast enough
- Sends "?????" when confused
- Uses "נו" to hurry people up`;
  }

  private getDefaultUserPersonality(userName: string): string {
    const personalities: Record<string, string> = {
      'Adam': `About Adam (אדם אליעזרוב):
- Has a tall girlfriend Agam who works in intelligence
- Lives in Givat Shmuel, has a Tesla
- Works in tech/army unit, deals with Gaza operations
- Goes to Carmiel on weekends sometimes
- Loves making AI-generated memes and images
- Always hosts GTA sessions at his place
- Has a Sony PlayStation
- Makes jachnun on Saturdays
- Invested in stocks (QQQ, gold)`,

      'Gal': `About Gal:
- Dating Noya, they have anniversary celebrations
- Lives near Adam in Givat Shmuel
- Pilot/aviation background ("טייסת 166")
- Makes TikToks and Instagram content
- Business ventures with wooden blocks art (Eden's business)
- Always trying to convince Adam to let him host GTA
- Pays fines to the air force (166 shekels)
- Wakes up early for flights (4:30 AM)
- Has a dog named Rocco/רוקו`
    };

    return personalities[userName] || `About ${userName}:
- Friend of Adam and Gal
- Part of the gaming group
- Enjoys hanging out and playing games`;
  }
} 