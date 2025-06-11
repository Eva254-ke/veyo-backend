require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin'); // Import firebase-admin

const app = express();
app.use(cors());
app.use(express.json()); // Use express.json() for parsing application/json

// Initialize Firebase Admin SDK
try {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. Please point it to your Firebase service account key JSON file.");
  }
  const serviceAccount = require(serviceAccountPath); // Load service account key
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
    // If you are using Firebase Realtime Database, you might also need:
    // databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com" 
    // If you are using Firestore, it's typically auto-detected.
  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error("Firebase Admin SDK initialization error:", error.message);
  process.exit(1); // Exit if Firebase Admin SDK fails to initialize
}

const db = admin.firestore(); // Initialize Firestore

const PORT = process.env.PORT || 3000;

// Load M-Pesa credentials and settings from .env
const mpesaConsumerKey = process.env.MPESA_CONSUMER_KEY;
const mpesaConsumerSecret = process.env.MPESA_CONSUMER_SECRET;
const mpesaPasskey = process.env.MPESA_PASSKEY;
const mpesaShortCode = process.env.MPESA_SHORTCODE;
const mpesaCallbackUrl = process.env.MPESA_CALLBACK_URL;
const mpesaEnvironment = process.env.MPESA_ENVIRONMENT || 'sandbox'; // Default to sandbox
const mpesaAccountReference = process.env.MPESA_ACCOUNT_REFERENCE || "VeyoRide";
const mpesaTransactionDesc = process.env.MPESA_TRANSACTION_DESC || "Payment for ride service";

// Validate essential M-Pesa configuration
const requiredEnvVars = [
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_PASSKEY',
  'MPESA_SHORTCODE',
  'MPESA_CALLBACK_URL',
  'MPESA_ENVIRONMENT'
];
let missingVars = false;
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`FATAL ERROR: Environment variable ${varName} is not set.`);
    missingVars = true;
  }
});

if (missingVars) {
  console.error("Please set all required M-Pesa environment variables in your .env file and restart the server.");
  process.exit(1); // Exit if critical configuration is missing
}

console.log(`M-Pesa environment: ${mpesaEnvironment.toUpperCase()}`);
console.log(`M-Pesa Callback URL: ${mpesaCallbackUrl}`);
if (mpesaEnvironment === 'sandbox' && mpesaCallbackUrl.includes('localhost')) {
    console.warn("WARNING: M-Pesa callback URL is localhost. For sandbox testing with callbacks, use a tunneling service like ngrok.");
}


const MpesaAPIBaseURL = mpesaEnvironment === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getAccessToken() {
  if (!mpesaConsumerKey || !mpesaConsumerSecret) {
    throw new Error("M-Pesa consumer key or secret is not defined.");
  }
  const auth = Buffer.from(`${mpesaConsumerKey}:${mpesaConsumerSecret}`).toString("base64");
  const tokenUrl = `${MpesaAPIBaseURL}/oauth/v1/generate?grant_type=client_credentials`;
  
  try {
    const res = await axios.get(tokenUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return res.data.access_token;
  } catch (error) {
    console.error("Error fetching M-Pesa access token:", error.response ? error.response.data : error.message);
    throw new Error("Could not fetch M-Pesa access token.");
  }
}

app.post("/api/stkpush", async (req, res) => {
  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ success: false, error: "Phone number and amount are required." });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ success: false, error: "Invalid amount. Amount must be a positive number." });
  }
  // Ensure amount is an integer
  const validatedAmount = Math.round(amount); 

  // Validate phone number format (basic validation)
  const phoneRegex = /^(254\d{9})$/; // Example: 2547XXXXXXXX
  if (!phoneRegex.test(phone)) {
      return res.status(400).json({ success: false, error: "Invalid phone number format. Expected format: 254XXXXXXXXX" });
  }

  const timestamp = new Date().toISOString().replace(/[-T:\.Z]/g, '').substring(0, 14);
  const password = Buffer.from(mpesaShortCode + mpesaPasskey + timestamp).toString('base64');
  const stkPushUrl = `${MpesaAPIBaseURL}/mpesa/stkpush/v1/processrequest`;

  try {
    const token = await getAccessToken();

    const mpesaRes = await axios.post(
      stkPushUrl,
      {
        BusinessShortCode: mpesaShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline", // For Till Number
        Amount: validatedAmount, // Use validated integer amount
        PartyA: phone, // Customer's phone number
        PartyB: mpesaShortCode, // Your Till Number
        PhoneNumber: phone, // Customer's phone number again
        CallBackURL: mpesaCallbackUrl,
        AccountReference: mpesaAccountReference,
        TransactionDesc: mpesaTransactionDesc
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Safaricom API usually returns a CustomerMessage for successful requests
    res.status(200).json({ success: true, message: mpesaRes.data.CustomerMessage || "STK push initiated successfully.", responseData: mpesaRes.data });
  } catch (err) {
    console.error("STK Push Error:", err.response?.data || err.message);
    // Provide a more structured error response
    const errorResponse = {
        success: false,
        message: "Failed to initiate STK push.",
        error: err.response?.data?.errorMessage || err.response?.data || err.message
    };
    if (err.response?.data?.errorCode) {
        errorResponse.errorCode = err.response.data.errorCode;
    }
    res.status(err.response?.status || 500).json(errorResponse);
  }
});

