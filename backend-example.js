// Sample Backend Implementation for MIT Payments
// This is an example Node.js/Express server for processing MIT payments

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config(); // Load environment variables from .env

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Load credentials from environment variables
const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY;
const TAP_MERCHANT_ID = process.env.TAP_MERCHANT_ID;
const TAP_API_URL = process.env.TAP_API_URL || 'https://api.tap.company/v2';

// Validate that secret key is set
if (!TAP_SECRET_KEY || TAP_SECRET_KEY === 'sk_test_YOUR_SECRET_KEY_HERE') {
  console.error('❌ ERROR: TAP_SECRET_KEY not set in .env file!');
  console.log('Please create a .env file with your Tap secret key.');
  process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Tap Payments Backend Running' });
});

// Shared helper to call Tap Create Charge API
async function createTapCharge(chargeData) {
  const response = await fetch(`${TAP_API_URL}/charges`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TAP_SECRET_KEY}`,
      'Content-Type': 'application/json',
      'lang_code': 'en'
    },
    body: JSON.stringify(chargeData)
  });

  const data = await response.json();
  return { response, data };
}

async function retrieveTapCharge(chargeId) {
  const response = await fetch(`${TAP_API_URL}/charges/${chargeId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${TAP_SECRET_KEY}`,
      'Content-Type': 'application/json',
      'lang_code': 'en'
    }
  });

  const data = await response.json();
  return { response, data };
}

function mapTapResult(data) {
  return {
    id: data.id,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    card: data.card,
    receipt: data.receipt,
    threeDSUrl: data.transaction?.url || null,
    redirect: data.redirect,
    source: data.source
  };
}

// Create CIT charge (customer initiated, 3DS true, save card true)
app.post('/api/charges/cit', async (req, res) => {
  try {
    const { token, amount, currency, merchantId, customerId, customer, redirectUrl } = req.body;

    if (!token || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields: token, amount, currency' }
      });
    }

    const chargeData = {
      amount,
      currency,
      customer_initiated: true,
      threeDSecure: true,
      save_card: true,
      description: 'CIT charge via Tap SDK token',
      merchant: {
        id: merchantId || TAP_MERCHANT_ID
      },
      source: {
        id: token
      },
      customer: customerId ? { id: customerId } : {
        first_name: customer?.firstName || 'Customer',
        last_name: customer?.lastName || 'User',
        email: customer?.email || 'customer@example.com',
        phone: {
          country_code: customer?.phoneCountryCode || '965',
          number: customer?.phoneNumber || '50000000'
        }
      },
      redirect: {
        url: redirectUrl || req.headers.origin || 'http://localhost:5173'
      }
    };

    const { response, data } = await createTapCharge(chargeData);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: {
          message: data.response?.message || 'CIT charge failed',
          code: data.response?.code,
          details: data
        }
      });
    }

    return res.json({ success: true, data: mapTapResult(data) });
  } catch (error) {
    console.error('CIT payment error:', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// Create MIT charge (merchant initiated, 3DS false, save card false)
app.post('/api/charges/mit', async (req, res) => {
  try {
    const { token, amount, currency, merchantId, customerId, redirectUrl } = req.body;

    if (!token || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields: token, amount, currency' }
      });
    }

    const chargeData = {
      amount,
      currency,
      customer_initiated: false,
      threeDSecure: false,
      save_card: false,
      description: 'MIT charge via saved token',
      merchant: {
        id: merchantId || TAP_MERCHANT_ID
      },
      source: {
        id: token
      },
      redirect: {
        url: redirectUrl || req.headers.origin || 'http://localhost:5173'
      }
    };

    if (customerId) {
      chargeData.customer = { id: customerId };
    }

    const { response, data } = await createTapCharge(chargeData);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: {
          message: data.response?.message || 'MIT charge failed',
          code: data.response?.code,
          details: data
        }
      });
    }

    return res.json({ success: true, data: mapTapResult(data) });
  } catch (error) {
    console.error('MIT payment error:', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// Legacy MIT endpoint kept for compatibility
app.post('/api/charge-saved-card', async (req, res) => {
  req.url = '/api/charges/mit';
  return app._router.handle(req, res, () => undefined);
});

// Webhook endpoint to receive payment status updates
app.post('/api/webhook/tap', async (req, res) => {
  try {
    const event = req.body;

    console.log('Received webhook:', event);

    // TODO: Verify webhook signature
    // TODO: Process webhook event based on type

    switch (event.object) {
      case 'charge':
        // Handle charge events
        console.log('Charge event:', event.id, event.status);
        break;

      case 'refund':
        // Handle refund events
        console.log('Refund event:', event.id);
        break;

      default:
        console.log('Unknown event type:', event.object);
    }

    // Acknowledge receipt
    res.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve charge details
app.get('/api/charges/:chargeId', async (req, res) => {
  try {
    const { chargeId } = req.params;

    if (!chargeId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required path param: chargeId' }
      });
    }

    const { response, data } = await retrieveTapCharge(chargeId);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: {
          message: data.response?.message || 'Retrieve charge failed',
          code: data.response?.code,
          details: data
        }
      });
    }

    return res.json({ success: true, data: mapTapResult(data) });
  } catch (error) {
    console.error('Retrieve charge error:', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// Start server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Tap Payments Backend Server Running!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🔧 Health Check: http://localhost:${PORT}/health`);
  console.log(`💳 CIT Endpoint: http://localhost:${PORT}/api/charges/cit`);
  console.log(`💳 MIT Endpoint: http://localhost:${PORT}/api/charges/mit`);
  console.log(`💳 Legacy MIT Endpoint: http://localhost:${PORT}/api/charge-saved-card`);
  console.log(`🔎 Retrieve Charge Endpoint: http://localhost:${PORT}/api/charges/:chargeId`);
  console.log('');
  console.log('⚠️  Make sure to set TAP_SECRET_KEY environment variable');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
});


