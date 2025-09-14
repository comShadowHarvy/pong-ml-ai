/**
 * Enhanced Pong - User Management Routes
 * 
 * Routes for user profiles, friends system, and social features:
 * - Public user profiles and statistics
 * - Friend requests, acceptance, and management
 * - User settings and profile updates
 * - Avatar uploads and bio management
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const database = require('../database/db');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = './uploads/avatars';
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `avatar-${req.user.id}-${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

/**
 * GET /api/users/:id
 * Get public user profile by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const requestingUserId = req.user?.id;
        
        if (isNaN(parseInt(id))) {
            return res.status(400).json({
                error: 'Invalid user ID',
                code: 'INVALID_USER_ID'
            });
        }
        
        // Get user profile
        const user = await database.get(`
            SELECT 
                id, username, display_name, avatar_url, rating, total_games,
                games_won, games_lost, win_streak, best_win_streak, total_playtime,
                achievements, last_active, is_online, created_at
            FROM users 
            WHERE id = ? AND is_banned = 0
        `, [id]);
        
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
                AVG(duration) as avg_match_duration,
                MAX(CASE WHEN winner_id = ? THEN duration ELSE 0 END) as longest_win
            FROM matches 
            WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed'
        `, [user.id, user.id, user.id, user.id]);
        
        // Get recent matches
        const recentMatches = await database.all(`
            SELECT 
                m.id, m.match_id, m.game_mode, m.player1_score, m.player2_score,
                m.winner_id, m.duration, m.started_at, m.ended_at,
                u1.username as player1_username, u1.display_name as player1_name,
                u2.username as player2_username, u2.display_name as player2_name
            FROM matches m
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status = 'completed'
            ORDER BY m.ended_at DESC
            LIMIT 5
        `, [user.id, user.id]);
        
        // Check friend status if requesting user is authenticated
        let friendStatus = null;
        if (requestingUserId && requestingUserId !== user.id) {
            const friendship = await database.get(`
                SELECT status FROM friends 
                WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
            `, [requestingUserId, user.id, user.id, requestingUserId]);
            
            if (friendship) {
                friendStatus = friendship.status;
            }
        }
        
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
                isOnline: user.is_online,
                lastActive: user.last_active,
                createdAt: user.created_at,
                friendStatus
            },
            stats: {
                totalMatches: stats?.total_matches || 0,
                wonMatches: stats?.won_matches || 0,
                lostMatches: (stats?.total_matches || 0) - (stats?.won_matches || 0),
                winRate: stats?.total_matches > 0 ? ((stats?.won_matches || 0) / stats.total_matches) : 0,
                avgMatchDuration: stats?.avg_match_duration || 0,
                longestWin: stats?.longest_win || 0
            },
            recentMatches
        });
        
    } catch (error) {
        logger.error('Get user profile error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_PROFILE_FAILED'
        });
    }
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', async (req, res) => {
    try {
        const { displayName, bio, preferences } = req.body;
        const updates = [];
        const values = [];
        
        if (displayName !== undefined) {
            if (!displayName || displayName.length < 1 || displayName.length > 50) {
                return res.status(400).json({
                    error: 'Display name must be between 1 and 50 characters',
                    code: 'INVALID_DISPLAY_NAME'
                });
            }
            updates.push('display_name = ?');
            values.push(displayName);
        }
        
        if (bio !== undefined) {
            if (bio.length > 500) {
                return res.status(400).json({
                    error: 'Bio must be less than 500 characters',
                    code: 'BIO_TOO_LONG'
                });
            }
            // Bio would be stored in a separate column if we had it
            // For now, we'll store it in preferences
        }
        
        if (preferences !== undefined) {
            try {
                const prefsString = JSON.stringify(preferences);
                updates.push('preferences = ?');
                values.push(prefsString);
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid preferences format',
                    code: 'INVALID_PREFERENCES'
                });
            }
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No valid updates provided',
                code: 'NO_UPDATES'
            });
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.user.id);
        
        await database.run(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `, values);
        
        // Fetch updated user
        const updatedUser = await database.get(
            'SELECT * FROM users WHERE id = ?',
            [req.user.id]
        );
        
        logger.info(`User profile updated: ${req.user.username}`);
        
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                displayName: updatedUser.display_name,
                avatarUrl: updatedUser.avatar_url,
                rating: updatedUser.rating,
                preferences: JSON.parse(updatedUser.preferences || '{}')
            }
        });
        
    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'UPDATE_PROFILE_FAILED'
        });
    }
});

/**
 * POST /api/users/me/avatar
 * Upload user avatar
 */
