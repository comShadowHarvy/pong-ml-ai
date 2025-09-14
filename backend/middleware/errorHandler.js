/**
 * Enhanced Pong - Error Handler Middleware
 * 
 * Global error handling middleware for Express:
 * - Catches and formats all application errors
 * - Provides consistent error responses
 * - Logs errors appropriately
 * - Prevents sensitive information leaks
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    
    // Log error
    logger.error(err);
    
    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message);
        error = {
            message: message.join(', '),
            code: 'VALIDATION_ERROR',
            status: 400
        };
    }
    
    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        error = {
            message: 'Invalid ID format',
            code: 'INVALID_ID',
            status: 400
        };
    }
    
    // MongoDB duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        error = {
            message: `Duplicate value for field: ${field}`,
            code: 'DUPLICATE_VALUE',
            status: 400
        };
    }
    
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error = {
            message: 'Invalid token',
            code: 'INVALID_TOKEN',
            status: 401
        };
    }
    
    if (err.name === 'TokenExpiredError') {
        error = {
            message: 'Token expired',
            code: 'TOKEN_EXPIRED',
            status: 401
        };
    }
    
    // Multer errors (file upload)
    if (err.code === 'LIMIT_FILE_SIZE') {
        error = {
            message: 'File too large',
            code: 'FILE_TOO_LARGE',
            status: 400
        };
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
        error = {
            message: 'Too many files',
            code: 'TOO_MANY_FILES',
            status: 400
        };
    }
    
    // Default to 500 server error
    res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Server Error',
        code: error.code || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;