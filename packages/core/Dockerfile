# Use official Node.js image
FROM node:18-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright to use installed Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create directories for tests and reports
RUN mkdir -p /app/tests /app/reports

# Run as non-root user
RUN addgroup -g 1001 -S autoqa && \
    adduser -S autoqa -u 1001 && \
    chown -R autoqa:autoqa /app

USER autoqa

# Default command
CMD ["node", "dist/index.js"]
