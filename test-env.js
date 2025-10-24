// test-env.js
require('dotenv').config();

console.log('Environment variables check:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback');
console.log('PORT:', process.env.PORT || 3000);

// Check if credentials are valid (not empty)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('✅ Environment variables look good!');
} else {
  console.log('❌ Please check your .env file');
}