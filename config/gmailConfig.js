// config/gmailConfig.js
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

class GmailConfig {
  constructor() {
    this.oAuth2Client = null;
    this.isInitialized = false;
  }

  initializeOAuth2(clientId, clientSecret, redirectUri) {
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
    }

    this.oAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    this.isInitialized = true;
    console.log('✅ OAuth2 client initialized successfully');
    return this.oAuth2Client;
  }

  getGmailClient() {
    if (!this.isInitialized) {
      throw new Error('OAuth2 client not initialized. Call initializeOAuth2() first.');
    }
    return google.gmail({ version: 'v1', auth: this.oAuth2Client });
  }

  generateAuthUrl() {
    this.ensureInitialized();
    return this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async getTokens(code) {
    this.ensureInitialized();
    const { tokens } = await this.oAuth2Client.getToken(code);
    this.oAuth2Client.setCredentials(tokens);
    console.log('✅ Tokens received successfully');
    return tokens;
  }

  setCredentials(tokens) {
    this.ensureInitialized();
    this.oAuth2Client.setCredentials(tokens);
  }

  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('OAuth2 client not initialized. Call initializeOAuth2() first.');
    }
  }
}

module.exports = new GmailConfig();
