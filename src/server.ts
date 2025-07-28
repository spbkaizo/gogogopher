import * as net from 'net';
import { EventEmitter } from 'events';
import { ServerConfig, GopherRequest, GopherError } from './types.js';
import { ProtocolHandler } from './protocol.js';
import { Logger } from './logger.js';
import { SecurityManager } from './security.js';

export class GopherServer extends EventEmitter {
  private server: net.Server;
  private protocolHandler: ProtocolHandler;
  private logger: Logger;
  private security: SecurityManager;
  private connections = new Set<net.Socket>();
  private isShuttingDown = false;

  constructor(
    private config: ServerConfig,
    protocolHandler?: ProtocolHandler,
    logger?: Logger,
    security?: SecurityManager
  ) {
    super();
    this.protocolHandler = protocolHandler || new ProtocolHandler(config);
    this.logger = logger || new Logger(config.enableLogging);
    this.security = security || new SecurityManager();
    this.server = this.createServer();
  }

  private createServer(): net.Server {
    const server = net.createServer({
      allowHalfOpen: false,
      pauseOnConnect: false,
    });

    server.on('connection', this.handleConnection.bind(this));
    server.on('listening', this.handleListening.bind(this));
    server.on('close', this.handleClose.bind(this));
    server.on('error', this.handleError.bind(this));

    return server;
  }

  private handleConnection(socket: net.Socket): void {
    if (this.isShuttingDown) {
      socket.destroy();
      return;
    }

    this.connections.add(socket);
    const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.info(`New connection from ${clientInfo}`);

    socket.setTimeout(this.config.connectionTimeout);
    socket.setEncoding('utf8');

    socket.on('data', (data: string) => {
      this.handleRequest(socket, data, clientInfo);
    });

    socket.on('timeout', () => {
      this.logger.warn(`Connection timeout for ${clientInfo}`);
      socket.destroy();
    });

    socket.on('error', (error: Error) => {
      this.logger.error(`Socket error for ${clientInfo}: ${error.message}`);
      socket.destroy();
    });

    socket.on('close', () => {
      this.connections.delete(socket);
      this.logger.info(`Connection closed for ${clientInfo}`);
    });
  }

  private async handleRequest(
    socket: net.Socket,
    data: string,
    clientInfo: string
  ): Promise<void> {
    try {
      if (data.length > this.config.maxRequestSize) {
        throw new GopherError(
          'Request too large',
          'REQUEST_TOO_LARGE',
          413
        );
      }

      const request = this.parseRequest(data);
      this.logger.info(`Request from ${clientInfo}: selector="${request.selector}"`);

      if (!this.security.isRequestAllowed(request, socket.remoteAddress || '')) {
        throw new GopherError(
          'Request not allowed',
          'REQUEST_FORBIDDEN',
          403
        );
      }

      const response = await this.protocolHandler.handleRequest(request);
      
      if (response.isDirectory && response.items) {
        const directoryListing = this.formatDirectoryListing(response.items);
        socket.write(directoryListing);
      } else {
        if (Buffer.isBuffer(response.data)) {
          socket.write(response.data);
        } else {
          socket.write(response.data, 'utf8');
        }
      }

      socket.write('.\r\n');
      socket.end();

    } catch (error) {
      this.handleRequestError(socket, error, clientInfo);
    }
  }

  private parseRequest(data: string): GopherRequest {
    const trimmedData = data.trim();
    const parts = trimmedData.split('\t');
    
    return {
      selector: parts[0] || '',
      searchTerms: parts[1] || undefined,
    };
  }

  private formatDirectoryListing(items: Array<{ type: string; displayString: string; selector: string; hostname: string; port: number }>): string {
    return items
      .map(item => 
        `${item.type}${item.displayString}\t${item.selector}\t${item.hostname}\t${item.port}\r\n`
      )
      .join('');
  }

  private handleRequestError(
    socket: net.Socket,
    error: unknown,
    clientInfo: string
  ): void {
    if (error instanceof GopherError) {
      this.logger.error(`Gopher error for ${clientInfo}: ${error.message}`);
      socket.write(`3Error: ${error.message}\terror\terror\t70\r\n`);
    } else if (error instanceof Error) {
      this.logger.error(`Unexpected error for ${clientInfo}: ${error.message}`);
      socket.write('3Internal server error\terror\terror\t70\r\n');
    } else {
      this.logger.error(`Unknown error for ${clientInfo}: ${String(error)}`);
      socket.write('3Internal server error\terror\terror\t70\r\n');
    }
    
    socket.write('.\r\n');
    socket.end();
  }

  private handleListening(): void {
    const address = this.server.address();
    if (address && typeof address === 'object') {
      this.logger.info(`Gopher server listening on ${address.address}:${address.port}`);
      this.emit('listening', address);
    }
  }

  private handleClose(): void {
    this.logger.info('Gopher server closed');
    this.emit('close');
  }

  private handleError(error: Error): void {
    this.logger.error(`Server error: ${error.message}`);
    this.emit('error', error);
  }

  public listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('listening', resolve);
      this.server.once('error', reject);
      this.server.listen(this.config.port, this.config.hostname);
    });
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info('Shutting down server...');

    for (const socket of this.connections) {
      socket.destroy();
    }

    return new Promise<void>((resolve) => {
      this.server.close(() => {
        this.logger.info('Server shutdown complete');
        resolve();
      });
    });
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public isListening(): boolean {
    return this.server.listening;
  }

  public getHealthStatus(): { status: string; uptime: number; connections: number; listening: boolean } {
    return {
      status: this.isListening() && !this.isShuttingDown ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      connections: this.connections.size,
      listening: this.isListening(),
    };
  }
}