import * as fs from 'fs/promises';
import * as path from 'path';
import { Stats } from 'fs';
import { GopherItem, GopherItemType, ServerConfig, GopherError } from './types.js';
import { ProtocolHandler } from './protocol.js';
import { SecurityManager } from './security.js';

export class FileSystemHandler {
  private security: SecurityManager;

  constructor(
    private config: ServerConfig,
    security?: SecurityManager
  ) {
    this.security = security || new SecurityManager();
  }

  public async getFileStats(filePath: string): Promise<Stats> {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'ENOENT') {
          throw new GopherError(
            'File not found',
            'FILE_NOT_FOUND',
            404
          );
        }
        if (error.code === 'EACCES') {
          throw new GopherError(
            'Permission denied',
            'PERMISSION_DENIED',
            403
          );
        }
      }
      throw new GopherError(
        'File system error',
        'FILESYSTEM_ERROR',
        500
      );
    }
  }

  public async readFile(filePath: string): Promise<string | Buffer> {
    try {
      const stats = await this.getFileStats(filePath);
      
      this.security.validateFileSize(stats.size);
      
      if (!this.security.isFileTypeAllowed(filePath)) {
        throw new GopherError(
          'File type not allowed',
          'FILE_TYPE_FORBIDDEN',
          403
        );
      }

      const extension = path.extname(filePath).toLowerCase();
      const isBinary = this.isBinaryFile(extension);

      if (isBinary) {
        return await fs.readFile(filePath);
      } else {
        return await fs.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      if (error instanceof GopherError) {
        throw error;
      }
      throw new GopherError(
        'Failed to read file',
        'READ_ERROR',
        500
      );
    }
  }

  public async getDirectoryListing(dirPath: string): Promise<GopherItem[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items: GopherItem[] = [];

      if (dirPath !== this.config.documentRoot) {
        items.push({
          type: GopherItemType.DIRECTORY,
          displayString: '..',
          selector: this.getParentSelector(dirPath),
          hostname: this.config.hostname,
          port: this.config.port,
        });
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.config.documentRoot, fullPath);
        const selector = '/' + relativePath.replace(/\\/g, '/');

        const itemType = ProtocolHandler.determineItemType(fullPath, entry.isDirectory());
        
        items.push({
          type: itemType as GopherItemType,
          displayString: this.formatDisplayString(entry.name, entry.isDirectory()),
          selector: selector,
          hostname: this.config.hostname,
          port: this.config.port,
        });
      }

      return items.sort((a, b) => {
        if (a.type === GopherItemType.DIRECTORY && b.type !== GopherItemType.DIRECTORY) {
          return -1;
        }
        if (a.type !== GopherItemType.DIRECTORY && b.type === GopherItemType.DIRECTORY) {
          return 1;
        }
        return a.displayString.localeCompare(b.displayString);
      });

    } catch (error) {
      if (error instanceof GopherError) {
        throw error;
      }
      throw new GopherError(
        'Failed to read directory',
        'DIRECTORY_ERROR',
        500
      );
    }
  }

  private getParentSelector(dirPath: string): string {
    const parentPath = path.dirname(dirPath);
    if (parentPath === this.config.documentRoot) {
      return '/';
    }
    const relativePath = path.relative(this.config.documentRoot, parentPath);
    return '/' + relativePath.replace(/\\/g, '/');
  }

  private formatDisplayString(filename: string, isDirectory: boolean): string {
    const maxLength = 67;
    let displayName = filename;
    
    if (isDirectory) {
      displayName = `${filename}/`;
    }

    if (displayName.length > maxLength) {
      displayName = displayName.substring(0, maxLength - 3) + '...';
    }

    return displayName;
  }

  private isBinaryFile(extension: string): boolean {
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
      '.pdf', '.zip', '.tar', '.gz', '.rar',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov',
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    ];

    return binaryExtensions.includes(extension);
  }

  public async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch {
      throw new GopherError(
        'Failed to create directory',
        'MKDIR_ERROR',
        500
      );
    }
  }

  public async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      await this.ensureDirectory(dir);
      await fs.writeFile(filePath, content);
    } catch {
      throw new GopherError(
        'Failed to write file',
        'WRITE_ERROR',
        500
      );
    }
  }

  public async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (deleteError) {
      if (deleteError instanceof Error && 'code' in deleteError && deleteError.code === 'ENOENT') {
        return;
      }
      throw new GopherError(
        'Failed to delete file',
        'DELETE_ERROR',
        500
      );
    }
  }

  public isPathAllowed(requestPath: string): boolean {
    const resolvedPath = path.resolve(requestPath);
    const documentRoot = path.resolve(this.config.documentRoot);
    
    return resolvedPath.startsWith(documentRoot);
  }
}