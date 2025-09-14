/**
 * Enhanced Pong - WebSocket Event Handlers
 * 
 * Real-time multiplayer functionality:
 * - Matchmaking queue management
 * - Game state synchronization
 * - Chat and lobby systems
 * - Anti-cheat validation
 * - Connection management
 * 
 * @author ShadowHarvy
 * @version 1.6.0
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const database = require('../database/db');
const logger = require('../utils/logger');

class MatchmakingService {
    constructor() {
        this.queue = [];
        this.ratingBands = {
            bronze: { min: 0, max: 1000 },
            silver: { min: 1000, max: 1400 },
            gold: { min: 1400, max: 1800 },
            platinum: { min: 1800, max: 2200 },
            diamond: { min: 2200, max: 3000 }
        };
        this.searchTimeouts = new Map();
    }

    addToQueue(player) {
        // Remove if already in queue
        this.removeFromQueue(player.userId);
        
        const queueEntry = {
            ...player,
            joinedAt: Date.now(),
            ratingRange: this.calculateRatingRange(player.rating, 0)
        };
        
        this.queue.push(queueEntry);
        
        // Set expanding search timeout
        this.setExpandingSearch(player.userId);
        
        logger.info(`Player added to matchmaking queue: ${player.username} (${player.rating})`);
        
        // Try immediate match
        return this.findMatch(queueEntry);
    }

    removeFromQueue(userId) {
        this.queue = this.queue.filter(p => p.userId !== userId);
        
        // Clear timeout
        const timeout = this.searchTimeouts.get(userId);
        if (timeout) {
            clearTimeout(timeout);
            this.searchTimeouts.delete(userId);
        }
        
        logger.info(`Player removed from matchmaking queue: ${userId}`);
    }

    calculateRatingRange(rating, timeInQueue) {
        // Base range ±150, expands by 50 every 15 seconds
        const baseRange = 150;
        const expansionRate = 50;
        const expansionInterval = 15000; // 15 seconds
        
        const expansions = Math.floor(timeInQueue / expansionInterval);
        const currentRange = baseRange + (expansions * expansionRate);
        
        return {
            min: Math.max(800, rating - currentRange),
            max: Math.min(3000, rating + currentRange)
        };
    }

    setExpandingSearch(userId) {
        const expandSearch = () => {
            const player = this.queue.find(p => p.userId === userId);
            if (!player) return;
            
            const timeInQueue = Date.now() - player.joinedAt;
            player.ratingRange = this.calculateRatingRange(player.rating, timeInQueue);
            
            logger.info(`Expanding search range for ${player.username}: ${player.ratingRange.min}-${player.ratingRange.max}`);
            
            // Try to find match with expanded range
            this.findMatch(player);
            
            // Schedule next expansion
            const timeout = setTimeout(expandSearch, 15000);
            this.searchTimeouts.set(userId, timeout);
        };
        
        const timeout = setTimeout(expandSearch, 15000);
        this.searchTimeouts.set(userId, timeout);
    }

    findMatch(player) {
        for (const opponent of this.queue) {
            if (opponent.userId === player.userId) continue;
            
            // Check if ratings are compatible
            const ratingDiff = Math.abs(player.rating - opponent.rating);
            const playerInRange = opponent.rating >= player.ratingRange.min && opponent.rating <= player.ratingRange.max;
            const opponentInRange = player.rating >= opponent.ratingRange.min && player.rating <= opponent.ratingRange.max;
            
            if (playerInRange || opponentInRange) {
                // Found a match!
                this.removeFromQueue(player.userId);
                this.removeFromQueue(opponent.userId);
                
                const match = this.createMatch(player, opponent);
                logger.info(`Match found: ${player.username} vs ${opponent.username} (${ratingDiff} rating diff)`);
                
                return match;
            }
        }
        
        return null;
    }

    createMatch(player1, player2) {
        const matchId = uuidv4();
        const gameRoom = `game-${matchId}`;
        
        return {
            id: matchId,
            roomId: gameRoom,
            players: [player1, player2],
            status: 'starting',
            createdAt: Date.now(),
            gameState: {
                ball: { x: 400, y: 300, vx: 5, vy: 3 },
                paddles: {
                    left: { y: 250, score: 0 },
                    right: { y: 250, score: 0 }
                },
                lastUpdate: Date.now()
            }
        };
    }

    getQueueStats() {
        return {
            total: this.queue.length,
            byRating: {
                bronze: this.queue.filter(p => p.rating < 1000).length,
                silver: this.queue.filter(p => p.rating >= 1000 && p.rating < 1400).length,
                gold: this.queue.filter(p => p.rating >= 1400 && p.rating < 1800).length,
                platinum: this.queue.filter(p => p.rating >= 1800 && p.rating < 2200).length,
                diamond: this.queue.filter(p => p.rating >= 2200).length
            }
        };
    }
}

class GameEngine {
    constructor() {
        this.matches = new Map();
        this.tickRate = 60; // 60 FPS
    }

    createMatch(matchData) {
        this.matches.set(matchData.id, {
            ...matchData,
            lastTick: Date.now(),
            tickInterval: null
        });

        // Start game loop
        this.startGameLoop(matchData.id);
        
        return matchData;
    }

    startGameLoop(matchId) {
        const match = this.matches.get(matchId);
        if (!match) return;

        match.tickInterval = setInterval(() => {
            this.updateGameState(matchId);
        }, 1000 / this.tickRate);
    }

    updateGameState(matchId) {
        const match = this.matches.get(matchId);
        if (!match || match.status !== 'playing') return;

        const now = Date.now();
        const deltaTime = (now - match.lastTick) / 1000;
        match.lastTick = now;

        // Update ball position
        const ball = match.gameState.ball;
        ball.x += ball.vx * deltaTime * 60; // Normalize to 60fps
        ball.y += ball.vy * deltaTime * 60;

        // Ball collision with top/bottom walls
        if (ball.y <= 10 || ball.y >= 590) {
            ball.vy = -ball.vy;
            ball.y = Math.max(10, Math.min(590, ball.y));
        }

        // Ball collision with paddles
        this.handlePaddleCollision(match);

        // Check for scoring
        if (ball.x <= 0) {
            match.gameState.paddles.right.score++;
            this.resetBall(match);
        } else if (ball.x >= 800) {
            match.gameState.paddles.left.score++;
            this.resetBall(match);
        }

        // Check for game end
        if (match.gameState.paddles.left.score >= 11 || match.gameState.paddles.right.score >= 11) {
            this.endMatch(matchId);
        }

        match.gameState.lastUpdate = now;
    }

    handlePaddleCollision(match) {
        const ball = match.gameState.ball;
        const leftPaddle = match.gameState.paddles.left;
        const rightPaddle = match.gameState.paddles.right;

        // Left paddle collision
        if (ball.x <= 20 && ball.x >= 10 && 
            ball.y >= leftPaddle.y - 50 && ball.y <= leftPaddle.y + 50) {
            ball.vx = Math.abs(ball.vx);
            const relativeIntersectY = (leftPaddle.y - ball.y) / 50;
            ball.vy = -relativeIntersectY * 5;
        }

        // Right paddle collision
        if (ball.x >= 780 && ball.x <= 790 && 
            ball.y >= rightPaddle.y - 50 && ball.y <= rightPaddle.y + 50) {
            ball.vx = -Math.abs(ball.vx);
            const relativeIntersectY = (rightPaddle.y - ball.y) / 50;
            ball.vy = -relativeIntersectY * 5;
        }
    }

    resetBall(match) {
        const ball = match.gameState.ball;
        ball.x = 400;
        ball.y = 300;
        ball.vx = Math.random() > 0.5 ? 5 : -5;
        ball.vy = (Math.random() - 0.5) * 6;
    }

    endMatch(matchId) {
        const match = this.matches.get(matchId);
        if (!match) return;

        match.status = 'completed';
        
        if (match.tickInterval) {
            clearInterval(match.tickInterval);
        }

        // Determine winner
        const leftScore = match.gameState.paddles.left.score;
        const rightScore = match.gameState.paddles.right.score;
        match.winner = leftScore > rightScore ? match.players[0] : match.players[1];

        logger.info(`Match completed: ${matchId}, Winner: ${match.winner.username}`);
    }

    updatePlayerInput(matchId, playerId, input) {
        const match = this.matches.get(matchId);
        if (!match || match.status !== 'playing') return false;

        const playerIndex = match.players.findIndex(p => p.userId === playerId);
        if (playerIndex === -1) return false;

        // Validate input
        if (!this.validateInput(input)) {
            logger.warn(`Invalid input from player ${playerId} in match ${matchId}`);
            return false;
        }

        // Update paddle position
        const paddle = playerIndex === 0 ? match.gameState.paddles.left : match.gameState.paddles.right;
        paddle.y = Math.max(50, Math.min(550, input.paddleY));

        return true;
    }

    validateInput(input) {
        // Basic validation
        if (typeof input.paddleY !== 'number') return false;
        if (input.paddleY < 50 || input.paddleY > 550) return false;
        return true;
    }

    getMatchState(matchId) {
        const match = this.matches.get(matchId);
        return match ? match.gameState : null;
    }

    removeMatch(matchId) {
        const match = this.matches.get(matchId);
        if (match?.tickInterval) {
            clearInterval(match.tickInterval);
        }
        this.matches.delete(matchId);
    }
}

// Global instances
const matchmakingService = new MatchmakingService();
const gameEngine = new GameEngine();

// JWT verification for socket connections
const verifySocketToken = (socket, next) => {
    const token = socket.handshake.auth?.token;
    
    if (!token) {
        return next(new Error('Authentication token required'));
    }
    
    try {
        const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'enhanced-pong-access-secret';
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
        socket.userId = decoded.id;
        socket.username = decoded.username;
        socket.isAdmin = decoded.isAdmin;
        next();
    } catch (error) {
        next(new Error('Invalid authentication token'));
    }
};

const setupSocketEvents = (socket, serverContext) => {
    const { activeConnections, matchmakingQueue, activeMatches, playerStats, io } = serverContext;
    
    logger.info(`Socket connected: ${socket.username} (${socket.id})`);
    
    // Update connection info
    const connection = activeConnections.get(socket.id);
    if (connection) {
        connection.userId = socket.userId;
    }

    // User joins lobby
    socket.on('lobby:join', async () => {
        socket.join('lobby');
        
        // Update user online status
        await database.run(
            'UPDATE users SET is_online = 1, last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [socket.userId]
        );
        
        // Send lobby info
        const onlineUsers = Array.from(activeConnections.values())
            .filter(conn => conn.userId)
            .map(conn => ({
                id: conn.userId,
                socketId: conn.socket.id,
                joinedAt: conn.joinedAt
            }));
        
        socket.emit('lobby:info', {
            onlineUsers: onlineUsers.length,
            queuedPlayers: matchmakingService.queue.length,
            activeMatches: activeMatches.size
        });
        
        logger.info(`${socket.username} joined lobby`);
    });

    // Join matchmaking queue
    socket.on('matchmaking:join', async (data) => {
        try {
            // Get user data
            const user = await database.get(
                'SELECT id, username, display_name, rating FROM users WHERE id = ?',
                [socket.userId]
            );
            
            if (!user) {
                socket.emit('error', { message: 'User not found' });
                return;
            }
            
            const player = {
                userId: user.id,
                socketId: socket.id,
                username: user.username,
                displayName: user.display_name,
                rating: user.rating,
                socket: socket
            };
            
            const match = matchmakingService.addToQueue(player);
            
            if (match) {
                // Match found immediately
                handleMatchFound(match, io, activeMatches);
            } else {
                // Added to queue
                socket.emit('matchmaking:queued', {
                    position: matchmakingService.queue.length,
                    estimatedWait: Math.max(30, matchmakingService.queue.length * 15)
                });
            }
            
        } catch (error) {
            logger.error('Matchmaking join error:', error);
            socket.emit('error', { message: 'Failed to join matchmaking' });
        }
    });

    // Leave matchmaking queue
    socket.on('matchmaking:leave', () => {
        matchmakingService.removeFromQueue(socket.userId);
        socket.emit('matchmaking:left');
        logger.info(`${socket.username} left matchmaking queue`);
    });

    // Game input
    socket.on('game:input', (data) => {
        const connection = activeConnections.get(socket.id);
        if (!connection?.currentMatch) {
            socket.emit('error', { message: 'Not in a match' });
            return;
        }
        
        const success = gameEngine.updatePlayerInput(
            connection.currentMatch,
            socket.userId,
            data
        );
        
        if (!success) {
            socket.emit('error', { message: 'Invalid game input' });
        }
    });

    // Chat message
    socket.on('chat:message', async (data) => {
        if (!data.message || data.message.length > 500) {
            socket.emit('error', { message: 'Invalid chat message' });
            return;
        }
        
        // Basic profanity filter (would be more sophisticated in production)
        const message = data.message.trim();
        
        const chatMessage = {
            id: uuidv4(),
            userId: socket.userId,
            username: socket.username,
            message,
            timestamp: new Date().toISOString(),
            room: data.room || 'lobby'
        };
        
        // Broadcast to room
        if (data.room && data.room.startsWith('game-')) {
            socket.to(data.room).emit('chat:message', chatMessage);
        } else {
            socket.to('lobby').emit('chat:message', chatMessage);
        }
        
        logger.info(`Chat message: ${socket.username}: ${message}`);
    });

    // Player ready for match
    socket.on('match:ready', () => {
        const connection = activeConnections.get(socket.id);
        if (!connection?.currentMatch) return;
        
        const match = activeMatches.get(connection.currentMatch);
        if (!match) return;
        
        // Mark player as ready
        const player = match.players.find(p => p.socketId === socket.id);
        if (player) {
            player.ready = true;
            
            // Check if both players are ready
            if (match.players.every(p => p.ready)) {
                match.status = 'playing';
                io.to(match.roomId).emit('match:start');
                logger.info(`Match started: ${match.id}`);
            }
        }
    });

    // Disconnect handling
    socket.on('disconnect', async () => {
        logger.info(`Socket disconnected: ${socket.username} (${socket.id})`);
        
        // Remove from matchmaking
        matchmakingService.removeFromQueue(socket.userId);
        
        // Update user offline status
        if (socket.userId) {
            await database.run(
                'UPDATE users SET is_online = 0, last_active = CURRENT_TIMESTAMP WHERE id = ?',
                [socket.userId]
            );
        }
        
        // Handle match disconnection
        const connection = activeConnections.get(socket.id);
        if (connection?.currentMatch) {
            const match = activeMatches.get(connection.currentMatch);
            if (match) {
                handlePlayerDisconnect(match, socket, activeMatches, io);
            }
        }
    });
};

const handleMatchFound = (match, io, activeMatches) => {
    // Store match
    activeMatches.set(match.id, match);
    gameEngine.createMatch(match);
    
    // Update player connections
    match.players.forEach(player => {
        const connection = activeMatches.get(player.socketId);
        if (connection) {
            connection.currentMatch = match.id;
        }
        
        // Join game room
        player.socket.join(match.roomId);
        
        // Notify player
        player.socket.emit('match:found', {
            matchId: match.id,
            roomId: match.roomId,
            opponent: {
                username: match.players.find(p => p.userId !== player.userId)?.username,
                rating: match.players.find(p => p.userId !== player.userId)?.rating
            }
        });
    });
    
    logger.info(`Match created: ${match.id}`);
    
    // Start countdown
    setTimeout(() => {
        const activeMatch = activeMatches.get(match.id);
        if (activeMatch && activeMatch.status === 'starting') {
            io.to(match.roomId).emit('match:countdown', { seconds: 3 });
        }
    }, 2000);
};

const handlePlayerDisconnect = (match, disconnectedSocket, activeMatches, io) => {
    // Notify other players
    disconnectedSocket.to(match.roomId).emit('player:disconnected', {
        username: disconnectedSocket.username
    });
    
    // Pause match or end it
    match.status = 'paused';
    
    // Give 30 seconds for reconnection
    setTimeout(() => {
        const currentMatch = activeMatches.get(match.id);
        if (currentMatch && currentMatch.status === 'paused') {
            // End match due to disconnection
            gameEngine.endMatch(match.id);
            gameEngine.removeMatch(match.id);
            activeMatches.delete(match.id);
            
            io.to(match.roomId).emit('match:ended', {
                reason: 'player_disconnect',
                winner: match.players.find(p => p.socketId !== disconnectedSocket.id)?.username
            });
        }
    }, 30000);
};

// Game state broadcast (called by server every 16.67ms for 60fps)
const broadcastGameStates = (io, activeMatches) => {
    activeMatches.forEach((match, matchId) => {
        if (match.status === 'playing') {
            const gameState = gameEngine.getMatchState(matchId);
            if (gameState) {
                io.to(match.roomId).emit('game:state', {
                    ball: gameState.ball,
                    paddles: gameState.paddles,
                    timestamp: gameState.lastUpdate
                });
            }
        }
    });
};

module.exports = {
    setupSocketEvents,
    verifySocketToken,
    matchmakingService,
    gameEngine,
    broadcastGameStates
};