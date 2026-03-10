// Example Frontend Implementation for MIT Payment Agreement Flow

// ============================================================================
// STEP 1: Customer Initiates Payment & Saves Card (CIT)
// ============================================================================

async function processCITPayment(cardToken, amount, currency = 'USD') {
  try {
    console.log('🔵 Processing CIT (Customer-Initiated) charge...');

    const citResponse = await fetch('http://localhost:4000/api/charges/cit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: cardToken,
        amount: amount,
        currency: currency,
        customer_initiated: true,  // Customer is present
        save_card: true,           // Save for future MIT charges
        threeDSecure: true         // Enable 3DS for security
      })
    });

    const result = await citResponse.json();

    if (!result.success) {
      console.error('❌ CIT charge failed:', result.error);
      return { success: false, error: result.error };
    }

    console.log('✅ CIT charge succeeded!');
    console.log('📋 Payment Agreement ID:', result.data.payment_agreement.id);
    console.log('📋 Card ID:', result.data.payment_agreement.contract.id);

    // 🚨 CRITICAL: SAVE THIS DATA FOR FUTURE MIT CHARGES
    const paymentAgreement = {
      agreementId: result.data.payment_agreement.id,
      cardId: result.data.payment_agreement.contract.id,
      savedAt: new Date().toISOString(),
      chargeId: result.data.id,
      cardLast4: result.data.card?.last4 || 'unknown'
    };

    // Store in your database associated with the customer
    await savePaymentAgreementForCustomer(paymentAgreement);

    return {
      success: true,
      data: result.data,
      paymentAgreement: paymentAgreement
    };

  } catch (error) {
    console.error('💥 CIT payment error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 2: Retrieve Stored Payment Agreements for Customer
// ============================================================================

async function getCustomerPaymentAgreements(customerId) {
  try {
    // Query your database for stored agreements
    const agreements = await database.query(`
      SELECT * FROM payment_agreements 
      WHERE customer_id = ? 
      ORDER BY saved_at DESC
    `, [customerId]);

    console.log(`📋 Found ${agreements.length} saved payment methods for customer ${customerId}`);
    return agreements;

  } catch (error) {
    console.error('❌ Error retrieving agreements:', error);
    return [];
  }
}

// ============================================================================
// STEP 3: Merchant Charges Using Saved Agreement (MIT)
// ============================================================================

async function processMITPayment(savedAgreement, amount, currency = 'USD') {
  try {
    console.log('🟠 Processing MIT (Merchant-Initiated) charge...');

    // Validate we have the required agreement
    if (!savedAgreement.agreementId) {
      throw new Error('Payment agreement ID is missing. Customer must perform CIT charge first.');
    }

    const mitResponse = await fetch('http://localhost:4000/api/charges/mit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: savedAgreement.cardId,           // Saved card source ID
        amount: amount,
        currency: currency,
        paymentAgreementId: savedAgreement.agreementId,  // ✅ CRITICAL
        customer_initiated: false,              // Merchant is charging
        threeDSecure: false,                    // No 3DS for MIT
        save_card: false                        // Already saved from CIT
      })
    });

    const result = await mitResponse.json();

    if (!result.success) {
      console.error('❌ MIT charge failed:', result.error);

      // Special handling for error 1216 (missing agreement ID)
      if (result.error?.errors?.some(e => e.code === '1216')) {
        console.error('⚠️  Error 1216: Payment Agreement ID is missing');
        console.error('💡 Solution: Save agreement ID from initial CIT charge');
      }

      return { success: false, error: result.error };
    }

    console.log('✅ MIT charge succeeded!');
    console.log('📋 Charge ID:', result.data.id);

    return {
      success: true,
      data: result.data
    };

  } catch (error) {
    console.error('💥 MIT payment error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 4: Complete CIT → MIT Flow (Full Example)
// ============================================================================

async function completePaymentFlow(customerId, cardToken, firstAmount, secondAmount) {
  console.log('\n========== PAYMENT FLOW START ==========\n');

  // PHASE 1: Customer saves card (CIT)
  console.log('PHASE 1️⃣  Customer saves card...');
  const citResult = await processCITPayment(cardToken, firstAmount);

  if (!citResult.success) {
    console.error('❌ CIT failed, cannot continue to MIT');
    return citResult;
  }

  const savedAgreement = citResult.paymentAgreement;
  console.log(`✅ Card saved with agreement ID: ${savedAgreement.agreementId}\n`);

  // PHASE 2: Merchant charges saved card (MIT)
  console.log('PHASE 2️⃣  Merchant charges saved card...');
  const mitResult = await processMITPayment(savedAgreement, secondAmount);

  if (!mitResult.success) {
    console.error('❌ MIT failed');
    return mitResult;
  }

  console.log(`✅ MIT charge successful\n`);
  console.log('\n========== PAYMENT FLOW COMPLETE ==========\n');

  return {
    success: true,
    citCharge: citResult.data,
    mitCharge: mitResult.data,
    savedAgreement: savedAgreement
  };
}

// ============================================================================
// STEP 5: Recurring/Subscription Charges (Multiple MIT)
// ============================================================================

async function processSubscriptionPayment(customerId, amount, currency = 'USD') {
  try {
    console.log(`💳 Processing subscription charge for customer ${customerId}...`);

    // Get customer's saved agreements
    const agreements = await getCustomerPaymentAgreements(customerId);

    if (agreements.length === 0) {
      throw new Error('No saved payment methods found. Customer must perform CIT charge first.');
    }

    // Use the most recent agreement (or let customer choose)
    const primaryAgreement = agreements[0];

    // Process MIT charge
    const result = await processMITPayment(primaryAgreement, amount, currency);

    if (result.success) {
      console.log(`✅ Subscription charge successful for ${customerId}`);
      // Update subscription records, send confirmation email, etc.
    }

    return result;

  } catch (error) {
    console.error('❌ Subscription charge error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DATABASE HELPERS (Example using generic structure)
// ============================================================================

async function savePaymentAgreementForCustomer(agreement) {
  // Store agreement in your database
  // Example SQL:
  // INSERT INTO payment_agreements (
  //   agreement_id, card_id, customer_id, saved_at, card_last4
  // ) VALUES (?, ?, ?, ?, ?)

  console.log('💾 Saving agreement to database:', agreement.agreementId);
  // Implementation depends on your database choice
}

async function deletePaymentAgreement(agreementId) {
  // Remove agreement from your database
  console.log('🗑️  Deleting agreement:', agreementId);
  // Implementation depends on your database choice
}

// ============================================================================
// ERROR HANDLING & DEBUGGING
// ============================================================================

function handlePaymentError(error) {
  const errorCode = error.error?.errors?.[0]?.code;

  const errorMap = {
    '1216': {
      message: 'Payment Agreement ID is missing',
      solution: 'Ensure paymentAgreementId is provided in MIT request',
      cause: 'Forgot to save agreement ID from CIT charge'
    },
    '1217': {
      message: 'Invalid Payment Agreement',
      solution: 'Verify agreement ID is correct and not expired',
      cause: 'Agreement ID may have expired or been deleted'
    },
    '1218': {
      message: 'Payment Agreement limit exceeded',
      solution: 'Check maximum payment limits for this agreement',
      cause: 'Amount exceeds agreement limits'
    }
  };

  const errorInfo = errorMap[errorCode] || {
    message: 'Unknown payment error',
    solution: 'Check API documentation',
    cause: 'Unable to determine cause'
  };

  console.error(`
❌ Error Code: ${errorCode}
📝 Message: ${errorInfo.message}
💡 Solution: ${errorInfo.solution}
🔍 Cause: ${errorInfo.cause}
  `);

  return errorInfo;
}

// ============================================================================
// EXPORT FOR USE
// ============================================================================

export {
  processCITPayment,
  processMITPayment,
  completePaymentFlow,
  processSubscriptionPayment,
  getCustomerPaymentAgreements,
  savePaymentAgreementForCustomer,
  deletePaymentAgreement,
  handlePaymentError
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*

// Example 1: Simple CIT → MIT flow
const cardToken = 'tok_abc123...';
const result = await completePaymentFlow('cust_123', cardToken, 1.00, 100.00);

// Example 2: Process subscription with saved card
await processSubscriptionPayment('cust_123', 49.99, 'USD');

// Example 3: Manual MIT with stored agreement
const agreements = await getCustomerPaymentAgreements('cust_123');
await processMITPayment(agreements[0], 100.00, 'USD');

*/

