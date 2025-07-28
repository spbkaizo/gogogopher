# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci --silent

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Add non-root user for security
RUN addgroup -g 1001 -S gopher && \
    adduser -S gopher -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --silent && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy gopher content directory
COPY --from=builder /app/gopher-content ./gopher-content

# Change ownership to non-root user
RUN chown -R gopher:gopher /app

# Switch to non-root user
USER gopher

# Expose Gopher port
EXPOSE 70

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD nc -z localhost 70 || exit 1

# Default command
CMD ["node", "dist/index.js"]