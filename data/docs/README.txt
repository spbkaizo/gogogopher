GoGoGopher
==========

A secure, RFC 1436 compliant Gopher server written in TypeScript.

Features
--------

- RFC 1436 Compliant: Full compliance with the original Gopher protocol
- Security: Built-in path traversal protection, rate limiting, input validation
- TypeScript: Modern TypeScript implementation with full type safety
- Configurable: JSON configuration files and environment variable support
- Logging: Comprehensive structured logging with configurable levels
- CLI Interface: Easy-to-use command-line interface
- Directory Browsing: Automatic directory listing generation
- Multiple File Types: Support for text, binary, image, and HTML files
- Search: Built-in search functionality for directories

Installation
------------

Local Development:
  npm install
  npm run build
  npm start

Docker (Recommended):
  # Using Docker Compose
  docker-compose up -d

  # Or build and run directly
  docker build -t gogogopher .
  docker run -p 70:70 gogogopher

Kubernetes with Helm:
  # Install with Helm
  helm install gogogopher ./helm/gogogopher

  # Or with custom values
  helm install gogogopher ./helm/gogogopher -f values.yaml

The server will start on port 70 by default and serve files from the ./data directory.

Usage
-----

Command Line Options:
  node dist/index.js [options]

  Options:
    -p, --port <port>          Port to listen on (default: 70)  
    -h, --hostname <hostname>  Hostname to bind to (default: 0.0.0.0)
    -d, --document-root <path> Document root directory (default: ./data)
    -c, --config <file>        Configuration file path
    -v, --verbose              Enable verbose logging
    -q, --quiet                Disable logging
    --daemon                   Run as daemon
    --create-config            Create example configuration file
    --help                     Show help message
    --version                  Show version information

Environment Variables:
  GOPHER_PORT                     Port to listen on
  GOPHER_HOSTNAME                 Hostname to bind to  
  GOPHER_DOCUMENT_ROOT            Document root directory
  GOPHER_ALLOWED_DATA_DIRECTORY   Allowed data directory (security)
  GOPHER_MAX_REQUEST_SIZE         Maximum request size in bytes
  GOPHER_CONNECTION_TIMEOUT       Connection timeout in milliseconds
  GOPHER_ENABLE_LOGGING           Enable logging (true/false)
  GOPHER_LOG_LEVEL               Log level (DEBUG, INFO, WARN, ERROR, FATAL)

Configuration File:
  Create a configuration file using:
    node dist/index.js --create-config

  Example configuration:
    {
      "server": {
        "port": 70,
        "hostname": "localhost", 
        "documentRoot": "./data",
        "maxRequestSize": 1024,
        "connectionTimeout": 30000,
        "enableLogging": true,
        "allowedDataDirectory": "./data"
      },
      "security": {
        "maxFileSize": 10485760,
        "rateLimitRequests": 100,
        "rateLimitWindow": 60000
      }
    }

Security Features
-----------------

Path Traversal Protection:
- Always-on protection against directory traversal attacks
- Blocks common path traversal patterns (../, %2e%2e, etc.)
- URL encoding detection and prevention

Allowlist-Only Access:
- Only files within allowed data directory are accessible
- Default deny approach - everything outside allowlist is blocked
- No system path access possible

Rate Limiting:
- Configurable request limits per IP address
- Time-window based rate limiting
- Automatic cleanup of expired rate limit entries

Input Validation:
- Request size limits
- Selector string validation  
- Invalid character filtering
- File size limits

Testing
-------

Access your server using:

1. Telnet:
     telnet localhost 70
   Then press Enter for root directory or type a path.

2. Lynx browser:
     lynx gopher://localhost:70

3. Curl (for testing):
     echo "" | nc localhost 70

Deployment
----------

Production Deployment:

GoGoGopher is production-ready with:
- Docker support - Multi-stage builds with security best practices
- Kubernetes manifests - Ready for container orchestration
- Helm charts - Easy deployment and configuration management  
- CI/CD pipelines - Automated testing, building, and deployment
- Health checks - Built-in monitoring and observability
- Multi-architecture - Supports AMD64 and ARM64

See DEPLOYMENT.txt for detailed deployment instructions.

Container Registry:
  Pre-built images are available at:
    # Pull the latest image
    docker pull ghcr.io/spbkaizo/gogogopher:latest

    # Or specific version  
    docker pull ghcr.io/spbkaizo/gogogopher:1.0.0

Protocol Compliance
-------------------

This server implements the Gopher protocol as specified in RFC 1436:

- Item Types: Supports all standard Gopher item types (0-9, +, g, I, T, h, i)
- Response Format: Proper tab-separated field format
- Directory Listings: RFC-compliant menu structure
- Error Handling: Standard error item type (3) responses
- Search: Support for search servers (item type 7)

File Types:
  The server automatically detects file types and assigns appropriate 
  Gopher item types:

  - Text files (.txt, .md): Item type 0
  - Directories: Item type 1
  - Images (.gif): Item type g  
  - Images (.jpg, .png, etc.): Item type I
  - HTML files (.html, .htm): Item type h
  - Binary files (.exe, .zip, etc.): Item type 9

Development
-----------

Scripts:
  npm run build    - Compile TypeScript to JavaScript
  npm run dev      - Run in development mode with ts-node
  npm start        - Start the compiled server
  npm test         - Run tests
  npm run lint     - Run ESLint
  npm run format   - Format code with Prettier

Project Structure:
  src/
  ├── types.ts          # Type definitions and interfaces
  ├── server.ts         # Main TCP server implementation  
  ├── protocol.ts       # Gopher protocol handler
  ├── filesystem.ts     # File system operations
  ├── security.ts       # Security and validation
  ├── config.ts         # Configuration management
  ├── logger.ts         # Logging system
  ├── cli.ts            # Command-line interface
  └── index.ts          # Main entry point

License
-------

MIT License

Contributing
------------

1. Fork the repository
2. Create a feature branch
3. Make your changes  
4. Add tests if applicable
5. Submit a pull request

Support
-------

For issues and feature requests, please use the GitHub issue tracker at:
https://github.com/spbkaizo/gogogopher