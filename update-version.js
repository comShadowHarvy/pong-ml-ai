#!/usr/bin/env node

// =======================
// VERSION UPDATE SCRIPT
// =======================
// 
// Usage: node update-version.js [new-version]
// 
// This script automatically updates version numbers across all files
// based on the version-config.json configuration.

const fs = require('fs');
const path = require('path');

class VersionUpdater {
    constructor() {
        this.configPath = path.join(__dirname, 'version-config.json');
        this.config = null;
    }
    
    loadConfig() {
        try {
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(configContent);
            console.log(`✅ Loaded config for version ${this.config.version}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to load version-config.json:', error.message);
            return false;
        }
    }
    
    updateVersion(newVersion) {
        if (!this.config) {
            console.error('❌ Config not loaded');
            return false;
        }
        
        console.log(`🔄 Updating from ${this.config.version} to ${newVersion}`);
        
        // Update config
        this.config.version = newVersion;
        this.config.releaseDate = new Date().toISOString().split('T')[0];
        
        // Save updated config
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        console.log(`✅ Updated version-config.json to ${newVersion}`);
        
        return true;
    }
    
    updateAllFiles() {
        if (!this.config) {
            console.error('❌ Config not loaded');
            return false;
        }
        
        const version = this.config.version;
        let filesUpdated = 0;
        
        // Update each target file
        this.config.updateTargets.forEach(target => {
            const filePath = path.join(__dirname, target.file);
            
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️  File not found: ${target.file}`);
                return;
            }
            
            const success = this.updateFile(filePath, target, version);
            if (success) {
                filesUpdated++;
                console.log(`✅ Updated ${target.file}`);
            } else {
                console.warn(`⚠️  Failed to update ${target.file}`);
            }
        });
        
        console.log(`🎉 Updated ${filesUpdated} files to version ${version}`);
        return filesUpdated > 0;
    }
    
    updateFile(filePath, target, version) {
        try {
            let content = fs.readFileSync(filePath, 'utf8');
            let updated = false;
            
            target.locations.forEach(location => {
                const newContent = this.updateLocation(content, location, version);
                if (newContent !== content) {
                    content = newContent;
                    updated = true;
                }
            });
            
            if (updated) {
                fs.writeFileSync(filePath, content);
            }
            
            return updated;
        } catch (error) {
            console.error(`❌ Error updating ${filePath}:`, error.message);
            return false;
        }
    }
    
    updateLocation(content, location, version) {
        switch (location.type) {
            case 'version':
                return this.updateVersionPattern(content, location, version);
            case 'badge':
                return this.updateBadge(content, location, version);
            case 'cache':
                return this.updateCacheName(content, location, version);
            default:
                console.warn(`⚠️  Unknown location type: ${location.type}`);
                return content;
        }
    }
    
    updateVersionPattern(content, location, version) {
        if (location.pattern) {
            const pattern = location.pattern.replace('{{version}}', version);
            // Find existing version pattern and replace it
            const regex = /Version\s+[\d\.]+/g;
            const replacement = `Version ${version}`;
            return content.replace(regex, replacement);
        }
        return content;
    }
    
    updateBadge(content, location, version) {
        const pattern = location.pattern.replace('{{version}}', version);
        // Replace version badge
        const regex = /!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-[\d\.]+-blue\.svg\)/g;
        return content.replace(regex, pattern);
    }
    
    updateCacheName(content, location, version) {
        const pattern = location.pattern.replace('{{version}}', version);
        // Replace cache name
        const regex = /const CACHE_NAME = 'enhanced-pong-v[\d\.]+';/g;
        return content.replace(regex, pattern);
    }
    
    addToRoadmap(versionInfo) {
        if (!this.config) return false;
        
        // Move current version to completed
        if (!this.config.roadmap.completed.some(v => v.version === this.config.version)) {
            this.config.roadmap.completed.push({
                version: this.config.version,
                date: this.config.releaseDate,
                features: versionInfo.features || []
            });
        }
        
        // Save updated config
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        console.log(`✅ Added version ${this.config.version} to roadmap`);
        
        return true;
    }
    
    generateReport() {
        if (!this.config) return;
        
        console.log(`\n📋 VERSION REPORT`);
        console.log(`==================`);
        console.log(`Current Version: ${this.config.version}`);
        console.log(`Codename: ${this.config.codename || 'None'}`);
        console.log(`Release Date: ${this.config.releaseDate}`);
        console.log(`Files to Update: ${this.config.updateTargets.length}`);
        
        console.log(`\n📁 Update Targets:`);
        this.config.updateTargets.forEach(target => {
            console.log(`  • ${target.file} (${target.locations.length} locations)`);
        });
        
        console.log(`\n🗺️  Roadmap Status:`);
        console.log(`  Completed: ${this.config.roadmap.completed.length} versions`);
        console.log(`  Upcoming: ${this.config.roadmap.upcoming.length} versions`);
    }
    
    validateConfig() {
        if (!this.config) return false;
        
        const required = ['version', 'description', 'author', 'features', 'roadmap', 'updateTargets'];
        const missing = required.filter(key => !this.config.hasOwnProperty(key));
        
        if (missing.length > 0) {
            console.error('❌ Missing required config fields:', missing.join(', '));
            return false;
        }
        
        console.log('✅ Config validation passed');
        return true;
    }
}

// CLI Interface
function main() {
    const updater = new VersionUpdater();
    
    if (!updater.loadConfig()) {
        process.exit(1);
    }
    
    if (!updater.validateConfig()) {
        process.exit(1);
    }
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'update':
            const newVersion = args[1];
            if (!newVersion) {
                console.error('❌ Usage: node update-version.js update <version>');
                process.exit(1);
            }
            
            updater.updateVersion(newVersion);
            updater.updateAllFiles();
            break;
            
        case 'sync':
            updater.updateAllFiles();
            break;
            
        case 'report':
            updater.generateReport();
            break;
            
        case 'roadmap':
            const features = args.slice(1);
            updater.addToRoadmap({ features });
            break;
            
        default:
            console.log(`
🚀 Enhanced Pong Version Manager

Commands:
  update <version>  - Update to new version and sync all files
  sync              - Sync all files with current version
  report            - Show current version status
  roadmap [feature] - Add current version to completed roadmap

Examples:
  node update-version.js update 1.3.0
  node update-version.js sync
  node update-version.js report
            `);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = VersionUpdater;