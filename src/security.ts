import * as path from 'path';
import { GopherRequest, SecurityOptions, GopherError } from './types.js';

export class SecurityManager {
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  private options: SecurityOptions;

  constructor(options?: Partial<SecurityOptions>) {
    this.options = {
      enablePathTraversalProtection: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      rateLimitRequests: 100,
      rateLimitWindow: 60 * 1000, // 1 minute
      ...options,
    };
  }

  public isRequestAllowed(request: GopherRequest, clientIP: string): boolean {
    try {
      this.validatePathTraversal(request.selector);
      this.checkRateLimit(clientIP);
      this.validateSelector(request.selector);
      return true;
    } catch (error) {
      if (error instanceof GopherError) {
        throw error;
      }
      throw new GopherError(
        'Security validation failed',
        'SECURITY_ERROR',
        403
      );
    }
  }

  private validatePathTraversal(selector: string): void {
    if (!this.options.enablePathTraversalProtection) {
      return;
    }

    const normalizedPath = path.posix.normalize(selector);
    
    if (normalizedPath.includes('..')) {
      throw new GopherError(
        'Path traversal detected',
        'PATH_TRAVERSAL',
        403
      );
    }

    const suspiciousPatterns = [
      /\.\./,
      /\/\.\//,
      /\\\.\\/, 
      /%2e%2e/i,
      /%2f/i,
      /%5c/i,
      /\0/,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(selector)) {
        throw new GopherError(
          'Suspicious path pattern detected',
          'SUSPICIOUS_PATH',
          403
        );
      }
    }
  }

  private checkRateLimit(clientIP: string): void {
    const now = Date.now();
    const clientData = this.rateLimitMap.get(clientIP);

    if (!clientData) {
      this.rateLimitMap.set(clientIP, {
        count: 1,
        resetTime: now + this.options.rateLimitWindow,
      });
      return;
    }

    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + this.options.rateLimitWindow;
      return;
    }

    if (clientData.count >= this.options.rateLimitRequests) {
      throw new GopherError(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    clientData.count++;
  }

  private validateSelector(selector: string): void {
    if (selector.length > 255) {
      throw new GopherError(
        'Selector too long',
        'SELECTOR_TOO_LONG',
        414
      );
    }

    // eslint-disable-next-line no-control-regex
    const forbiddenChars = /[\u0000-\u0008\u000e-\u001f\u007f]/;
    if (forbiddenChars.test(selector)) {
      throw new GopherError(
        'Invalid characters in selector',
        'INVALID_SELECTOR',
        400
      );
    }

    const reservedPaths = [
      '/proc',
      '/sys',
      '/dev',
      '/etc/passwd',
      '/etc/shadow',
      '/root',
      '/home',
    ];

    const normalizedSelector = path.posix.normalize(selector.toLowerCase());
    for (const reservedPath of reservedPaths) {
      if (normalizedSelector.startsWith(reservedPath)) {
        throw new GopherError(
          'Access to system paths not allowed',
          'SYSTEM_PATH_FORBIDDEN',
          403
        );
      }
    }
  }

  public sanitizePath(inputPath: string, documentRoot: string): string {
    let sanitized = inputPath;

    sanitized = sanitized.replace(/[^\w\s\-_./]/g, '');
    
    sanitized = path.posix.normalize(sanitized);
    
    if (!sanitized.startsWith('/')) {
      sanitized = '/' + sanitized;
    }

    const resolvedPath = path.resolve(documentRoot, sanitized.substring(1));
    
    if (!resolvedPath.startsWith(path.resolve(documentRoot))) {
      throw new GopherError(
        'Path outside document root',
        'PATH_OUTSIDE_ROOT',
        403
      );
    }

    return resolvedPath;
  }

  public validateFileSize(fileSize: number): void {
    if (fileSize > this.options.maxFileSize) {
      throw new GopherError(
        'File too large',
        'FILE_TOO_LARGE',
        413
      );
    }
  }

  public isFileTypeAllowed(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase();
    
    const forbiddenExtensions = [
      '.exe',
      '.bat',
      '.cmd',
      '.com',
      '.scr',
      '.pif',
      '.vbs',
      '.js',
      '.jar',
      '.sh',
      '.bin',
    ];

    return !forbiddenExtensions.includes(extension);
  }

  public cleanupRateLimit(): void {
    const now = Date.now();
    for (const [ip, data] of this.rateLimitMap.entries()) {
      if (now > data.resetTime) {
        this.rateLimitMap.delete(ip);
      }
    }
  }

  public getRateLimitStatus(clientIP: string): { remaining: number; resetTime: number } {
    const clientData = this.rateLimitMap.get(clientIP);
    if (!clientData) {
      return {
        remaining: this.options.rateLimitRequests,
        resetTime: Date.now() + this.options.rateLimitWindow,
      };
    }

    return {
      remaining: Math.max(0, this.options.rateLimitRequests - clientData.count),
      resetTime: clientData.resetTime,
    };
  }
}