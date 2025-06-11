// routes/stkPush.js
const express = require('express');
const router = express.Router();
const settings = require('../config/mpesaSettings');
const { sendStkPush } = require('../utils/mpesaClient');

router.post('/stk-push/:projectId', async (req, res) => {
  const { phoneNumber, amount } = req.body;
  const { projectId } = req.params;

  const config = settings[projectId];
  if (!config) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const result = await sendStkPush(config, phoneNumber, amount);
    res.json(result);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'STK Push failed' });
  }
});

module.exports = router;
