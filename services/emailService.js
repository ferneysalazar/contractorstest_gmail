// services/emailService.js
const gmailConfig = require('../config/gmailConfig');

class EmailService {
  constructor() {
    this.gmail = null;
  }

  // Initialize gmail client for a specific user
  initializeForUser(tokens) {
    gmailConfig.setCredentials(tokens);
    this.gmail = gmailConfig.getGmailClient();
  }

  // Get emails from another user's inbox (delegated access)
  async getDelegatedEmails(targetEmail, maxResults = 10, pageToken = null) {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized. Call initializeForUser() first.');
    }

    try {
      const params = {
        userId: targetEmail, // Use target email instead of 'me'
        maxResults: maxResults
      };

      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await this.gmail.users.messages.list(params);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch emails from ${targetEmail}: ${error.message}`);
    }
  }

  // Send email on behalf of another user
  async sendEmailAsDelegate(emailData) {
    const gmail = this.ensureGmailClient();
    const { to, subject, body, from } = emailData;
    
    const message = [
      `From: ${from}`, // This should be the delegated email
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      body
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      // Extract the email from the "From" field to use as userId
      const fromEmail = from.match(/<(.+)>/)?.[1] || from;
      
      const response = await gmail.users.messages.send({
        userId: fromEmail, // Send as the delegated user
        requestBody: {
          raw: encodedMessage
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to send email as delegate: ${error.message}`);
    }
  }

  // Get specific email from delegated account
  async getDelegatedEmail(targetEmail, messageId) {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized.');
    }

    try {
      const response = await this.gmail.users.messages.get({
        userId: targetEmail, // Use target email
        id: messageId,
        format: 'full'
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch email from ${targetEmail}: ${error.message}`);
    }
  }

  // Get threads from delegated account
  async getDelegatedThreads(targetEmail, maxResults = 10) {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized.');
    }

    try {
      const response = await this.gmail.users.threads.list({
        userId: targetEmail, // Use target email
        maxResults: maxResults
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch threads from ${targetEmail}: ${error.message}`);
    }
  }

  ensureGmailClient() {
    if (!this.gmail) {
      this.gmail = gmailConfig.getGmailClient();
    }
    return this.gmail;
  }

  async verifyDelegationAccess(authenticatedUser, targetEmail) {
    // Implement logic to verify the authenticated user
    // has delegation rights for the target email
    // This might involve checking your database or Gmail API
  }

  async checkDelegationStatus(authenticatedUser, targetEmail) {
    // Check if delegation is properly set up
  }

  isTokenExpired(tokens) {
    // Check if access token needs refresh
  }
}

module.exports = new EmailService();
