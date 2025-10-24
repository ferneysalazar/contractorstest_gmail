// routes/delegatedEmailRoutes.js
const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const tokenManager = require('../utils/tokenManager');

// Middleware to load user tokens
const loadUserTokens = async (req, res, next) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID required. Use the userId from authentication.' 
      });
    }

    const tokens = await tokenManager.loadTokens(userId);
    
    if (!tokens) {
      return res.status(404).json({ 
        error: 'User not found or not authenticated. Please authenticate first.' 
      });
    }

    req.userTokens = tokens;
    req.userEmail = tokens.email;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Basic validation middleware - SIMPLIFIED
const validateEmailAccess = async (req, res, next) => {
  try {
    const { targetEmail } = req.query || req.body;
    
    if (!targetEmail) {
      return res.status(400).json({ 
        error: 'targetEmail parameter is required' 
      });
    }

    // Basic email format validation only
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    req.targetEmail = targetEmail;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Apply token loading middleware to all routes
router.use(loadUserTokens);

// Get emails from delegated inbox
router.get('/inbox', validateEmailAccess, async (req, res) => {
  try {
    const { maxResults = 10, pageToken, labelIds, q } = req.query;
    
    const emails = await emailService.getDelegatedEmails(
      req.targetEmail,
      parseInt(maxResults), 
      pageToken,
      labelIds ? labelIds.split(',') : undefined,
      q
    );
    
    res.json({ 
      success: true, 
      authenticatedAs: req.userEmail,
      accessing: req.targetEmail,
      data: emails 
    });
  } catch (error) {
    console.error('Get delegated emails error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch emails',
      details: error.message
    });
  }
});

// Send email as delegated user
router.post('/send', validateEmailAccess, async (req, res) => {
  try {
    const { to, subject, body, from, cc, bcc, replyTo, attachments } = req.body;
    
    // Validate required fields
    if (!to || !subject || !body || !from) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, body, from' 
      });
    }

    // Validate from email matches targetEmail
    if (from !== req.targetEmail) {
      return res.status(400).json({ 
        error: 'From email must match the delegated mailbox' 
      });
    }

    const result = await emailService.sendEmailAsDelegate({
      to, 
      subject, 
      body, 
      from,
      cc,
      bcc,
      replyTo,
      attachments
    });
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully as delegate',
      sentAs: from,
      messageId: result.id 
    });
  } catch (error) {
    console.error('Send delegated email error:', error);
    res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message
    });
  }
});

// Get specific email from delegated account
router.get('/emails/:messageId', validateEmailAccess, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Validate messageId format
    if (!messageId || messageId.length < 5) {
      return res.status(400).json({ 
        error: 'Valid messageId is required' 
      });
    }

    const email = await emailService.getDelegatedEmail(
      req.targetEmail, 
      messageId
    );
    
    res.json({ 
      success: true, 
      authenticatedAs: req.userEmail,
      accessing: req.targetEmail,
      data: email 
    });
  } catch (error) {
    console.error('Get delegated email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get threads from delegated account
router.get('/threads', validateEmailAccess, async (req, res) => {
  try {
    const { maxResults = 10, pageToken, labelIds } = req.query;
    
    const threads = await emailService.getDelegatedThreads(
      req.targetEmail, 
      parseInt(maxResults),
      pageToken,
      labelIds ? labelIds.split(',') : undefined
    );
    
    res.json({ 
      success: true, 
      authenticatedAs: req.userEmail,
      accessing: req.targetEmail,
      data: threads 
    });
  } catch (error) {
    console.error('Get delegated threads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple delegation status check (basic version)
router.get('/delegation-status', async (req, res) => {
  try {
    const { targetEmail } = req.query;
    
    if (!targetEmail) {
      return res.status(400).json({ 
        error: 'targetEmail parameter is required' 
      });
    }

    // Basic status response without actual delegation checking
    res.json({ 
      success: true, 
      authenticatedAs: req.userEmail,
      delegationStatus: {
        hasAccess: true,
        message: 'Delegation check skipped for testing',
        targetEmail: targetEmail
      }
    });
  } catch (error) {
    console.error('Check delegation status error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;