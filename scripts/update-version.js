#!/usr/bin/env node

/**
 * Update version.json with current git commit hash and timestamp
 * Run before deployment: node scripts/update-version.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionFile = path.join(__dirname, '..', 'version.json');

try {
  // Get git commit hash (short)
  const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  
  // Get current timestamp and date
  const timestamp = Date.now();
  const buildDate = new Date().toISOString();
  
  // Create version data
  const versionData = {
    version: commitHash,
    timestamp: timestamp,
    buildDate: buildDate
  };
  
  // Write to version.json
  fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2) + '\n');
  
  console.log(`✅ Version updated: ${commitHash} (${buildDate})`);
} catch (error) {
  console.error('❌ Failed to update version:', error.message);
  
  // Fallback: write default version
  const fallbackData = {
    version: 'dev-' + Date.now(),
    timestamp: Date.now(),
    buildDate: new Date().toISOString()
  };
  
  fs.writeFileSync(versionFile, JSON.stringify(fallbackData, null, 2) + '\n');
  console.log(`⚠️  Using fallback version: ${fallbackData.version}`);
}
