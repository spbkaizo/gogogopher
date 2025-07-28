# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Docker support with multi-stage builds
- Kubernetes deployment manifests
- Helm chart for easy deployment
- GitHub Actions CI/CD pipelines
- Security scanning workflows
- Health check endpoints
- Multi-architecture container builds (AMD64/ARM64)
- Production deployment documentation

## [1.0.0] - 2024-01-XX

### Added
- Initial release of GoGoGopher server
- RFC 1436 compliant Gopher protocol implementation
- TypeScript implementation with full type safety
- TCP server with connection management
- Path traversal protection and security features
- Rate limiting per IP address
- Configurable server settings
- CLI interface with comprehensive options
- Structured logging with configurable levels
- Directory browsing with automatic listing generation
- Search functionality for directories
- Support for multiple file types (text, binary, images, HTML)
- Example Gopher content included

### Security
- Non-root container execution
- Input validation and sanitization
- File access controls and blocked paths
- Request size limits
- Connection timeout handling

### Documentation
- Comprehensive README with usage examples
- Configuration guide with environment variables
- Development setup instructions
- Gopher protocol compliance documentation