router.post('/me/avatar', upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No avatar file provided',
                code: 'NO_AVATAR_FILE'
            });
        }
        
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        
        // Delete old avatar if exists
        const oldUser = await database.get(
            'SELECT avatar_url FROM users WHERE id = ?',
            [req.user.id]
        );
        
        if (oldUser?.avatar_url) {
            const oldPath = path.join('./uploads/avatars', path.basename(oldUser.avatar_url));
            try {
                await fs.unlink(oldPath);
            } catch (error) {
                // Ignore errors when deleting old avatar
            }
        }
        
        // Update user avatar URL
        await database.run(
            'UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [avatarUrl, req.user.id]
        );
        
        logger.info(`Avatar updated for user: ${req.user.username}`);
        
        res.json({
            message: 'Avatar updated successfully',
            avatarUrl
        });
        
    } catch (error) {
        logger.error('Avatar upload error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'AVATAR_UPLOAD_FAILED'
        });
    }
});

/**
 * GET /api/users/me/friends
 * Get current user's friends list
 */
router.get('/me/friends', async (req, res) => {
    try {
        const friends = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url, u.rating,
                u.is_online, u.last_active, f.status, f.created_at as friendship_date
            FROM friends f
            JOIN users u ON (
                CASE 
                    WHEN f.user_id = ? THEN f.friend_id
                    ELSE f.user_id
                END = u.id
            )
            WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
            ORDER BY u.is_online DESC, u.last_active DESC
        `, [req.user.id, req.user.id, req.user.id]);
        
        res.json({ friends });
        
    } catch (error) {
        logger.error('Get friends error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_FRIENDS_FAILED'
        });
    }
});

/**
 * GET /api/users/me/friend-requests
 * Get pending friend requests for current user
 */
router.get('/me/friend-requests', async (req, res) => {
    try {
        // Incoming requests (requests sent to me)
        const incoming = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url, u.rating,
                f.created_at as request_date
            FROM friends f
            JOIN users u ON f.user_id = u.id
            WHERE f.friend_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC
        `, [req.user.id]);
        
        // Outgoing requests (requests I sent)
        const outgoing = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url, u.rating,
                f.created_at as request_date
            FROM friends f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC
        `, [req.user.id]);
        
        res.json({
            incoming,
            outgoing
        });
        
    } catch (error) {
        logger.error('Get friend requests error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_FRIEND_REQUESTS_FAILED'
        });
    }
});

/**
 * POST /api/users/:id/friend-request
 * Send friend request to user
 */
router.post('/:id/friend-request', async (req, res) => {
    try {
        const { id } = req.params;
        const friendId = parseInt(id);
        
        if (isNaN(friendId)) {
            return res.status(400).json({
                error: 'Invalid user ID',
                code: 'INVALID_USER_ID'
            });
        }
        
        if (friendId === req.user.id) {
            return res.status(400).json({
                error: 'Cannot send friend request to yourself',
                code: 'SELF_FRIEND_REQUEST'
            });
        }
        
        // Check if target user exists
        const targetUser = await database.get(
            'SELECT id, username FROM users WHERE id = ? AND is_banned = 0',
            [friendId]
        );
        
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Check if friendship already exists
        const existingFriendship = await database.get(`
            SELECT status FROM friends 
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        `, [req.user.id, friendId, friendId, req.user.id]);
        
        if (existingFriendship) {
            const message = existingFriendship.status === 'accepted' 
                ? 'Already friends with this user'
                : 'Friend request already exists';
            return res.status(409).json({
                error: message,
                code: 'FRIENDSHIP_EXISTS'
            });
        }
        
        // Check friend limit
        const friendCount = await database.get(
            'SELECT COUNT(*) as count FROM friends WHERE (user_id = ? OR friend_id = ?) AND status = \'accepted\'',
            [req.user.id, req.user.id]
        );
        
        const maxFriends = 100; // Could be configurable
        if (friendCount.count >= maxFriends) {
            return res.status(400).json({
                error: `Friend limit reached (${maxFriends})`,
                code: 'FRIEND_LIMIT_REACHED'
            });
        }
        
        // Create friend request
        await database.run(`
            INSERT INTO friends (user_id, friend_id, status, created_at)
            VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
        `, [req.user.id, friendId]);
        
        logger.info(`Friend request sent: ${req.user.username} -> ${targetUser.username}`);
        
        res.status(201).json({
            message: 'Friend request sent successfully',
            targetUser: {
                id: targetUser.id,
                username: targetUser.username
            }
        });
        
    } catch (error) {
        logger.error('Send friend request error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'SEND_FRIEND_REQUEST_FAILED'
        });
    }
});

/**
 * PUT /api/users/:id/friend-request
 * Accept or decline friend request
 */
router.put('/:id/friend-request', async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'accept' or 'decline'
        const requesterId = parseInt(id);
        
        if (isNaN(requesterId)) {
            return res.status(400).json({
                error: 'Invalid user ID',
                code: 'INVALID_USER_ID'
            });
        }
        
        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).json({
                error: 'Action must be "accept" or "decline"',
                code: 'INVALID_ACTION'
            });
        }
        
        // Find the pending friend request
        const friendRequest = await database.get(`
            SELECT * FROM friends 
            WHERE user_id = ? AND friend_id = ? AND status = 'pending'
        `, [requesterId, req.user.id]);
        
        if (!friendRequest) {
            return res.status(404).json({
                error: 'Friend request not found',
                code: 'FRIEND_REQUEST_NOT_FOUND'
            });
        }
        
        if (action === 'accept') {
            // Update to accepted
            await database.run(`
                UPDATE friends SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND friend_id = ?
            `, [requesterId, req.user.id]);
            
            logger.info(`Friend request accepted: ${requesterId} -> ${req.user.id}`);
            
            res.json({ message: 'Friend request accepted' });
        } else {
            // Delete the request
            await database.run(`
                DELETE FROM friends WHERE user_id = ? AND friend_id = ?
            `, [requesterId, req.user.id]);
            
            logger.info(`Friend request declined: ${requesterId} -> ${req.user.id}`);
            
            res.json({ message: 'Friend request declined' });
        }
        
    } catch (error) {
        logger.error('Handle friend request error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'HANDLE_FRIEND_REQUEST_FAILED'
        });
    }
});

/**
 * DELETE /api/users/:id/friend
 * Remove friend
 */
router.delete('/:id/friend', async (req, res) => {
    try {
        const { id } = req.params;
        const friendId = parseInt(id);
        
        if (isNaN(friendId)) {
            return res.status(400).json({
                error: 'Invalid user ID',
                code: 'INVALID_USER_ID'
            });
        }
        
        // Delete friendship (either direction)
        const result = await database.run(`
            DELETE FROM friends 
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        `, [req.user.id, friendId, friendId, req.user.id]);
        
        if (result.changes === 0) {
            return res.status(404).json({
                error: 'Friendship not found',
                code: 'FRIENDSHIP_NOT_FOUND'
            });
        }
        
        logger.info(`Friendship removed: ${req.user.id} <-> ${friendId}`);
        
        res.json({ message: 'Friend removed successfully' });
        
    } catch (error) {
        logger.error('Remove friend error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'REMOVE_FRIEND_FAILED'
        });
    }
});

/**
 * GET /api/users/search
 * Search users by username
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query; // search query
        
        if (!q || q.length < 2) {
            return res.status(400).json({
                error: 'Search query must be at least 2 characters',
                code: 'INVALID_SEARCH_QUERY'
            });
        }
        
        const users = await database.all(`
            SELECT 
                id, username, display_name, avatar_url, rating, is_online, last_active
            FROM users 
            WHERE (username LIKE ? OR display_name LIKE ?) 
                AND is_banned = 0 AND id != ?
            ORDER BY 
                CASE WHEN is_online = 1 THEN 0 ELSE 1 END,
                rating DESC
            LIMIT 20
        `, [`%${q}%`, `%${q}%`, req.user?.id || 0]);
        
        res.json({ users });
        
    } catch (error) {
        logger.error('Search users error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'SEARCH_USERS_FAILED'
        });
    }
});

module.exports = router;