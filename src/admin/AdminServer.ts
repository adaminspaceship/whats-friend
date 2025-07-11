import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Config } from '../config/Config.js';
import { WhatsAppBot } from '../bot/WhatsAppBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AdminStats {
  totalMessages: number;
  activeChats: number;
  currentMood: string;
  uptime: number;
  lastActivity: string;
  messagesByUser: Record<string, number>;
  errorCount: number;
  proactiveStats: {
    enabled: boolean;
    nextProactiveTime: number;
    lastProactiveTime: number;
    proactiveCount: number;
    checkinEnabled: boolean;
    nextCheckinTime: number;
    lastCheckinTime: number;
    checkinCount: number;
  };
}

export class AdminServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private config: Config;
  private bot: WhatsAppBot | null = null;
  private stats: AdminStats;
  private startTime: number;

  constructor(config: Config) {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    this.startTime = Date.now();
    this.stats = {
      totalMessages: 0,
      activeChats: 0,
      currentMood: 'normal',
      uptime: 0,
      lastActivity: 'Never',
      messagesByUser: {},
      errorCount: 0,
      proactiveStats: {
        enabled: false,
        nextProactiveTime: 0,
        lastProactiveTime: 0,
        proactiveCount: 0,
        checkinEnabled: false,
        nextCheckinTime: 0,
        lastCheckinTime: 0,
        checkinCount: 0
      }
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../admin/public')));
  }

  private setupRoutes(): void {
    // Health check endpoint for Railway
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        botConnected: this.bot !== null,
        uptime: Date.now() - this.startTime
      });
    });

    // Serve the admin interface
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../admin/public/index.html'));
    });

    // API endpoints
    this.app.get('/api/stats', (req: Request, res: Response) => {
      this.updateStats();
      res.json(this.stats);
    });

    this.app.get('/api/config', (req: Request, res: Response) => {
      res.json(this.config.getConfig());
    });

    this.app.post('/api/config', (req: Request, res: Response) => {
      try {
        const updates = req.body;
        Object.keys(updates).forEach(key => {
          this.config.set(key, updates[key]);
        });
        res.json({ success: true });
        this.io.emit('configUpdated', updates);
      } catch (error) {
        res.status(500).json({ error: 'Failed to update config' });
      }
    });

    this.app.post('/api/send-message', (req: Request, res: Response) => {
      try {
        const { chatId, message } = req.body;
        if (this.bot) {
          // We'll implement this method in the bot
          this.bot.sendAdminMessage(chatId, message);
          res.json({ success: true });
        } else {
          res.status(503).json({ error: 'Bot not connected' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
      }
    });

    this.app.post('/api/change-mood', (req: Request, res: Response) => {
      try {
        const { mood } = req.body;
        if (this.bot) {
          this.bot.changeMood(mood);
          res.json({ success: true });
          this.io.emit('moodChanged', mood);
        } else {
          res.status(503).json({ error: 'Bot not connected' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to change mood' });
      }
    });

    this.app.get('/api/logs', (req: Request, res: Response) => {
      // Return recent logs (we'll implement log storage)
      res.json({ logs: [] });
    });

    // Proactive behavior controls
    this.app.post('/api/proactive/trigger', (req: Request, res: Response) => {
      try {
        const { chatId, type } = req.body;
        if (this.bot) {
          this.bot.triggerProactiveMessage(chatId, type || 'proactive');
          res.json({ success: true });
          this.io.emit('proactiveTriggered', { chatId, type });
        } else {
          res.status(503).json({ error: 'Bot not connected' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger proactive message' });
      }
    });

    this.app.post('/api/proactive/toggle', (req: Request, res: Response) => {
      try {
        const { enabled, type } = req.body;
        if (this.bot) {
          this.bot.toggleProactiveBehavior(type, enabled);
          res.json({ success: true });
          this.io.emit('proactiveToggled', { type, enabled });
        } else {
          res.status(503).json({ error: 'Bot not connected' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to toggle proactive behavior' });
      }
    });

    this.app.post('/api/proactive/config', (req: Request, res: Response) => {
      try {
        const { type, config } = req.body;
        if (this.bot) {
          this.bot.updateProactiveConfig(type, config);
          res.json({ success: true });
          this.io.emit('proactiveConfigUpdated', { type, config });
        } else {
          res.status(503).json({ error: 'Bot not connected' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to update proactive config' });
      }
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('🌐 Admin client connected');
      
      // Send initial data
      this.updateStats();
      socket.emit('stats', this.stats);
      socket.emit('config', this.config.getConfig());

      socket.on('disconnect', () => {
        console.log('🌐 Admin client disconnected');
      });

      socket.on('requestStats', () => {
        this.updateStats();
        socket.emit('stats', this.stats);
      });
    });
  }

  private updateStats(): void {
    this.stats.uptime = Date.now() - this.startTime;
    if (this.bot) {
      const botStats = this.bot.getStats();
      this.stats.totalMessages = botStats.totalMessages;
      this.stats.activeChats = botStats.activeChats;
      this.stats.currentMood = botStats.currentMood;
      this.stats.messagesByUser = botStats.messagesByUser;
      this.stats.errorCount = botStats.errorCount;
      this.stats.lastActivity = botStats.lastActivity;
    }
  }

  public setBotInstance(bot: WhatsAppBot): void {
    this.bot = bot;
  }

  public emitLog(level: string, message: string, data?: any): void {
    this.io.emit('log', {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    });
  }

  public emitMessage(chatId: string, sender: string, message: string): void {
    this.io.emit('message', {
      timestamp: new Date().toISOString(),
      chatId,
      sender,
      message
    });
  }

  public emitStats(): void {
    this.updateStats();
    this.io.emit('stats', this.stats);
  }

  public start(port: number = 3000): void {
    const serverPort = process.env.PORT ? parseInt(process.env.PORT) : port;
    this.server.listen(serverPort, '0.0.0.0', () => {
      console.log(`🌐 Admin interface available at http://localhost:${serverPort}`);
      if (process.env.RAILWAY_ENVIRONMENT) {
        console.log(`🚀 Railway deployment: Admin interface available at your Railway app URL`);
      }
    });
  }
} 