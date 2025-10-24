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

// Dashboard route (simplified for testing)
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
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
      </style>
    </head>
    <body>
      <h1>Dashboard</h1>
      <p>Welcome, ${req.user.name}!</p>
      <p>Email: ${req.user.email}</p>
      <a href="/" class="btn">Home</a>
      <a href="/logout" class="btn btn-danger">Logout</a>
    </body>
    </html>
  `);
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