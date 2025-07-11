# WhatsApp Bot - TypeScript Edition

A modular, configurable WhatsApp bot built with TypeScript, featuring dynamic personalities, extensible behaviors, and a clean architecture.

## Features

- 🎭 **Dynamic Personalities**: User-specific personality files with mood system
- 🤖 **AI Integration**: Grok API for natural conversation
- 🔄 **Proactive Behaviors**: Random conversations, check-ins, time-based messages
- 🧩 **Plugin System**: Extensible architecture for custom features
- ⚙️ **Configurable**: JSON-based configuration with environment variables
- 📝 **TypeScript**: Full type safety and modern development experience

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment**:
```bash
cp .env.example .env
# Edit .env with your XAI_API_KEY
```

3. **Configure the bot**:
```bash
cp config.example.json config.json
# Edit config.json with your settings
```

4. **Run in development**:
```bash
npm run dev
```

5. **Build and run**:
```bash
npm run build
npm start
```

## Railway Deployment

The bot includes a web-based admin interface that can be deployed to Railway alongside the WhatsApp bot.

### Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Environment Variables**: Set up the following in your Railway project:
   - `XAI_API_KEY`: Your Grok API key
   - `PORT`: Automatically set by Railway (usually 3000)
   - `NODE_ENV`: Set to `production`

### Deployment Steps

1. **Connect Repository**: 
   - Connect your GitHub repository to Railway
   - Railway will automatically detect the `railway.json` configuration

2. **Set Environment Variables**:
   ```bash
   # In Railway dashboard, add these variables:
   XAI_API_KEY=your_grok_api_key_here
   NODE_ENV=production
   ```

3. **Deploy**:
   - Railway will automatically build and deploy your bot
   - The admin interface will be available at your Railway app URL

### Admin Interface Access

- **Local Development**: `http://localhost:3000`
- **Railway Deployment**: Your Railway app URL (e.g., `https://your-app.railway.app`)

### Features Available in Production

- ✅ Real-time bot monitoring
- ✅ Message statistics and user activity
- ✅ Mood control and configuration
- ✅ Proactive behavior management
- ✅ Manual message triggering
- ✅ Live message and system logs
- ✅ Health check endpoint (`/health`)

### Monitoring

The deployment includes a health check endpoint at `/health` that returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "botConnected": true,
  "uptime": 12345
}
```

## Project Structure

```
src/
├── types/           # TypeScript type definitions
├── config/          # Configuration management
├── personality/     # Personality system
├── ai/             # AI provider integration
├── conversation/   # Message history management
├── state/          # Bot state management
├── behaviors/      # Proactive behaviors
├── bot/            # Main bot class
├── plugins/        # Plugin system
└── index.ts        # Entry point

personalities/       # Personality files
├── base.txt        # Core personality
├── adam.txt        # Adam-specific details
└── gal.txt         # Gal-specific details

config.json         # Main configuration
```

## Architecture

### Core Components

- **Config**: JSON-based configuration with environment variable support
- **PersonalityManager**: Dynamic personality loading and context injection
- **AIProvider**: Pluggable AI provider system (currently Grok)
- **ConversationManager**: Message history and context management
- **BotStateManager**: Mood system and working hours tracking
- **BehaviorManager**: Proactive messaging and natural response handling
- **WhatsAppBot**: Main orchestrator class

### Configuration

The bot is configured through `config.json`:

```json
{
  "ai": {
    "provider": "grok",
    "model": "grok-3-latest",
    "maxTokens": 50,
    "temperature": 0.9
  },
  "bot": {
    "name": "Raju",
    "conversationHistoryLimit": 20,
    "messageDebounceTime": 3000,
    "reconnectDelay": 5000
  },
  "behaviors": {
    "proactive": {
      "enabled": true,
      "frequency": { "min": 30, "max": 60 },
      "chance": 0.3
    }
  },
  "users": {
    "972501234567": {
      "name": "Adam",
      "personalityFile": "adam.txt"
    }
  }
}
```

### Personality System

Personalities are loaded from text files and combined dynamically:

- `personalities/base.txt` - Core bot personality
- `personalities/adam.txt` - Adam-specific details
- `personalities/gal.txt` - Gal-specific details

### Plugin System

Create plugins by implementing the `Plugin` interface:

```typescript
import { Plugin, PluginContext } from './types.js';

class MyPlugin implements Plugin {
  name = 'My Plugin';
  version = '1.0.0';
  description = 'Does something cool';
  enabled = true;

  async initialize(context: PluginContext): Promise<void> {
    // Setup code
  }

  async onMessage(message: string, chatId: string, context: PluginContext): Promise<void> {
    // Handle incoming messages
  }
}
```

## Development

### TypeScript Commands

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Clean build directory
npm run clean

# Run built version
npm start
```

### Adding Features

1. **New Behavior**: Extend `BehaviorManager` class
2. **New AI Provider**: Implement `AIProvider` interface
3. **New Plugin**: Create class implementing `Plugin` interface
4. **New Config**: Add to `BotConfig` type and `config.json`

### Type Safety

All components are fully typed with TypeScript:

- Configuration objects
- Message structures
- Plugin interfaces
- Bot state management
- AI provider responses

## Environment Variables

```bash
XAI_API_KEY=your_grok_api_key_here
```

## Dependencies

- **baileys**: WhatsApp Web API
- **dotenv**: Environment variable management
- **TypeScript**: Type safety and modern JavaScript features
- **tsx**: TypeScript execution for development

## License

MIT License 