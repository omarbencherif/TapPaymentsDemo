# 🚀 MIT Payment Agreement - Quick Reference Card

## Error 1216 is FIXED ✅

### The Problem (Before)
```
You sent:                          Tap API Response:
{                                  ❌ Error 1216
  "amount": 100,                   "Payment Agreement 
  "source": { "id": "..." }        id is missing"
}
```

### The Solution (After)
```
You send:                          Tap API Response:
{                                  ✅ Success
  "amount": 100,                   "status": "authorized"
  "source": { "id": "..." },       
  "payment_agreement": {           
    "id": "payment_agreement_..."  (Now included!)
  }
}
```

---

## MIT Payment Requirements

```
┌─────────────────────────────────────────────────────────┐
│ MERCHANT-INITIATED TRANSACTION (MIT)                    │
│                                                         │
│ REQUIRED FIELDS:                                        │
│ ✅ amount                                               │
│ ✅ currency                                             │
│ ✅ source.id (saved card)                               │
│ ✅ payment_agreement.id ← THE FIX!                      │
│                                                         │
│ MUST SET:                                               │
│ ✅ customer_initiated: false                            │
│ ✅ threeDSecure: false                                  │
│                                                         │
│ NO 3DS NEEDED (already authorized in CIT)              │
└─────────────────────────────────────────────────────────┘
```

---

## The Two-Step Flow

### Step 1️⃣ : Customer Saves Card (CIT)
```
┌────────────────────────────────────────────────────────┐
│ POST /api/charges/cit                                  │
├────────────────────────────────────────────────────────┤
│ {                                                      │
│   "token": "tok_abc123...",                            │
│   "amount": 1,                                         │
│   "currency": "USD",                                   │
│   "save_card": true,          ← Enable saving          │
│   "customer_initiated": true  ← Customer present       │
│ }                                                      │
└────────────────────────────────────────────────────────┘
                     ↓
         ✅ Gets authorization
         ✅ Card is saved
         ✅ Agreement created
                     ↓
         SAVE THIS ID:
         payment_agreement.id = "payment_agreement_..."
```

### Step 2️⃣ : Merchant Charges Card (MIT)
```
┌────────────────────────────────────────────────────────┐
│ POST /api/charges/mit                                  │
├────────────────────────────────────────────────────────┤
│ {                                                      │
│   "token": "src_xyz...",                               │
│   "amount": 100,                                       │
│   "currency": "USD",                                   │
│   "paymentAgreementId": "payment_agreement_...",  ← PASS │
│   "customer_initiated": false ← Merchant is charging   │
│ }                                                      │
└────────────────────────────────────────────────────────┘
                     ↓
         ✅ Agreement validated
         ✅ Charge authorized
         ✅ No 3DS needed
```

---

## Backend Implementation (What We Fixed)

### Before ❌
```javascript
app.post('/api/charges/mit', async (req, res) => {
  const { token, amount, currency } = req.body;
  // ❌ Missing: paymentAgreementId
  
  const chargeData = {
    amount, currency,
    source: { id: token }
    // ❌ NO payment_agreement object
  };
});
```

### After ✅
```javascript
app.post('/api/charges/mit', async (req, res) => {
  const { token, amount, currency, paymentAgreementId } = req.body;
  
  // ✅ Validate it's provided
  if (!paymentAgreementId) {
    return res.status(400).json({ error: 'Agreement ID required' });
  }
  
  const chargeData = {
    amount, currency,
    source: { id: token },
    payment_agreement: {
      id: paymentAgreementId  // ✅ NOW INCLUDED!
    }
  };
});
```

---

## Frontend Usage Example

### Store Agreement After CIT
```javascript
// After successful CIT charge:
const citResponse = await fetch('/api/charges/cit', {
  method: 'POST',
  body: JSON.stringify({
    token: cardToken,
    amount: 1,
    save_card: true
  })
});

const { data } = await citResponse.json();

// 🔑 SAVE THIS!
const agreementId = data.payment_agreement.id;
localStorage.setItem('paymentAgreementId', agreementId);
```

### Use Agreement for MIT
```javascript
// For future charges:
const agreementId = localStorage.getItem('paymentAgreementId');

const mitResponse = await fetch('/api/charges/mit', {
  method: 'POST',
  body: JSON.stringify({
    token: savedCardId,
    amount: 100,
    paymentAgreementId: agreementId  // ✅ USE IT HERE
  })
});
```

---

## Error Reference

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| **1216** | Payment Agreement id is missing | `paymentAgreementId` not provided | Include it from CIT response |
| **1217** | Invalid Payment Agreement | Wrong/expired agreement ID | Verify ID is correct |
| **1218** | Agreement limit exceeded | Amount exceeds limit | Check agreement max amount |

---

## Checklist Before MIT Charge

- [ ] Did you complete a CIT charge first?
- [ ] Did you get `payment_agreement.id` in response?
- [ ] Is the ID saved securely (database/storage)?
- [ ] Are you passing it as `paymentAgreementId` in MIT request?
- [ ] Is the agreement ID not expired?
- [ ] Using saved card token (starts with `src_` or `tok_`)?
- [ ] Set `customer_initiated: false`?
- [ ] Set `threeDSecure: false`?

✅ All checked? MIT charge should succeed!

---

## Common Mistakes

### ❌ Mistake 1: Forgetting Agreement ID
```javascript
// WRONG
fetch('/api/charges/mit', {
  body: JSON.stringify({
    token: 'src_...',
    amount: 100
    // ❌ Missing paymentAgreementId
  })
});
// Result: Error 1216 ❌
```

### ❌ Mistake 2: Using Original Token
```javascript
// WRONG
fetch('/api/charges/mit', {
  body: JSON.stringify({
    token: 'tok_original...',  // ❌ Should be src_
    paymentAgreementId: '...'
  })
});
```

### ❌ Mistake 3: Setting customer_initiated = true
```javascript
// WRONG
fetch('/api/charges/mit', {
  body: JSON.stringify({
    token: 'src_...',
    paymentAgreementId: '...',
    customer_initiated: true  // ❌ Should be false for MIT
  })
});
```

### ✅ Correct Way
```javascript
// CORRECT
fetch('/api/charges/mit', {
  body: JSON.stringify({
    token: 'src_...',              // ✅ Saved card
    amount: 100,
    currency: 'USD',
    paymentAgreementId: 'payment_agreement_...',  // ✅ From CIT
    customer_initiated: false,     // ✅ Merchant charging
    customerId: 'cust_...'         // Optional but recommended
  })
});
// Result: Success ✅
```

---

## Documentation Files

- **MIT_FIX_SUMMARY.md** - Overview and fix summary
- **MIT_PAYMENT_AGREEMENT_FIX.md** - Detailed technical explanation
- **examples-mit-frontend.js** - Complete code examples
- **This file** - Quick reference guide

---

## Key Takeaway

```
CIT (Customer Saves Card) → Gets payment_agreement.id
                                         ↓
MIT (Merchant Charges Card) → Uses payment_agreement.id
```

**The agreement ID connects the saved card to merchant charges.**

---

Generated: March 2026 | Status: ✅ Fixed and Ready to Use

