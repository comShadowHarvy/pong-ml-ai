/**
 * Enhanced Pong - Leaderboards Routes
 * 
 * Routes for global rankings and statistics:
 * - Global leaderboards with pagination
 * - Friend leaderboards
 * - Seasonal rankings
 * - Player statistics and achievements
 * - Caching for performance
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const express = require('express');
const database = require('../database/db');
const logger = require('../utils/logger');

const router = express.Router();

// Cache for leaderboard data (5 minutes)
const leaderboardCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getCachedData = (key) => {
    const cached = leaderboardCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    return null;
};

const setCachedData = (key, data) => {
    leaderboardCache.set(key, {
        data,
        timestamp: Date.now()
    });
};

/**
 * GET /api/leaderboards/global
 * Get global leaderboard
 */
router.get('/global', async (req, res) => {
    try {
        const { page = 1, limit = 100, gameMode = 'all', season = 'current' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const cacheKey = `global_${page}_${limit}_${gameMode}_${season}`;
        
        // Check cache first
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }
        
        let whereClause = 'WHERE u.is_banned = 0';
        let joinClause = '';
        let params = [];
        
        if (season !== 'all' && season !== 'current') {
            joinClause = `
                LEFT JOIN leaderboards l ON u.id = l.user_id 
                AND l.season = ? AND l.game_mode = ?
            `;
            whereClause += ' AND l.user_id IS NOT NULL';
            params.push(season, gameMode === 'all' ? 'classic' : gameMode);
        }
        
        const leaderboardQuery = `
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                u.rating, u.total_games, u.games_won, u.games_lost,
                u.win_streak, u.best_win_streak, u.total_playtime,
                u.last_active, u.is_online,
                RANK() OVER (ORDER BY u.rating DESC) as rank,
                ROUND((CAST(u.games_won AS REAL) / NULLIF(u.total_games, 0)) * 100, 2) as win_rate
            FROM users u
            ${joinClause}
            ${whereClause}
            ORDER BY u.rating DESC, u.games_won DESC
            LIMIT ? OFFSET ?
        `;
        
        params.push(parseInt(limit), offset);
        
        const players = await database.all(leaderboardQuery, params);
        
        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM users u
            ${joinClause}
            ${whereClause}
        `;
        
        const countParams = season !== 'all' && season !== 'current' 
            ? [season, gameMode === 'all' ? 'classic' : gameMode]
            : [];
        
        const totalResult = await database.get(countQuery, countParams);
        const total = totalResult.total;
        
        // Get ranking changes (last 24 hours)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rankingChanges = await database.all(`
            SELECT user_id, rating
            FROM game_stats 
            WHERE stat_date >= date('${yesterday}')
            GROUP BY user_id
        `);
        
        // Add ranking changes to players
        const playersWithChanges = players.map(player => {
            const change = rankingChanges.find(c => c.user_id === player.id);
            return {
                ...player,
                ratingChange: change ? player.rating - change.rating : 0
            };
        });
        
        const responseData = {
            players: playersWithChanges,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            },
            filters: {
                gameMode,
                season
            },
            lastUpdated: new Date().toISOString()
        };
        
        // Cache the result
        setCachedData(cacheKey, responseData);
        
        res.json(responseData);
        
    } catch (error) {
        logger.error('Get global leaderboard error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_LEADERBOARD_FAILED'
        });
    }
});

/**
 * GET /api/leaderboards/friends
 * Get friend leaderboard for authenticated user
 */
router.get('/friends', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const { gameMode = 'all', season = 'current' } = req.query;
        const cacheKey = `friends_${req.user.id}_${gameMode}_${season}`;
        
        // Check cache first
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }
        
        // Get user's friends
        const friendsQuery = `
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                u.rating, u.total_games, u.games_won, u.games_lost,
                u.win_streak, u.best_win_streak, u.total_playtime,
                u.last_active, u.is_online,
                ROUND((CAST(u.games_won AS REAL) / NULLIF(u.total_games, 0)) * 100, 2) as win_rate
            FROM users u
            JOIN friends f ON (
                (f.user_id = ? AND f.friend_id = u.id) OR
                (f.friend_id = ? AND f.user_id = u.id)
            )
            WHERE f.status = 'accepted' AND u.is_banned = 0
            ORDER BY u.rating DESC, u.games_won DESC
        `;
        
        const friends = await database.all(friendsQuery, [req.user.id, req.user.id]);
        
        // Add user to the list
        const user = await database.get(`
            SELECT 
                id, username, display_name, avatar_url,
                rating, total_games, games_won, games_lost,
                win_streak, best_win_streak, total_playtime,
                last_active, is_online,
                ROUND((CAST(games_won AS REAL) / NULLIF(total_games, 0)) * 100, 2) as win_rate
            FROM users WHERE id = ?
        `, [req.user.id]);
        
        if (user) {
            friends.unshift({ ...user, isCurrentUser: true });
        }
        
        // Add rankings
        const playersWithRank = friends.map((player, index) => ({
            ...player,
            rank: index + 1
        }));
        
        const responseData = {
            players: playersWithRank,
            filters: {
                gameMode,
                season
            },
            lastUpdated: new Date().toISOString()
        };
        
        // Cache the result
        setCachedData(cacheKey, responseData);
        
        res.json(responseData);
        
    } catch (error) {
        logger.error('Get friends leaderboard error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_FRIENDS_LEADERBOARD_FAILED'
        });
    }
});

/**
 * GET /api/leaderboards/top
 * Get top players summary (top 10)
 */
router.get('/top', async (req, res) => {
    try {
        const cacheKey = 'top_players';
        
        // Check cache first
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }
        
        const topPlayers = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                u.rating, u.total_games, u.games_won,
                u.win_streak, u.best_win_streak,
                ROUND((CAST(u.games_won AS REAL) / NULLIF(u.total_games, 0)) * 100, 2) as win_rate
            FROM users u
            WHERE u.is_banned = 0 AND u.total_games >= 10
            ORDER BY u.rating DESC
            LIMIT 10
        `);
        
        // Get most active players
        const mostActive = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                u.total_games, u.total_playtime
            FROM users u
            WHERE u.is_banned = 0
            ORDER BY u.total_playtime DESC
            LIMIT 5
        `);
        
        // Get recent champions (winners from last 24 hours)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentWinners = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                COUNT(m.id) as wins_today
            FROM users u
            JOIN matches m ON m.winner_id = u.id
            WHERE m.ended_at >= ? AND u.is_banned = 0
            GROUP BY u.id
            ORDER BY wins_today DESC, u.rating DESC
            LIMIT 5
        `, [yesterday]);
        
        const responseData = {
            topRated: topPlayers,
            mostActive,
            recentChampions: recentWinners,
            lastUpdated: new Date().toISOString()
        };
        
        // Cache the result
        setCachedData(cacheKey, responseData);
        
        res.json(responseData);
        
    } catch (error) {
        logger.error('Get top players error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_TOP_PLAYERS_FAILED'
        });
    }
});

