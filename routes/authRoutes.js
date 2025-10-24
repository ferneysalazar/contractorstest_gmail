// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const gmailConfig = require('../config/gmailConfig');
const tokenManager = require('../utils/tokenManager');

// Generate auth URL
router.get('/url', (req, res) => {
  try {
    const authUrl = gmailConfig.generateAuthUrl();
    res.json({ 
      success: true,
      authUrl: authUrl,
      message: 'Visit this URL to authenticate with Google' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }

    // Exchange code for tokens
    const tokens = await gmailConfig.getTokens(code);
    
    // Generate a user ID (in real app, this would come from your user system)
    const userId = `user_${Date.now()}`;
    
    // Save tokens
    await tokenManager.saveTokens(userId, tokens);
    
    res.json({ 
      success: true, 
      message: 'Authentication successful',
      userId: userId,
      hasRefreshToken: !!tokens.refresh_token,
      note: 'Save this userId for making API calls'
    });
    
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check token status
router.get('/status', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const tokens = await tokenManager.loadTokens(userId);
    
    if (!tokens) {
      return res.status(404).json({ error: 'No tokens found for user' });
    }

    const isExpired = tokenManager.isTokenExpired(tokens);
    
    res.json({
      success: true,
      hasTokens: true,
      isExpired: isExpired,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null
    });
    
  } catch (error) {
    console.error('Token status error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;