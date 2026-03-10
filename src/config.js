// Tap Payments Configuration
// Replace these with your actual Tap credentials

export const TAP_CONFIG = {
  // Get these from https://dashboard.tap.company/
  publicKey: 'pk_test_EtHFV4BuPQokJT6jiROls87Y',
  merchantId: '599424',

  // Backend URL for Tap API calls
  backendBaseUrl: 'http://localhost:3000',

  // Optional: Set a customer ID if you have one
  customerId: '', // e.g., 'cus_TS01A2220231433Ql4N1810314'


  // Default transaction settings
  defaultCurrency: 'KWD',
  defaultAmount: 10.00,

  // Supported payment brands (remove any NOT enabled on your account)
  supportedBrands: ['AMERICAN_EXPRESS', 'VISA', 'MASTERCARD', 'MADA'],

  // Card types to accept
  supportedCards: 'ALL', // 'ALL', ['DEBIT'], or ['CREDIT']

  // UI Settings
  theme: 'LIGHT', // 'LIGHT' or 'DARK'
  locale: 'EN', // 'EN' or 'AR'
  direction: 'LTR', // 'LTR' or 'RTL'
};
