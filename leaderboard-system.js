// =======================
// TOURNAMENT LEADERBOARD SYSTEM
// =======================

class LeaderboardSystem {
    constructor() {
        this.tournamentHistory = this.loadTournamentHistory();
        this.playerProfile = this.loadPlayerProfile();
    }
    
    loadTournamentHistory() {
        const saved = localStorage.getItem('pongTournamentHistory');
        return saved ? JSON.parse(saved) : [];
    }
    
    loadPlayerProfile() {
        const saved = localStorage.getItem('pongPlayerProfile');
        return saved ? JSON.parse(saved) : {
            playerName: 'Player',
            registeredDate: new Date().toISOString(),
            totalTournaments: 0,
            tournamentsWon: 0,
            bestStreak: 0,
            currentStreak: 0,
            favoriteOpponent: null,
            nemesis: null,
            totalMatchesWon: 0,
            totalMatchesPlayed: 0
        };
    }
    
    recordTournamentResult(result) {
        const tournamentRecord = {
            date: new Date().toISOString(),
            matchesWon: result.matchesWon,
            totalMatches: result.totalMatches,
            isChampion: result.isChampion,
            opponentsDefeated: result.opponentsDefeated || [],
            finalScore: result.finalScore || 0,
            tournamentType: result.tournamentType || 'standard',
            duration: result.duration || 0,
            difficulty: result.difficulty || 'medium'
        };
        
        this.tournamentHistory.unshift(tournamentRecord); // Add to beginning
        
        // Keep only last 50 tournaments
        if (this.tournamentHistory.length > 50) {
            this.tournamentHistory = this.tournamentHistory.slice(0, 50);
        }
        
        this.updatePlayerProfile(tournamentRecord);
        this.saveTournamentHistory();
        this.savePlayerProfile();
    }
    
    updatePlayerProfile(tournamentRecord) {
        this.playerProfile.totalTournaments++;
        this.playerProfile.totalMatchesPlayed += tournamentRecord.totalMatches;
        this.playerProfile.totalMatchesWon += tournamentRecord.matchesWon;
        
        if (tournamentRecord.isChampion) {
            this.playerProfile.tournamentsWon++;
            this.playerProfile.currentStreak++;
            
            if (this.playerProfile.currentStreak > this.playerProfile.bestStreak) {
                this.playerProfile.bestStreak = this.playerProfile.currentStreak;
            }
        } else {
            this.playerProfile.currentStreak = 0;
        }
        
        // Update opponent statistics
        if (tournamentRecord.opponentsDefeated.length > 0) {
            // Find most defeated opponent (favorite)
            const opponentCounts = {};
            this.tournamentHistory.forEach(record => {
                record.opponentsDefeated?.forEach(opponent => {
                    opponentCounts[opponent] = (opponentCounts[opponent] || 0) + 1;
                });
            });
            
            const mostDefeated = Object.entries(opponentCounts)
                .sort(([,a], [,b]) => b - a)[0];
            
            if (mostDefeated) {
                this.playerProfile.favoriteOpponent = mostDefeated[0];
            }
        }
    }
    
    getTournamentStats() {
        const recent = this.tournamentHistory.slice(0, 10);
        const championshipRate = this.playerProfile.totalTournaments > 0 ? 
            Math.round((this.playerProfile.tournamentsWon / this.playerProfile.totalTournaments) * 100) : 0;
        const matchWinRate = this.playerProfile.totalMatchesPlayed > 0 ?
            Math.round((this.playerProfile.totalMatchesWon / this.playerProfile.totalMatchesPlayed) * 100) : 0;
            
        return {
            totalTournaments: this.playerProfile.totalTournaments,
            tournamentsWon: this.playerProfile.tournamentsWon,
            championshipRate,
            matchWinRate,
            bestStreak: this.playerProfile.bestStreak,
            currentStreak: this.playerProfile.currentStreak,
            favoriteOpponent: this.playerProfile.favoriteOpponent,
            recentTournaments: recent,
            averageMatchesPerTournament: this.playerProfile.totalTournaments > 0 ?
                Math.round(this.playerProfile.totalMatchesWon / this.playerProfile.totalTournaments * 10) / 10 : 0
        };
    }
    
    getGlobalLeaderboard() {
        // This would connect to a server in a real implementation
        // For now, we'll generate mock leaderboard data based on current player
        const playerStats = this.getTournamentStats();
        
        return [
            { 
                rank: this.getPlayerRank(playerStats.championshipRate),
                name: this.playerProfile.playerName,
                tournaments: playerStats.totalTournaments,
                wins: playerStats.tournamentsWon,
                winRate: playerStats.championshipRate,
                streak: playerStats.currentStreak,
                isCurrentPlayer: true
            },
            ...this.generateMockLeaderboard(playerStats)
        ].sort((a, b) => {
            // Sort by win rate, then by total wins, then by tournaments played
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.tournaments - a.tournaments;
        }).map((entry, index) => ({ ...entry, rank: index + 1 }));
    }
    
