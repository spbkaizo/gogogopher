import { ConfigManager } from '../config.js';
import { ServerConfig, GopherError } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ConfigManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gopher-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    
    // Clean up environment variables
    delete process.env.GOPHER_PORT;
    delete process.env.GOPHER_HOSTNAME;
    delete process.env.GOPHER_DOCUMENT_ROOT;
    delete process.env.GOPHER_ALLOWED_DATA_DIRECTORY;
    delete process.env.GOPHER_MAX_REQUEST_SIZE;
    delete process.env.GOPHER_CONNECTION_TIMEOUT;
    delete process.env.GOPHER_ENABLE_LOGGING;
    delete process.env.GOPHER_LOG_LEVEL;
  });

  describe('Default Configuration', () => {
    test('should create default configuration', () => {
      const config = ConfigManager.createDefaultConfig();
      
      expect(config.port).toBe(70);
      expect(config.hostname).toBe('0.0.0.0');
      expect(config.documentRoot).toBe('./data');
      expect(config.allowedDataDirectory).toBe('./data');
      expect(config.maxRequestSize).toBe(1024);
      expect(config.connectionTimeout).toBe(30000);
      expect(config.enableLogging).toBe(true);
    });

    test('should return new instances', () => {
      const config1 = ConfigManager.createDefaultConfig();
      const config2 = ConfigManager.createDefaultConfig();
      
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('Configuration File Loading', () => {
    test('should load valid configuration file', async () => {
      const configPath = path.join(tempDir, 'config.json');
      const configData = {
        server: {
          port: 8070,
          hostname: 'example.com',
          documentRoot: './custom-data',
          allowedDataDirectory: './custom-data',
          maxRequestSize: 2048,
          connectionTimeout: 60000,
          enableLogging: false
        },
        security: {
          maxFileSize: 20971520,
          rateLimitRequests: 200,
          rateLimitWindow: 120000
        }
      };

      await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
      
      const config = await ConfigManager.loadFromFile(configPath);
      
      expect(config.port).toBe(8070);
      expect(config.hostname).toBe('example.com');
      expect(config.documentRoot).toBe('./custom-data');
      expect(config.allowedDataDirectory).toBe('./custom-data');
      expect(config.maxRequestSize).toBe(2048);
      expect(config.connectionTimeout).toBe(60000);
      expect(config.enableLogging).toBe(false);
    });

    test('should handle partial configuration files', async () => {
      const configPath = path.join(tempDir, 'partial-config.json');
      const configData = {
        server: {
          port: 8070,
          hostname: 'example.com'
          // Other fields missing - should use defaults
        }
      };

      await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
      
      const config = await ConfigManager.loadFromFile(configPath);
      
      expect(config.port).toBe(8070);
      expect(config.hostname).toBe('example.com');
      expect(config.documentRoot).toBe('./data'); // Default value
      expect(config.maxRequestSize).toBe(1024); // Default value
    });

    test('should throw error for non-existent config file', async () => {
      const configPath = path.join(tempDir, 'nonexistent.json');
      
      await expect(ConfigManager.loadFromFile(configPath))
        .rejects.toThrow(GopherError);
    });

    test('should throw error for invalid JSON', async () => {
      const configPath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(configPath, '{ invalid json }');
      
      await expect(ConfigManager.loadFromFile(configPath))
        .rejects.toThrow(GopherError);
    });

    test('should handle empty config file', async () => {
      const configPath = path.join(tempDir, 'empty.json');
      await fs.writeFile(configPath, '{}');
      
      const config = await ConfigManager.loadFromFile(configPath);
      
      // Should use all default values
      expect(config.port).toBe(70);
      expect(config.hostname).toBe('0.0.0.0');
      expect(config.documentRoot).toBe('./data');
    });
  });

  describe('Environment Variable Loading', () => {
    test('should load configuration from environment variables', () => {
      process.env.GOPHER_PORT = '8080';
      process.env.GOPHER_HOSTNAME = 'gopher.example.com';
      process.env.GOPHER_DOCUMENT_ROOT = '/var/gopher';
      process.env.GOPHER_ALLOWED_DATA_DIRECTORY = '/var/gopher/data';
      process.env.GOPHER_MAX_REQUEST_SIZE = '4096';
      process.env.GOPHER_CONNECTION_TIMEOUT = '45000';
      process.env.GOPHER_ENABLE_LOGGING = 'false';
      
      const config = ConfigManager.loadFromEnvironment();
      
      expect(config.port).toBe(8080);
      expect(config.hostname).toBe('gopher.example.com');
      expect(config.documentRoot).toBe('/var/gopher');
      expect(config.allowedDataDirectory).toBe('/var/gopher/data');
      expect(config.maxRequestSize).toBe(4096);
      expect(config.connectionTimeout).toBe(45000);
      expect(config.enableLogging).toBe(false);
    });

    test('should handle invalid port in environment', () => {
      process.env.GOPHER_PORT = 'invalid';
      
      const config = ConfigManager.loadFromEnvironment();
      
      expect(config.port).toBe(70); // Should use default
    });

    test('should handle invalid numbers in environment', () => {
      process.env.GOPHER_MAX_REQUEST_SIZE = 'not-a-number';
      process.env.GOPHER_CONNECTION_TIMEOUT = 'also-not-a-number';
      
      const config = ConfigManager.loadFromEnvironment();
      
      expect(config.maxRequestSize).toBe(1024); // Default
      expect(config.connectionTimeout).toBe(30000); // Default
    });

    test('should handle boolean environment variables', () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'false', expected: false },
        { value: '1', expected: true },
        { value: '0', expected: false },
        { value: 'yes', expected: true },
        { value: 'no', expected: false },
        { value: 'invalid', expected: true } // Default for invalid
      ];

      testCases.forEach(({ value, expected }) => {
        process.env.GOPHER_ENABLE_LOGGING = value;
        const config = ConfigManager.loadFromEnvironment();
        expect(config.enableLogging).toBe(expected);
      });
    });

    test('should use defaults when environment variables are not set', () => {
      const config = ConfigManager.loadFromEnvironment();
      
      expect(config.port).toBe(70);
      expect(config.hostname).toBe('0.0.0.0');
      expect(config.documentRoot).toBe('./data');
      expect(config.enableLogging).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate valid configuration', () => {
      const validConfig: ServerConfig = {
        port: 70,
        hostname: 'localhost',
        documentRoot: './data',
        allowedDataDirectory: './data',
        maxRequestSize: 1024,
        connectionTimeout: 30000,
        enableLogging: true
      };

      expect(() => {
        ConfigManager.validateConfig(validConfig);
      }).not.toThrow();
    });

    test('should reject invalid port numbers', () => {
      const invalidConfigs = [
        { port: 0 },
        { port: -1 },
        { port: 65536 },
        { port: 999999 }
      ];

      invalidConfigs.forEach(override => {
        const config = { ...ConfigManager.createDefaultConfig(), ...override };
        expect(() => {
          ConfigManager.validateConfig(config);
        }).toThrow(GopherError);
      });
    });

    test('should reject empty hostname', () => {
      const config = { ...ConfigManager.createDefaultConfig(), hostname: '' };
      
      expect(() => {
        ConfigManager.validateConfig(config);
      }).toThrow(GopherError);
    });

    test('should reject empty document root', () => {
      const config = { ...ConfigManager.createDefaultConfig(), documentRoot: '' };
      
      expect(() => {
        ConfigManager.validateConfig(config);
      }).toThrow(GopherError);
    });

    test('should reject empty allowed data directory', () => {
      const config = { ...ConfigManager.createDefaultConfig(), allowedDataDirectory: '' };
      
      expect(() => {
        ConfigManager.validateConfig(config);
      }).toThrow(GopherError);
    });

    test('should reject invalid request size', () => {
      const config = { ...ConfigManager.createDefaultConfig(), maxRequestSize: 0 };
      
      expect(() => {
        ConfigManager.validateConfig(config);
      }).toThrow(GopherError);
    });

    test('should reject invalid connection timeout', () => {
      const config = { ...ConfigManager.createDefaultConfig(), connectionTimeout: 500 };
      
      expect(() => {
        ConfigManager.validateConfig(config);
      }).toThrow(GopherError);
    });

    test('should collect multiple validation errors', () => {
      const invalidConfig: ServerConfig = {
        port: 99999,
        hostname: '',
        documentRoot: '',
        allowedDataDirectory: '',
        maxRequestSize: -1,
        connectionTimeout: 100,
        enableLogging: true
      };

      expect(() => {
        ConfigManager.validateConfig(invalidConfig);
      }).toThrow(GopherError);
    });
  });

  describe('Configuration Merging', () => {
    test('should merge configurations correctly', () => {
      const baseConfig = ConfigManager.createDefaultConfig();
      const overrides = {
        port: 8080,
        hostname: 'example.com',
        maxRequestSize: 2048
      };

      const merged = ConfigManager.mergeConfig(baseConfig, overrides);

      expect(merged.port).toBe(8080);
      expect(merged.hostname).toBe('example.com');
      expect(merged.maxRequestSize).toBe(2048);
      expect(merged.documentRoot).toBe('./data'); // Should keep default
      expect(merged.connectionTimeout).toBe(30000); // Should keep default
    });

    test('should not modify original configurations', () => {
      const baseConfig = ConfigManager.createDefaultConfig();
      const originalPort = baseConfig.port;
      const overrides = { port: 8080 };

      ConfigManager.mergeConfig(baseConfig, overrides);

      expect(baseConfig.port).toBe(originalPort);
    });

    test('should handle empty overrides', () => {
      const baseConfig = ConfigManager.createDefaultConfig();
      const merged = ConfigManager.mergeConfig(baseConfig, {});

      expect(merged).toEqual(baseConfig);
      expect(merged).not.toBe(baseConfig); // Should be new instance
    });
  });

  describe('Document Root Resolution', () => {
    test('should resolve relative document root', () => {
      const resolved = ConfigManager.resolveDocumentRoot('./data');
      
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved).toContain('data');
    });

    test('should handle absolute document root', () => {
      const absolutePath = '/var/gopher/data';
      const resolved = ConfigManager.resolveDocumentRoot(absolutePath);
      
      expect(resolved).toBe(absolutePath);
    });

    test('should handle current directory', () => {
      const resolved = ConfigManager.resolveDocumentRoot('.');
      
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved).toBe(process.cwd());
    });
  });

  describe('Example Configuration Creation', () => {
    test('should create valid example configuration', () => {
      const exampleConfig = ConfigManager.createExampleConfig();
      
      expect(exampleConfig.server).toBeDefined();
      expect(exampleConfig.security).toBeDefined();
      
      expect(exampleConfig.server.port).toBe(70);
      expect(exampleConfig.server.hostname).toBe('localhost');
      expect(exampleConfig.server.documentRoot).toBe('./data');
      expect(exampleConfig.server.allowedDataDirectory).toBe('./data');
      
      expect(exampleConfig.security.maxFileSize).toBe(10485760);
      expect(exampleConfig.security.rateLimitRequests).toBe(100);
      expect(exampleConfig.security.rateLimitWindow).toBe(60000);
    });

    test('should create serializable configuration', () => {
      const exampleConfig = ConfigManager.createExampleConfig();
      
      expect(() => {
        JSON.stringify(exampleConfig);
      }).not.toThrow();
    });
  });

  describe('Configuration File Writing', () => {
    test('should write configuration file correctly', async () => {
      const configPath = path.join(tempDir, 'written-config.json');
      const exampleConfig = ConfigManager.createExampleConfig();
      
      await fs.writeFile(configPath, JSON.stringify(exampleConfig, null, 2));
      
      // Read back and parse
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const parsedConfig = JSON.parse(fileContent);
      
      expect(parsedConfig).toEqual(exampleConfig);
    });
  });

  describe('Error Handling', () => {
    test('should provide meaningful error messages', async () => {
      const configPath = path.join(tempDir, 'malformed.json');
      await fs.writeFile(configPath, '{ "server": { "port": "invalid" } }');
      
      try {
        await ConfigManager.loadFromFile(configPath);
      } catch (error) {
        expect(error).toBeInstanceOf(GopherError);
        expect((error as GopherError).message).toContain('Failed to load configuration');
      }
    });

    test('should handle file permission errors', async () => {
      const configPath = path.join(tempDir, 'no-permission.json');
      await fs.writeFile(configPath, '{}');
      
      try {
        await fs.chmod(configPath, 0o000); // No permissions
        
        await expect(ConfigManager.loadFromFile(configPath))
          .rejects.toThrow(GopherError);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(configPath, 0o644);
      }
    });
  });
});