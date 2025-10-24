const { google } = require('googleapis');

async function testGmailAccess(accessToken) {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth });
    
    // Test profile access
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log('✅ Connected as:', profile.data.emailAddress);
    
    // Test listing emails
    const emails = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5
    });
    
    console.log('✅ Email access working. Found messages:', emails.data.messages?.length || 0);
    return true;
  } catch (error) {
    console.error('❌ Gmail access test failed:', error.message);
    return false;
  }
}

module.exports = testGmailAccess;
