# QA Application - Production Dockerfile
# Supports canvas and opencv with all native dependencies

FROM node:22-slim

# Install system dependencies for canvas, opencv and other native modules
RUN apt-get update && apt-get install -y \
    # Canvas dependencies
    libpixman-1-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    libpng-dev \
    librsvg2-dev \
    pkg-config \
    # Build tools
    build-essential \
    python3 \
    make \
    g++ \
    cmake \
    # Git for cloning
    git \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm turbo

# Copy package files for better caching
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy all package.json files from packages
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npx", "serve", "packages/frontend/dist", "-p", "3000", "-s"]
