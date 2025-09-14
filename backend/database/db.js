/**
 * Enhanced Pong - Database Layer
 * 
 * Comprehensive database management with support for:
 * - SQLite for development and small deployments
 * - PostgreSQL for production scaling
 * - User management and authentication
 * - Game statistics and leaderboards
 * - Match history and replays
 * - Anti-cheat data and reporting
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbType = process.env.DB_TYPE || 'sqlite';
        this.isInitialized = false;
    }

    async initialize() {
        try {
            if (this.dbType === 'sqlite') {
                await this.initializeSQLite();
            } else if (this.dbType === 'postgresql') {
                await this.initializePostgreSQL();
            } else {
                throw new Error(`Unsupported database type: ${this.dbType}`);
            }

            await this.createTables();
            await this.createIndexes();
            await this.seedInitialData();
            
            this.isInitialized = true;
            logger.info('Database initialized successfully');
            
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    async initializeSQLite() {
        const dbPath = process.env.DB_PATH || './data/enhanced-pong.db';
        const dbDir = path.dirname(dbPath);
        
        // Ensure database directory exists
        try {
            await fs.mkdir(dbDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        
        this.db = new sqlite3.Database(dbPath);
        
        // Enable foreign keys and WAL mode for better performance
        await this.run('PRAGMA foreign_keys = ON');
        await this.run('PRAGMA journal_mode = WAL');
        await this.run('PRAGMA synchronous = NORMAL');
        await this.run('PRAGMA cache_size = 1000');
        
        logger.info(`SQLite database connected: ${dbPath}`);
    }

    async initializePostgreSQL() {
        // PostgreSQL implementation would go here
        throw new Error('PostgreSQL support not implemented yet');
    }

    async createTables() {
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                avatar_url TEXT,
                rating INTEGER DEFAULT 1200,
                total_games INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                games_lost INTEGER DEFAULT 0,
                win_streak INTEGER DEFAULT 0,
                best_win_streak INTEGER DEFAULT 0,
                total_playtime INTEGER DEFAULT 0,
                achievements TEXT DEFAULT '[]',
                preferences TEXT DEFAULT '{}',
                last_active DATETIME,
                is_online BOOLEAN DEFAULT 0,
                is_banned BOOLEAN DEFAULT 0,
                is_admin BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Matches table
            `CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id VARCHAR(100) UNIQUE NOT NULL,
                game_mode VARCHAR(50) NOT NULL,
                player1_id INTEGER NOT NULL,
                player2_id INTEGER,
                ai_personality VARCHAR(50),
                player1_score INTEGER DEFAULT 0,
                player2_score INTEGER DEFAULT 0,
                winner_id INTEGER,
                duration INTEGER,
                status VARCHAR(20) DEFAULT 'active',
                match_data TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player1_id) REFERENCES users(id),
                FOREIGN KEY (player2_id) REFERENCES users(id),
                FOREIGN KEY (winner_id) REFERENCES users(id)
            )`,

            // Replays table
            `CREATE TABLE IF NOT EXISTS replays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                replay_id VARCHAR(100) UNIQUE NOT NULL,
                match_id INTEGER NOT NULL,
                uploader_id INTEGER NOT NULL,
                title VARCHAR(255),
                description TEXT,
                replay_data TEXT NOT NULL,
                metadata TEXT,
                file_size INTEGER,
                view_count INTEGER DEFAULT 0,
                like_count INTEGER DEFAULT 0,
                is_public BOOLEAN DEFAULT 1,
                is_featured BOOLEAN DEFAULT 0,
                tags TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES matches(id),
                FOREIGN KEY (uploader_id) REFERENCES users(id)
            )`,

            // Leaderboards table
            `CREATE TABLE IF NOT EXISTS leaderboards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                season VARCHAR(50) NOT NULL,
                game_mode VARCHAR(50) NOT NULL,
                rating INTEGER NOT NULL,
                rank_position INTEGER,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                win_rate REAL DEFAULT 0.0,
                highest_win_streak INTEGER DEFAULT 0,
                total_playtime INTEGER DEFAULT 0,
                last_match_date DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, season, game_mode)
            )`,

            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id VARCHAR(255) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                socket_id VARCHAR(255),
                ip_address VARCHAR(45),
                user_agent TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`,

            // Anti-cheat reports table
            `CREATE TABLE IF NOT EXISTS anticheat_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                reported_user_id INTEGER NOT NULL,
                reporter_id INTEGER,
                report_type VARCHAR(50) NOT NULL,
                severity VARCHAR(20) DEFAULT 'low',
                description TEXT,
                evidence TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                admin_notes TEXT,
                reviewed_by INTEGER,
                reviewed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES matches(id),
                FOREIGN KEY (reported_user_id) REFERENCES users(id),
                FOREIGN KEY (reporter_id) REFERENCES users(id),
                FOREIGN KEY (reviewed_by) REFERENCES users(id)
            )`,

            // Friends table
            `CREATE TABLE IF NOT EXISTS friends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                friend_id INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (friend_id) REFERENCES users(id),
                UNIQUE(user_id, friend_id)
            )`,

            // Game statistics table
            `CREATE TABLE IF NOT EXISTS game_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                stat_date DATE NOT NULL,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                total_score INTEGER DEFAULT 0,
                longest_rally INTEGER DEFAULT 0,
                perfect_games INTEGER DEFAULT 0,
                power_ups_collected INTEGER DEFAULT 0,
                avg_reaction_time REAL DEFAULT 0.0,
                playtime_minutes INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, stat_date)
            )`,

            // System settings table
            `CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key VARCHAR(100) UNIQUE NOT NULL,
                setting_value TEXT,
                description TEXT,
                is_public BOOLEAN DEFAULT 0,
                updated_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (updated_by) REFERENCES users(id)
            )`
        ];

        for (const tableSQL of tables) {
            await this.run(tableSQL);
        }

        logger.info('Database tables created successfully');
    }

    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC)',
            'CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active)',
            
            'CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id)',
            'CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id)',
            'CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)',
            'CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches(started_at)',
            
            'CREATE INDEX IF NOT EXISTS idx_replays_match ON replays(match_id)',
            'CREATE INDEX IF NOT EXISTS idx_replays_uploader ON replays(uploader_id)',
            'CREATE INDEX IF NOT EXISTS idx_replays_public ON replays(is_public)',
            'CREATE INDEX IF NOT EXISTS idx_replays_featured ON replays(is_featured)',
            
            'CREATE INDEX IF NOT EXISTS idx_leaderboards_season ON leaderboards(season)',
            'CREATE INDEX IF NOT EXISTS idx_leaderboards_mode ON leaderboards(game_mode)',
            'CREATE INDEX IF NOT EXISTS idx_leaderboards_rating ON leaderboards(rating DESC)',
            
            'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
            
            'CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status)',
            
            'CREATE INDEX IF NOT EXISTS idx_game_stats_user_date ON game_stats(user_id, stat_date)'
        ];

        for (const indexSQL of indexes) {
            await this.run(indexSQL);
        }

        logger.info('Database indexes created successfully');
    }

    async seedInitialData() {
        // Create admin user if it doesn't exist
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@enhanced-pong.com';
        const adminExists = await this.get('SELECT id FROM users WHERE email = ?', [adminEmail]);
        
        if (!adminExists) {
            const bcrypt = require('bcryptjs');
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            
            await this.run(`
                INSERT INTO users (username, email, password_hash, display_name, is_admin, rating)
                VALUES (?, ?, ?, ?, ?, ?)
            `, ['admin', adminEmail, hashedPassword, 'Admin', 1, 2000]);
            
            logger.info('Admin user created successfully');
        }

        // Insert initial system settings
        const defaultSettings = [
            ['server_name', 'Enhanced Pong Server', 'Server display name', 1],
            ['max_rating', '3000', 'Maximum player rating', 1],
            ['min_rating', '800', 'Minimum player rating', 1],
            ['season_duration', '90', 'Season length in days', 1],
            ['matchmaking_enabled', 'true', 'Enable matchmaking system', 1],
            ['anti_cheat_enabled', 'true', 'Enable anti-cheat system', 1],
            ['max_replay_size', '10485760', 'Maximum replay file size in bytes', 1],
            ['max_friends', '100', 'Maximum friends per user', 1]
        ];

        for (const [key, value, description, isPublic] of defaultSettings) {
            const exists = await this.get('SELECT id FROM system_settings WHERE setting_key = ?', [key]);
            if (!exists) {
                await this.run(`
                    INSERT INTO system_settings (setting_key, setting_value, description, is_public)
                    VALUES (?, ?, ?, ?)
                `, [key, value, description, isPublic]);
            }
        }

        logger.info('Initial data seeded successfully');
    }

    // Database operation wrappers
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(error) {
                if (error) {
                    logger.error('Database run error:', error);
                    reject(error);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (error, row) => {
                if (error) {
                    logger.error('Database get error:', error);
                    reject(error);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (error, rows) => {
                if (error) {
                    logger.error('Database all error:', error);
                    reject(error);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Transaction support
    async beginTransaction() {
        await this.run('BEGIN TRANSACTION');
    }

    async commit() {
        await this.run('COMMIT');
    }

    async rollback() {
        await this.run('ROLLBACK');
    }

    // Close database connection
    async close() {
        if (this.db) {
            await new Promise((resolve) => {
                this.db.close(resolve);
            });
            logger.info('Database connection closed');
        }
    }

    // Health check
    async healthCheck() {
        try {
            await this.get('SELECT 1');
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
        }
    }
}

// Create singleton instance
const database = new DatabaseManager();

module.exports = database;