#!/usr/bin/env node

/**
 * Enhanced Pong - Backend Server
 * 
 * A comprehensive backend for Enhanced Pong with:
 * - Global leaderboards and player statistics
 * - Real-time matchmaking service
 * - Cloud replay storage and sharing
 * - Anti-cheat validation system
 * - User authentication and profiles
 * - Admin dashboard and monitoring
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./database/db');

// Import route handlers
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const gameRoutes = require('./routes/games');
const leaderboardRoutes = require('./routes/leaderboards');
const replayRoutes = require('./routes/replays');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');

// Import WebSocket handlers
const socketHandlers = require('./sockets/socketHandlers');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

class EnhancedPongServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080'],
                methods: ['GET', 'POST']
            }
        });
        
        this.port = process.env.PORT || 3001;
        this.host = process.env.HOST || 'localhost';
        
        this.activeConnections = new Map();
        this.matchmakingQueue = [];
        this.activeMatches = new Map();
        this.playerStats = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
    }
    
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false, // Allow WebSocket connections
            crossOriginEmbedderPolicy: false
        }));
        
        // CORS configuration
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));
        
        // Compression middleware
        this.app.use(compression());
        
        // Request logging
        this.app.use(morgan('combined', {
            stream: { write: (message) => logger.info(message.trim()) }
        }));
        
        // Rate limiting
        const limiter = rateLimit({
            windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
            max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
            message: {
                error: 'Too many requests from this IP, please try again later.',
                code: 'RATE_LIMIT_EXCEEDED'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
        this.app.use('/api/', limiter);
        
        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Static file serving for uploads
        this.app.use('/uploads', express.static('uploads'));
        
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.6.0',
                environment: process.env.NODE_ENV,
                activeConnections: this.activeConnections.size,
                activeMatches: this.activeMatches.size,
                queuedPlayers: this.matchmakingQueue.length
            });
        });
        
        logger.info('Middleware setup completed');
    }
    
    setupRoutes() {
        // API routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/users', authMiddleware, userRoutes);
        this.app.use('/api/games', authMiddleware, gameRoutes);
        this.app.use('/api/leaderboards', leaderboardRoutes);
        this.app.use('/api/replays', replayRoutes);
        this.app.use('/api/stats', statsRoutes);
        this.app.use('/api/admin', authMiddleware, adminRoutes);
        
        // API documentation endpoint
        this.app.get('/api', (req, res) => {
            res.json({
                name: 'Enhanced Pong API',
                version: '1.6.0',
                description: 'Backend API for Enhanced Pong multiplayer gaming platform',
                endpoints: {
                    auth: '/api/auth - Authentication endpoints',
                    users: '/api/users - User management',
                    games: '/api/games - Game management',
                    leaderboards: '/api/leaderboards - Global rankings',
                    replays: '/api/replays - Replay storage and sharing',
                    stats: '/api/stats - Player and game statistics',
                    admin: '/api/admin - Administrative functions'
                },
                websocket: {
                    endpoint: '/socket.io/',
                    events: ['connection', 'matchmaking', 'game-events', 'chat']
                }
            });
        });
        
        // 404 handler for API routes
        this.app.use('/api/*', (req, res) => {
            res.status(404).json({
                error: 'API endpoint not found',
                path: req.path,
                method: req.method
            });
        });
        
        logger.info('Routes setup completed');
    }
    
    setupWebSocket() {
        // Set up WebSocket event handlers
        this.io.on('connection', (socket) => {
            logger.info(`New WebSocket connection: ${socket.id}`);
            
            // Store connection
            this.activeConnections.set(socket.id, {
                socket: socket,
                userId: null,
                currentMatch: null,
                joinedAt: new Date()
            });
            
            // Set up socket event handlers
            socketHandlers.setupSocketEvents(socket, {
                activeConnections: this.activeConnections,
                matchmakingQueue: this.matchmakingQueue,
                activeMatches: this.activeMatches,
                playerStats: this.playerStats,
                io: this.io
            });
            
            socket.on('disconnect', () => {
                logger.info(`WebSocket disconnected: ${socket.id}`);
                this.handleDisconnection(socket.id);
            });
        });
        
        logger.info('WebSocket setup completed');
    }
    
    setupErrorHandling() {
        // Global error handler
        this.app.use(errorHandler);
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });
        
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            this.shutdown();
        });
        
        process.on('SIGINT', () => {
            logger.info('SIGINT received, shutting down gracefully');
            this.shutdown();
        });
        
        logger.info('Error handling setup completed');
    }
    
    handleDisconnection(socketId) {
        const connection = this.activeConnections.get(socketId);
        if (!connection) return;
        
        // Remove from matchmaking queue
        this.matchmakingQueue = this.matchmakingQueue.filter(
            player => player.socketId !== socketId
        );
        
        // Handle active match disconnection
        if (connection.currentMatch) {
            const match = this.activeMatches.get(connection.currentMatch);
            if (match) {
                this.handleMatchDisconnection(match, socketId);
            }
        }
        
        // Remove connection
        this.activeConnections.delete(socketId);
        
        // Broadcast updated stats
        this.broadcastServerStats();
    }
    
    handleMatchDisconnection(match, disconnectedSocketId) {
        // Notify other player of disconnection
        match.players.forEach(player => {
            if (player.socketId !== disconnectedSocketId) {
                const socket = this.activeConnections.get(player.socketId)?.socket;
                if (socket) {
                    socket.emit('opponent-disconnected', {
                        matchId: match.id,
                        message: 'Your opponent has disconnected'
                    });
                }
            }
        });
        
        // End match or pause for reconnection
        setTimeout(() => {
            if (this.activeMatches.has(match.id)) {
                this.endMatch(match.id, 'disconnection');
            }
        }, 30000); // 30 second grace period for reconnection
    }
    
    endMatch(matchId, reason = 'completed') {
        const match = this.activeMatches.get(matchId);
        if (!match) return;
        
        // Update player connections
        match.players.forEach(player => {
            const connection = this.activeConnections.get(player.socketId);
            if (connection) {
                connection.currentMatch = null;
            }
        });
        
        // Remove match
        this.activeMatches.delete(matchId);
        
        logger.info(`Match ${matchId} ended: ${reason}`);
        this.broadcastServerStats();
    }
    
    broadcastServerStats() {
        const stats = {
            activeConnections: this.activeConnections.size,
            activeMatches: this.activeMatches.size,
            queuedPlayers: this.matchmakingQueue.length,
            timestamp: new Date().toISOString()
        };
        
        this.io.emit('server-stats', stats);
    }
    
    async start() {
        try {
            // Initialize database
            await database.initialize();
            logger.info('Database initialized successfully');
            
            // Start server
            this.server.listen(this.port, this.host, () => {
                logger.info(`Enhanced Pong Backend Server started`);
                logger.info(`🚀 Server running at http://${this.host}:${this.port}`);
                logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
                logger.info(`📊 Health check: http://${this.host}:${this.port}/health`);
                logger.info(`📖 API docs: http://${this.host}:${this.port}/api`);
                
                // Start broadcasting server stats every 30 seconds
                setInterval(() => {
                    this.broadcastServerStats();
                }, 30000);
            });
            
        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }
    
    async shutdown() {
        logger.info('Starting graceful shutdown...');
        
        try {
            // Close all WebSocket connections
            this.io.close();
            
            // Close HTTP server
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
            
            // Close database connections
            await database.close();
            
            logger.info('Server shutdown completed');
            process.exit(0);
            
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Create and start server
const server = new EnhancedPongServer();

// Start server if this file is run directly
if (require.main === module) {
    server.start();
}

module.exports = server;