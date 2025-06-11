// config/mpesaSettings.js
// This file holds the M-Pesa API credentials for different projects.

// Load environment variables from .env file
require('dotenv').config(); // Add this line at the top

module.exports = {
  veyoApp: {
    consumerKey: process.env.MPESA_CONSUMER_KEY, // Loaded from .env
    consumerSecret: process.env.MPESA_CONSUMER_SECRET, // Loaded from .env
    passkey: process.env.MPESA_PASSKEY, // Loaded from .env
    shortcode: '4953118', // Your Till Number - you can also move this to .env if you prefer e.g., process.env.MPESA_SHORTCODE
    callbackUrl: process.env.MPESA_CALLBACK_URL || 'https://yourdomain.com/api/mpesa-callback/veyoApp', // Load from .env or use a default
    // For sandbox testing, you might use a different set of credentials and URLs
    // Example for sandbox (ensure mpesaClient.js also uses sandbox URLs if you use this):
    // consumerKey_sandbox: process.env.MPESA_SANDBOX_CONSUMER_KEY,
    // consumerSecret_sandbox: process.env.MPESA_SANDBOX_CONSUMER_SECRET,
    // passkey_sandbox: process.env.MPESA_SANDBOX_PASSKEY,
    // shortcode_sandbox: '174379', // Safaricom's sandbox shortcode for testing
    // callbackUrl_sandbox: process.env.MPESA_SANDBOX_CALLBACK_URL || 'https://your-ngrok-or-test-domain.com/api/mpesa-callback/veyoAppSandbox',
  },
  // You can add configurations for other projects if needed:
  // anotherProject: {
  //   consumerKey: '...',
  //   consumerSecret: '...',
  //   passkey: '...',
  //   shortcode: '...', // Another Till or Paybill
  //   callbackUrl: '...',
  // }
};
