#!/usr/bin/env node
import { GopherServer } from './server.js';
import { ConfigManager } from './config.js';
import { Logger, LogLevel } from './logger.js';
import { GopherError } from './types.js';

interface CLIOptions {
  port?: number;
  hostname?: string;
  documentRoot?: string;
  config?: string;
  verbose?: boolean;
  quiet?: boolean;
  daemon?: boolean;
  help?: boolean;
  version?: boolean;
  createConfig?: boolean;
}

export class CLI {
  private logger: Logger;

  constructor() {
    this.logger = new Logger(true, LogLevel.INFO);
  }

  public async run(args: string[] = process.argv.slice(2)): Promise<void> {
    try {
      const options = this.parseArguments(args);

      if (options.help) {
        this.showHelp();
        return;
      }

      if (options.version) {
        await this.showVersion();
        return;
      }

      if (options.createConfig) {
        await this.createExampleConfig(options.config || './gopher.config.json');
        return;
      }

      if (options.quiet) {
        this.logger.setEnabled(false);
      } else if (options.verbose) {
        this.logger.setLogLevel(LogLevel.DEBUG);
      }

      await this.startServer(options);
    } catch (error) {
      if (error instanceof GopherError) {
        this.logger.error(`Error: ${error.message}`);
        process.exit(1);
      } else if (error instanceof Error) {
        this.logger.error(`Unexpected error: ${error.message}`);
        process.exit(1);
      } else {
        this.logger.error(`Unknown error: ${String(error)}`);
        process.exit(1);
      }
    }
  }

  private parseArguments(args: string[]): CLIOptions {
    const options: CLIOptions = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '-p':
        case '--port':
          options.port = parseInt(args[++i], 10);
          if (isNaN(options.port) || options.port < 1 || options.port > 65535) {
            throw new GopherError('Invalid port number', 'INVALID_PORT');
          }
          break;
          
        case '-h':
        case '--hostname':
          options.hostname = args[++i];
          if (!options.hostname) {
            throw new GopherError('Hostname is required', 'MISSING_HOSTNAME');
          }
          break;
          
        case '-d':
        case '--document-root':
          options.documentRoot = args[++i];
          if (!options.documentRoot) {
            throw new GopherError('Document root is required', 'MISSING_DOCUMENT_ROOT');
          }
          break;
          
        case '-c':
        case '--config':
          options.config = args[++i];
          if (!options.config) {
            throw new GopherError('Config file path is required', 'MISSING_CONFIG');
          }
          break;
          
        case '-v':
        case '--verbose':
          options.verbose = true;
          break;
          
        case '-q':
        case '--quiet':
          options.quiet = true;
          break;
          
        case '--daemon':
          options.daemon = true;
          break;
          
        case '--help':
          options.help = true;
          break;
          
        case '--version':
          options.version = true;
          break;
          
        case '--create-config':
          options.createConfig = true;
          break;
          
        default:
          if (arg.startsWith('-')) {
            throw new GopherError(`Unknown option: ${arg}`, 'UNKNOWN_OPTION');
          }
          break;
      }
    }
    
    return options;
  }

  private async startServer(options: CLIOptions): Promise<void> {
    let config = ConfigManager.createDefaultConfig();

    if (options.config) {
      try {
        config = await ConfigManager.loadFromFile(options.config);
        this.logger.info(`Loaded configuration from ${options.config}`);
      } catch (error) {
        if (error instanceof GopherError && error.code === 'CONFIG_NOT_FOUND') {
          this.logger.warn(`Configuration file not found: ${options.config}, using defaults`);
        } else {
          throw error;
        }
      }
    }

    const envConfig = ConfigManager.loadFromEnvironment();
    config = ConfigManager.mergeConfig(config, envConfig);

    if (options.port) config.port = options.port;
    if (options.hostname) config.hostname = options.hostname;
    if (options.documentRoot) config.documentRoot = options.documentRoot;

    config.documentRoot = ConfigManager.resolveDocumentRoot(config.documentRoot);

    ConfigManager.validateConfig(config);

    await ConfigManager.ensureDocumentRoot(config.documentRoot);

    const server = new GopherServer(config, undefined, this.logger);

    this.setupSignalHandlers(server);

    try {
      await server.listen();
      this.logger.info(`Gopher server started successfully`);
      this.logger.info(`Document root: ${config.documentRoot}`);
      this.logger.info('Press Ctrl+C to stop the server');

      if (options.daemon) {
        process.disconnect?.();
      }

    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'EADDRINUSE') {
          throw new GopherError(
            `Port ${config.port} is already in use`,
            'PORT_IN_USE'
          );
        }
        if (error.code === 'EACCES') {
          throw new GopherError(
            `Permission denied to bind to port ${config.port}`,
            'PERMISSION_DENIED'
          );
        }
      }
      throw error;
    }
  }

  private setupSignalHandlers(server: GopherServer): void {
    const gracefulShutdown = async (signal: string): Promise<void> => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await server.shutdown();
        this.logger.info('Server shutdown complete');
        process.exit(0);
      } catch (error) {
        this.logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    process.on('uncaughtException', (error: Error) => {
      this.logger.fatal('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason: unknown) => {
      this.logger.fatal('Unhandled rejection', { reason: String(reason) });
      process.exit(1);
    });
  }

  private async createExampleConfig(configPath: string): Promise<void> {
    const exampleConfig = ConfigManager.createExampleConfig();
    if (exampleConfig.server) {
      await ConfigManager.saveToFile(exampleConfig.server as Parameters<typeof ConfigManager.saveToFile>[0], configPath);
      this.logger.info(`Example configuration created at ${configPath}`);
    }
  }

  private showHelp(): void {
    console.log(`
GoGoGopher - A secure, RFC-compliant Gopher server

Usage: gogogopher [options]

Options:
  -p, --port <port>          Port to listen on (default: 70)
  -h, --hostname <hostname>  Hostname to bind to (default: 0.0.0.0)
  -d, --document-root <path> Document root directory (default: ./gopher-content)
  -c, --config <file>        Configuration file path
  -v, --verbose              Enable verbose logging
  -q, --quiet                Disable logging
  --daemon                   Run as daemon
  --create-config            Create example configuration file
  --help                     Show this help message
  --version                  Show version information

Environment Variables:
  GOPHER_PORT                Port to listen on
  GOPHER_HOSTNAME            Hostname to bind to
  GOPHER_DOCUMENT_ROOT       Document root directory
  GOPHER_MAX_REQUEST_SIZE    Maximum request size in bytes
  GOPHER_CONNECTION_TIMEOUT  Connection timeout in milliseconds
  GOPHER_ENABLE_LOGGING      Enable logging (true/false)
  GOPHER_LOG_LEVEL           Log level (DEBUG, INFO, WARN, ERROR, FATAL)

Examples:
  gogogopher                           # Start with default settings
  gogogopher -p 8070 -h localhost      # Custom port and hostname
  gogogopher -c ./my-config.json       # Use configuration file
  gogogopher --create-config           # Create example config
`);
  }

  private async showVersion(): Promise<void> {
    const { readFile } = await import('fs/promises');
    const packageContent = await readFile('package.json', 'utf-8');
    const packageInfo = JSON.parse(packageContent);
    console.log(`GoGoGopher v${packageInfo.version}`);
  }
}

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new CLI();
  cli.run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}