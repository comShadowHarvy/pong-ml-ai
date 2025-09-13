// =======================
// ACHIEVEMENT SYSTEM
// =======================

class AchievementSystem {
    constructor() {
        this.achievements = this.initializeAchievements();
        this.unlockedAchievements = this.loadUnlockedAchievements();
        this.recentlyUnlocked = [];
    }
    
    initializeAchievements() {
        return {
            // Basic Game Achievements
            'first_win': {
                id: 'first_win',
                name: 'First Victory',
                description: 'Win your first game',
                icon: '🏆',
                type: 'basic',
                condition: (stats) => stats.gamesWon >= 1
            },
            'perfect_game': {
                id: 'perfect_game',
                name: 'Perfectionist',
                description: 'Win a game without letting AI score',
                icon: '💯',
                type: 'skill',
                condition: (stats) => stats.perfectGames >= 1
            },
            'rally_master': {
                id: 'rally_master',
                name: 'Rally Master',
                description: 'Achieve a rally of 50 hits',
                icon: '🎾',
                type: 'skill',
                condition: (stats) => stats.longestRally >= 50
            },
            'century': {
                id: 'century',
                name: 'Century',
                description: 'Play 100 games',
                icon: '💯',
                type: 'milestone',
                condition: (stats) => stats.gamesPlayed >= 100
            },
            'winning_streak': {
                id: 'winning_streak',
                name: 'Winning Streak',
                description: 'Win 10 games in a row',
                icon: '🔥',
                type: 'skill',
                condition: (stats) => (stats.currentWinStreak || 0) >= 10
            },
            
            // Tournament Achievements
            'tournament_debut': {
                id: 'tournament_debut',
                name: 'Tournament Debut',
                description: 'Complete your first tournament',
                icon: '🥉',
                type: 'tournament',
                condition: (stats) => (stats.tournamentPlayed || 0) >= 1
            },
            'rookie_slayer': {
                id: 'rookie_slayer',
                name: 'Rookie Slayer',
                description: 'Defeat the Rookie in tournament',
                icon: '🗡️',
                type: 'tournament',
                condition: (stats) => (stats.tournamentOpponentsDefeated || []).includes('Rookie')
            },
            'challenger_conquered': {
                id: 'challenger_conquered',
                name: 'Challenger Conquered',
                description: 'Defeat the Challenger in tournament',
                icon: '⚔️',
                type: 'tournament',
                condition: (stats) => (stats.tournamentOpponentsDefeated || []).includes('Challenger')
            },
            'veteran_vanquished': {
                id: 'veteran_vanquished',
                name: 'Veteran Vanquished',
                description: 'Defeat the Veteran in tournament',
                icon: '🛡️',
                type: 'tournament',
                condition: (stats) => (stats.tournamentOpponentsDefeated || []).includes('Veteran')
            },
            'champion_crusher': {
                id: 'champion_crusher',
                name: 'Champion Crusher',
                description: 'Defeat the Champion in tournament',
                icon: '👑',
                type: 'tournament',
                condition: (stats) => (stats.tournamentOpponentsDefeated || []).includes('Champion')
            },
            'legend_killer': {
                id: 'legend_killer',
                name: 'Legend Killer',
                description: 'Defeat the Legend in tournament final',
                icon: '⚡',
                type: 'tournament',
                condition: (stats) => (stats.tournamentOpponentsDefeated || []).includes('Legend')
            },
            'tournament_champion': {
                id: 'tournament_champion',
                name: 'Tournament Champion',
                description: 'Win your first tournament',
                icon: '🏆',
                type: 'tournament',
                condition: (stats) => (stats.tournamentsWon || 0) >= 1
            },
            'grand_slam': {
                id: 'grand_slam',
                name: 'Grand Slam',
                description: 'Win 5 tournaments',
                icon: '🌟',
                type: 'tournament',
                condition: (stats) => (stats.tournamentsWon || 0) >= 5
            },
            'ultimate_champion': {
                id: 'ultimate_champion',
                name: 'Ultimate Champion',
                description: 'Win 10 tournaments',
                icon: '👑',
                type: 'tournament',
                condition: (stats) => (stats.tournamentsWon || 0) >= 10
            },
            'undefeated': {
                id: 'undefeated',
                name: 'Undefeated Champion',
                description: 'Win a tournament without losing a match',
                icon: '💪',
                type: 'tournament',
                condition: (stats) => (stats.perfectTournaments || 0) >= 1
            },
            
            // Special Achievements
            'speed_demon': {
                id: 'speed_demon',
                name: 'Speed Demon',
                description: 'Win a speedball game',
                icon: '⚡',
                type: 'mode',
                condition: (stats) => (stats.speedballWins || 0) >= 1
            },
            'survivor': {
                id: 'survivor',
                name: 'Survivor',
                description: 'Last 100 points in survival mode',
                icon: '💀',
                type: 'mode',
                condition: (stats) => (stats.survivalHighScore || 0) >= 100
            },
            
            // AI Achievement
            'ai_master': {
                id: 'ai_master',
                name: 'AI Master',
                description: 'Defeat all 8 AI personalities',
                icon: '🤖',
                type: 'skill',
                condition: (stats) => {
                    const personalities = ['balanced', 'defensive', 'aggressive', 'perfect', 'unpredictable', 'trickster', 'copycat', 'adaptive'];
                    const beaten = stats.personalitiesBeaten || new Set();
                    return personalities.every(p => beaten.has(p));
                }
            }
        };
    }
    
