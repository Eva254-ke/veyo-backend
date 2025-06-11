// utils/mpesaClient.js
const axios = require('axios');
const moment = require('moment');

async function getAccessToken({ consumerKey, consumerSecret }) {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const { data } = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` }
  });
  return data.access_token;
}

async function sendStkPush(config, phoneNumber, amount, accountReference = 'VEYO_TXN') { // Added accountReference parameter with a default
  const accessToken = await getAccessToken(config);

  const timestamp = moment().format('YYYYMMDDHHmmss');
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerBuyGoodsOnline', // MODIFIED: Correct for Till Number
    Amount: Math.round(amount), // MODIFIED: Ensure amount is an integer
    PartyA: phoneNumber,
    PartyB: config.shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: config.callbackUrl,
    AccountReference: accountReference, // MODIFIED: Use dynamic account reference
    TransactionDesc: 'Veyo Payment' // MODIFIED: More specific description
  };

  const response = await axios.post('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return response.data;
}

module.exports = { sendStkPush };
