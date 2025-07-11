export class DebugUtils {
  static logMessageInfo(msg: any): void {
    console.log('🔍 Message Debug Info:');
    console.log('  - RemoteJid:', msg.key?.remoteJid);
    console.log('  - Participant:', msg.key?.participant);
    console.log('  - ID:', msg.key?.id);
    console.log('  - FromMe:', msg.key?.fromMe);
    console.log('  - Has Message:', !!msg.message);
    console.log('  - Message Type:', this.getMessageType(msg.message));
  }

  static getMessageType(message: any): string {
    if (!message) return 'none';
    
    const types = Object.keys(message);
    return types.join(', ') || 'unknown';
  }

  static isEncryptionError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || error.toString();
    return errorMessage.includes('SenderKeyRecord') || 
           errorMessage.includes('decryption') ||
           errorMessage.includes('decrypt');
  }

  static logEncryptionError(error: any, chatId: string): void {
    console.log('🔐 Encryption Error Details:');
    console.log('  - Chat ID:', chatId);
    console.log('  - Error Type:', error.constructor.name);
    console.log('  - Error Message:', error.message);
    console.log('  - Stack:', error.stack?.split('\n')[0]);
  }

  static shouldSkipMessage(msg: any): boolean {
    // Skip if no message content
    if (!msg || !msg.message) return true;
    
    // Skip if from ourselves
    if (msg.key?.fromMe) return true;
    
    // Skip if it's a protocol message
    if (msg.message.protocolMessage) return true;
    
    // Skip if it's a reaction
    if (msg.message.reactionMessage) return true;
    
    return false;
  }
} 