    checkAchievements(stats) {
        const newlyUnlocked = [];
        
        for (const [id, achievement] of Object.entries(this.achievements)) {
            if (!this.unlockedAchievements.includes(id) && achievement.condition(stats)) {
                this.unlockedAchievements.push(id);
                newlyUnlocked.push(achievement);
                this.recentlyUnlocked.push(achievement);
            }
        }
        
        if (newlyUnlocked.length > 0) {
            this.saveUnlockedAchievements();
            this.showAchievementNotifications(newlyUnlocked);
        }
        
        return newlyUnlocked;
    }
    
    showAchievementNotifications(achievements) {
        achievements.forEach((achievement, index) => {
            setTimeout(() => {
                this.showAchievementPopup(achievement);
            }, index * 2000); // Stagger notifications
        });
    }
    
    showAchievementPopup(achievement) {
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #FFD700, #FFA500);
            color: #000;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
            z-index: 10000;
            font-weight: bold;
            max-width: 300px;
            animation: slideInRight 0.5s ease-out, fadeOut 0.5s ease-out 4.5s;
            pointer-events: auto;
            cursor: pointer;
        `;
        
        popup.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">${achievement.icon}</span>
                <div>
                    <div style="font-size: 16px; margin-bottom: 2px;">Achievement Unlocked!</div>
                    <div style="font-size: 14px; font-weight: normal;">${achievement.name}</div>
                    <div style="font-size: 12px; opacity: 0.8;">${achievement.description}</div>
                </div>
            </div>
        `;
        
        // Add animations
        if (!document.querySelector('#achievement-animations')) {
            const animationStyle = document.createElement('style');
            animationStyle.id = 'achievement-animations';
            animationStyle.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    to { opacity: 0; transform: translateX(100%); }
                }
            `;
            document.head.appendChild(animationStyle);
        }
        
        popup.addEventListener('click', () => {
            popup.remove();
        });
        
        document.body.appendChild(popup);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 5000);
        
        // Play achievement sound
        if (window.audioSystem) {
            window.audioSystem.play('achievement');
        }
    }
    
    getUnlockedAchievements() {
        return this.unlockedAchievements.map(id => this.achievements[id]);
    }
    
    getAchievementsByType(type) {
        return Object.values(this.achievements).filter(achievement => achievement.type === type);
    }
    
    getCompletionRate() {
        return Math.round((this.unlockedAchievements.length / Object.keys(this.achievements).length) * 100);
    }
    
    recordTournamentOpponentDefeated(opponentName, stats) {
        if (!stats.tournamentOpponentsDefeated) {
            stats.tournamentOpponentsDefeated = [];
        }
        
        if (!stats.tournamentOpponentsDefeated.includes(opponentName)) {
            stats.tournamentOpponentsDefeated.push(opponentName);
        }
    }
    
    recordPerfectTournament(stats) {
        stats.perfectTournaments = (stats.perfectTournaments || 0) + 1;
    }
    
    recordPersonalityBeaten(personality, stats) {
        if (!stats.personalitiesBeaten) {
            stats.personalitiesBeaten = new Set();
        }
        stats.personalitiesBeaten.add(personality.toLowerCase());
    }
    
    saveUnlockedAchievements() {
        localStorage.setItem('pongAchievements', JSON.stringify(this.unlockedAchievements));
    }
    
    loadUnlockedAchievements() {
        const saved = localStorage.getItem('pongAchievements');
        return saved ? JSON.parse(saved) : [];
    }
    
    clearAchievements() {
        this.unlockedAchievements = [];
        this.recentlyUnlocked = [];
        this.saveUnlockedAchievements();
    }
}

// Global achievement system instance
let achievementSystem = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    achievementSystem = new AchievementSystem();
    window.achievementSystem = achievementSystem;
});