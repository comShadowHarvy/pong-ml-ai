// =======================
// VERSION MANAGER SYSTEM
// =======================

class VersionManager {
    constructor() {
        this.versionData = null;
        this.loaded = false;
    }
    
    async loadVersionData() {
        if (this.loaded) return this.versionData;
        
        try {
            const response = await fetch('./version-config.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.versionData = await response.json();
            this.loaded = true;
            console.log('Version data loaded:', this.versionData.version);
            return this.versionData;
        } catch (error) {
            console.error('Failed to load version data:', error);
            // Fallback version data
            this.versionData = {
                version: '1.2.0',
                description: 'Enhanced Pong - Ultimate Edition',
                author: 'ShadowHarvy',
                features: {
                    aiPersonalities: 8,
                    achievements: '15+',
                    themes: 16,
                    backgroundEffects: 15,
                    gameModes: 6,
                    newFeatures: ['Tournament System', 'Achievement Expansion']
                },
                roadmap: {
                    completed: [],
                    upcoming: []
                }
            };
            this.loaded = true;
            return this.versionData;
        }
    }
    
    getVersion() {
        return this.versionData?.version || '1.2.0';
    }
    
    getFullDescription() {
        return this.versionData?.description || 'Enhanced Pong - Ultimate Edition';
    }
    
    getAuthor() {
        return this.versionData?.author || 'ShadowHarvy';
    }
    
    getReleaseDate() {
        if (!this.versionData?.releaseDate) return 'Unknown';
        return new Date(this.versionData.releaseDate).toLocaleDateString();
    }
    
    getCodename() {
        return this.versionData?.codename || '';
    }
    
    getFeatures() {
        return this.versionData?.features || {};
    }
    
    getNewFeatures() {
        return this.versionData?.features?.newFeatures || [];
    }
    
    getRoadmap() {
        return this.versionData?.roadmap || { completed: [], upcoming: [] };
    }
    
    generateAboutHTML() {
        if (!this.versionData) return '<p>Loading version information...</p>';
        
        const features = this.getFeatures();
        const roadmap = this.getRoadmap();
        const codename = this.getCodename();
        
        return `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3 style="color: var(--secondary-color); margin-bottom: 5px;">${this.getFullDescription()}</h3>
                <p style="margin: 5px 0; color: #aaa;">
                    Version ${this.getVersion()}${codename ? ` "${codename}"` : ''}
                </p>
                <p style="margin: 5px 0; font-weight: bold;">Created by <span style="color: var(--primary-color);">${this.getAuthor()}</span></p>
                <p style="margin: 5px 0; color: #999; font-size: 12px;">Released: ${this.getReleaseDate()}</p>
            </div>
            
            <div style="text-align: left; font-size: 13px; margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h4 style="color: var(--primary-color); margin-top: 0;">🚀 What Makes This Special</h4>
                    <p>• <strong>${features.aiPersonalities} AI Personalities</strong> including machine learning adaptive AI</p>
                    <p>• <strong>Advanced Analytics</strong> with heat maps and performance tracking</p>
                    <p>• <strong>${features.achievements} Achievements</strong> including tournament-specific rewards</p>
                    <p>• <strong>Tournament System</strong> with leaderboards and rankings</p>
                    <p>• <strong>${features.themes} Visual Themes</strong> including accessibility options</p>
                    <p>• <strong>${features.backgroundEffects} Background Effects</strong> from Matrix to Lightning Storm</p>
                    <p>• <strong>${features.gameModes} Game Modes</strong> for varied gameplay experiences</p>
                </div>
                
                ${this.generateRoadmapHTML(roadmap)}
                
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                    <h4 style="color: var(--primary-color); margin-top: 0;">👨‍💻 About the Developer</h4>
                    <p><strong>${this.getAuthor()}</strong> is a backend developer with a passion for security and a growing interest in game development. This project represents an exploration into frontend technologies and AI-driven gameplay mechanics.</p>
                    <p style="margin-top: 10px;"><strong>Background:</strong> 🖥️ Backend Development • 🔒 Security Enthusiast • 🎮 Aspiring Game Developer</p>
                    <p><strong>Platform:</strong> Linux (CachyOS) • Multi-browser support</p>
                    <p><strong>Tech Stack:</strong> HTML5 Canvas, JavaScript ES6+, Web Audio API, Machine Learning</p>
                    <p style="margin-top: 10px; font-style: italic;">"Bridging backend expertise with creative game development!"</p>
                </div>
            </div>
        `;
    }
    
    generateRoadmapHTML(roadmap) {
        if (!roadmap.completed.length && !roadmap.upcoming.length) {
            return '<div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 15px;"><p>Roadmap information loading...</p></div>';
        }
        
        let html = '<div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 15px;">';
        html += '<h4 style="color: var(--secondary-color); margin-top: 0;">🗺️ Development Roadmap</h4>';
        
        // Show latest completed version
        if (roadmap.completed.length > 0) {
            const latest = roadmap.completed[roadmap.completed.length - 1];
            html += `<p><strong>✅ v${latest.version}:</strong> ${latest.features.join(', ')} (COMPLETED)</p>`;
        }
        
        // Show upcoming versions
        roadmap.upcoming.forEach((version, index) => {
            const prefix = index === 0 ? 'Next' : `v${version.version}`;
            html += `<p><strong>${prefix} (v${version.version}):</strong> ${version.title}</p>`;
        });
        
        html += '</div>';
        return html;
    }
    
    generateFeaturesHTML() {
        const newFeatures = this.getNewFeatures();
        if (newFeatures.length === 0) return '';
        
        return `
            <div style="background: rgba(78,205,196,0.1); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h4 style="color: var(--primary-color); margin-top: 0;">✨ Latest Features (v${this.getVersion()})</h4>
                ${newFeatures.map(feature => `<p>• ${feature}</p>`).join('')}
            </div>
        `;
    }
    
    async updateAboutPanel() {
        await this.loadVersionData();
        
        const aboutContent = document.getElementById('aboutContent');
        if (aboutContent) {
            aboutContent.innerHTML = this.generateAboutHTML();
            console.log(`✅ Updated about panel to version ${this.getVersion()}`);
        } else {
            console.warn('⚠️  About content div not found');
        }
    }
    
    // Helper method to update service worker cache name
    getCacheVersion() {
        return `enhanced-pong-v${this.getVersion()}`;
    }
    
    // Helper method to check if update is needed
    needsUpdate(currentVersion) {
        const configVersion = this.getVersion();
        return currentVersion !== configVersion;
    }
}

// Global version manager instance
let versionManager = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    versionManager = new VersionManager();
    window.versionManager = versionManager;
    
    // Load version data immediately
    await versionManager.loadVersionData();
    
    // Update about panel if it exists
    if (document.getElementById('aboutPanel')) {
        await versionManager.updateAboutPanel();
    }
    
    console.log(`Enhanced Pong ${versionManager.getVersion()} loaded successfully!`);
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VersionManager;
}