// Tap Payments Integration - Card SDK v2
// This handles the payment flow: CIT (with 3DS) -> Save Card -> MIT (without 3DS)

import { TAP_CONFIG } from './config.js';

// State management
const state = {
  savedCards: [],
  transactions: [],
  tapCardInstance: null,
  isSDKReady: false,
};

// SDK Methods
let tapCardMethods = null;


// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  console.log('🚀 Initializing Tap Payments Integration...');

  // Load saved data from localStorage
  loadSavedData();

  // Pre-fill configuration fields
  document.getElementById('public-key').value = TAP_CONFIG.publicKey;
  document.getElementById('merchant-id').value = TAP_CONFIG.merchantId;
  document.getElementById('customer-id').value = TAP_CONFIG.customerId || '';

  // Initialize event listeners
  setupEventListeners();

  // Render initial UI
  renderSavedCards();
  renderTransactionHistory();

  // Check if returning from 3DS redirect
  checkFor3DSReturn();

  // Auto-initialize Tap SDK with config
  setTimeout(() => {
    initializeTapSDK();
  }, 100);
}

function setupEventListeners() {
  // Config toggle
  document.getElementById('config-toggle').addEventListener('click', toggleConfigSection);

  // Update config button
  document.getElementById('update-config-btn').addEventListener('click', handleConfigUpdate);

  // Clear data button
  document.getElementById('clear-data-btn').addEventListener('click', () => {
    window.TapPaymentsApp.clearData();
  });

  // Reset saved cards button
  document.getElementById('reset-cards-btn').addEventListener('click', () => {
    window.TapPaymentsApp.resetSavedCards();
  });

  // Reset transactions button
  document.getElementById('reset-transactions-btn').addEventListener('click', () => {
    window.TapPaymentsApp.resetTransactions();
  });

  // CIT Payment button
  document.getElementById('pay-and-save-btn').addEventListener('click', handleCITPayment);

  // MIT Payment button
  document.getElementById('pay-with-saved-card-btn').addEventListener('click', handleMITPayment);

  // Currency change listener to update SDK configuration
  document.getElementById('cit-currency').addEventListener('change', handleCurrencyChange);
}

// Toggle configuration section
function toggleConfigSection() {
  const content = document.getElementById('config-content');
  const icon = document.querySelector('.toggle-icon');

  content.classList.toggle('collapsed');
  icon.classList.toggle('open');
}

