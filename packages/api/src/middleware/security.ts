/**
 * Security Middleware for Production Hardening
 * **Validates: Requirements 9.1, 9.4, 9.5**
 * 
 * Comprehensive security middleware including input validation,
 * sanitization, CORS, security headers, and attack prevention.
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult, sanitizeBody } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../utils/logger';

/**
 * Security headers middleware using Helmet
 * **Validates: Requirements 9.1**
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'strict-dynamic'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  
  // Permissions Policy
  permissionsPolicy: {
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: [],
    },
  },
  
  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // Disabled for API compatibility
  
  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: {
    policy: 'same-origin',
  },
  
  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },
});

/**
 * Enhanced CORS configuration with explicit origins
 * **Validates: Requirements 9.1**
 */
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://autoqa-pilot.com',
      'https://app.autoqa-pilot.com',
    ];
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS origin blocked', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Correlation-ID',
    'X-Request-ID',
    'X-Hub-Signature-256',
    'X-GitLab-Token',
  ],
  exposedHeaders: [
    'X-Correlation-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],
  maxAge: 86400, // 24 hours
};

/**
 * Input sanitization middleware
 * **Validates: Requirements 9.1**
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  } catch (error) {
    logger.error('Input sanitization error', {
      error: (error as Error).message,
      correlationId: (req as any).correlationId,
    });
    
    res.status(400).json({
      error: {
        code: 'SANITIZATION_ERROR',
        message: 'Invalid input data',
        correlationId: (req as any).correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Remove potential XSS payloads
    return DOMPurify.sanitize(obj, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    }).trim();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key name
      const sanitizedKey = DOMPurify.sanitize(key, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
      });
      
      // Recursively sanitize value
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    
    return sanitized;
  }
  
  return obj;
}

/**
 * SQL injection prevention middleware
 * **Validates: Requirements 9.1**
 */
export const preventSQLInjection = (req: Request, res: Response, next: NextFunction) => {
  const sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /('|(\\')|(;)|(\\;)|(\|)|(\*)|(%)|(<)|(>)|(\^)|(\[)|(\])|(\{)|(\})|(\()|(\))/,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
  ];
  
  const checkForSQLInjection = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlInjectionPatterns.some(pattern => pattern.test(value));
    }
    
    if (Array.isArray(value)) {
      return value.some(item => checkForSQLInjection(item));
    }
    
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(val => checkForSQLInjection(val));
    }
    
    return false;
  };
  
  // Check all input sources
  const inputs = [req.body, req.query, req.params];
  
  for (const input of inputs) {
    if (checkForSQLInjection(input)) {
      logger.warn('SQL injection attempt detected', {
        correlationId: (req as any).correlationId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method,
        suspiciousInput: JSON.stringify(input).substring(0, 200),
      });
      
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid characters detected in input',
          correlationId: (req as any).correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  next();
};

/**
 * XSS prevention middleware
 * **Validates: Requirements 9.1**
 */
export const preventXSS = (req: Request, res: Response, next: NextFunction) => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  ];
  
  const checkForXSS = (value: any): boolean => {
    if (typeof value === 'string') {
      return xssPatterns.some(pattern => pattern.test(value));
    }
    
    if (Array.isArray(value)) {
      return value.some(item => checkForXSS(item));
    }
    
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(val => checkForXSS(val));
    }
    
    return false;
  };
  
  // Check all input sources
  const inputs = [req.body, req.query, req.params];
  
  for (const input of inputs) {
    if (checkForXSS(input)) {
      logger.warn('XSS attempt detected', {
        correlationId: (req as any).correlationId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method,
        suspiciousInput: JSON.stringify(input).substring(0, 200),
      });
      
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Potentially malicious content detected',
          correlationId: (req as any).correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  next();
};

/**
 * Request size limiting middleware
 * **Validates: Requirements 9.1**
 */
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction) => {
  const maxSizes = {
    '/api/webhooks': 1024 * 1024, // 1MB for webhooks
    '/api/projects': 512 * 1024,  // 512KB for projects
    '/api/users': 256 * 1024,     // 256KB for users
    default: 100 * 1024,          // 100KB default
  };
  
  const path = req.path;
  let maxSize = maxSizes.default;
  
  // Find matching path
  for (const [pathPattern, size] of Object.entries(maxSizes)) {
    if (pathPattern !== 'default' && path.startsWith(pathPattern)) {
      maxSize = size;
      break;
    }
  }
  
  const contentLength = parseInt(req.get('content-length') || '0');
  
  if (contentLength > maxSize) {
    logger.warn('Request size limit exceeded', {
      correlationId: (req as any).correlationId,
      path,
      contentLength,
      maxSize,
      ip: req.ip,
    });
    
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request size ${contentLength} exceeds limit ${maxSize}`,
        correlationId: (req as any).correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  next();
};

/**
 * Security event logging middleware
 * **Validates: Requirements 9.1**
 */
export const securityEventLogger = (req: Request, res: Response, next: NextFunction) => {
  const originalSend = res.send;
  
  res.send = function(body: any) {
    // Log security-related responses
    if (res.statusCode >= 400) {
      const securityCodes = ['INVALID_API_KEY', 'MISSING_API_KEY', 'INVALID_SIGNATURE', 'RATE_LIMIT_EXCEEDED'];
      
      try {
        const responseBody = typeof body === 'string' ? JSON.parse(body) : body;
        
        if (responseBody?.error?.code && securityCodes.includes(responseBody.error.code)) {
          logger.warn('Security event detected', {
            correlationId: (req as any).correlationId,
            securityEvent: responseBody.error.code,
            statusCode: res.statusCode,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        // Ignore JSON parsing errors
      }
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Dependency confusion attack prevention
 * **Validates: Requirements 9.1**
 */
export const preventDependencyConfusion = () => {
  // This would typically be implemented at the package manager level
  // For runtime protection, we can validate package integrity
  
  const suspiciousPackages = [
    'lodash-utils',
    'request-promise',
    'colors.js',
    'faker.js',
  ];
  
  // Check if any suspicious packages are loaded
  const loadedModules = Object.keys(require.cache);
  
  for (const suspiciousPackage of suspiciousPackages) {
    const found = loadedModules.some(module => module.includes(suspiciousPackage));
    
    if (found) {
      logger.error('Suspicious package detected', {
        package: suspiciousPackage,
        loadedModules: loadedModules.filter(m => m.includes(suspiciousPackage)),
      });
      
      // In production, this might terminate the process
      // For now, just log the warning
    }
  }
};

/**
 * Initialize security middleware
 */
export const initializeSecurity = () => {
  // Check for dependency confusion attacks on startup
  preventDependencyConfusion();
  
  logger.info('Security middleware initialized', {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['localhost'],
    securityHeaders: 'enabled',
    inputSanitization: 'enabled',
    sqlInjectionPrevention: 'enabled',
    xssPrevention: 'enabled',
  });
};