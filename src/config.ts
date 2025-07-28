import * as path from 'path';
import * as fs from 'fs/promises';
import { ServerConfig, SecurityOptions, GopherError } from './types.js';

export interface ConfigFile {
  server?: Partial<ServerConfig>;
  security?: Partial<SecurityOptions>;
}

export class ConfigManager {
  private static readonly DEFAULT_CONFIG: ServerConfig = {
    port: 70,
    hostname: '0.0.0.0',
    documentRoot: './gopher-content',
    maxRequestSize: 1024,
    connectionTimeout: 30000,
    enableLogging: true,
    allowedPaths: [],
    blockedPaths: ['/etc', '/proc', '/sys', '/dev', '/root', '/home'],
  };

  public static createDefaultConfig(): ServerConfig {
    return { ...this.DEFAULT_CONFIG };
  }

  public static async loadFromFile(configPath: string): Promise<ServerConfig> {
    try {
      const configFile = await fs.readFile(configPath, 'utf-8');
      const parsedConfig: ConfigFile = JSON.parse(configFile);
      
      return this.mergeConfig(this.DEFAULT_CONFIG, parsedConfig.server || {});
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new GopherError(
          `Configuration file not found: ${configPath}`,
          'CONFIG_NOT_FOUND',
          404
        );
      }
      throw new GopherError(
        `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
        'CONFIG_LOAD_ERROR',
        500
      );
    }
  }

  public static async saveToFile(config: ServerConfig, configPath: string): Promise<void> {
    try {
      const configFile: ConfigFile = {
        server: config,
      };
      
      const configDir = path.dirname(configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      await fs.writeFile(configPath, JSON.stringify(configFile, null, 2), 'utf-8');
    } catch (error) {
      throw new GopherError(
        `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`,
        'CONFIG_SAVE_ERROR',
        500
      );
    }
  }

  public static loadFromEnvironment(): Partial<ServerConfig> {
    const config: Partial<ServerConfig> = {};

    if (process.env.GOPHER_PORT) {
      const port = parseInt(process.env.GOPHER_PORT, 10);
      if (!isNaN(port) && port > 0 && port <= 65535) {
        config.port = port;
      }
    }

    if (process.env.GOPHER_HOSTNAME) {
      config.hostname = process.env.GOPHER_HOSTNAME;
    }

    if (process.env.GOPHER_DOCUMENT_ROOT) {
      config.documentRoot = process.env.GOPHER_DOCUMENT_ROOT;
    }

    if (process.env.GOPHER_MAX_REQUEST_SIZE) {
      const size = parseInt(process.env.GOPHER_MAX_REQUEST_SIZE, 10);
      if (!isNaN(size) && size > 0) {
        config.maxRequestSize = size;
      }
    }

    if (process.env.GOPHER_CONNECTION_TIMEOUT) {
      const timeout = parseInt(process.env.GOPHER_CONNECTION_TIMEOUT, 10);
      if (!isNaN(timeout) && timeout > 0) {
        config.connectionTimeout = timeout;
      }
    }

    if (process.env.GOPHER_ENABLE_LOGGING) {
      config.enableLogging = process.env.GOPHER_ENABLE_LOGGING.toLowerCase() === 'true';
    }

    return config;
  }

  public static mergeConfig(
    baseConfig: ServerConfig,
    overrides: Partial<ServerConfig>
  ): ServerConfig {
    return {
      ...baseConfig,
      ...overrides,
      allowedPaths: overrides.allowedPaths || baseConfig.allowedPaths,
      blockedPaths: overrides.blockedPaths || baseConfig.blockedPaths,
    };
  }

  public static validateConfig(config: ServerConfig): void {
    const errors: string[] = [];

    if (!config.port || config.port < 1 || config.port > 65535) {
      errors.push('Port must be between 1 and 65535');
    }

    if (!config.hostname || config.hostname.trim() === '') {
      errors.push('Hostname is required');
    }

    if (!config.documentRoot || config.documentRoot.trim() === '') {
      errors.push('Document root is required');
    }

    if (config.maxRequestSize < 1) {
      errors.push('Max request size must be positive');
    }

    if (config.connectionTimeout < 1000) {
      errors.push('Connection timeout must be at least 1000ms');
    }

    if (errors.length > 0) {
      throw new GopherError(
        `Configuration validation failed: ${errors.join(', ')}`,
        'CONFIG_VALIDATION_ERROR',
        400
      );
    }
  }

  public static resolveDocumentRoot(documentRoot: string): string {
    if (path.isAbsolute(documentRoot)) {
      return documentRoot;
    }
    return path.resolve(process.cwd(), documentRoot);
  }

  public static async ensureDocumentRoot(documentRoot: string): Promise<void> {
    try {
      const resolvedPath = this.resolveDocumentRoot(documentRoot);
      await fs.mkdir(resolvedPath, { recursive: true });
    } catch (error) {
      throw new GopherError(
        `Failed to create document root directory: ${error instanceof Error ? error.message : String(error)}`,
        'DOCUMENT_ROOT_ERROR',
        500
      );
    }
  }

  public static createExampleConfig(): ConfigFile {
    return {
      server: {
        port: 70,
        hostname: 'localhost',
        documentRoot: './gopher-content',
        maxRequestSize: 1024,
        connectionTimeout: 30000,
        enableLogging: true,
        allowedPaths: [],
        blockedPaths: ['/etc', '/proc', '/sys', '/dev', '/root', '/home'],
      },
      security: {
        enablePathTraversalProtection: true,
        maxFileSize: 10485760, // 10MB
        rateLimitRequests: 100,
        rateLimitWindow: 60000, // 1 minute
      },
    };
  }
}