async function checkFor3DSReturn() {
  const params = new URLSearchParams(window.location.search);
  const chargeId = params.get('tap_id') || params.get('charge_id');

  if (!chargeId) return;

  const statusEl = document.getElementById('cit-status');
  showStatus(statusEl, '⏳ Verifying charge status from 3DS...', 'info');

  try {
    // Get charge status from backend
    const response = await fetch(`http://localhost:4000/api/charges/${chargeId}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error('Failed to retrieve charge status');
    }

    const chargeStatus = result.data?.status;
    const pendingData = JSON.parse(localStorage.getItem('tap_pending_cit') || '{}');

    // Update transaction
    const txIndex = state.transactions.findIndex(tx => tx.id === chargeId);
    if (txIndex >= 0) {
      state.transactions[txIndex].status = chargeStatus?.toLowerCase() || 'captured';
    }

    // If charge was successful and card was pending, save it
    if (['CAPTURED', 'AUTHORIZED'].includes(chargeStatus) && pendingData.cardData) {
      state.savedCards.push(pendingData.cardData);
      showStatus(statusEl, '✅ 3DS completed! Card saved.', 'success');
    } else if (chargeStatus === 'FAILED') {
      showStatus(statusEl, '❌ 3DS failed. Card not saved.', 'error');
    }

    saveSavedData();
    renderSavedCards();
    renderTransactionHistory();
    enableMITSection();
    localStorage.removeItem('tap_pending_cit');

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);

  } catch (error) {
    console.error('3DS return error:', error);
    showStatus(statusEl, `❌ Failed to verify 3DS status: ${error.message}`, 'error');
  }
}

// Toggle configuration section

// Handle configuration update
function handleConfigUpdate() {
  const publicKey = document.getElementById('public-key').value.trim();
  const merchantId = document.getElementById('merchant-id').value.trim();
  const customerId = document.getElementById('customer-id').value.trim();
  const statusEl = document.getElementById('config-status');

  if (!publicKey) {
    showStatus(statusEl, '❌ Please enter a valid public key', 'error');
    return;
  }

  if (!merchantId) {
    showStatus(statusEl, '❌ Please enter a valid merchant ID', 'error');
    return;
  }

  showStatus(statusEl, '⏳ Reinitializing Tap Card SDK...', 'info');

  try {
    // Unmount existing SDK if present
    if (state.tapCardInstance?.unmount) {
      state.tapCardInstance.unmount();
    }

    // Update config
    TAP_CONFIG.publicKey = publicKey;
    TAP_CONFIG.merchantId = merchantId;
    TAP_CONFIG.customerId = customerId;

    // Reinitialize SDK
    state.isSDKReady = false;
    initializeTapSDK();

    showStatus(statusEl, '✅ Configuration updated successfully!', 'success');

    // Close config section after 2 seconds
    setTimeout(() => {
      toggleConfigSection();
    }, 2000);
  } catch (error) {
    showStatus(statusEl, `❌ Update failed: ${error.message}`, 'error');
    console.error('Config update error:', error);
  }
}


// Initialize Tap Card SDK v2
function initializeTapSDK() {
  if (typeof window.CardSDK === 'undefined') {
    console.error('❌ Tap Card SDK not loaded. Please check your internet connection.');
    return;
  }

  // Validate config
  if (!TAP_CONFIG.publicKey || TAP_CONFIG.publicKey === 'pk_test_YOUR_PUBLIC_KEY_HERE') {
    console.warn('⚠️ Please update your Tap credentials in src/config.js');
    const container = document.getElementById('card-sdk-container');
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #e53e3e;">
        <p style="margin: 0; font-size: 1rem;">
          ⚠️ <strong>Configuration Required</strong>
        </p>
        <p style="margin: 0.5rem 0 0; font-size: 0.875rem;">
          Please update your Tap credentials in the configuration section above ☝️
        </p>
      </div>
    `;
    return;
  }

  if (!TAP_CONFIG.merchantId || TAP_CONFIG.merchantId === 'YOUR_MERCHANT_ID_HERE') {
    console.warn('⚠️ Please update your Merchant ID in src/config.js');
    return;
  }

  const { renderTapCard, Theme, Currencies, Direction, Edges, Locale, tokenize, updateCardConfiguration } = window.CardSDK;

  // Get currency from dropdown
  const currency = document.getElementById('cit-currency').value;
  const amount = parseFloat(document.getElementById('cit-amount').value) || TAP_CONFIG.defaultAmount;

  // Prepare customer object
  const customerConfig = TAP_CONFIG.customerId ? {
    id: TAP_CONFIG.customerId,
    name: [{
      lang: Locale[TAP_CONFIG.locale],
      first: 'Customer',
      last: 'Name',
    }],
    nameOnCard: 'Customer Name',
    editable: true,
    contact: {
      email: 'customer@example.com',
      phone: {
        countryCode: '965',
        number: '50000000'
      }
    }
  } : {
    name: [{
      lang: Locale[TAP_CONFIG.locale],
      first: 'Customer',
      last: 'Name',
    }],
    nameOnCard: 'Customer Name',
    editable: true,
    contact: {
      email: 'customer@example.com',
      phone: {
        countryCode: '965',
        number: '50000000'
      }
    }
  };

  try {
    // Render the Tap Card SDK
    const { unmount } = renderTapCard('card-sdk-container', {
      publicKey: TAP_CONFIG.publicKey,
      merchant: {
        id: TAP_CONFIG.merchantId
      },
      transaction: {
        amount: amount,
        currency: Currencies[currency] || Currencies[TAP_CONFIG.defaultCurrency]
      },
      customer: customerConfig,
      acceptance: {
        supportedBrands: TAP_CONFIG.supportedBrands,
        supportedCards: TAP_CONFIG.supportedCards
      },
      fields: {
        cardHolder: true
      },
      addons: {
        displayPaymentBrands: true,
        loader: true,
        saveCard: true // Enable save card option
      },
      interface: {
        locale: Locale[TAP_CONFIG.locale],
        theme: Theme[TAP_CONFIG.theme],
        edges: Edges.CURVED,
        direction: Direction[TAP_CONFIG.direction]
      },
      // Event handlers
      onReady: () => {
        console.log('✅ Card SDK Ready');
        state.isSDKReady = true;
        document.getElementById('pay-and-save-btn').disabled = false;
      },
      onFocus: () => console.log('Card focused'),
      onBinIdentification: (data) => {
        console.log('BIN identified:', data);
      },
      onValidInput: (data) => {
        console.log('Valid input:', data);
      },
      onInvalidInput: (data) => {
        console.log('Invalid input:', data);
      },
      onError: (data) => {
        console.error('Card SDK Error:', data);
        const statusEl = document.getElementById('cit-status');
        showStatus(statusEl, `❌ Error: ${data.message || 'Unknown error'}`, 'error');
      },
      onSuccess: (data) => {
        console.log('✅ Card tokenized successfully:', data);
        handleTokenizationSuccess(data);
      },
      onChangeSaveCardLater: (isSaveCardSelected) => {
        console.log('Save card option changed:', isSaveCardSelected);
      }
    });

    // Store methods for later use
    tapCardMethods = {
      tokenize,
      updateCardConfiguration,
      unmount
    };

    state.tapCardInstance = { unmount };

    console.log('✅ Tap Card SDK initialized successfully');
  } catch (error) {
    console.error('❌ SDK initialization failed:', error);
    const container = document.getElementById('card-sdk-container');
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #e53e3e;">
        <p style="margin: 0; font-size: 1rem;">
          ❌ <strong>SDK Initialization Failed</strong>
        </p>
        <p style="margin: 0.5rem 0 0; font-size: 0.875rem;">
          ${error.message}
        </p>
      </div>
    `;
  }
}

// Handle currency change to update SDK configuration
function handleCurrencyChange() {
  if (!state.isSDKReady || !tapCardMethods) return;

  const currency = document.getElementById('cit-currency').value;
  const amount = parseFloat(document.getElementById('cit-amount').value) || 1;

  const { Currencies } = window.CardSDK;

  tapCardMethods.updateCardConfiguration({
    transaction: {
      amount: amount,
      currency: Currencies[currency] || Currencies.KWD
    }
  });

  console.log(`Updated currency to ${currency}`);
}

// Handle Customer Initiated Transaction (CIT) with 3DS
async function handleCITPayment() {
  const amount = document.getElementById('cit-amount').value;
  const currency = document.getElementById('cit-currency').value;
  const statusEl = document.getElementById('cit-status');

  if (!amount || parseFloat(amount) <= 0) {
    showStatus(statusEl, '❌ Please enter a valid amount', 'error');
    return;
  }

  if (!state.isSDKReady || !tapCardMethods) {
    showStatus(statusEl, '❌ SDK not initialized. Please initialize the SDK first.', 'error');
    return;
  }

  showStatus(statusEl, '⏳ Tokenizing card and creating charge with 3DS...', 'info');

  try {
    const { Currencies } = window.CardSDK;
    tapCardMethods.updateCardConfiguration({
      transaction: {
        amount: parseFloat(amount),
        currency: Currencies[currency] || Currencies.KWD
      }
    });

    tapCardMethods.tokenize();
  } catch (error) {
    console.error('Payment error:', error);
    showStatus(statusEl, `❌ Payment failed: ${error.message}`, 'error');
  }
}

async function handleTokenizationSuccess(tokenData) {
  const amount = parseFloat(document.getElementById('cit-amount').value);
  const currency = document.getElementById('cit-currency').value;
  const statusEl = document.getElementById('cit-status');

  showStatus(statusEl, '⏳ Creating charge with Tap API...', 'info');

  try {
    const cardInfo = tokenData.card || tokenData.payment?.card_data || {};
    const cardData = {
      id: tokenData.id || generateCardId(),
      token: tokenData.id,
      last4: cardInfo.last_four || cardInfo.last4 || '****',
      brand: cardInfo.brand || cardInfo.scheme || 'CARD',
      expMonth: String(cardInfo.exp_month || '12').padStart(2, '0'),
      expYear: String(cardInfo.exp_year || '2026'),
      firstSix: cardInfo.first_six || '',
      savedAt: new Date().toISOString(),
    };

    // Call backend to create charge with Tap API
    const response = await fetch('http://localhost:4000/api/charges/cit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: tokenData.id,
        amount,
        currency,
        merchantId: TAP_CONFIG.merchantId,
        customerId: TAP_CONFIG.customerId,
        redirectUrl: 'http://localhost:5173'
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error?.message || 'Charge creation failed');
    }

    const chargeId = result.data?.id;
    const chargeStatus = result.data?.status;
    const threeDSUrl = result.data?.threeDSUrl;

    cardData.chargeId = chargeId;

    // Create transaction
    const transaction = {
      id: chargeId,
      type: 'CIT',
      amount,
      currency,
      status: chargeStatus?.toLowerCase() || 'initiated',
      cardLast4: cardData.last4,
      tokenId: tokenData.id,
      timestamp: new Date().toISOString(),
      with3DS: true,
    };

    state.transactions.unshift(transaction);

    // Store pending card while waiting for 3DS
    localStorage.setItem('tap_pending_cit', JSON.stringify({
      chargeId,
      cardData
    }));
    saveSavedData();
    renderTransactionHistory();

    // If 3DS URL available, redirect to it
    if (threeDSUrl) {
      showStatus(statusEl, '🔐 Redirecting to 3D Secure...', 'info');
      setTimeout(() => {
        window.location.href = threeDSUrl;
      }, 1500);
    } else {
      // No 3DS needed, save card immediately
      state.savedCards.push(cardData);
      saveSavedData();
      renderSavedCards();
      enableMITSection();
      showStatus(statusEl, '✅ Charge successful and card saved!', 'success');

      if (tapCardMethods && window.CardSDK.resetCardInputs) {
        setTimeout(() => window.CardSDK.resetCardInputs(), 1000);
      }
    }

  } catch (error) {
    console.error('CIT charge error:', error);
    showStatus(statusEl, `❌ CIT failed: ${error.message}`, 'error');
  }
}


async function handleMITPayment() {
  const cardSelect = document.getElementById('selected-card');
  const amount = document.getElementById('mit-amount').value;
  const currency = document.getElementById('mit-currency').value;
  const statusEl = document.getElementById('mit-status');

  if (!cardSelect.value) {
    showStatus(statusEl, '❌ Please select a saved card', 'error');
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    showStatus(statusEl, '❌ Please enter a valid amount', 'error');
    return;
  }

  const selectedCard = state.savedCards.find(card => card.id === cardSelect.value);
  if (!selectedCard) {
    showStatus(statusEl, '❌ Card not found', 'error');
    return;
  }

  showStatus(statusEl, '⏳ Processing MIT charge (no 3DS)...', 'info');

  try {
    // Simulate MIT charge processing (in production, this would call Tap API via backend)
    const transaction = {
      id: generateTransactionId(),
      type: 'MIT',
      amount: parseFloat(amount),
      currency,
      status: 'captured',
      cardLast4: selectedCard.last4,
      tokenId: selectedCard.token,
      timestamp: new Date().toISOString(),
      with3DS: false,
    };

    state.transactions.unshift(transaction);
    saveSavedData();
    renderTransactionHistory();
    showStatus(statusEl, `✅ MIT charge successful! (${parseFloat(amount).toFixed(2)} ${currency})`, 'success');
  } catch (error) {
    console.error('MIT charge error:', error);
    showStatus(statusEl, `❌ MIT failed: ${error.message}`, 'error');
  }
}

async function resumeFromRedirectCharge() {
  const params = new URLSearchParams(window.location.search);
  const tapId = params.get('tap_id') || params.get('charge_id');
  if (!tapId) return;

  const statusEl = document.getElementById('cit-status');
  showStatus(statusEl, '⏳ Verifying charge status after redirect...', 'info');

  const result = await callBackend(`/api/charges/${tapId}`, undefined, 'GET');
  const chargeStatus = String(result.data?.status || 'UNKNOWN').toUpperCase();

  // Update existing transaction entry when possible
  const existingIdx = state.transactions.findIndex(tx => tx.id === tapId);
  if (existingIdx >= 0) {
    state.transactions[existingIdx].status = chargeStatus.toLowerCase();
  } else {
    state.transactions.unshift({
      id: tapId,
      type: 'CIT',
      amount: Number(result.data?.amount || 0),
      currency: result.data?.currency || TAP_CONFIG.defaultCurrency,
      status: chargeStatus.toLowerCase(),
      cardLast4: result.data?.card?.last_four || '****',
      tokenId: '',
      timestamp: new Date().toISOString(),
      with3DS: true
    });
  }

  // Persist pending card only if the final status is successful
  const pendingRaw = localStorage.getItem(PENDING_CARD_KEY);
  if (pendingRaw) {
    const pending = JSON.parse(pendingRaw);
    if (pending?.chargeId === tapId && SUCCESS_STATUSES.has(chargeStatus)) {
      persistSavedCard(pending.cardData);
      localStorage.removeItem(PENDING_CARD_KEY);
      showStatus(statusEl, '✅ 3DS completed. Card saved successfully.', 'success');
    } else if (pending?.chargeId === tapId) {
      localStorage.removeItem(PENDING_CARD_KEY);
      showStatus(statusEl, `❌ 3DS completed with status: ${chargeStatus}`, 'error');
    }
  }

  saveSavedData();
  renderSavedCards();
  renderTransactionHistory();

  // Clean URL query params after handling redirect
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function persistSavedCard(cardData) {
  const exists = state.savedCards.some(card => card.token === cardData.token);
  if (!exists) {
    state.savedCards.push(cardData);
  }
  enableMITSection();
}


// Render saved cards
function renderSavedCards() {
  const container = document.getElementById('saved-cards-list');
  const cardSelect = document.getElementById('selected-card');

  if (state.savedCards.length === 0) {
    container.innerHTML = '<p class="empty-state">No saved cards yet. Complete a CIT transaction above to save a card.</p>';
    cardSelect.innerHTML = '<option value="">No saved cards available</option>';
    cardSelect.disabled = true;
    return;
  }

  container.innerHTML = state.savedCards.map(card => `
    <div class="card-item">
      <div class="card-badge">Saved</div>
      <div class="card-brand">${card.brand}</div>
      <div class="card-number">•••• •••• •••• ${card.last4}</div>
      <div class="card-expiry">Expires ${card.expMonth}/${card.expYear}</div>
      <div class="token-label">Token</div>
      <div class="token-value">${card.token || 'N/A'}</div>
    </div>
  `).join('');

  cardSelect.innerHTML = state.savedCards.map(card => `
    <option value="${card.id}">${card.brand} •••• ${card.last4} (Exp: ${card.expMonth}/${card.expYear})</option>
  `).join('');
  cardSelect.disabled = false;
}

// Render transaction history
function renderTransactionHistory() {
  const container = document.getElementById('transaction-history');

  if (state.transactions.length === 0) {
    container.innerHTML = '<p class="empty-state">No transactions yet</p>';
    return;
  }

  container.innerHTML = state.transactions.map(tx => {
    const date = new Date(tx.timestamp);
    const formattedDate = date.toLocaleString();

    return `
      <div class="transaction-item">
        <div class="transaction-type ${tx.type.toLowerCase()}">${tx.type}</div>
        <div class="transaction-details">
          <span>Card: •••• ${tx.cardLast4}</span>
          <span>${formattedDate}</span>
          <span>${tx.with3DS ? '🔒 With 3DS' : '⚡ No 3DS'}</span>
          <span class="tx-token">Token: ${tx.tokenId || 'N/A'}</span>
          <span class="tx-charge-id">Charge ID: ${tx.id || tx.chargeId || 'N/A'}</span>
        </div>
        <div class="transaction-amount">${tx.amount.toFixed(2)} ${tx.currency}</div>
        <span class="transaction-status ${tx.status}">${tx.status}</span>
      </div>
    `;
  }).join('');
}

// Enable MIT section after first card is saved
function enableMITSection() {
  document.getElementById('pay-with-saved-card-btn').disabled = false;
}

// Show status message
function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status-message show ${type}`;

  if (type === 'success') {
    setTimeout(() => {
      element.classList.remove('show');
    }, 5000);
  }
}


// Save data to localStorage
function saveSavedData() {
  localStorage.setItem('tapPayments_savedCards', JSON.stringify(state.savedCards));
  localStorage.setItem('tapPayments_transactions', JSON.stringify(state.transactions));
}

// Load data from localStorage
function loadSavedData() {
  const savedCards = localStorage.getItem('tapPayments_savedCards');
  const transactions = localStorage.getItem('tapPayments_transactions');

  if (savedCards) {
    state.savedCards = JSON.parse(savedCards);
  }

  if (transactions) {
    state.transactions = JSON.parse(transactions);
  }

  // Enable MIT if cards exist
  if (state.savedCards.length > 0) {
    enableMITSection();
  }
}

// Utility functions
function generateCardId() {
  return `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateTransactionId() {
  return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Export functions for external use and testing
window.TapPaymentsApp = {
  // Get current state
  getState: () => state,

  // Get current config
  getConfig: () => TAP_CONFIG,

  // Manually add a saved card (for testing)
  addSavedCard: (cardData) => {
    state.savedCards.push(cardData);
    saveSavedData();
    renderSavedCards();
    enableMITSection();
  },

  // Clear all data
  clearData: () => {
    state.savedCards = [];
    state.transactions = [];
    saveSavedData();
    renderSavedCards();
    renderTransactionHistory();
    document.getElementById('pay-with-saved-card-btn').disabled = true;

    // Show success message
    const statusEl = document.getElementById('config-status');
    showStatus(statusEl, '✅ All saved cards and transactions cleared', 'success');

    console.log('✅ All data cleared');
  },

  // Reset only saved cards
  resetSavedCards: () => {
    state.savedCards = [];
    saveSavedData();
    renderSavedCards();
    document.getElementById('pay-with-saved-card-btn').disabled = true;
    document.getElementById('selected-card').value = '';

    const statusEl = document.getElementById('cit-status');
    showStatus(statusEl, '✅ All saved cards have been reset', 'success');

    console.log('✅ Saved cards reset');
  },

  // Reset only transactions
  resetTransactions: () => {
    state.transactions = [];
    saveSavedData();
    renderTransactionHistory();

    const statusEl = document.getElementById('mit-status');
    showStatus(statusEl, '✅ Transaction history has been reset', 'success');

    console.log('✅ Transactions reset');
  },

  // Complete 3DS authentication
  complete3DS: async (chargeId) => {
    const statusEl = document.getElementById('cit-status');
    showStatus(statusEl, '⏳ Verifying 3DS status...', 'info');

    try {
      // Get charge status from backend
      const response = await fetch(`http://localhost:4000/api/charges/${chargeId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error('Failed to retrieve charge status');
      }

      const chargeStatus = result.data?.status;
      const pendingData = JSON.parse(localStorage.getItem('tap_pending_cit'));

      if (pendingData && pendingData.chargeId === chargeId) {
        const { cardData } = pendingData;

        // Update transaction status
        const txIndex = state.transactions.findIndex(tx => tx.id === chargeId);
        if (txIndex >= 0) {
          state.transactions[txIndex].status = chargeStatus?.toLowerCase() || 'captured';
        }

        // Save the card permanently
        state.savedCards.push(cardData);
        saveSavedData();
        renderSavedCards();
        renderTransactionHistory();
        enableMITSection();

        // Clear pending data
        localStorage.removeItem('tap_pending_cit');

        showStatus(statusEl, '✅ 3DS authentication successful! Card saved.', 'success');

        if (tapCardMethods && window.CardSDK.resetCardInputs) {
          setTimeout(() => window.CardSDK.resetCardInputs(), 1000);
        }
      }
    } catch (error) {
      console.error('3DS completion error:', error);
      showStatus(statusEl, `❌ 3DS verification failed: ${error.message}`, 'error');
    }
  },

  // Cancel 3DS authentication
  cancel3DS: (chargeId) => {
    const modal = document.getElementById('modal-3ds');
    if (modal) modal.remove();

    // Remove pending transaction
    state.transactions = state.transactions.filter(tx => tx.id !== chargeId);
    saveSavedData();
    renderTransactionHistory();

    // Clear pending data
    localStorage.removeItem('tap_pending_cit');

    const statusEl = document.getElementById('cit-status');
    showStatus(statusEl, '❌ 3DS authentication cancelled. Card not saved.', 'error');

    console.log('❌ 3DS cancelled');
  },

  // Reinitialize SDK
  reinitializeSDK: () => {
    if (state.tapCardInstance?.unmount) {
      state.tapCardInstance.unmount();
    }
    state.isSDKReady = false;
    initializeTapSDK();
  },

  // Get tap card methods
  getTapMethods: () => tapCardMethods,

  // Toggle config section
  toggleConfig: () => toggleConfigSection(),
};

console.log('🚀 Tap Payments Integration loaded.');
console.log('💡 Use window.TapPaymentsApp for API access.');
console.log('📝 Available methods: getState(), clearData(), reinitializeSDK(), toggleConfig()');
console.log('⚙️  Update credentials in src/config.js or click the configuration header');

