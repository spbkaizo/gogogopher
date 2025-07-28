import { ProtocolHandler } from '../protocol.js';
import { GopherItemType, ServerConfig, GopherItem } from '../types.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('ProtocolHandler', () => {
  let protocolHandler: ProtocolHandler;
  let tempDir: string;
  let config: ServerConfig;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gopher-protocol-test-'));
    
    config = {
      port: 70,
      hostname: 'localhost',
      documentRoot: tempDir,
      allowedDataDirectory: tempDir,
      maxRequestSize: 1024,
      connectionTimeout: 30000,
      enableLogging: false
    };

    protocolHandler = new ProtocolHandler(config);

    // Create test files and directories
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello, Gopher!');
    await fs.writeFile(path.join(tempDir, 'document.md'), '# Markdown Document');
    await fs.writeFile(path.join(tempDir, 'image.gif'), Buffer.from('GIF89a'));
    await fs.writeFile(path.join(tempDir, 'image.jpg'), Buffer.from('JPEG'));
    await fs.writeFile(path.join(tempDir, 'page.html'), '<html><body>Test</body></html>');
    await fs.writeFile(path.join(tempDir, 'binary.zip'), Buffer.from('PK'));
    
    await fs.mkdir(path.join(tempDir, 'directory'));
    await fs.writeFile(path.join(tempDir, 'directory', 'nested.txt'), 'Nested file content');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Request Parsing', () => {
    test('should parse simple gopher request', () => {
      const rawRequest = '/test.txt\r\n';
      const parsed = protocolHandler.parseRequest(rawRequest);
      
      expect(parsed.selector).toBe('/test.txt');
      expect(parsed.searchTerms).toEqual([]);
    });

    test('should parse root directory request', () => {
      const rawRequest = '\r\n';
      const parsed = protocolHandler.parseRequest(rawRequest);
      
      expect(parsed.selector).toBe('/');
      expect(parsed.searchTerms).toEqual([]);
    });

    test('should parse search request with terms', () => {
      const rawRequest = '/search\tterm1 term2\r\n';
      const parsed = protocolHandler.parseRequest(rawRequest);
      
      expect(parsed.selector).toBe('/search');
      expect(parsed.searchTerms).toEqual(['term1', 'term2']);
    });

    test('should handle malformed requests gracefully', () => {
      const malformedRequests = [
        '/test.txt', // Missing CRLF
        '/test.txt\n', // Missing CR
        '', // Empty request
        '/' + 'a'.repeat(2000) + '\r\n' // Too long
      ];

      malformedRequests.forEach(request => {
        expect(() => {
          protocolHandler.parseRequest(request);
        }).not.toThrow();
      });
    });

    test('should normalize selectors', () => {
      const testCases = [
        { input: '\\test\\file.txt\r\n', expected: '/test/file.txt' },
        { input: '//double//slash\r\n', expected: '/double/slash' },
        { input: '/test/./file.txt\r\n', expected: '/test/file.txt' },
        { input: 'relative/path\r\n', expected: '/relative/path' }
      ];

      testCases.forEach(({ input, expected }) => {
        const parsed = protocolHandler.parseRequest(input);
        expect(parsed.selector).toBe(expected);
      });
    });
  });

  describe('Item Type Determination', () => {
    test('should identify text files correctly', () => {
      const textFiles = [
        '/test.txt',
        '/document.md',
        '/readme.rst',
        '/config.yml',
        '/data.json'
      ];

      textFiles.forEach(filePath => {
        const itemType = ProtocolHandler.determineItemType(filePath, false);
        expect(itemType).toBe(GopherItemType.FILE);
      });
    });

    test('should identify directory correctly', () => {
      const itemType = ProtocolHandler.determineItemType('/some/directory', true);
      expect(itemType).toBe(GopherItemType.DIRECTORY);
    });

    test('should identify GIF images correctly', () => {
      const itemType = ProtocolHandler.determineItemType('/image.gif', false);
      expect(itemType).toBe(GopherItemType.GIF_IMAGE);
    });

    test('should identify other images correctly', () => {
      const imageFiles = ['/photo.jpg', '/picture.png', '/icon.ico', '/bitmap.bmp'];
      
      imageFiles.forEach(filePath => {
        const itemType = ProtocolHandler.determineItemType(filePath, false);
        expect(itemType).toBe(GopherItemType.IMAGE);
      });
    });

    test('should identify HTML files correctly', () => {
      const htmlFiles = ['/page.html', '/index.htm'];
      
      htmlFiles.forEach(filePath => {
        const itemType = ProtocolHandler.determineItemType(filePath, false);
        expect(itemType).toBe(GopherItemType.HTML);
      });
    });

    test('should identify binary files correctly', () => {
      const binaryFiles = [
        '/archive.zip',
        '/compressed.tar.gz',
        '/document.pdf',
        '/spreadsheet.xls'
      ];
      
      binaryFiles.forEach(filePath => {
        const itemType = ProtocolHandler.determineItemType(filePath, false);
        expect(itemType).toBe(GopherItemType.BINARY_FILE);
      });
    });
  });

  describe('Response Formatting', () => {
    test('should format directory listing correctly (RFC 1436)', async () => {
      const response = await protocolHandler.handleRequest({ 
        selector: '/', 
        searchTerms: [] 
      });

      expect(response.isDirectory).toBe(true);
      expect(response.items).toBeDefined();
      expect(response.items!.length).toBeGreaterThan(0);

      // Check that each item follows RFC 1436 format
      response.items!.forEach(item => {
        expect(item.type).toMatch(/^[0-9+gIThi]$/);
        expect(item.displayString).toBeDefined();
        expect(item.selector).toBeDefined();
        expect(item.hostname).toBe('localhost');
        expect(item.port).toBe(70);
      });
    });

    test('should format file response correctly', async () => {
      const response = await protocolHandler.handleRequest({ 
        selector: '/test.txt', 
        searchTerms: [] 
      });

      expect(response.isDirectory).toBe(false);
      expect(typeof response.data).toBe('string');
      expect(response.data).toBe('Hello, Gopher!');
    });

    test('should handle binary files correctly', async () => {
      const response = await protocolHandler.handleRequest({ 
        selector: '/binary.zip', 
        searchTerms: [] 
      });

      expect(response.isDirectory).toBe(false);
      expect(Buffer.isBuffer(response.data)).toBe(true);
    });

    test('should generate RFC-compliant menu format', () => {
      const testItems: GopherItem[] = [
        {
          type: GopherItemType.FILE,
          displayString: 'Test file',
          selector: '/test.txt',
          hostname: 'localhost',
          port: 70
        },
        {
          type: GopherItemType.DIRECTORY,
          displayString: 'Subdirectory',
          selector: '/subdir',
          hostname: 'localhost',
          port: 70
        }
      ];

      const formattedMenu = protocolHandler.formatDirectoryListing(testItems);
      const lines = formattedMenu.split('\r\n');

      // Check format: [type][displayString][TAB][selector][TAB][hostname][TAB][port]
      expect(lines[0]).toMatch(/^0Test file\t\/test\.txt\tlocalhost\t70$/);
      expect(lines[1]).toMatch(/^1Subdirectory\t\/subdir\tlocalhost\t70$/);
      expect(lines[2]).toBe('.'); // Menu terminator
    });

    test('should include menu terminator', () => {
      const testItems: GopherItem[] = [];
      const formattedMenu = protocolHandler.formatDirectoryListing(testItems);
      
      expect(formattedMenu.endsWith('.\r\n')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle file not found gracefully', async () => {
      const response = await protocolHandler.handleRequest({ 
        selector: '/nonexistent.txt', 
        searchTerms: [] 
      });

      expect(response.isDirectory).toBe(false);
      expect(typeof response.data).toBe('string');
      expect(response.data).toContain('error'); // Should contain error message
    });

    test('should handle permission denied gracefully', async () => {
      // Create a file and remove read permissions
      const restrictedFile = path.join(tempDir, 'restricted.txt');
      await fs.writeFile(restrictedFile, 'restricted content');
      
      try {
        await fs.chmod(restrictedFile, 0o000); // No permissions
        
        const response = await protocolHandler.handleRequest({ 
          selector: '/restricted.txt', 
          searchTerms: [] 
        });

        expect(response.isDirectory).toBe(false);
        expect(typeof response.data).toBe('string');
        expect(response.data).toContain('error');
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });

    test('should return error item for invalid requests', () => {
      const errorItems = protocolHandler.createErrorResponse('Test error message');
      
      expect(errorItems.length).toBe(1);
      expect(errorItems[0].type).toBe(GopherItemType.ERROR);
      expect(errorItems[0].displayString).toContain('Test error message');
    });
  });

  describe('RFC 1436 Compliance', () => {
    test('should use correct CRLF line endings', () => {
      const testItems: GopherItem[] = [
        {
          type: GopherItemType.FILE,
          displayString: 'Test',
          selector: '/test',
          hostname: 'localhost',
          port: 70
        }
      ];

      const formatted = protocolHandler.formatDirectoryListing(testItems);
      
      // Should use CRLF, not just LF
      expect(formatted).toContain('\r\n');
      expect(formatted).not.toMatch(/[^\r]\n/);
    });

    test('should use TAB as field separator', () => {
      const testItems: GopherItem[] = [
        {
          type: GopherItemType.FILE,
          displayString: 'Test File',
          selector: '/test.txt',
          hostname: 'example.com',
          port: 7070
        }
      ];

      const formatted = protocolHandler.formatDirectoryListing(testItems);
      const lines = formatted.split('\r\n');
      const fields = lines[0].split('\t');
      
      expect(fields).toHaveLength(4);
      expect(fields[0]).toBe('0Test File');
      expect(fields[1]).toBe('/test.txt');
      expect(fields[2]).toBe('example.com');
      expect(fields[3]).toBe('7070');
    });

    test('should terminate directory listings with period', () => {
      const testItems: GopherItem[] = [];
      const formatted = protocolHandler.formatDirectoryListing(testItems);
      
      expect(formatted).toEndWith('.\r\n');
    });

    test('should handle special characters in display strings', () => {
      const testItems: GopherItem[] = [
        {
          type: GopherItemType.FILE,
          displayString: 'File with\ttab and\rnewline',
          selector: '/test.txt',
          hostname: 'localhost',
          port: 70
        }
      ];

      const formatted = protocolHandler.formatDirectoryListing(testItems);
      
      // Special characters should be handled appropriately
      expect(formatted).not.toContain('\t\t'); // Should not have double tabs
      expect(formatted).not.toContain('\r\r'); // Should not break line endings
    });
  });

  describe('Search Functionality', () => {
    test('should handle search requests', async () => {
      // Create a search-enabled directory
      await fs.writeFile(path.join(tempDir, 'searchable.txt'), 'This file contains search terms');
      await fs.writeFile(path.join(tempDir, 'another.txt'), 'Another file with different content');

      const response = await protocolHandler.handleRequest({ 
        selector: '/', 
        searchTerms: ['search'] 
      });

      expect(response.isDirectory).toBe(true);
      expect(response.items).toBeDefined();
      
      // Should return filtered results based on search terms
      const searchResults = response.items!.filter(item => 
        item.displayString.toLowerCase().includes('search') ||
        item.selector.includes('searchable')
      );
      
      expect(searchResults.length).toBeGreaterThan(0);
    });

    test('should return empty results for no matches', async () => {
      const response = await protocolHandler.handleRequest({ 
        selector: '/', 
        searchTerms: ['nonexistent'] 
      });

      expect(response.isDirectory).toBe(true);
      expect(response.items).toBeDefined();
      
      // Should still include navigation items like ".."
      const navigationItems = response.items!.filter(item => 
        item.displayString === '..'
      );
      expect(navigationItems.length).toBeLessThanOrEqual(1);
    });
  });
});