/**
 * GET /api/leaderboards/stats/summary
 * Get platform statistics summary
 */
router.get('/stats/summary', async (req, res) => {
    try {
        const cacheKey = 'platform_stats';
        
        // Check cache first
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }
        
        // Get overall statistics
        const [
            userStats,
            matchStats,
            onlineStats,
            replayStats
        ] = await Promise.all([
            database.get(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN is_banned = 0 THEN 1 END) as active_users,
                    AVG(rating) as avg_rating,
                    MAX(rating) as highest_rating
                FROM users
            `),
            database.get(`
                SELECT 
                    COUNT(*) as total_matches,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_matches,
                    AVG(duration) as avg_duration,
                    SUM(duration) as total_playtime
                FROM matches
            `),
            database.get(`
                SELECT COUNT(*) as online_users
                FROM users WHERE is_online = 1 AND is_banned = 0
            `),
            database.get(`
                SELECT 
                    COUNT(*) as total_replays,
                    COUNT(CASE WHEN is_public = 1 THEN 1 END) as public_replays
                FROM replays
            `)
        ]);
        
        // Get today's statistics
        const today = new Date().toISOString().split('T')[0];
        const todayStats = await database.get(`
            SELECT 
                COUNT(*) as matches_today,
                COUNT(DISTINCT player1_id) + COUNT(DISTINCT player2_id) as players_today
            FROM matches 
            WHERE DATE(started_at) = ?
        `, [today]);
        
        const responseData = {
            users: {
                total: userStats.total_users,
                active: userStats.active_users,
                online: onlineStats.online_users,
                averageRating: Math.round(userStats.avg_rating || 1200),
                highestRating: userStats.highest_rating || 1200
            },
            matches: {
                total: matchStats.total_matches,
                completed: matchStats.completed_matches,
                today: todayStats.matches_today,
                averageDuration: Math.round(matchStats.avg_duration || 0),
                totalPlaytime: Math.round(matchStats.total_playtime || 0)
            },
            replays: {
                total: replayStats.total_replays,
                public: replayStats.public_replays
            },
            activity: {
                playersToday: todayStats.players_today,
                date: today
            },
            lastUpdated: new Date().toISOString()
        };
        
        // Cache the result
        setCachedData(cacheKey, responseData);
        
        res.json(responseData);
        
    } catch (error) {
        logger.error('Get platform stats error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_PLATFORM_STATS_FAILED'
        });
    }
});

/**
 * GET /api/leaderboards/search
 * Search players in leaderboard
 */
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({
                error: 'Search query must be at least 2 characters',
                code: 'INVALID_SEARCH_QUERY'
            });
        }
        
        const players = await database.all(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                u.rating, u.total_games, u.games_won, u.games_lost,
                u.last_active, u.is_online,
                ROUND((CAST(u.games_won AS REAL) / NULLIF(u.total_games, 0)) * 100, 2) as win_rate,
                (
                    SELECT COUNT(*) + 1 
                    FROM users u2 
                    WHERE u2.rating > u.rating AND u2.is_banned = 0
                ) as global_rank
            FROM users u
            WHERE (u.username LIKE ? OR u.display_name LIKE ?)
                AND u.is_banned = 0
            ORDER BY u.rating DESC
            LIMIT ?
        `, [`%${q}%`, `%${q}%`, parseInt(limit)]);
        
        res.json({
            players,
            query: q,
            lastUpdated: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Search leaderboard error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'SEARCH_LEADERBOARD_FAILED'
        });
    }
});

