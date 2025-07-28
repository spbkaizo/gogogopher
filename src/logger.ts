export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown> | undefined;
}

export class Logger {
  private logLevel: LogLevel;

  constructor(
    private enabled: boolean = true,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.logLevel = logLevel;
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  public error(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  public fatal(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!this.enabled || level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
    };

    const formattedMessage = this.formatLogEntry(entry);
    
    if (level >= LogLevel.ERROR) {
      console.error(formattedMessage);
    } else if (level === LogLevel.WARN) {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp;
    const message = entry.message;
    
    let formattedMessage = `[${timestamp}] ${levelName}: ${message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metadataString = JSON.stringify(entry.metadata);
      formattedMessage += ` | ${metadataString}`;
    }
    
    return formattedMessage;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public static createFromEnvironment(): Logger {
    const enabled = process.env.GOPHER_LOGGING !== 'false';
    const logLevelEnv = process.env.GOPHER_LOG_LEVEL?.toUpperCase();
    
    let logLevel = LogLevel.INFO;
    if (logLevelEnv && logLevelEnv in LogLevel) {
      logLevel = LogLevel[logLevelEnv as keyof typeof LogLevel] as LogLevel;
    }

    return new Logger(enabled, logLevel);
  }

  public logRequest(
    clientIP: string,
    selector: string,
    responseSize: number,
    duration: number
  ): void {
    this.info('Request processed', {
      clientIP,
      selector,
      responseSize,
      duration,
    });
  }

  public logError(
    error: Error,
    context?: Record<string, unknown>
  ): void {
    this.error(error.message, {
      error: error.name,
      stack: error.stack,
      ...context,
    });
  }

  public logServerStart(hostname: string, port: number): void {
    this.info(`Gopher server started on ${hostname}:${port}`);
  }

  public logServerStop(): void {
    this.info('Gopher server stopped');
  }

  public logConnection(clientIP: string, action: 'connected' | 'disconnected'): void {
    this.debug(`Client ${action}`, { clientIP });
  }

  public logSecurity(
    event: string,
    clientIP: string,
    details?: Record<string, unknown>
  ): void {
    this.warn(`Security event: ${event}`, {
      clientIP,
      ...details,
    });
  }
}