    getPlayerRank(winRate) {
        if (winRate >= 80) return 'Legend';
        if (winRate >= 65) return 'Champion';
        if (winRate >= 50) return 'Veteran';
        if (winRate >= 35) return 'Challenger';
        return 'Rookie';
    }
    
    generateMockLeaderboard(playerStats) {
        const mockPlayers = [
            { name: 'PongMaster', baseWinRate: 85, tournaments: 150 },
            { name: 'BallBlaster', baseWinRate: 78, tournaments: 120 },
            { name: 'PaddleKing', baseWinRate: 72, tournaments: 200 },
            { name: 'RallyQueen', baseWinRate: 68, tournaments: 95 },
            { name: 'SpeedDemon', baseWinRate: 65, tournaments: 180 },
            { name: 'TrickShot', baseWinRate: 62, tournaments: 88 },
            { name: 'ProPlayer', baseWinRate: 58, tournaments: 110 },
            { name: 'GameGuru', baseWinRate: 55, tournaments: 130 },
            { name: 'TableTitan', baseWinRate: 52, tournaments: 75 }
        ];
        
        return mockPlayers.map(player => {
            const winRate = Math.max(0, player.baseWinRate + (Math.random() * 10 - 5));
            const wins = Math.floor(player.tournaments * (winRate / 100));
            
            return {
                name: player.name,
                tournaments: player.tournaments + Math.floor(Math.random() * 20),
                wins,
                winRate: Math.round(winRate),
                streak: Math.floor(Math.random() * 8),
                isCurrentPlayer: false
            };
        });
    }
    
    getTournamentHistory(limit = 10) {
        return this.tournamentHistory.slice(0, limit).map(record => ({
            ...record,
            date: new Date(record.date).toLocaleDateString(),
            result: record.isChampion ? 'Champion' : `${record.matchesWon}/${record.totalMatches} matches`,
            performance: record.isChampion ? 'Victory' : 'Defeat'
        }));
    }
    
    getPersonalRecords() {
        const history = this.tournamentHistory;
        if (history.length === 0) return null;
        
        const champTournaments = history.filter(t => t.isChampion);
        const bestTournament = champTournaments.length > 0 ? 
            champTournaments.reduce((best, current) => 
                current.matchesWon > best.matchesWon ? current : best
            ) : null;
            
        const quickestWin = champTournaments.length > 0 ?
            champTournaments.reduce((fastest, current) => 
                current.duration < fastest.duration ? current : fastest
            ) : null;
            
        return {
            bestPerformance: bestTournament ? 
                `${bestTournament.matchesWon}/${bestTournament.totalMatches} matches won` : 'None',
            quickestVictory: quickestWin ? 
                `${Math.round(quickestWin.duration / 1000)}s` : 'None',
            mostOpponentsDefeated: bestTournament ? 
                bestTournament.opponentsDefeated.length : 0,
            firstTournament: history.length > 0 ? 
                new Date(history[history.length - 1].date).toLocaleDateString() : 'Never'
        };
    }
    
    setPlayerName(name) {
        this.playerProfile.playerName = name || 'Player';
        this.savePlayerProfile();
    }
    
    exportLeaderboardData() {
        return {
            profile: this.playerProfile,
            history: this.tournamentHistory,
            stats: this.getTournamentStats(),
            records: this.getPersonalRecords()
        };
    }
    
    clearLeaderboardData() {
        this.tournamentHistory = [];
        this.playerProfile = {
            playerName: this.playerProfile.playerName, // Keep name
            registeredDate: new Date().toISOString(),
            totalTournaments: 0,
            tournamentsWon: 0,
            bestStreak: 0,
            currentStreak: 0,
            favoriteOpponent: null,
            nemesis: null,
            totalMatchesWon: 0,
            totalMatchesPlayed: 0
        };
        
        this.saveTournamentHistory();
        this.savePlayerProfile();
    }
    
    saveTournamentHistory() {
        localStorage.setItem('pongTournamentHistory', JSON.stringify(this.tournamentHistory));
    }
    
    savePlayerProfile() {
        localStorage.setItem('pongPlayerProfile', JSON.stringify(this.playerProfile));
    }
}

// Global leaderboard system instance
let leaderboardSystem = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    leaderboardSystem = new LeaderboardSystem();
    window.leaderboardSystem = leaderboardSystem;
});
