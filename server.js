require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { google } = require('googleapis');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.REDIRECT_URI,
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'profile',
    'email'
  ],
  accessType: 'offline',
  prompt: 'consent'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      accessToken: accessToken,
      refreshToken: refreshToken
    };
    return done(null, user);
  } catch (error) {
    console.error('Error in Google Strategy:', error);
    return done(error, null);
  }
}));

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

// Gmail API helper functions
class GmailService {
  constructor(accessToken) {
    this.auth = new google.auth.OAuth2();
    this.auth.setCredentials({ access_token: accessToken });
    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
  }

  // Get user profile
  async getProfile() {
    try {
      const response = await this.gmail.users.getProfile({ userId: 'me' });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get profile: ${error.message}`);
    }
  }

  // List emails
  async listEmails(maxResults = 10) {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: maxResults
      });

      const messages = response.data.messages || [];
      const emailDetails = [];

      for (const message of messages) {
        const email = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date']
        });
        
        const headers = email.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        
        emailDetails.push({
          id: message.id,
          threadId: message.threadId,
          subject: subject,
          from: from,
          date: date,
          snippet: email.data.snippet
        });
      }

      return emailDetails;
    } catch (error) {
      throw new Error(`Failed to list emails: ${error.message}`);
    }
  }

  // Get conversation/thread
  async getConversation(threadId) {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });

      const messages = response.data.messages || [];
      const conversation = [];

      for (const message of messages) {
        const email = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date']
        });
        
        const headers = email.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value;
        const to = headers.find(h => h.name === 'To')?.value;
        const subject = headers.find(h => h.name === 'Subject')?.value;
        const date = headers.find(h => h.name === 'Date')?.value;
        
        conversation.push({
          id: message.id,
          from: from,
          to: to,
          subject: subject,
          date: date,
          snippet: message.snippet
        });
      }

      return conversation;
    } catch (error) {
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }

  // Send email
  async sendEmail(to, subject, message) {
    try {
      const emailLines = [
        `To: ${to}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        message
      ];

      const email = emailLines.join('\r\n').trim();
      const base64EncodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: base64EncodedEmail
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

// Routes

// Home page
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gmail OAuth App</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
        .btn { 
          background: #4285f4; 
          color: white; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 5px; 
          cursor: pointer; 
          text-decoration: none;
          display: inline-block;
          font-size: 16px;
          margin: 10px;
        }
        .btn:hover { background: #3367d6; }
        .container { max-width: 600px; margin: 0 auto; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Gmail OAuth 2.0 Integration</h1>
        <p>Connect your Gmail account to read conversations and send emails.</p>
        <a href="/auth/google" class="btn">Sign in with Google</a>
      </div>
    </body>
    </html>
  `);
});

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { 
    accessType: 'offline', 
    prompt: 'consent' 
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/',
    failureMessage: true 
  }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

// Dashboard
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dashboard - Gmail App</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn { 
          background: #4285f4; 
          color: white; 
          padding: 10px 20px; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer; 
          margin: 5px;
          text-decoration: none;
          display: inline-block;
        }
        .btn-danger { background: #dc3545; }
        .btn-success { background: #28a745; }
        .email-list { max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; }
        .email-item { 
          border: 1px solid #eee; 
          padding: 15px; 
          margin: 10px 0; 
          border-radius: 4px; 
          cursor: pointer;
        }
        .email-item:hover { background: #f9f9f9; }
        .form-group { margin-bottom: 15px; text-align: left; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group textarea { 
          width: 100%; 
          padding: 8px; 
          border: 1px solid #ddd; 
          border-radius: 4px; 
          box-sizing: border-box;
        }
        textarea { height: 150px; resize: vertical; }
        .user-info { background: #e9f7fe; padding: 10px; border-radius: 4px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Gmail Dashboard</h1>
          <div class="user-info">
            <strong>Welcome, ${req.user.name} (${req.user.email})</strong>
          </div>
          <a href="/" class="btn">Home</a>
          <a href="/logout" class="btn btn-danger">Logout</a>
          <a href="/profile" class="btn">Profile Info</a>
        </div>

        <div class="section">
          <h2>Email Management</h2>
          <button class="btn" onclick="loadEmails()">Load Recent Emails</button>
          <button class="btn" onclick="testSendEmail()">Test Send Email</button>
          <div id="emails" class="email-list"></div>
        </div>

        <div class="section">
          <h2>Send Email</h2>
          <form id="emailForm">
            <div class="form-group">
              <label for="to">To:</label>
              <input type="email" id="to" name="to" required value="${req.user.email}">
            </div>
            <div class="form-group">
              <label for="subject">Subject:</label>
              <input type="text" id="subject" name="subject" required value="Test from Gmail OAuth App">
            </div>
            <div class="form-group">
              <label for="message">Message:</label>
              <textarea id="message" name="message" required>This is a test email sent from the Gmail OAuth application.</textarea>
            </div>
            <button type="submit" class="btn btn-success">Send Email</button>
          </form>
          <div id="sendResult"></div>
        </div>

        <div class="section">
          <h2>Conversation View</h2>
          <div id="conversation" class="email-list"></div>
        </div>
      </div>

      <script>
        async function loadEmails() {
          try {
            const response = await fetch('/api/emails');
            const data = await response.json();
            
            const emailsDiv = document.getElementById('emails');
            emailsDiv.innerHTML = '<h3>Recent Emails</h3>';
            
            if (data.success && data.emails.length > 0) {
              data.emails.forEach(email => {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'email-item';
                emailDiv.innerHTML = \`
                  <strong>From:</strong> \${email.from}<br>
                  <strong>Subject:</strong> \${email.subject}<br>
                  <strong>Date:</strong> \${email.date}<br>
                  <p>\${email.snippet}</p>
                  <button class="btn" onclick="loadConversation('\${email.threadId}')">View Conversation</button>
                \`;
                emailsDiv.appendChild(emailDiv);
              });
            } else {
              emailsDiv.innerHTML += '<p>No emails found or failed to load emails.</p>';
            }
          } catch (error) {
            console.error('Error loading emails:', error);
            document.getElementById('emails').innerHTML = '<p style="color: red;">Error loading emails</p>';
          }
        }

        async function loadConversation(threadId) {
          try {
            const response = await fetch(\`/api/conversations/\${threadId}\`);
            const data = await response.json();
            
            const conversationDiv = document.getElementById('conversation');
            conversationDiv.innerHTML = '<h3>Conversation</h3>';
            
            if (data.success && data.conversation.length > 0) {
              data.conversation.forEach(message => {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'email-item';
                messageDiv.innerHTML = \`
                  <strong>From:</strong> \${message.from}<br>
                  <strong>To:</strong> \${message.to}<br>
                  <strong>Date:</strong> \${message.date}<br>
                  <strong>Subject:</strong> \${message.subject}<br>
                  <p>\${message.snippet}</p>
                  <hr>
                \`;
                conversationDiv.appendChild(messageDiv);
              });
            } else {
              conversationDiv.innerHTML += '<p>No conversation found.</p>';
            }
          } catch (error) {
            console.error('Error loading conversation:', error);
            document.getElementById('conversation').innerHTML = '<p style="color: red;">Error loading conversation</p>';
          }
        }

        async function testSendEmail() {
          document.getElementById('to').value = '${req.user.email}';
          document.getElementById('subject').value = 'Test Email - ' + new Date().toLocaleString();
          document.getElementById('message').value = 'This is a test email sent from the Gmail OAuth application at ' + new Date().toLocaleString();
        }

        document.getElementById('emailForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const formData = new FormData(e.target);
          const data = {
            to: formData.get('to'),
            subject: formData.get('subject'),
            message: formData.get('message')
          };

          try {
            const response = await fetch('/api/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            });

            const result = await response.json();
            const resultDiv = document.getElementById('sendResult');
            
            if (result.success) {
              resultDiv.innerHTML = '<p style="color: green;">✅ Email sent successfully! Message ID: ' + result.messageId + '</p>';
              e.target.reset();
            } else {
              resultDiv.innerHTML = '<p style="color: red;">❌ Error: ' + result.error + '</p>';
            }
          } catch (error) {
            console.error('Error sending email:', error);
            document.getElementById('sendResult').innerHTML = '<p style="color: red;">❌ Failed to send email</p>';
          }
        });

        // Load emails on page load
        loadEmails();
      </script>
    </body>
    </html>
  `);
});

// API Routes
app.get('/api/emails', ensureAuthenticated, async (req, res) => {
  try {
    const gmailService = new GmailService(req.user.accessToken);
    const emails = await gmailService.listEmails(10);
    
    res.json({ success: true, emails: emails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/conversations/:threadId', ensureAuthenticated, async (req, res) => {
  try {
    const gmailService = new GmailService(req.user.accessToken);
    const conversation = await gmailService.getConversation(req.params.threadId);
    
    res.json({ success: true, conversation: conversation });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-email', ensureAuthenticated, async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: to, subject, message' 
      });
    }

    const gmailService = new GmailService(req.user.accessToken);
    const result = await gmailService.sendEmail(to, subject, message);
    
    res.json({ 
      success: true, 
      messageId: result.id,
      message: 'Email sent successfully'
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const gmailService = new GmailService(req.user.accessToken);
    const profile = await gmailService.getProfile();
    
    res.json({
      success: true,
      user: req.user,
      gmailProfile: profile
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    authenticated: req.isAuthenticated()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Gmail OAuth app ready for testing`);
  console.log(`🔐 Make sure to configure your Google Cloud Console OAuth credentials`);
});