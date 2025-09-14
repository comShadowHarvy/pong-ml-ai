/**
 * Enhanced Pong - Game Routes
 * 
 * Routes for game management:
 * - Match history and details
 * - Game statistics
 * - Match creation and management
 * - Post-game processing
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const database = require('../database/db');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/games/matches
 * Get user's match history
 */
router.get('/matches', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let statusFilter = '';
        const params = [req.user.id, req.user.id];
        
        if (status !== 'all') {
            statusFilter = 'AND m.status = ?';
            params.push(status);
        }
        
        const matches = await database.all(`
            SELECT 
                m.*, 
                u1.username as player1_username, u1.display_name as player1_name,
                u2.username as player2_username, u2.display_name as player2_name,
                winner.username as winner_username, winner.display_name as winner_name
            FROM matches m
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            LEFT JOIN users winner ON m.winner_id = winner.id
            WHERE (m.player1_id = ? OR m.player2_id = ?) ${statusFilter}
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);
        
        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM matches m
            WHERE (m.player1_id = ? OR m.player2_id = ?) ${statusFilter}
        `;
        const totalResult = await database.get(countQuery, params);
        
        res.json({
            matches,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalResult.total,
                pages: Math.ceil(totalResult.total / parseInt(limit))
            }
        });
        
    } catch (error) {
        logger.error('Get matches error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_MATCHES_FAILED'
        });
    }
});

/**
 * GET /api/games/matches/:id
 * Get specific match details
 */
