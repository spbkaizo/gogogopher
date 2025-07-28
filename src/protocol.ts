import * as path from 'path';
import { GopherRequest, GopherResponse, ServerConfig, GopherError, GopherItemType, GopherItem } from './types.js';
import { FileSystemHandler } from './filesystem.js';
import { Logger } from './logger.js';

export class ProtocolHandler {
  private fileSystem: FileSystemHandler;
  private logger: Logger;

  constructor(
    private config: ServerConfig,
    fileSystem?: FileSystemHandler,
    logger?: Logger
  ) {
    this.fileSystem = fileSystem || new FileSystemHandler(config);
    this.logger = logger || new Logger(config.enableLogging);
  }

  public async handleRequest(request: GopherRequest): Promise<GopherResponse> {
    try {
      this.validateRequest(request);
      
      let selector = request.selector;
      
      if (selector === '' || selector === '/') {
        selector = '/';
      }

      const resolvedPath = this.resolvePath(selector);
      this.logger.debug(`Resolved path: ${resolvedPath}`);

      const stats = await this.fileSystem.getFileStats(resolvedPath);
      
      if (stats.isDirectory()) {
        return await this.handleDirectoryRequest(resolvedPath, request);
      } else {
        return await this.handleFileRequest(resolvedPath);
      }
    } catch (error) {
      this.logger.error(`Protocol error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private validateRequest(request: GopherRequest): void {
    if (request.selector.includes('..')) {
      throw new GopherError(
        'Path traversal not allowed',
        'PATH_TRAVERSAL',
        403
      );
    }

    if (request.selector.length > 255) {
      throw new GopherError(
        'Selector too long',
        'SELECTOR_TOO_LONG',
        414
      );
    }
  }

  private resolvePath(selector: string): string {
    let normalizedSelector = selector;
    
    if (!normalizedSelector.startsWith('/')) {
      normalizedSelector = '/' + normalizedSelector;
    }

    normalizedSelector = path.posix.normalize(normalizedSelector);
    
    const resolvedPath = path.join(this.config.documentRoot, normalizedSelector);
    
    if (!resolvedPath.startsWith(this.config.documentRoot)) {
      throw new GopherError(
        'Path traversal not allowed',
        'PATH_TRAVERSAL',
        403
      );
    }

    return resolvedPath;
  }

  private async handleDirectoryRequest(
    dirPath: string,
    request: GopherRequest
  ): Promise<GopherResponse> {
    if (request.searchTerms) {
      return await this.handleSearchRequest(dirPath, request.searchTerms);
    }

    const items = await this.fileSystem.getDirectoryListing(dirPath);
    
    return {
      data: '',
      isDirectory: true,
      items: items,
    };
  }

  private async handleFileRequest(filePath: string): Promise<GopherResponse> {
    const content = await this.fileSystem.readFile(filePath);
    
    return {
      data: content,
      isDirectory: false,
    };
  }

  private async handleSearchRequest(
    dirPath: string,
    searchTerms: string
  ): Promise<GopherResponse> {
    this.logger.info(`Search request in ${dirPath} for: ${searchTerms}`);
    
    const allItems = await this.fileSystem.getDirectoryListing(dirPath);
    
    const filteredItems = allItems.filter(item =>
      item.displayString.toLowerCase().includes(searchTerms.toLowerCase()) ||
      item.selector.toLowerCase().includes(searchTerms.toLowerCase())
    );

    return {
      data: '',
      isDirectory: true,
      items: filteredItems,
    };
  }

  public static determineItemType(filePath: string, isDirectory: boolean): string {
    if (isDirectory) {
      return '1';
    }

    const extension = path.extname(filePath).toLowerCase();
    
    switch (extension) {
      case '.txt':
      case '.md':
      case '.readme':
        return '0';
      case '.gif':
        return 'g';
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.bmp':
        return 'I';
      case '.html':
      case '.htm':
        return 'h';
      case '.exe':
      case '.zip':
      case '.tar':
      case '.gz':
      case '.pdf':
        return '9';
      default:
        return '0';
    }
  }

  public createErrorResponse(message: string): GopherResponse {
    return {
      data: `3${message}\terror\terror\t70\r\n`,
      isDirectory: true,
      items: [
        {
          type: GopherItemType.ERROR,
          displayString: message,
          selector: 'error',
          hostname: 'error',
          port: 70,
        },
      ],
    };
  }

  public parseRequest(rawRequest: string): GopherRequest {
    const trimmedData = rawRequest.trim();
    const parts = trimmedData.split('\t');
    
    return {
      selector: parts[0] || '/',
      searchTerms: parts[1] || undefined,
    };
  }

  public formatDirectoryListing(items: GopherItem[]): string {
    let result = '';
    
    for (const item of items) {
      result += `${item.type}${item.displayString}\t${item.selector}\t${item.hostname}\t${item.port}\r\n`;
    }
    
    result += '.\r\n'; // Menu terminator
    return result;
  }
}