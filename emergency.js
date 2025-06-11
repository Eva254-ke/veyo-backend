require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Twilio config (for SMS)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Emergency contacts (could be dynamic/user-specific in production)
const EMERGENCY_CONTACTS = process.env.EMERGENCY_CONTACTS ? process.env.EMERGENCY_CONTACTS.split(',') : [];
const DISPATCH_NUMBER = process.env.DISPATCH_NUMBER;

// M-Pesa config (reuse your existing Daraja logic)
// ...existing mpesa-backend code...

// Emergency alert endpoint
app.post('/api/emergency-alert', async (req, res) => {
  const { userPhone, userName, location } = req.body;
  const message = `EMERGENCY ALERT: ${userName || 'A user'} needs help! Location: ${location || 'Unknown'}. Please respond ASAP.`;
  const recipients = [...EMERGENCY_CONTACTS, DISPATCH_NUMBER].filter(Boolean);
  try {
    const results = await Promise.all(
      recipients.map(number =>
        twilioClient.messages.create({
          body: message,
          from: TWILIO_PHONE_NUMBER,
          to: number.trim(),
        })
      )
    );
    res.json({ success: true, sent: results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Donation endpoint (M-Pesa STK push)
app.post('/api/donate', async (req, res) => {
  const { phone, amount } = req.body;
  // Reuse your existing STK push logic
  // ...call Daraja API as in /api/stkpush...
  // For demo, just return success
  res.json({ success: true });
});

// ...existing mpesa-backend endpoints...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
