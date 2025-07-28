import { SecurityManager } from '../security.js';
import { GopherRequest, GopherError } from '../types.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;
  let tempDir: string;
  let allowedDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gopher-test-'));
    allowedDir = path.join(tempDir, 'allowed');
    await fs.mkdir(allowedDir, { recursive: true });
    
    // Create some test files
    await fs.writeFile(path.join(allowedDir, 'test.txt'), 'test content');
    await fs.mkdir(path.join(allowedDir, 'subdir'));
    await fs.writeFile(path.join(allowedDir, 'subdir', 'nested.txt'), 'nested content');
    
    securityManager = new SecurityManager(allowedDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Path Traversal Protection', () => {
    test('should block basic path traversal attempts', () => {
      const maliciousRequests: GopherRequest[] = [
        { selector: '../../../etc/passwd', searchTerms: undefined },
        { selector: '..\\..\\windows\\system32', searchTerms: undefined },
        { selector: '/test/../../../etc/shadow', searchTerms: undefined },
        { selector: 'test/../../etc/passwd', searchTerms: undefined }
      ];

      maliciousRequests.forEach(request => {
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).toThrow(GopherError);
      });
    });

    test('should block encoded path traversal attempts', () => {
      const encodedRequests: GopherRequest[] = [
        { selector: '%2e%2e%2f%2e%2e%2fetc%2fpasswd', searchTerms: undefined },
        { selector: '..%2f..%2fetc%2fpasswd', searchTerms: undefined },
        { selector: '%2e%2e\\%2e%2e\\etc\\passwd', searchTerms: undefined }
      ];

      encodedRequests.forEach(request => {
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).toThrow(GopherError);
      });
    });

    test('should block null byte injection', () => {
      const nullByteRequests: GopherRequest[] = [
        { selector: '/test\0../../../etc/passwd', searchTerms: undefined },
        { selector: '/test.txt\0.exe', searchTerms: undefined }
      ];

      nullByteRequests.forEach(request => {
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).toThrow(GopherError);
      });
    });

    test('should allow legitimate paths', () => {
      const legitimateRequests: GopherRequest[] = [
        { selector: '/test.txt', searchTerms: undefined },
        { selector: '/subdir/nested.txt', searchTerms: undefined },
        { selector: '/', searchTerms: undefined },
        { selector: '/subdir', searchTerms: undefined }
      ];

      legitimateRequests.forEach(request => {
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).not.toThrow();
      });
    });
  });

  describe('Allowlist-Only Access Control', () => {
    test('should only allow access within allowed directory', () => {
      const validPaths = [
        '/',
        '/test.txt',
        '/subdir/',
        '/subdir/nested.txt'
      ];

      validPaths.forEach(selector => {
        const request: GopherRequest = { selector, searchTerms: undefined };
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).not.toThrow();
      });
    });

    test('should block access outside allowed directory', () => {
      // These should be blocked even without explicit path traversal
      const blockedPaths = [
        '/../../outside.txt',
        '/../sibling.txt',
        '/allowed/../outside.txt'
      ];

      blockedPaths.forEach(selector => {
        const request: GopherRequest = { selector, searchTerms: undefined };
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).toThrow(GopherError);
      });
    });

    test('should validate resolved paths stay within bounds', () => {
      const request: GopherRequest = { selector: '/test/../../../etc/passwd', searchTerms: undefined };
      
      expect(() => {
        securityManager.isRequestAllowed(request, '127.0.0.1');
      }).toThrow(GopherError);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within rate limit', () => {
      const request: GopherRequest = { selector: '/test.txt', searchTerms: undefined };
      const clientIP = '192.168.1.100';

      // Should allow multiple requests within limit
      for (let i = 0; i < 10; i++) {
        expect(() => {
          securityManager.isRequestAllowed(request, clientIP);
        }).not.toThrow();
      }
    });

    test('should block requests exceeding rate limit', () => {
      const request: GopherRequest = { selector: '/test.txt', searchTerms: undefined };
      const clientIP = '192.168.1.101';

      // Make requests up to the limit (default is 100)
      for (let i = 0; i < 100; i++) {
        securityManager.isRequestAllowed(request, clientIP);
      }

      // The 101st request should be blocked
      expect(() => {
        securityManager.isRequestAllowed(request, clientIP);
      }).toThrow(GopherError);
    });

    test('should track rate limits per IP separately', () => {
      const request: GopherRequest = { selector: '/test.txt', searchTerms: undefined };
      const clientIP1 = '192.168.1.102';
      const clientIP2 = '192.168.1.103';

      // Exhaust rate limit for first IP
      for (let i = 0; i < 100; i++) {
        securityManager.isRequestAllowed(request, clientIP1);
      }

      // First IP should be blocked
      expect(() => {
        securityManager.isRequestAllowed(request, clientIP1);
      }).toThrow(GopherError);

      // Second IP should still work
      expect(() => {
        securityManager.isRequestAllowed(request, clientIP2);
      }).not.toThrow();
    });

    test('should provide rate limit status', () => {
      const clientIP = '192.168.1.104';
      
      const initialStatus = securityManager.getRateLimitStatus(clientIP);
      expect(initialStatus.remaining).toBe(100);

      // Make some requests
      const request: GopherRequest = { selector: '/test.txt', searchTerms: undefined };
      for (let i = 0; i < 5; i++) {
        securityManager.isRequestAllowed(request, clientIP);
      }

      const updatedStatus = securityManager.getRateLimitStatus(clientIP);
      expect(updatedStatus.remaining).toBe(95);
    });
  });

  describe('Input Validation', () => {
    test('should reject selectors that are too long', () => {
      const longSelector = '/test' + 'a'.repeat(300); // Over 255 chars
      const request: GopherRequest = { selector: longSelector, searchTerms: undefined };

      expect(() => {
        securityManager.isRequestAllowed(request, '127.0.0.1');
      }).toThrow(GopherError);
    });

    test('should reject selectors with forbidden control characters', () => {
      const forbiddenRequests: GopherRequest[] = [
        { selector: '/test\x01.txt', searchTerms: undefined },
        { selector: '/test\x02.txt', searchTerms: undefined },
        { selector: '/test\x1f.txt', searchTerms: undefined },
        { selector: '/test\x7f.txt', searchTerms: undefined }
      ];

      forbiddenRequests.forEach(request => {
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).toThrow(GopherError);
      });
    });

    test('should allow normal ASCII characters', () => {
      const validRequests: GopherRequest[] = [
        { selector: '/test-file_123.txt', searchTerms: undefined },
        { selector: '/My Documents/file.txt', searchTerms: undefined },
        { selector: '/folder with spaces/file.txt', searchTerms: undefined }
      ];

      validRequests.forEach(request => {
        expect(() => {
          securityManager.isRequestAllowed(request, '127.0.0.1');
        }).not.toThrow();
      });
    });
  });

  describe('File Type Validation', () => {
    test('should block dangerous file extensions', () => {
      const dangerousFiles = [
        '/malware.exe',
        '/script.bat',
        '/command.cmd',
        '/program.com',
        '/screen.scr',
        '/program.pif',
        '/script.vbs',
        '/malware.js',
        '/archive.jar',
        '/script.sh',
        '/binary.bin'
      ];

      dangerousFiles.forEach(filePath => {
        expect(securityManager.isFileTypeAllowed(filePath)).toBe(false);
      });
    });

    test('should allow safe file extensions', () => {
      const safeFiles = [
        '/document.txt',
        '/readme.md',
        '/data.json',
        '/config.yaml',
        '/image.jpg',
        '/photo.png',
        '/archive.zip'
      ];

      safeFiles.forEach(filePath => {
        expect(securityManager.isFileTypeAllowed(filePath)).toBe(true);
      });
    });
  });

  describe('Path Sanitization', () => {
    test('should sanitize malicious input', () => {
      const maliciousPath = '/test<script>alert("xss")</script>.txt';
      const sanitizedPath = securityManager.sanitizePath(maliciousPath);
      
      expect(sanitizedPath).not.toContain('<script>');
      expect(sanitizedPath).not.toContain('alert');
    });

    test('should normalize path separators', () => {
      const windowsPath = '\\test\\file.txt';
      const sanitizedPath = securityManager.sanitizePath(windowsPath);
      
      expect(sanitizedPath).toContain('/test');
    });

    test('should ensure path starts with slash', () => {
      const relativePath = 'test/file.txt';
      const sanitizedPath = securityManager.sanitizePath(relativePath);
      
      expect(sanitizedPath).toMatch(/^.*\/test/);
    });

    test('should prevent path traversal in sanitized paths', () => {
      const traversalPath = '/test/../../../etc/passwd';
      
      expect(() => {
        securityManager.sanitizePath(traversalPath);
      }).toThrow(GopherError);
    });
  });

  describe('File Size Validation', () => {
    test('should allow files within size limit', () => {
      const normalSize = 1024 * 1024; // 1MB
      
      expect(() => {
        securityManager.validateFileSize(normalSize);
      }).not.toThrow();
    });

    test('should block files exceeding size limit', () => {
      const largeSize = 50 * 1024 * 1024; // 50MB (over default 10MB limit)
      
      expect(() => {
        securityManager.validateFileSize(largeSize);
      }).toThrow(GopherError);
    });
  });
});