/**
 * GET /api/leaderboards/seasons
 * Get available seasons
 */
router.get('/seasons', async (req, res) => {
    try {
        const seasons = await database.all(`
            SELECT DISTINCT season, 
                   MIN(created_at) as start_date,
                   MAX(updated_at) as end_date,
                   COUNT(DISTINCT user_id) as player_count
            FROM leaderboards 
            GROUP BY season
            ORDER BY start_date DESC
        `);
        
        // Add current season info
        const currentSeason = {
            season: 'current',
            start_date: new Date().toISOString(),
            end_date: null,
            player_count: await database.get('SELECT COUNT(*) as count FROM users WHERE is_banned = 0').then(r => r.count),
            is_current: true
        };
        
        res.json({
            current: currentSeason,
            past: seasons,
            lastUpdated: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Get seasons error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'GET_SEASONS_FAILED'
        });
    }
});

/**
 * POST /api/leaderboards/cache/clear
 * Clear leaderboard cache (admin only)
 */
router.post('/cache/clear', async (req, res) => {
    try {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({
                error: 'Admin access required',
                code: 'ADMIN_REQUIRED'
            });
        }
        
        leaderboardCache.clear();
        logger.info(`Leaderboard cache cleared by admin: ${req.user.username}`);
        
        res.json({
            message: 'Cache cleared successfully',
            clearedAt: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Clear cache error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'CLEAR_CACHE_FAILED'
        });
    }
});

module.exports = router;