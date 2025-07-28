export enum GopherItemType {
  FILE = '0',
  DIRECTORY = '1',
  CSO_PHONE_BOOK = '2',
  ERROR = '3',
  BINHEX_FILE = '4',
  DOS_BINARY = '5',
  UUENCODED_FILE = '6',
  SEARCH_SERVER = '7',
  TELNET = '8',
  BINARY_FILE = '9',
  MIRROR = '+',
  GIF_IMAGE = 'g',
  IMAGE = 'I',
  TELNET_3270 = 'T',
  HTML = 'h',
  INFO = 'i',
}

export type GopherItemTypeString = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '+' | 'g' | 'I' | 'T' | 'h' | 'i';

export interface GopherItem {
  type: GopherItemType;
  displayString: string;
  selector: string;
  hostname: string;
  port: number;
}

export interface GopherRequest {
  selector: string;
  searchTerms?: string | undefined;
}

export interface GopherResponse {
  data: string | Buffer;
  isDirectory: boolean;
  items?: GopherItem[];
}

export interface ServerConfig {
  port: number;
  hostname: string;
  documentRoot: string;
  maxRequestSize: number;
  connectionTimeout: number;
  enableLogging: boolean;
  allowedDataDirectory: string;
}

export interface SecurityOptions {
  maxFileSize: number;
  rateLimitRequests: number;
  rateLimitWindow: number;
}

export class GopherError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'GopherError';
  }
}