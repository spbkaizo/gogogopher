import { FileSystemHandler } from '../filesystem.js';
import { ServerConfig, GopherItemType, GopherError } from '../types.js';
import { SecurityManager } from '../security.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('FileSystemHandler', () => {
  let fsHandler: FileSystemHandler;
  let tempDir: string;
  let config: ServerConfig;
  let securityManager: SecurityManager;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gopher-fs-test-'));
    
    config = {
      port: 70,
      hostname: 'localhost',
      documentRoot: tempDir,
      allowedDataDirectory: tempDir,
      maxRequestSize: 1024,
      connectionTimeout: 30000,
      enableLogging: false
    };

    securityManager = new SecurityManager(tempDir);
    fsHandler = new FileSystemHandler(config, securityManager);

    // Create test directory structure
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.mkdir(path.join(tempDir, 'empty-dir'));
    await fs.mkdir(path.join(tempDir, 'nested', 'deep'), { recursive: true });

    // Create test files
    await fs.writeFile(path.join(tempDir, 'text.txt'), 'Hello, World!');
    await fs.writeFile(path.join(tempDir, 'large.txt'), 'A'.repeat(1000));
    await fs.writeFile(path.join(tempDir, 'binary.zip'), Buffer.from([0x50, 0x4B, 0x03, 0x04])); // ZIP header
    await fs.writeFile(path.join(tempDir, 'image.jpg'), Buffer.from([0xFF, 0xD8, 0xFF])); // JPEG header
    await fs.writeFile(path.join(tempDir, 'subdir', 'nested.txt'), 'Nested content');
    await fs.writeFile(path.join(tempDir, 'nested', 'deep', 'file.txt'), 'Deep nested content');
    
    // Create hidden files (should be ignored)
    await fs.writeFile(path.join(tempDir, '.hidden'), 'Hidden content');
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('File Reading', () => {
    test('should read text files correctly', async () => {
      const content = await fsHandler.readFile(path.join(tempDir, 'text.txt'));
      
      expect(typeof content).toBe('string');
      expect(content).toBe('Hello, World!');
    });

    test('should read binary files as Buffer', async () => {
      const content = await fsHandler.readFile(path.join(tempDir, 'binary.zip'));
      
      expect(Buffer.isBuffer(content)).toBe(true);
      expect(content[0]).toBe(0x50); // ZIP signature
    });

    test('should throw error for non-existent files', async () => {
      await expect(fsHandler.readFile(path.join(tempDir, 'nonexistent.txt')))
        .rejects.toThrow(GopherError);
    });

    test('should validate file size limits', async () => {
      // Create a file that exceeds the security limit
      const largeFile = path.join(tempDir, 'huge.txt');
      await fs.writeFile(largeFile, 'A'.repeat(20 * 1024 * 1024)); // 20MB

      await expect(fsHandler.readFile(largeFile))
        .rejects.toThrow(GopherError);
    });

    test('should check file type permissions', async () => {
      // Create an executable file
      const execFile = path.join(tempDir, 'script.exe');
      await fs.writeFile(execFile, 'fake executable');

      await expect(fsHandler.readFile(execFile))
        .rejects.toThrow(GopherError);
    });
  });

  describe('Directory Listing', () => {
    test('should list directory contents correctly', async () => {
      const items = await fsHandler.getDirectoryListing(tempDir);
      
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);

      // Check for expected files and directories
      const fileNames = items.map(item => item.displayString);
      expect(fileNames).toContain('text.txt');
      expect(fileNames).toContain('subdir/');
      expect(fileNames).toContain('binary.zip');
    });

    test('should not include hidden files', async () => {
      const items = await fsHandler.getDirectoryListing(tempDir);
      const fileNames = items.map(item => item.displayString);
      
      expect(fileNames).not.toContain('.hidden');
      expect(fileNames).not.toContain('.gitignore');
    });

    test('should include parent directory link for subdirectories', async () => {
      const items = await fsHandler.getDirectoryListing(path.join(tempDir, 'subdir'));
      const fileNames = items.map(item => item.displayString);
      
      expect(fileNames).toContain('..');
    });

    test('should not include parent link for document root', async () => {
      const items = await fsHandler.getDirectoryListing(tempDir);
      const fileNames = items.map(item => item.displayString);
      
      expect(fileNames).not.toContain('..');
    });

    test('should assign correct item types', async () => {
      const items = await fsHandler.getDirectoryListing(tempDir);
      
      const textFile = items.find(item => item.displayString === 'text.txt');
      const subdirectory = items.find(item => item.displayString === 'subdir/');
      const binaryFile = items.find(item => item.displayString === 'binary.zip');
      const imageFile = items.find(item => item.displayString === 'image.jpg');

      expect(textFile?.type).toBe(GopherItemType.FILE);
      expect(subdirectory?.type).toBe(GopherItemType.DIRECTORY);
      expect(binaryFile?.type).toBe(GopherItemType.BINARY_FILE);
      expect(imageFile?.type).toBe(GopherItemType.IMAGE);
    });

    test('should sort items correctly (directories first, then alphabetical)', async () => {
      const items = await fsHandler.getDirectoryListing(tempDir);
      
      // Find first directory and first file
      let firstDirIndex = -1;
      let firstFileIndex = -1;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === GopherItemType.DIRECTORY && firstDirIndex === -1) {
          firstDirIndex = i;
        }
        if (items[i].type === GopherItemType.FILE && firstFileIndex === -1) {
          firstFileIndex = i;
        }
      }

      // Directories should come before files (if both exist)
      if (firstDirIndex !== -1 && firstFileIndex !== -1) {
        expect(firstDirIndex).toBeLessThan(firstFileIndex);
      }
    });

    test('should handle empty directories', async () => {
      const items = await fsHandler.getDirectoryListing(path.join(tempDir, 'empty-dir'));
      
      // Should at least contain parent directory link
      expect(items.length).toBeGreaterThanOrEqual(1);
      const fileNames = items.map(item => item.displayString);
      expect(fileNames).toContain('..');
    });

    test('should throw error for non-existent directory', async () => {
      await expect(fsHandler.getDirectoryListing(path.join(tempDir, 'nonexistent')))
        .rejects.toThrow(GopherError);
    });
  });

  describe('File Statistics', () => {
    test('should get file stats correctly', async () => {
      const stats = await fsHandler.getFileStats(path.join(tempDir, 'text.txt'));
      
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should get directory stats correctly', async () => {
      const stats = await fsHandler.getFileStats(path.join(tempDir, 'subdir'));
      
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isFile()).toBe(false);
    });

    test('should throw error for non-existent files', async () => {
      await expect(fsHandler.getFileStats(path.join(tempDir, 'nonexistent.txt')))
        .rejects.toThrow(GopherError);
    });
  });

  describe('Path Validation', () => {
    test('should allow paths within document root', () => {
      const validPaths = [
        path.join(tempDir, 'text.txt'),
        path.join(tempDir, 'subdir', 'nested.txt'),
        path.join(tempDir, 'nested', 'deep', 'file.txt')
      ];

      validPaths.forEach(testPath => {
        expect(fsHandler.isPathAllowed(testPath)).toBe(true);
      });
    });

    test('should reject paths outside document root', () => {
      const invalidPaths = [
        path.join(tempDir, '..', 'outside.txt'),
        path.join(tempDir, '..', '..', 'etc', 'passwd'),
        '/etc/passwd',
        '/tmp/malicious.txt'
      ];

      invalidPaths.forEach(testPath => {
        expect(fsHandler.isPathAllowed(testPath)).toBe(false);
      });
    });
  });

  describe('File Type Detection', () => {
    test('should detect binary files correctly', () => {
      const binaryExtensions = ['.jpg', '.png', '.gif', '.zip', '.exe', '.pdf'];
      
      binaryExtensions.forEach(ext => {
        const isBinary = (fsHandler as any).isBinaryFile(ext);
        expect(isBinary).toBe(true);
      });
    });

    test('should detect text files correctly', () => {
      const textExtensions = ['.txt', '.md', '.json', '.yaml', '.css', '.html'];
      
      textExtensions.forEach(ext => {
        const isBinary = (fsHandler as any).isBinaryFile(ext);
        expect(isBinary).toBe(false);
      });
    });
  });

  describe('Display String Formatting', () => {
    test('should format directory names with trailing slash', () => {
      const formatted = (fsHandler as any).formatDisplayString('testdir', true);
      expect(formatted).toBe('testdir/');
    });

    test('should format file names without trailing slash', () => {
      const formatted = (fsHandler as any).formatDisplayString('testfile.txt', false);
      expect(formatted).toBe('testfile.txt');
    });

    test('should truncate long filenames', () => {
      const longName = 'a'.repeat(100);
      const formatted = (fsHandler as any).formatDisplayString(longName, false);
      
      expect(formatted.length).toBeLessThanOrEqual(67); // Max length
      expect(formatted).toEndWith('...');
    });

    test('should not truncate short filenames', () => {
      const shortName = 'short.txt';
      const formatted = (fsHandler as any).formatDisplayString(shortName, false);
      
      expect(formatted).toBe(shortName);
    });
  });

  describe('Parent Selector Generation', () => {
    test('should generate correct parent selector for subdirectory', () => {
      const subDir = path.join(tempDir, 'subdir');
      const parentSelector = (fsHandler as any).getParentSelector(subDir);
      
      expect(parentSelector).toBe('/');
    });

    test('should generate correct parent selector for nested directory', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep');
      const parentSelector = (fsHandler as any).getParentSelector(nestedDir);
      
      expect(parentSelector).toBe('/nested');
    });

    test('should return root for document root parent', () => {
      const parentSelector = (fsHandler as any).getParentSelector(tempDir);
      
      expect(parentSelector).toBe('/');
    });
  });

  describe('File Operations', () => {
    test('should create directories recursively', async () => {
      const newDirPath = path.join(tempDir, 'new', 'nested', 'dir');
      
      await fsHandler.ensureDirectory(newDirPath);
      
      const stats = await fs.stat(newDirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should write files correctly', async () => {
      const testFile = path.join(tempDir, 'written.txt');
      const content = 'This is test content';
      
      await fsHandler.writeFile(testFile, content);
      
      const readContent = await fs.readFile(testFile, 'utf-8');
      expect(readContent).toBe(content);
    });

    test('should write binary files correctly', async () => {
      const testFile = path.join(tempDir, 'binary-written.dat');
      const content = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      
      await fsHandler.writeFile(testFile, content);
      
      const readContent = await fs.readFile(testFile);
      expect(Buffer.compare(readContent, content)).toBe(0);
    });

    test('should delete files correctly', async () => {
      const testFile = path.join(tempDir, 'to-delete.txt');
      await fs.writeFile(testFile, 'delete me');
      
      await fsHandler.deleteFile(testFile);
      
      await expect(fs.stat(testFile)).rejects.toThrow();
    });

    test('should handle deletion of non-existent files gracefully', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');
      
      // Should not throw an error
      await expect(fsHandler.deleteFile(nonExistentFile)).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle permission errors gracefully', async () => {
      const restrictedDir = path.join(tempDir, 'restricted');
      await fs.mkdir(restrictedDir);
      
      try {
        await fs.chmod(restrictedDir, 0o000); // No permissions
        
        await expect(fsHandler.getDirectoryListing(restrictedDir))
          .rejects.toThrow(GopherError);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755);
      }
    });

    test('should handle filesystem errors gracefully', async () => {
      // Try to read a directory as a file
      await expect(fsHandler.readFile(path.join(tempDir, 'subdir')))
        .rejects.toThrow(GopherError);
    });

    test('should validate security constraints', async () => {
      // This should be handled by the SecurityManager integration
      const maliciousPath = path.join(tempDir, '..', '..', 'etc', 'passwd');
      
      // The filesystem handler should respect security validation
      expect(fsHandler.isPathAllowed(maliciousPath)).toBe(false);
    });
  });
});