// routes/emailRoutes.js
const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  // In a real app, you'd check for a valid session/token
  // For now, we'll use a simple check for tokens in query or body
  const { userId, tokens } = req.query;
  
  if (!userId || !tokens) {
    return res.status(401).json({ 
      error: 'Authentication required. Please authenticate first via /auth and provide userId and tokens.' 
    });
  }
  
  next();
};

// Apply auth middleware to all routes
router.use(requireAuth);

// Send email
router.post('/send', async (req, res) => {
  try {
    const { to, subject, body, from } = req.body;
    
    if (!to || !subject || !body) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, body' 
      });
    }

    const result = await emailService.sendEmail({
      to, 
      subject, 
      body, 
      from: from || 'me'
    });
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.id 
    });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get emails from inbox
router.get('/inbox', async (req, res) => {
  try {
    const { maxResults = 10, pageToken } = req.query;
    
    const emails = await emailService.getEmails(
      parseInt(maxResults), 
      pageToken
    );
    
    res.json({ 
      success: true, 
      data: emails 
    });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific email by ID
router.get('/emails/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const email = await emailService.getEmail(messageId);
    
    res.json({ 
      success: true, 
      data: email 
    });
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get email threads
router.get('/threads', async (req, res) => {
  try {
    const { maxResults = 10 } = req.query;
    
    const threads = await emailService.getThreads(parseInt(maxResults));
    
    res.json({ 
      success: true, 
      data: threads 
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific thread
router.get('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    
    const thread = await emailService.getThread(threadId);
    
    res.json({ 
      success: true, 
      data: thread 
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
