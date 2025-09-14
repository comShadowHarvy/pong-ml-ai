/**
 * Enhanced Pong - Logger Utility
 * 
 * Comprehensive logging system using Winston with:
 * - Multiple log levels and formats
 * - File rotation and management
 * - Console and file outputs
 * - Structured logging for monitoring
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
    })
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const ts = new Date().toLocaleTimeString();
        let logMessage = `${ts} ${level}: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta, null, 2)}`;
        }
        
        return logMessage;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { 
        service: 'enhanced-pong-backend',
        version: '1.6.0',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        // Error log file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        
        // Combined log file
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 10,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        
        // Console output for development
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
            level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
        })
    ],
    
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            maxsize: 5242880,
            maxFiles: 3
        })
    ],
    
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            maxsize: 5242880,
            maxFiles: 3
        })
    ]
});

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
    const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        userId: req.user?.id || null
    };
    
    if (res.statusCode >= 400) {
        logger.warn('HTTP Request', logData);
    } else {
        logger.info('HTTP Request', logData);
    }
};

// Add game event logging helper
logger.logGameEvent = (event, userId, data = {}) => {
    logger.info('Game Event', {
        event,
        userId,
        timestamp: new Date().toISOString(),
        ...data
    });
};

// Add security event logging helper
logger.logSecurityEvent = (event, details = {}) => {
    logger.warn('Security Event', {
        event,
        timestamp: new Date().toISOString(),
        ...details
    });
};

// Add performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
    const level = duration > 1000 ? 'warn' : 'info';
    logger[level]('Performance', {
        operation,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        ...metadata
    });
};

// Add database logging helper
logger.logDatabaseQuery = (query, duration, params = []) => {
    if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('Database Query', {
            query,
            params,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = logger;