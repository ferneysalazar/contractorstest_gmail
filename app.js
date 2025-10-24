require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { google } = require('googleapis');


// Validate environment variables
function validateEnvironment() {
  const required = ['CLIENT_ID', 'CLIENT_SECRET', 'SESSION_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => {
      console.error(`   - ${key}`);
    });
    console.error('\n📝 Please check your .env file');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded successfully');
}

validateEnvironment();

const app = express();

// Basic middleware
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

// Debug: Check if environment variables are loaded
console.log('🔧 Configuration:');
console.log('   CLIENT_ID:', process.env.CLIENT_ID ? '✓ Loaded' : '✗ Missing');
console.log('   CLIENT_SECRET:', process.env.CLIENT_SECRET ? '✓ Loaded' : '✗ Missing');
console.log('   REDIRECT_URI:', process.env.REDIRECT_URI);

// Google OAuth Strategy
try {
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
  console.log('✅ Passport Google Strategy configured successfully');
} catch (error) {
  console.error('❌ Failed to configure Passport Google Strategy:', error.message);
  process.exit(1);
}

// Gmail Service Class
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

  // List emails with better formatting
  async listEmails(maxResults = 20, labelIds = ['INBOX']) {
    try {
      console.log(`📧 Fetching ${maxResults} emails...`);
      
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: maxResults,
        labelIds: labelIds
      });

      const messages = response.data.messages || [];
      console.log(`✅ Found ${messages.length} messages`);

      const emailDetails = [];

      for (const message of messages) {
        try {
          const email = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID']
          });
          
          const headers = email.data.payload.headers;
          const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
          const to = headers.find(h => h.name === 'To')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
          const date = headers.find(h => h.name === 'Date')?.value || '';
          const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';
          
          // Clean up the from field (remove email part if present)
          const fromClean = from.replace(/<[^>]*>/g, '').trim();
          
          emailDetails.push({
            id: message.id,
            threadId: message.threadId,
            subject: subject,
            from: fromClean,
            to: to,
            date: new Date(date).toLocaleString(),
            snippet: email.data.snippet || 'No preview available',
            internalDate: email.data.internalDate,
            labelIds: email.data.labelIds || []
          });
        } catch (emailError) {
          console.error(`Error fetching email ${message.id}:`, emailError.message);
          emailDetails.push({
            id: message.id,
            error: emailError.message
          });
        }
      }

      return emailDetails;
    } catch (error) {
      console.error('Error listing emails:', error);
      throw new Error(`Failed to list emails: ${error.message}`);
    }
  }

  // Get full email content
  async getEmail(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const email = response.data;
      const headers = email.payload.headers || [];
      
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
      const to = headers.find(h => h.name === 'To')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      // Extract email body
      let body = '';
      if (email.payload.parts) {
        // Multipart email
        const textPart = email.payload.parts.find(part => part.mimeType === 'text/plain');
        const htmlPart = email.payload.parts.find(part => part.mimeType === 'text/html');
        
        if (textPart && textPart.body && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        } else if (htmlPart && htmlPart.body && htmlPart.body.data) {
          body = Buffer.from(htmlPart.body.data, 'base64').toString('utf8');
          // Strip HTML tags for simple display
          body = body.replace(/<[^>]*>/g, '');
        }
      } else if (email.payload.body && email.payload.body.data) {
        // Single part email
        body = Buffer.from(email.payload.body.data, 'base64').toString('utf8');
      }

      return {
        id: email.id,
        threadId: email.threadId,
        subject: subject,
        from: from,
        to: to,
        date: new Date(date).toLocaleString(),
        body: body || 'No body content available',
        snippet: email.snippet,
        labelIds: email.labelIds || []
      };
    } catch (error) {
      throw new Error(`Failed to get email: ${error.message}`);
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
        const headers = message.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        
        conversation.push({
          id: message.id,
          from: from.replace(/<[^>]*>/g, '').trim(),
          to: to,
          subject: subject,
          date: new Date(date).toLocaleString(),
          snippet: message.snippet || 'No preview available'
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

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

// Routes
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
        .debug { background: #f0f0f0; padding: 10px; border-radius: 5px; margin: 20px 0; text-align: left; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Gmail OAuth 2.0 Integration</h1>
        <p>Connect your Gmail account to read conversations and send emails.</p>
        <a href="/auth/google" class="btn">Sign in with Google</a>
        
        <div class="debug">
          <h3>Debug Info:</h3>
          <p><strong>CLIENT_ID:</strong> ${process.env.CLIENT_ID ? '✓ Set' : '✗ Missing'}</p>
          <p><strong>CLIENT_SECRET:</strong> ${process.env.CLIENT_SECRET ? '✓ Set' : '✗ Missing'}</p>
          <p><strong>REDIRECT_URI:</strong> ${process.env.REDIRECT_URI}</p>
        </div>
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

// Dashboard with enhanced email testing
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
        .btn-warning { background: #ffc107; color: black; }
        .email-list { max-height: 500px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        .email-item { 
          border: 1px solid #eee; 
          padding: 15px; 
          margin: 10px 0; 
          border-radius: 4px; 
          cursor: pointer;
          transition: background 0.2s;
        }
        .email-item:hover { background: #f8f9fa; }
        .email-item.unread { background: #e3f2fd; border-left: 4px solid #4285f4; }
        .email-header { display: flex; justify-content: between; margin-bottom: 8px; }
        .email-from { font-weight: bold; flex: 1; }
        .email-date { color: #666; font-size: 0.9em; }
        .email-subject { font-weight: bold; margin: 5px 0; color: #333; }
        .email-snippet { color: #666; font-size: 0.9em; line-height: 1.4; }
        .form-group { margin-bottom: 15px; text-align: left; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group textarea, .form-group select { 
          width: 100%; 
          padding: 8px; 
          border: 1px solid #ddd; 
          border-radius: 4px; 
          box-sizing: border-box;
        }
        textarea { height: 150px; resize: vertical; }
        .user-info { background: #e9f7fe; padding: 15px; border-radius: 4px; margin: 10px 0; }
        .loading { color: #666; font-style: italic; }
        .error { color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .success { color: #155724; background: #d4edda; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .email-actions { margin-top: 10px; }
        .stats { display: flex; gap: 20px; margin: 15px 0; }
        .stat-item { background: #f8f9fa; padding: 10px; border-radius: 4px; flex: 1; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📧 Gmail Dashboard</h1>
          <div class="user-info">
            <strong>Welcome, ${req.user.name}!</strong><br>
            <strong>Email:</strong> ${req.user.email}
          </div>
          <a href="/" class="btn">Home</a>
          <a href="/logout" class="btn btn-danger">Logout</a>
          <a href="/api/profile" class="btn" target="_blank">Profile API</a>
        </div>

        <div class="section">
          <h2>📨 Email Testing</h2>
          <div class="stats">
            <div class="stat-item">
              <strong>Test Email Reading</strong><br>
              <button class="btn btn-success" onclick="loadEmails()">Load Recent Emails</button>
            </div>
            <div class="stat-item">
              <strong>Test Email Sending</strong><br>
              <button class="btn btn-warning" onclick="testSendEmail()">Test Send Email</button>
            </div>
          </div>
          
          <div class="form-group">
            <label for="emailCount">Number of emails to fetch:</label>
            <select id="emailCount" onchange="loadEmails()">
              <option value="10">10 emails</option>
              <option value="20" selected>20 emails</option>
              <option value="50">50 emails</option>
            </select>
          </div>

          <div id="emailStats"></div>
          <div id="emails" class="email-list">
            <div class="loading">Click "Load Recent Emails" to start testing...</div>
          </div>
        </div>

        <div class="section">
          <h2>✉️ Send Test Email</h2>
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
              <textarea id="message" name="message" required>This is a test email sent from the Gmail OAuth application to verify that email sending functionality is working correctly.

Timestamp: ${new Date().toLocaleString()}

If you can read this, the Gmail API integration is working properly! 🎉</textarea>
            </div>
            <button type="submit" class="btn btn-success">Send Email</button>
          </form>
          <div id="sendResult"></div>
        </div>

        <div class="section">
          <h2>💬 Conversation View</h2>
          <div id="conversation" class="email-list">
            <div class="loading">Select an email to view its conversation thread</div>
          </div>
        </div>

        <div class="section">
          <h2>🔍 Email Details</h2>
          <div id="emailDetail" class="email-list">
            <div class="loading">Select "View Details" on any email to see full content</div>
          </div>
        </div>
      </div>

      <script>
        async function loadEmails() {
          const emailCount = document.getElementById('emailCount').value;
          const emailsDiv = document.getElementById('emails');
          const statsDiv = document.getElementById('emailStats');
          
          emailsDiv.innerHTML = '<div class="loading">📧 Loading emails...</div>';
          statsDiv.innerHTML = '';

          try {
            const response = await fetch(\`/api/emails?maxResults=\${emailCount}\`);
            const data = await response.json();
            
            emailsDiv.innerHTML = '';
            
            if (data.success && data.emails.length > 0) {
              // Show stats
              statsDiv.innerHTML = \`<div class="success">✅ Loaded \${data.emails.length} emails successfully</div>\`;
              
              data.emails.forEach(email => {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'email-item';
                if (email.labelIds && !email.labelIds.includes('UNREAD')) {
                  emailDiv.classList.add('unread');
                }
                
                emailDiv.innerHTML = \`
                  <div class="email-header">
                    <div class="email-from">👤 \${email.from}</div>
                    <div class="email-date">\${email.date}</div>
                  </div>
                  <div class="email-subject">\${email.subject}</div>
                  <div class="email-snippet">\${email.snippet}</div>
                  <div class="email-actions">
                    <button class="btn" onclick="loadConversation('\${email.threadId}')">View Conversation</button>
                    <button class="btn" onclick="viewEmailDetails('\${email.id}')">View Details</button>
                  </div>
                \`;
                emailsDiv.appendChild(emailDiv);
              });
            } else {
              emailsDiv.innerHTML = '<div class="error">❌ No emails found or failed to load emails.</div>';
            }
          } catch (error) {
            console.error('Error loading emails:', error);
            emailsDiv.innerHTML = '<div class="error">❌ Error loading emails: ' + error.message + '</div>';
          }
        }

        async function loadConversation(threadId) {
          const conversationDiv = document.getElementById('conversation');
          conversationDiv.innerHTML = '<div class="loading">💬 Loading conversation...</div>';

          try {
            const response = await fetch(\`/api/conversations/\${threadId}\`);
            const data = await response.json();
            
            conversationDiv.innerHTML = '<h3>Conversation Thread</h3>';
            
            if (data.success && data.conversation.length > 0) {
              data.conversation.forEach(message => {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'email-item';
                messageDiv.innerHTML = \`
                  <div class="email-header">
                    <div class="email-from">\${message.from}</div>
                    <div class="email-date">\${message.date}</div>
                  </div>
                  <div class="email-subject">\${message.subject}</div>
                  <div class="email-snippet">\${message.snippet}</div>
                \`;
                conversationDiv.appendChild(messageDiv);
              });
            } else {
              conversationDiv.innerHTML += '<div class="error">❌ No conversation found.</div>';
            }
          } catch (error) {
            console.error('Error loading conversation:', error);
            conversationDiv.innerHTML = '<div class="error">❌ Error loading conversation: ' + error.message + '</div>';
          }
        }

        async function viewEmailDetails(messageId) {
          const detailDiv = document.getElementById('emailDetail');
          detailDiv.innerHTML = '<div class="loading">🔍 Loading email details...</div>';

          try {
            const response = await fetch(\`/api/emails/\${messageId}\`);
            const data = await response.json();
            
            detailDiv.innerHTML = '<h3>Email Details</h3>';
            
            if (data.success) {
              const email = data.email;
              const emailDiv = document.createElement('div');
              emailDiv.className = 'email-item';
              emailDiv.innerHTML = \`
                <div class="email-header">
                  <div class="email-from"><strong>From:</strong> \${email.from}</div>
                  <div class="email-date"><strong>Date:</strong> \${email.date}</div>
                </div>
                <div><strong>To:</strong> \${email.to}</div>
                <div class="email-subject"><strong>Subject:</strong> \${email.subject}</div>
                <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 4px; white-space: pre-wrap;">
                  <strong>Body:</strong><br>\${email.body}
                </div>
                <div><strong>Snippet:</strong> \${email.snippet}</div>
                <div><strong>Labels:</strong> \${email.labelIds ? email.labelIds.join(', ') : 'None'}</div>
              \`;
              detailDiv.appendChild(emailDiv);
            } else {
              detailDiv.innerHTML += '<div class="error">❌ Failed to load email details.</div>';
            }
          } catch (error) {
            console.error('Error loading email details:', error);
            detailDiv.innerHTML = '<div class="error">❌ Error loading email details: ' + error.message + '</div>';
          }
        }

        async function testSendEmail() {
          document.getElementById('to').value = '${req.user.email}';
          document.getElementById('subject').value = 'Test Email - ' + new Date().toLocaleString();
          document.getElementById('message').value = 'This is a test email sent from the Gmail OAuth application at ' + new Date().toLocaleString() + '\\n\\nThis confirms that the email sending functionality is working correctly! 🎉';
        }

        document.getElementById('emailForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const formData = new FormData(e.target);
          const data = {
            to: formData.get('to'),
            subject: formData.get('subject'),
            message: formData.get('message')
          };

          const resultDiv = document.getElementById('sendResult');
          resultDiv.innerHTML = '<div class="loading">📤 Sending email...</div>';

          try {
            const response = await fetch('/api/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (result.success) {
              resultDiv.innerHTML = '<div class="success">✅ Email sent successfully! Message ID: ' + result.messageId + '</div>';
              e.target.reset();
              // Reload emails to see the sent one
              setTimeout(() => loadEmails(), 2000);
            } else {
              resultDiv.innerHTML = '<div class="error">❌ Error: ' + result.error + '</div>';
            }
          } catch (error) {
            console.error('Error sending email:', error);
            resultDiv.innerHTML = '<div class="error">❌ Failed to send email: ' + error.message + '</div>';
          }
        });

        // Load emails automatically when page loads
        setTimeout(() => loadEmails(), 1000);
      </script>
    </body>
    </html>
  `);
});

// API Routes for Email Testing
app.get('/api/emails', ensureAuthenticated, async (req, res) => {
  try {
    const maxResults = parseInt(req.query.maxResults) || 20;
    const gmailService = new GmailService(req.user.accessToken);
    const emails = await gmailService.listEmails(maxResults);
    
    console.log(`✅ Successfully fetched ${emails.length} emails`);
    res.json({ success: true, emails: emails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/emails/:messageId', ensureAuthenticated, async (req, res) => {
  try {
    const gmailService = new GmailService(req.user.accessToken);
    const email = await gmailService.getEmail(req.params.messageId);
    
    res.json({ success: true, email: email });
  } catch (error) {
    console.error('Error fetching email:', error);
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
    
    console.log(`✅ Email sent successfully to ${to}`);
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

app.get('/api/profile', ensureAuthenticated, async (req, res) => {
  try {
    const gmailService = new GmailService(req.user.accessToken);
    const profile = await gmailService.getProfile();
    
    res.json({
      success: true,
      user: req.user,
      gmailProfile: profile,
      permissions: {
        canRead: true,
        canSend: true,
        canModify: true
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: {
      client_id_set: !!process.env.CLIENT_ID,
      client_secret_set: !!process.env.CLIENT_SECRET,
      session_secret_set: !!process.env.SESSION_SECRET
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📧 Gmail OAuth app ready`);
});