// M-Pesa payment confirmation callback
app.post("/mpesa/callback", async (req, res) => {
  const body = req.body;
  console.log("M-Pesa Callback Received:", JSON.stringify(body, null, 2));

  const stkCallback = body?.Body?.stkCallback;

  if (!stkCallback) {
    console.error("Invalid callback format received.");
    return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback format." });
  }

  const merchantRequestID = stkCallback.MerchantRequestID;
  const checkoutRequestID = stkCallback.CheckoutRequestID;
  const resultCode = stkCallback.ResultCode;
  const resultDesc = stkCallback.ResultDesc;

  console.log(`Callback for MerchantRequestID: ${merchantRequestID}, CheckoutRequestID: ${checkoutRequestID}`);
  console.log(`ResultCode: ${resultCode}, ResultDesc: ${resultDesc}`);

  const transactionData = {
    merchantRequestID,
    checkoutRequestID,
    resultCode,
    resultDesc,
    processedAt: admin.firestore.FieldValue.serverTimestamp() // Use Firestore server timestamp
  };

  if (resultCode === 0) {
    // Payment successful
    const callbackMetadata = stkCallback.CallbackMetadata?.Item;
    let amountPaid, mpesaReceiptNumber, transactionDate, phoneNumber;

    if (callbackMetadata && Array.isArray(callbackMetadata)) {
        amountPaid = callbackMetadata.find(i => i.Name === 'Amount')?.Value;
        mpesaReceiptNumber = callbackMetadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
        // Safaricom's transactionDate is a number like 20230610123456 (YYYYMMDDHHMMSS)
        // You might want to parse or store it as is, or convert to a Date object
        const rawTransactionDate = callbackMetadata.find(i => i.Name === 'TransactionDate')?.Value;
        if (rawTransactionDate) {
            const year = rawTransactionDate.toString().substring(0, 4);
            const month = rawTransactionDate.toString().substring(4, 6);
            const day = rawTransactionDate.toString().substring(6, 8);
            const hour = rawTransactionDate.toString().substring(8, 10);
            const minute = rawTransactionDate.toString().substring(10, 12);
            const second = rawTransactionDate.toString().substring(12, 14);
            transactionDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        }
        phoneNumber = callbackMetadata.find(i => i.Name === 'PhoneNumber')?.Value;
    }
    
    console.log(`Payment successful for ${phoneNumber || 'N/A'}. Amount: ${amountPaid || 'N/A'}, Receipt: ${mpesaReceiptNumber || 'N/A'}, Date: ${transactionDate || 'N/A'}`);
    
    transactionData.status = 'successful';
    transactionData.amount = amountPaid ? Number(amountPaid) : null;
    transactionData.mpesaReceiptNumber = mpesaReceiptNumber || null;
    transactionData.transactionDate = transactionDate ? admin.firestore.Timestamp.fromDate(transactionDate) : null;
    transactionData.phoneNumber = phoneNumber || null;

    // TODO: Implement your business logic here
    // e.g., find the transaction in your database using merchantRequestID or checkoutRequestID
    // update its status, credit the user account, send notifications, etc.
    try {
      // Example: Store successful transaction in a 'transactions' collection in Firestore
      // You might want to use checkoutRequestID as the document ID if it's unique and you query by it
      // Or generate a new ID and store checkoutRequestID as a field.
      const transactionRef = db.collection('mpesa_transactions').doc(checkoutRequestID);
      await transactionRef.set(transactionData, { merge: true }); // Use merge:true to update if doc exists, or create if not
      console.log(`Transaction ${checkoutRequestID} successfully saved to Firestore.`);

      // Further logic: update user balance, send notification, etc.
      // if (phoneNumber) {
      //   // Potentially link transaction to a user based on phone number
      //   // This requires a users collection where you can find a user by phone
      // }

    } catch (dbError) {
      console.error("Error saving transaction to Firestore:", dbError);
      // Decide how to handle this. Maybe retry, or log for manual intervention.
      // For now, we still respond to Safaricom successfully as the callback was received.
    }

  } else {
    // Payment failed or cancelled
    console.log(`Payment failed or cancelled. Reason: ${resultDesc}`);
    transactionData.status = 'failed';
    
    // TODO: Implement your business logic for failed payments
    try {
      const transactionRef = db.collection('mpesa_transactions').doc(checkoutRequestID);
      await transactionRef.set(transactionData, { merge: true });
      console.log(`Failed transaction ${checkoutRequestID} details saved to Firestore.`);
    } catch (dbError) {
      console.error("Error saving failed transaction to Firestore:", dbError);
    }
  }

  // Respond to Safaricom to acknowledge receipt of the callback
  res.status(200).json({ ResultCode: 0, ResultDesc: "Callback received and processed successfully." });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Ensure all necessary .env variables for M-Pesa are set correctly.");
});
