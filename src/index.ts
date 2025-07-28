export { GopherServer } from './server.js';
export { ProtocolHandler } from './protocol.js';
export { FileSystemHandler } from './filesystem.js';
export { SecurityManager } from './security.js';
export { ConfigManager } from './config.js';
export { Logger, LogLevel } from './logger.js';
export { CLI } from './cli.js';
export * from './types.js';

import { CLI } from './cli.js';

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new CLI();
  cli.run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}