// AutoQA Pilot API Server
// Production-ready Express server with comprehensive middleware

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { logger, morganStream } from './utils/logger';
import { correlationId } from './middleware/correlation-id';
import { rateLimiter } from './middleware/rate-limiter';
import { 
  securityHeaders, 
  corsConfig, 
  sanitizeInput, 
  preventSQLInjection, 
  preventXSS, 
  requestSizeLimiter,
  securityEventLogger,
  initializeSecurity 
} from './middleware/security';

// Import routes
import usersRouter from './routes/users';
import projectsRouter from './routes/projects';
import webhooksRouter from './routes/webhooks';

// Load environment variables
dotenv.config();

// Initialize security
initializeSecurity();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders);

// CORS configuration
app.use(cors(corsConfig));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  strict: true,
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
}));

// Cookie parsing middleware
app.use(cookieParser());

// Request correlation ID
app.use(correlationId);

// Security middleware
app.use(requestSizeLimiter);
app.use(sanitizeInput);
app.use(preventSQLInjection);
app.use(preventXSS);
app.use(securityEventLogger);

// HTTP request logging
app.use(morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms',
  { stream: morganStream }
));

// Global rate limiting
app.use(rateLimiter.api);

// Health check endpoint
app.get('/health', (req: any, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    correlationId: req.correlationId,
  });
});

// API routes
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/webhooks', webhooksRouter);

// 404 handler
app.use('*', (req: any, res) => {
  logger.warn('Route not found', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      path: req.originalUrl,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    },
  });
});

// Global error handler
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.userId,
  });
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(error.status || 500).json({
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: isDevelopment ? error.message : 'Internal server error',
      ...(isDevelopment && { stack: error.stack }),
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    },
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during graceful shutdown', { error: err.message });
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Start server
const server = app.listen(PORT, () => {
  logger.info(`AutoQA Pilot API server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

export default app;