router.get('/matches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const match = await database.get(`
            SELECT 
                m.*, 
                u1.username as player1_username, u1.display_name as player1_name, u1.avatar_url as player1_avatar,
                u2.username as player2_username, u2.display_name as player2_name, u2.avatar_url as player2_avatar,
                winner.username as winner_username, winner.display_name as winner_name
            FROM matches m
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            LEFT JOIN users winner ON m.winner_id = winner.id
            WHERE m.id = ? AND (m.player1_id = ? OR m.player2_id = ? OR m.winner_id IS NOT NULL)
        `, [id, req.user.id, req.user.id]);
        
        if (!match) {
            return res.status(404).json({
                error: 'Match not found',
                code: 'MATCH_NOT_FOUND'
            });
        }
        
        // Parse match data if available
        let matchData = null;
        if (match.match_data) {
            try {
                matchData = JSON.parse(match.match_data);
            } catch (e) {
                logger.warn(`Failed to parse match data for match ${id}`);
            }
        }
        
        res.json({
            ...match,
            parsedMatchData: matchData
        });
        
    } catch (error) {
        logger.error('Get match details error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_MATCH_FAILED'
        });
    }
});

/**
 * POST /api/games/matches
 * Create a new match (for single-player against AI)
 */
router.post('/matches', async (req, res) => {
    try {
        const { gameMode, aiPersonality, difficulty } = req.body;
        
        if (!gameMode) {
            return res.status(400).json({
                error: 'Game mode is required',
                code: 'MISSING_GAME_MODE'
            });
        }
        
        const matchId = uuidv4();
        
        const result = await database.run(`
            INSERT INTO matches (
                match_id, game_mode, player1_id, ai_personality, status, created_at
            ) VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
        `, [matchId, gameMode, req.user.id, aiPersonality || 'balanced']);
        
        const match = await database.get(
            'SELECT * FROM matches WHERE id = ?',
            [result.id]
        );
        
        logger.info(`Match created: ${matchId} by ${req.user.username}`);
        
        res.status(201).json({
            message: 'Match created successfully',
            match
        });
        
    } catch (error) {
        logger.error('Create match error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'CREATE_MATCH_FAILED'
        });
    }
});

/**
 * PUT /api/games/matches/:id/complete
 * Complete a match and update statistics
 */
router.put('/matches/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { player1Score, player2Score, duration, matchData, winner } = req.body;
        
        // Validate input
        if (typeof player1Score !== 'number' || typeof player2Score !== 'number') {
            return res.status(400).json({
                error: 'Valid scores are required',
                code: 'INVALID_SCORES'
            });
        }
        
        if (typeof duration !== 'number' || duration < 0) {
            return res.status(400).json({
                error: 'Valid duration is required',
                code: 'INVALID_DURATION'
            });
        }
        
        // Get match
        const match = await database.get(
            'SELECT * FROM matches WHERE id = ? AND player1_id = ? AND status = \'active\'',
            [id, req.user.id]
        );
        
        if (!match) {
            return res.status(404).json({
                error: 'Active match not found',
                code: 'MATCH_NOT_FOUND'
            });
        }
        
        // Determine winner
        let winnerId = null;
        if (winner === 'player1' && player1Score > player2Score) {
            winnerId = match.player1_id;
        } else if (winner === 'player2' && player2Score > player1Score) {
            winnerId = match.player2_id;
        } else if (player1Score > player2Score) {
            winnerId = match.player1_id;
        } else if (player2Score > player1Score) {
            winnerId = match.player2_id;
        }
        
        await database.beginTransaction();
        
        try {
            // Update match
            await database.run(`
                UPDATE matches SET 
                    player1_score = ?, player2_score = ?, winner_id = ?, 
                    duration = ?, status = 'completed', match_data = ?,
                    ended_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [player1Score, player2Score, winnerId, duration, 
                JSON.stringify(matchData || {}), id]);
            
            // Update user statistics
            const isWin = winnerId === req.user.id;
            const currentStreak = isWin ? 1 : 0;
            
            await database.run(`
                UPDATE users SET 
                    total_games = total_games + 1,
                    games_won = games_won + ?,
                    games_lost = games_lost + ?,
                    win_streak = CASE WHEN ? THEN win_streak + 1 ELSE 0 END,
                    best_win_streak = MAX(best_win_streak, CASE WHEN ? THEN win_streak + 1 ELSE best_win_streak END),
                    total_playtime = total_playtime + ?
                WHERE id = ?
            `, [isWin ? 1 : 0, isWin ? 0 : 1, isWin, isWin, duration, req.user.id]);
            
            // Update daily statistics
            const today = new Date().toISOString().split('T')[0];
            await database.run(`
                INSERT INTO game_stats (user_id, stat_date, games_played, games_won, playtime_minutes)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(user_id, stat_date) DO UPDATE SET
                    games_played = games_played + 1,
                    games_won = games_won + ?,
                    playtime_minutes = playtime_minutes + ?
            `, [req.user.id, today, isWin ? 1 : 0, Math.round(duration / 60), 
                isWin ? 1 : 0, Math.round(duration / 60)]);
            
            await database.commit();
            
            logger.info(`Match completed: ${match.match_id} - Winner: ${winnerId ? 'Player' : 'Tie'}`);
            
            res.json({
                message: 'Match completed successfully',
                result: {
                    winner: winnerId ? (winnerId === req.user.id ? 'player' : 'opponent') : 'tie',
                    scores: { player1: player1Score, player2: player2Score },
                    duration,
                    ratingChange: isWin ? +25 : -15 // Simplified rating system
                }
            });
            
        } catch (error) {
            await database.rollback();
            throw error;
        }
        
    } catch (error) {
        logger.error('Complete match error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'COMPLETE_MATCH_FAILED'
        });
    }
});

