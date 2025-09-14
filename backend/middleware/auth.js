/**
 * Enhanced Pong - Authentication Middleware
 * 
 * JWT-based authentication with:
 * - Token validation and refresh
 * - User session management
 * - Role-based access control
 * - Security logging
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const jwt = require('jsonwebtoken');
const database = require('../database/db');
const logger = require('../utils/logger');

class AuthMiddleware {
    // Main authentication middleware
    static async authenticate(req, res, next) {
        try {
            const token = AuthMiddleware.extractToken(req);
            
            if (!token) {
                return res.status(401).json({
                    error: 'Access denied. No token provided.',
                    code: 'NO_TOKEN'
                });
            }
            
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user from database
            const user = await database.get(
                'SELECT * FROM users WHERE id = ? AND is_banned = 0',
                [decoded.userId]
            );
            
            if (!user) {
                logger.logSecurityEvent('INVALID_USER_TOKEN', {
                    userId: decoded.userId,
                    ip: req.ip
                });
                
                return res.status(401).json({
                    error: 'Invalid token. User not found or banned.',
                    code: 'INVALID_USER'
                });
            }
            
            // Check if session is still valid
            const session = await database.get(
                'SELECT * FROM sessions WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP',
                [user.id]
            );
            
            if (!session) {
                return res.status(401).json({
                    error: 'Session expired. Please login again.',
                    code: 'SESSION_EXPIRED'
                });
            }
            
            // Update last active timestamp
            await database.run(
                'UPDATE users SET last_active = CURRENT_TIMESTAMP, is_online = 1 WHERE id = ?',
                [user.id]
            );
            
            // Add user to request object
            req.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                rating: user.rating,
                isAdmin: user.is_admin,
                achievements: JSON.parse(user.achievements || '[]'),
                preferences: JSON.parse(user.preferences || '{}')
            };
            
            next();
            
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.logSecurityEvent('TOKEN_EXPIRED', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                
                return res.status(401).json({
                    error: 'Token expired. Please login again.',
                    code: 'TOKEN_EXPIRED'
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                logger.logSecurityEvent('INVALID_TOKEN', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    error: error.message
                });
                
                return res.status(401).json({
                    error: 'Invalid token.',
                    code: 'INVALID_TOKEN'
                });
            }
            
            logger.error('Authentication error:', error);
            res.status(500).json({
                error: 'Authentication failed.',
                code: 'AUTH_ERROR'
            });
        }
    }
    
    // Admin-only access middleware
    static requireAdmin(req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required.',
                code: 'NO_AUTH'
            });
        }
        
        if (!req.user.isAdmin) {
            logger.logSecurityEvent('ADMIN_ACCESS_DENIED', {
                userId: req.user.id,
                ip: req.ip,
                route: req.path
            });
            
            return res.status(403).json({
                error: 'Admin access required.',
                code: 'ADMIN_REQUIRED'
            });
        }
        
        next();
    }
    
    // Optional authentication middleware
    static optionalAuth(req, res, next) {
        const token = AuthMiddleware.extractToken(req);
        
        if (!token) {
            return next();
        }
        
        // Try to authenticate, but don't fail if invalid
        AuthMiddleware.authenticate(req, res, (error) => {
            if (error) {
                // Clear any partial user data and continue
                req.user = null;
            }
            next();
        });
    }
    
    // Extract token from request
    static extractToken(req) {
        const authHeader = req.get('Authorization');
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        
        // Also check query parameter for WebSocket upgrades
        if (req.query && req.query.token) {
            return req.query.token;
        }
        
        return null;
    }
    
    // Generate JWT token
    static generateToken(user, expiresIn = null) {
        const payload = {
            userId: user.id,
            username: user.username,
            isAdmin: user.is_admin || false
        };
        
        const options = {};
        if (expiresIn) {
            options.expiresIn = expiresIn;
        } else {
            options.expiresIn = process.env.JWT_EXPIRES_IN || '7d';
        }
        
        return jwt.sign(payload, process.env.JWT_SECRET, options);
    }
    
    // Generate refresh token
    static generateRefreshToken(user) {
        const payload = {
            userId: user.id,
            type: 'refresh'
        };
        
        return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: '30d'
        });
    }
    
    // Verify refresh token
    static async verifyRefreshToken(token) {
        try {
            const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
            
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid token type');
            }
            
            const user = await database.get(
                'SELECT * FROM users WHERE id = ? AND is_banned = 0',
                [decoded.userId]
            );
            
            return user;
            
        } catch (error) {
            logger.logSecurityEvent('REFRESH_TOKEN_ERROR', {
                error: error.message
            });
            throw error;
        }
    }
    
    // Create user session
    static async createSession(userId, socketId, req) {
        const sessionId = require('uuid').v4();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
        
        await database.run(`
            INSERT INTO sessions (session_id, user_id, socket_id, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            sessionId,
            userId,
            socketId,
            req.ip || req.connection?.remoteAddress,
            req.get('User-Agent'),
            expiresAt.toISOString()
        ]);
        
        return sessionId;
    }
    
    // Clean expired sessions
    static async cleanExpiredSessions() {
        try {
            const result = await database.run(
                'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
            );
            
            if (result.changes > 0) {
                logger.info(`Cleaned ${result.changes} expired sessions`);
            }
            
        } catch (error) {
            logger.error('Failed to clean expired sessions:', error);
        }
    }
    
    // Logout user (invalidate session)
    static async logout(userId, sessionId = null) {
        try {
            let query = 'DELETE FROM sessions WHERE user_id = ?';
            let params = [userId];
            
            if (sessionId) {
                query += ' AND session_id = ?';
                params.push(sessionId);
            }
            
            await database.run(query, params);
            
            // Update user online status
            await database.run(
                'UPDATE users SET is_online = 0 WHERE id = ?',
                [userId]
            );
            
            logger.info('User logged out', { userId, sessionId });
            
        } catch (error) {
            logger.error('Logout error:', error);
            throw error;
        }
    }
}

// Start session cleanup interval
setInterval(() => {
    AuthMiddleware.cleanExpiredSessions();
}, 60 * 60 * 1000); // Every hour

module.exports = AuthMiddleware;