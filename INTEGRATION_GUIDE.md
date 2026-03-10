# Integration Guide for Donny

Hi Donny! 👋

This guide will help you complete the Tap Payments integration. The website structure is ready - you just need to connect the backend for MIT payments.

## ✅ What's Already Done

1. ✅ **Tap Card SDK v2** is integrated and working
2. ✅ **CIT Flow** is fully implemented with 3DS
3. ✅ **Card tokenization** happens automatically
4. ✅ **UI/UX** for the entire flow is complete
5. ✅ **Saved cards** display and management
6. ✅ **Transaction history** tracking

## 🔧 What You Need to Do

### 1. Backend Setup for MIT Payments

Currently, the MIT payment (Step 3) simulates the payment. You need to:

**Create a backend endpoint** that accepts:
- Saved card token
- Amount
- Currency

**Call Tap's Charges API** with the saved token.

### Example Backend Implementation

#### Node.js/Express Example

```javascript
// backend/server.js
const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const TAP_SECRET_KEY = 'sk_test_...'; // Your Tap secret key

app.post('/api/charge-saved-card', async (req, res) => {
  try {
    const { token, amount, currency } = req.body;
    
    // Call Tap Charges API
    const response = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TAP_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount,
        currency: currency,
        source: { 
          id: token // Use the saved card token
        },
        threeDSecure: false, // No 3DS for MIT
        save_card: false,
        merchant: {
          id: 'your_merchant_id'
        },
        customer: {
          // Customer details if needed
        },
        redirect: {
          url: 'http://localhost:5173' // Your app URL
        }
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'CAPTURED' || data.status === 'AUTHORIZED') {
      res.json({ success: true, data });
    } else {
      res.status(400).json({ success: false, error: data });
    }
  } catch (error) {
    console.error('MIT payment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Backend running on http://localhost:3000');
});
```

### 2. Update Frontend MIT Handler

In `src/main.js`, update the `handleMITPayment()` function:

```javascript
// Replace the setTimeout simulation with actual API call
async function handleMITPayment() {
  const cardSelect = document.getElementById('selected-card');
  const amount = document.getElementById('mit-amount').value;
  const currency = document.getElementById('mit-currency').value;
  const statusEl = document.getElementById('mit-status');
  
  // ... validation code stays the same ...
  
  const selectedCard = state.savedCards.find(card => card.id === cardSelect.value);
  
  showStatus(statusEl, '⏳ Processing payment without 3DS...', 'info');
  
  try {
    // Call your backend
    const response = await fetch('/api/charge-saved-card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: selectedCard.token,
        amount: parseFloat(amount),
        currency: currency
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Create transaction record
      const transaction = {
        id: result.data.id || generateTransactionId(),
        type: 'MIT',
        amount: parseFloat(amount),
        currency: currency,
        status: 'success',
        cardLast4: selectedCard.last4,
        tokenId: selectedCard.token,
        timestamp: new Date().toISOString(),
        with3DS: false,
      };
      
      state.transactions.unshift(transaction);
      saveSavedData();
      
      renderTransactionHistory();
      showStatus(statusEl, '✅ Payment successful! (No 3DS required)', 'success');
    } else {
      throw new Error(result.error.message || 'Payment failed');
    }
  } catch (error) {
    console.error('MIT payment error:', error);
    showStatus(statusEl, `❌ Payment failed: ${error.message}`, 'error');
  }
}
```

## 🧪 Testing the Flow

### Step 1: Get Your Credentials
1. Login to [Tap Dashboard](https://dashboard.tap.company/)
2. Get your **Public Key** (starts with `pk_test_` or `pk_live_`)
3. Get your **Merchant ID**

### Step 2: Test CIT Payment
1. Run `npm run dev`
2. Open http://localhost:5173
3. Enter your credentials and click "Initialize SDK"
4. Use test card: **4111 1111 1111 1111**
5. Enter any CVV and future expiry
6. Click "Pay & Save Card"
7. Complete 3DS if prompted

### Step 3: Test MIT Payment
1. After CIT succeeds, you'll see the saved card
2. Select the saved card in Step 3
3. Enter amount and click "Pay with Saved Card"
4. ✅ Should process without 3DS

## 📁 Files You May Need to Modify

1. **`src/main.js`** (Line ~180-220) - MIT payment handler
   - Replace the `setTimeout` simulation
   - Add actual backend API call

2. **Backend service** (create new)
   - Set up Express/Flask/Django server
   - Create `/api/charge-saved-card` endpoint
   - Call Tap Charges API

## 🔗 Tap API Endpoints

### Charges API (for MIT)
```
POST https://api.tap.company/v2/charges
```

**Headers:**
```
Authorization: Bearer sk_test_...
Content-Type: application/json
```

**Body:**
```json
{
  "amount": 5.00,
  "currency": "KWD",
  "source": {
    "id": "tok_saved_card_token"
  },
  "threeDSecure": false,
  "save_card": false,
  "redirect": {
    "url": "https://your-app.com/success"
  }
}
```

## 📞 Questions?

If you need clarification on:
- Where to add your backend URL
- How to handle specific error cases
- Webhook integration
- Production deployment

Just let me know! The structure is flexible and ready for your Tap integration.

## Quick Reference

### Important Variables
- `state.savedCards` - Array of saved cards with tokens
- `state.config.publicKey` - Tap public key
- `selectedCard.token` - The card token to use for MIT

### Key Functions
- `initializeTapSDK()` - Initializes the Card SDK
- `handleCITPayment()` - Tokenizes card for CIT
- `handleMITPayment()` - Processes MIT (needs backend)
- `handleTokenizationSuccess()` - Saves card after tokenization

---

Good luck with the integration! 🚀

