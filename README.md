# Tap Payments Integration Website

A complete website implementation for integrating Tap's Card SDK v2 to handle card payments with CIT (Customer Initiated Transaction) and MIT (Merchant Initiated Transaction) flow.

## Features

- ✅ **Full Tap Card SDK v2 Integration** - Real card tokenization with 3DS support
- 🔒 **Step 1: CIT Payment (with 3DS)** - Accept card payments with 3DS authentication and save the card
- 💳 **Step 2: View Saved Cards** - Display all saved cards in a visual card format
- ⚡ **Step 3: MIT Payment (without 3DS)** - Process payments using saved cards without requiring 3DS
- 📊 **Transaction History** - View all past transactions with details
- 💾 **Persistent Storage** - All data saved in localStorage

## Setup & Installation

### Prerequisites
- Node.js (v14 or higher)
- npm
- Tap Payments account with API credentials

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open the URL shown in the terminal (usually http://localhost:5173)

## How to Use

### Step 0: Configure Your Credentials

**Before running, update `src/config.js` with your Tap credentials:**

```javascript
export const TAP_CONFIG = {
  publicKey: 'pk_test_YOUR_ACTUAL_KEY',  // Replace this
  merchantId: 'YOUR_MERCHANT_ID',         // Replace this
  customerId: '',                         // Optional
  // ... other settings
};
```

The configuration section on the website is **collapsible** (click the header to expand/collapse) so users won't see it unless they need to update credentials during testing.

### Step 1: Make a CIT Payment (with 3DS)
1. Enter your card details in the card form:
   - Card number (e.g., 4111 1111 1111 1111 for testing)
   - Expiry date
   - CVV
   - Cardholder name
2. Make sure "Save card for later" is checked (if you want to save it)
3. Enter the payment amount and select currency
4. Click "Pay & Save Card"
5. Complete 3DS authentication if prompted
6. ✅ Card will be tokenized and saved!

### Step 2: View Your Saved Cards
- All saved cards appear as visual card elements
- Shows brand, last 4 digits, and expiry date

### Step 3: Make an MIT Payment (without 3DS)
1. Select a saved card from the dropdown
2. Enter the payment amount and currency
3. Click "Pay with Saved Card"
4. ✅ Payment processed instantly without 3DS!

## Project Structure

```
TapPayments/
├── index.html           # Main HTML file with payment flow UI
├── src/
│   └── main.js         # JavaScript with full Tap SDK integration
├── public/
│   ├── style.css       # Modern payment interface styling
│   └── fonts/          # JetBrains fonts
└── package.json        # Project dependencies
```

## Payment Flow Architecture

### CIT (Customer Initiated Transaction) Flow
```
1. User enters card details in Tap SDK
2. User clicks "Pay & Save Card"
3. SDK tokenizes the card (with 3DS if required)
4. onSuccess callback receives the token
5. Token + card details saved to localStorage
6. Card appears in "Saved Cards" section
7. Transaction recorded in history
```

### MIT (Merchant Initiated Transaction) Flow
```
1. User selects a previously saved card
2. User enters amount and clicks "Pay with Saved Card"
3. Backend uses saved token to process payment (no 3DS)
4. Transaction recorded in history
```

## Tap Card SDK v2 Integration

### SDK Script
The SDK is automatically loaded via CDN:
```html
<script src="https://tap-sdks.b-cdn.net/card/1.0.2/index.js"></script>
```

### Configuration
The SDK is initialized with the following configuration:

```javascript
const { renderTapCard, Theme, Currencies, Direction, Edges, Locale } = window.CardSDK;

renderTapCard('card-sdk-container', {
  publicKey: 'pk_test_...', // Your Tap public key
  merchant: {
    id: 'merchant_id' // Your Tap merchant ID
  },
  transaction: {
    amount: 10.00,
    currency: Currencies.KWD
  },
  customer: { ... },
  acceptance: {
    supportedBrands: ['AMERICAN_EXPRESS', 'VISA', 'MASTERCARD', 'MADA'],
    supportedCards: "ALL"
  },
  addons: {
    saveCard: true // Enable card saving
  },
  // Event handlers
  onSuccess: (tokenData) => {
    // Handle tokenization success
    // Token contains: id, card details, etc.
  }
});
```

### Token Response
When the card is successfully tokenized, you receive:

```javascript
{
  "id": "tok_xuCp45241437ANEj31F4P426",
  "status": "ACTIVE",
  "card": {
    "brand": "VISA",
    "last_four": "1111",
    "exp_month": 1,
    "exp_year": 39,
    "first_six": "411111",
    ...
  },
  ...
}
```

## Backend Integration (For MIT Payments)

⚠️ **Important:** For MIT payments, you need a backend to process the payment using the saved card token.

### Example Backend Flow

```javascript
// Backend endpoint for MIT payment
app.post('/api/charge-saved-card', async (req, res) => {
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
      source: { id: token },
      threeDSecure: false, // No 3DS for MIT
      save_card: false,
      // ... other parameters
    })
  });
  
  return res.json(await response.json());
});
```

## Tap API Usage in This Project

The app now uses both endpoints in the payment flow:

- `POST https://api.tap.company/v2/charges` (Create Charge)
  - CIT: `customer_initiated: true`, `threeDSecure: true`, `save_card: true`
  - MIT: `customer_initiated: false`, `threeDSecure: false`, `save_card: false`
- `GET https://api.tap.company/v2/charges/{charge_id}` (Retrieve Charge)
  - Used after create to confirm final status
  - Used after 3DS redirect (`tap_id` / `charge_id`) to reconcile transaction state

Backend proxy routes:

- `POST /api/charges/cit`
- `POST /api/charges/mit`
- `GET /api/charges/:chargeId`

## Data Storage

The app uses localStorage to persist:
- `tapPayments_config` - API credentials (publicKey, merchantId, customerId)
- `tapPayments_savedCards` - Array of saved card objects
- `tapPayments_transactions` - Array of transaction objects

## Testing with Tap Test Cards

Use these test cards for different scenarios:

### Successful Payment
- **Card:** 4111 1111 1111 1111
- **CVV:** Any 3 digits
- **Expiry:** Any future date

### 3DS Authentication
- **Card:** 5200 0000 0000 1096
- **CVV:** 100
- **Expiry:** Any future date

For more test cards, visit [Tap's Testing Guide](https://developers.tap.company/docs/testing)

## API Access (Developer Console)

You can access the app's API via browser console:

```javascript
// Get current state
window.TapPaymentsApp.getState();

// Clear all data
window.TapPaymentsApp.clearData();

// Manually add a saved card
window.TapPaymentsApp.addSavedCard({
  id: 'card_123',
  token: 'tok_xxx',
  last4: '4242',
  brand: 'VISA',
  expMonth: '12',
  expYear: '2026',
  savedAt: new Date().toISOString()
});

// Reinitialize SDK
window.TapPaymentsApp.reinitializeSDK();

// Get Tap SDK methods
window.TapPaymentsApp.getTapMethods();
```

## Important Notes

### For CIT (Customer Initiated Transaction)
- ✅ Uses Tap Card SDK v2 tokenization
- ✅ Supports 3DS authentication
- ✅ Saves card token for future use
- ✅ Real-time card validation

### For MIT (Merchant Initiated Transaction)
- ⚠️ Requires backend implementation
- ⚠️ You need to call Tap's Charges API from your server with the saved token
- ✅ No 3DS required
- ✅ Faster checkout experience

### Security Best Practices
- 🔒 Never store actual card numbers
- 🔒 Only store tokenized card references
- 🔒 Public key is safe for client-side use
- 🔒 Secret key must ONLY be used on the backend
- 🔒 Validate all transactions server-side

## Next Steps for Production

1. **Backend Setup:**
   - Create a backend service (Node.js, Python, etc.)
   - Add endpoint for MIT payment processing
   - Use Tap's Charges API with saved tokens
   - Implement webhook handlers for payment status

2. **Security:**
   - Add HTTPS
   - Implement CSRF protection
   - Add rate limiting
   - Validate all inputs server-side

3. **Enhancement:**
   - Add loading states
   - Implement error recovery
   - Add payment confirmation modals
   - Email receipts

## Troubleshooting

### SDK Not Loading
- Check internet connection
- Verify the CDN URL is accessible
- Check browser console for errors

### Payment Fails
- Verify public key and merchant ID are correct
- Check that the card brand is supported in your Tap account
- Ensure the currency is enabled in your Tap account
- Check browser console for detailed error messages

### 3DS Not Appearing
- Ensure you're using a test card that requires 3DS
- Check that 3DS is enabled in your Tap account settings

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Commands

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Resources

- [Tap Card SDK v2 Documentation](https://developers.tap.company/docs/card-sdk-v2)
- [Tap Charges API](https://developers.tap.company/docs/charges-api)
- [Tap Dashboard](https://dashboard.tap.company/)
- [Demo Page](https://demo.dev.tap.company/v2/sdk/card)

---

Built with ❤️ for Tap Payments Integration by Omar
