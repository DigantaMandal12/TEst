# ========================================================
# Production Dockerfile — Campus Equipment Lending Exchange
# Multi-stage minimal Alpine Linux container (Node.js 24 LTS)
# ========================================================

FROM node:24-alpine AS base

# Install dumb-init for proper PID 1 signal forwarding (SIGTERM, SIGINT)
RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=3000

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies cleanly
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source code
COPY . .

# Set permissions to the built-in non-root node user
RUN chown -R node:node /usr/src/app

# Run as non-root user for container security
USER node

# Expose HTTP port (configured via process.env.PORT)
EXPOSE 3000

# Container health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-3000}/health || exit 1

# Launch application through dumb-init to handle termination signals gracefully
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]
