// utils/tokenManager.js
const fs = require('fs').promises;
const path = require('path');

class TokenManager {
  constructor() {
    this.tokensFile = path.join(__dirname, '../tokens.json');
  }

  // Save tokens to file
  async saveTokens(userId, tokens) {
    try {
      let tokenData = {};
      
      // Read existing tokens
      try {
        const data = await fs.readFile(this.tokensFile, 'utf8');
        tokenData = JSON.parse(data);
      } catch (error) {
        // File doesn't exist, create new
        console.log('Creating new tokens file...');
      }

      // Add/update user tokens
      tokenData[userId] = {
        ...tokens,
        createdAt: new Date().toISOString()
      };

      await fs.writeFile(this.tokensFile, JSON.stringify(tokenData, null, 2));
      console.log(`Tokens saved for user: ${userId}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to save tokens: ${error.message}`);
    }
  }

  // Load tokens for user
  async loadTokens(userId) {
    try {
      const data = await fs.readFile(this.tokensFile, 'utf8');
      const tokenData = JSON.parse(data);
      return tokenData[userId] || null;
    } catch (error) {
      return null;
    }
  }

  // Check if token is expired
  isTokenExpired(tokens) {
    if (!tokens.expiry_date) return true;
    return Date.now() > tokens.expiry_date;
  }
}

module.exports = new TokenManager();
