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

// Load credentials - hardcoded for development
const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY || 'sk_test_XKokBfNWv6FIYuTMg5sLPjhJ';
const TAP_MERCHANT_ID = process.env.TAP_MERCHANT_ID || '1124340';
const TAP_API_URL = process.env.TAP_API_URL || 'https://api.tap.company/v2';


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
    customer: data.customer,
    receipt: data.receipt,
    threeDSUrl: data.transaction?.url || null,
    redirect: data.redirect,
    source: data.source,
    payment_agreement: data.payment_agreement
  };
}

// Create a customer in Tap and return their ID
async function createTapCustomer(customer) {
  const response = await fetch(`${TAP_API_URL}/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TAP_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      first_name: customer?.firstName || 'Customer',
      last_name: customer?.lastName || 'User',
      email: customer?.email || 'customer@example.com',
      phone: {
        country_code: customer?.phoneCountryCode || '965',
        number: customer?.phoneNumber || '50000000'
      }
    })
  });
  const data = await response.json();
  console.log('👤 Created customer:', data.id);
  return data.id;
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

    // Auto-create customer in Tap if not provided
    let tapCustomerId = customerId;
    if (!tapCustomerId && customer) {
      tapCustomerId = await createTapCustomer(customer);
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
      // Payment agreement - Tap will auto-generate the agreement ID
      payment_agreement: {
        contract: {
          type: 'UNSCHEDULED'  // For saved cards without fixed schedule
        }
      },
      customer: tapCustomerId ? { id: tapCustomerId } : {
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

// Create or retrieve a saved card token for MIT charges
// This endpoint converts a tokenized card into a reusable saved card source
app.post('/api/tokens/create-from-card', async (req, res) => {
  try {
    const { token, customerId } = req.body;

    if (!token || !customerId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields: token, customerId' }
      });
    }

    // Create a token from the card for the customer
    const tokenData = {
      type: 'CARD',
      token: token,
      customer: {
        id: customerId
      }
    };

    console.log('🔷 Creating saved card token:', JSON.stringify(tokenData, null, 2));

    const response = await fetch(`${TAP_API_URL}/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TAP_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tokenData)
    });

    const data = await response.json();

    console.log('🔷 Token creation response:', response.status, JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: { message: data.response?.message || 'Token creation failed', details: data }
      });
    }

    return res.json({ success: true, data: { tokenId: data.id, token: data } });
  } catch (error) {
    console.error('Token creation error:', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// Create MIT charge (merchant initiated, 3DS false, save card false)
app.post('/api/charges/mit', async (req, res) => {
  try {
    const { token, amount, currency, merchantId, customerId, redirectUrl, paymentAgreementId } = req.body;

    console.log('📝 MIT Request Body:', { token, amount, currency, merchantId, customerId, paymentAgreementId });

    if (!token || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields: token, amount, currency' }
      });
    }

    if (!paymentAgreementId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Payment Agreement ID is required for MIT charges' }
      });
    }


    // Step 1: Create a fresh token from the saved card_id + customer_id
    // (card IDs cannot be used directly in charge requests per Tap docs)
    console.log('🔑 Creating token from saved card:', token, 'for customer:', customerId);

    if (!customerId) {
      console.warn('⚠️  No customerId provided. Tap will assign one during CIT - make sure to save it.');
    }

    const tokenResponse = await fetch(`${TAP_API_URL}/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TAP_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        saved_card: {
          card_id: token,
          customer_id: customerId
        }
      })
    });

    const tokenData = await tokenResponse.json();
    console.log('🔑 Token Response:', JSON.stringify(tokenData, null, 2));

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json({
        success: false,
        error: { message: tokenData.response?.message || 'Failed to create token from saved card', details: tokenData }
      });
    }

    const freshTokenId = tokenData.id;
    console.log('✅ Fresh token created:', freshTokenId);

    // Step 2: Use the fresh token to create the MIT charge
    const chargeData = {
      amount,
      currency,
      customer_initiated: false,
      threeDSecure: false,
      save_card: false,
      description: 'MIT charge via saved card',
      merchant: { id: merchantId || TAP_MERCHANT_ID },
      source: { id: freshTokenId },
      payment_agreement: { id: paymentAgreementId },
      customer: customerId ? { id: customerId } : {
        first_name: 'Customer',
        last_name: 'User',
        email: 'customer@example.com',
        phone: { country_code: '965', number: '50000000' }
      },
      redirect: { url: redirectUrl || req.headers.origin || 'http://localhost:3000' }
    };

    console.log('🔵 MIT Charge Request:', JSON.stringify(chargeData, null, 2));

    const { response, data } = await createTapCharge(chargeData);

    console.log('🔵 MIT Charge Response Status:', response.status);
    console.log('🔵 MIT Charge Response Data:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('❌ MIT Charge Failed:', {
        status: response.status,
        message: data.response?.message || data.message,
        code: data.response?.code || data.code,
        errors: data.errors,
        fullResponse: data
      });

      return res.status(response.status).json({
        success: false,
        error: {
          message: data.response?.message || data.message || 'MIT charge failed',
          code: data.response?.code || data.code,
          errors: data.errors,
          details: data
        }
      });
    }

    console.log('✅ MIT Charge Success:', data.id);
    return res.json({ success: true, data: mapTapResult(data) });
  } catch (error) {
    console.error('💥 MIT payment exception:', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message, stack: error.stack }
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
const PORT = process.env.PORT || 3000;

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


