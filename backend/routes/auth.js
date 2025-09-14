/**
 * Enhanced Pong - Authentication Routes
 * 
 * JWT-based authentication with support for:
 * - User registration and login
 * - Access and refresh token management
 * - Password hashing with bcrypt
 * - Rate limiting and security
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const database = require('../database/db');
const logger = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// JWT secrets
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'enhanced-pong-access-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'enhanced-pong-refresh-secret';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        error: 'Too many authentication attempts, please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: {
        error: 'Too many registration attempts, please try again later.',
        code: 'REGISTER_RATE_LIMIT_EXCEEDED'
    }
});

// Helper functions
const generateTokens = (user) => {
    const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.is_admin
    };
    
    const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
    
    return { accessToken, refreshToken };
};

const validatePassword = (password) => {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters long';
    }
    if (!/(?=.*[a-z])/.test(password)) {
        return 'Password must contain at least one lowercase letter';
    }
    if (!/(?=.*[A-Z])/.test(password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!/(?=.*\d)/.test(password)) {
        return 'Password must contain at least one number';
    }
    return null;
};

const validateUsername = (username) => {
    if (!username || username.length < 3 || username.length > 20) {
        return 'Username must be between 3 and 20 characters';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return 'Username can only contain letters, numbers, underscores, and hyphens';
    }
    return null;
};

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return 'Please provide a valid email address';
    }
    return null;
};

// Routes

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;
        
        // Validate input
        const usernameError = validateUsername(username);
        if (usernameError) {
            return res.status(400).json({ error: usernameError, code: 'INVALID_USERNAME' });
        }
        
        const emailError = validateEmail(email);
        if (emailError) {
            return res.status(400).json({ error: emailError, code: 'INVALID_EMAIL' });
        }
        
        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError, code: 'INVALID_PASSWORD' });
        }
        
        if (!displayName || displayName.length < 1 || displayName.length > 50) {
            return res.status(400).json({ 
                error: 'Display name must be between 1 and 50 characters',
                code: 'INVALID_DISPLAY_NAME'
            });
        }
        
        // Check if user already exists
        const existingUser = await database.get(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username.toLowerCase(), email.toLowerCase()]
        );
        
        if (existingUser) {
            return res.status(409).json({ 
                error: 'Username or email already exists',
                code: 'USER_EXISTS'
            });
        }
        
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create user
        const result = await database.run(`
            INSERT INTO users (username, email, password_hash, display_name, rating)
            VALUES (?, ?, ?, ?, ?)
        `, [username.toLowerCase(), email.toLowerCase(), passwordHash, displayName, 1200]);
        
        // Fetch created user
        const newUser = await database.get('SELECT * FROM users WHERE id = ?', [result.id]);
        
        // Generate tokens
        const tokens = generateTokens(newUser);
        
        // Create session
        const sessionId = uuidv4();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await database.run(`
            INSERT INTO sessions (session_id, user_id, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `, [sessionId, newUser.id, req.ip, req.get('User-Agent'), expiresAt.toISOString()]);
        
        logger.info(`User registered: ${username} (${email})`);
        
        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                displayName: newUser.display_name,
                rating: newUser.rating,
                isAdmin: newUser.is_admin,
                createdAt: newUser.created_at
            },
            tokens,
            sessionId
        });
        
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'REGISTRATION_FAILED'
        });
    }
});

/**
 * POST /api/auth/login
 * User login with username/email and password
 */
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier can be username or email
        
        if (!identifier || !password) {
            return res.status(400).json({ 
                error: 'Username/email and password are required',
                code: 'MISSING_CREDENTIALS'
            });
        }
        
        // Find user by username or email
        const user = await database.get(`
            SELECT * FROM users 
            WHERE (username = ? OR email = ?) AND is_banned = 0
        `, [identifier.toLowerCase(), identifier.toLowerCase()]);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Verify password
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Generate tokens
        const tokens = generateTokens(user);
        
        // Create session
        const sessionId = uuidv4();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await database.run(`
            INSERT INTO sessions (session_id, user_id, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `, [sessionId, user.id, req.ip, req.get('User-Agent'), expiresAt.toISOString()]);
        
        // Update last active
        await database.run(
            'UPDATE users SET last_active = CURRENT_TIMESTAMP, is_online = 1 WHERE id = ?',
            [user.id]
        );
        
        logger.info(`User logged in: ${user.username}`);
        
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                rating: user.rating,
                totalGames: user.total_games,
                gamesWon: user.games_won,
                winStreak: user.win_streak,
                isAdmin: user.is_admin,
                lastActive: user.last_active
            },
            tokens,
            sessionId
        });
        
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'LOGIN_FAILED'
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ 
                error: 'Refresh token required',
                code: 'MISSING_REFRESH_TOKEN'
            });
        }
        
        // Verify refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }
        
        // Get user
        const user = await database.get(
            'SELECT * FROM users WHERE id = ? AND is_banned = 0',
            [decoded.id]
        );
        
        if (!user) {
            return res.status(401).json({ 
                error: 'User not found or banned',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Generate new tokens
        const tokens = generateTokens(user);
        
        res.json({
            message: 'Token refreshed successfully',
            tokens
        });
        
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'REFRESH_FAILED'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user and invalidate session
 */
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        // Update user online status
        await database.run(
            'UPDATE users SET is_online = 0 WHERE id = ?',
            [req.user.id]
        );
        
        // Remove session if provided
        if (sessionId) {
            await database.run(
                'DELETE FROM sessions WHERE session_id = ? AND user_id = ?',
                [sessionId, req.user.id]
            );
        }
        
        logger.info(`User logged out: ${req.user.username}`);
        
        res.json({ message: 'Logout successful' });
        
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'LOGOUT_FAILED'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
        // Get fresh user data
        const user = await database.get(
            'SELECT * FROM users WHERE id = ?',
            [req.user.id]
        );
        
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Get user statistics
        const stats = await database.get(`
            SELECT 
                COUNT(*) as total_matches,
                SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as won_matches,
                AVG(duration) as avg_match_duration
            FROM matches 
            WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed'
        `, [user.id, user.id, user.id]);
        
        // Parse achievements
        let achievements = [];
        try {
            achievements = JSON.parse(user.achievements || '[]');
        } catch (e) {
            achievements = [];
        }
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                rating: user.rating,
                totalGames: user.total_games,
                gamesWon: user.games_won,
                gamesLost: user.games_lost,
                winStreak: user.win_streak,
                bestWinStreak: user.best_win_streak,
                totalPlaytime: user.total_playtime,
                achievements,
                isAdmin: user.is_admin,
                isOnline: user.is_online,
                lastActive: user.last_active,
                createdAt: user.created_at
            },
            stats: {
                totalMatches: stats?.total_matches || 0,
                wonMatches: stats?.won_matches || 0,
                lostMatches: (stats?.total_matches || 0) - (stats?.won_matches || 0),
                winRate: stats?.total_matches > 0 ? ((stats?.won_matches || 0) / stats.total_matches) : 0,
                avgMatchDuration: stats?.avg_match_duration || 0
            }
        });
        
    } catch (error) {
        logger.error('Get user info error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'GET_USER_FAILED'
        });
    }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                error: 'Current password and new password are required',
                code: 'MISSING_PASSWORDS'
            });
        }
        
        // Validate new password
        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.status(400).json({ error: passwordError, code: 'INVALID_PASSWORD' });
        }
        
        // Get user
        const user = await database.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
        
        // Verify current password
        const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!passwordValid) {
            return res.status(400).json({ 
                error: 'Current password is incorrect',
                code: 'INVALID_CURRENT_PASSWORD'
            });
        }
        
        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
        
        // Update password
        await database.run(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newPasswordHash, req.user.id]
        );
        
        // Invalidate all sessions except current one
        await database.run(
            'DELETE FROM sessions WHERE user_id = ?',
            [req.user.id]
        );
        
        logger.info(`Password changed for user: ${req.user.username}`);
        
        res.json({ message: 'Password changed successfully' });
        
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'CHANGE_PASSWORD_FAILED'
        });
    }
});

module.exports = router;