import { WhatsAppBot } from './bot/WhatsAppBot.js';
import { AdminServer } from './admin/AdminServer.js';
import { Config } from './config/Config.js';

async function main() {
  try {
    console.log('🚀 Starting WhatsApp Bot with Admin Interface...');
    
    // Create config instance
    const config = new Config();
    
    // Get port from environment or use default
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    
    // Create and start admin server
    const adminServer = new AdminServer(config);
    adminServer.start(port);
    
    // Create bot instance
    const bot = new WhatsAppBot();
    
    // Connect admin server to bot (bidirectional)
    adminServer.setBotInstance(bot);
    bot.setAdminServer(adminServer);
    
    // Start the bot
    await bot.start();
    
    console.log('✅ Bot and Admin Interface started successfully!');
    
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log('🚀 Railway deployment detected');
      console.log('🌐 Admin Panel: Available at your Railway app URL');
    } else {
      console.log(`🌐 Admin Panel: http://localhost:${port}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main(); 