/**
 * GET /api/games/stats
 * Get user's game statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        
        // Get overall stats
        const overallStats = await database.get(`
            SELECT 
                total_games, games_won, games_lost, win_streak, best_win_streak,
                total_playtime, rating
            FROM users WHERE id = ?
        `, [req.user.id]);
        
        // Get period-specific stats
        let dateFilter = '';
        const now = new Date();
        
        switch (period) {
            case '24h':
                dateFilter = `AND created_at >= datetime('${new Date(now - 24*60*60*1000).toISOString()}')`;
                break;
            case '7d':
                dateFilter = `AND created_at >= datetime('${new Date(now - 7*24*60*60*1000).toISOString()}')`;
                break;
            case '30d':
                dateFilter = `AND created_at >= datetime('${new Date(now - 30*24*60*60*1000).toISOString()}')`;
                break;
            case 'all':
            default:
                dateFilter = '';
        }
        
        const periodStats = await database.get(`
            SELECT 
                COUNT(*) as matches_played,
                SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as matches_won,
                AVG(duration) as avg_duration,
                SUM(duration) as total_duration
            FROM matches 
            WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed' ${dateFilter}
        `, [req.user.id, req.user.id, req.user.id]);
        
        // Get recent performance trend
        const trendStats = await database.all(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as games,
                SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins
            FROM matches 
            WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed'
                AND created_at >= datetime('${new Date(now - 30*24*60*60*1000).toISOString()}')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 30
        `, [req.user.id, req.user.id, req.user.id]);
        
        // Get favorite game modes
        const gameModeStats = await database.all(`
            SELECT 
                game_mode,
                COUNT(*) as games_played,
                SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as games_won,
                ROUND(AVG(duration)) as avg_duration
            FROM matches 
            WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed'
            GROUP BY game_mode
            ORDER BY games_played DESC
        `, [req.user.id, req.user.id, req.user.id]);
        
        res.json({
            overall: {
                ...overallStats,
                winRate: overallStats.total_games > 0 
                    ? (overallStats.games_won / overallStats.total_games) * 100 
                    : 0
            },
            period: {
                ...periodStats,
                winRate: periodStats.matches_played > 0 
                    ? (periodStats.matches_won / periodStats.matches_played) * 100 
                    : 0,
                period
            },
            trend: trendStats,
            gameModes: gameModeStats
        });
        
    } catch (error) {
        logger.error('Get game stats error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_STATS_FAILED'
        });
    }
});

/**
 * GET /api/games/achievements
 * Get user's achievements
 */
router.get('/achievements', async (req, res) => {
    try {
        const user = await database.get(
            'SELECT achievements FROM users WHERE id = ?',
            [req.user.id]
        );
        
        let achievements = [];
        try {
            achievements = JSON.parse(user.achievements || '[]');
        } catch (e) {
            achievements = [];
        }
        
        // Get achievement progress
        const stats = await database.get(`
            SELECT 
                total_games, games_won, win_streak, best_win_streak,
                COUNT(DISTINCT 
                    CASE WHEN m.player2_id IS NULL AND m.winner_id = u.id 
                    THEN m.game_mode END
                ) as ai_modes_beaten
            FROM users u
            LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id)
            WHERE u.id = ?
            GROUP BY u.id
        `, [req.user.id]);
        
        // Calculate available achievements
        const availableAchievements = [
            {
                id: 'first_win',
                name: 'First Victory',
                description: 'Win your first match',
                unlocked: stats.games_won >= 1,
                progress: Math.min(stats.games_won, 1),
                target: 1
            },
            {
                id: 'winning_streak_5',
                name: 'Hot Streak',
                description: 'Win 5 matches in a row',
                unlocked: stats.best_win_streak >= 5,
                progress: stats.win_streak,
                target: 5
            },
            {
                id: 'total_wins_100',
                name: 'Century Club',
                description: 'Win 100 matches',
                unlocked: stats.games_won >= 100,
                progress: stats.games_won,
                target: 100
            },
            {
                id: 'ai_master',
                name: 'AI Master',
                description: 'Beat AI in all game modes',
                unlocked: stats.ai_modes_beaten >= 5,
                progress: stats.ai_modes_beaten,
                target: 5
            }
        ];
        
        res.json({
            unlocked: achievements,
            available: availableAchievements,
            totalUnlocked: achievements.length,
            totalAvailable: availableAchievements.length
        });
        
    } catch (error) {
        logger.error('Get achievements error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_ACHIEVEMENTS_FAILED'
        });
    }
});

module.exports = router;