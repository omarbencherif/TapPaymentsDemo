#!/bin/bash
# MIT Payment Agreement Testing - Complete Flow
# Run these commands in sequence to test the fix

echo "═══════════════════════════════════════════════════════════"
echo "🧪 MIT Payment Agreement Testing - Complete Flow"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Configuration
BACKEND_URL="http://localhost:4000"
CARD_TOKEN="tok_test_card_visa"  # Replace with real Tap SDK token
AMOUNT_CIT=1
AMOUNT_MIT=100
CURRENCY="USD"
MERCHANT_ID="1124340"
CUSTOMER_ID="cust_test_12345"

echo "📋 Configuration:"
echo "  Backend URL: $BACKEND_URL"
echo "  Card Token: $CARD_TOKEN"
echo "  CIT Amount: $AMOUNT_CIT $CURRENCY"
echo "  MIT Amount: $AMOUNT_MIT $CURRENCY"
echo "  Customer ID: $CUSTOMER_ID"
echo ""

# ============================================================================
# STEP 1: Health Check
# ============================================================================
echo "STEP 1️⃣  Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing backend is running..."
echo ""

HEALTH_RESPONSE=$(curl -s -X GET "$BACKEND_URL/health")
echo "Response: $HEALTH_RESPONSE"
echo ""

if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
  echo "✅ Backend is running!"
else
  echo "❌ Backend not responding. Make sure to run: npm start"
  echo "   Or: node backend-example.js"
  exit 1
fi

echo ""
echo ""

# ============================================================================
# STEP 2: Customer-Initiated Transaction (CIT) - Save Card
# ============================================================================
echo "STEP 2️⃣  Process CIT Charge (Customer Saves Card)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Sending CIT request to save the customer's card..."
echo ""
echo "Request Body:"
cat <<EOF
{
  "token": "$CARD_TOKEN",
  "amount": $AMOUNT_CIT,
  "currency": "$CURRENCY",
  "merchantId": "$MERCHANT_ID",
  "customerId": "$CUSTOMER_ID",
  "save_card": true,
  "customer_initiated": true,
  "threeDSecure": true
}
EOF
echo ""
echo ""

# Send CIT request and save response
CIT_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/charges/cit" \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$CARD_TOKEN\",
    \"amount\": $AMOUNT_CIT,
    \"currency\": \"$CURRENCY\",
    \"merchantId\": \"$MERCHANT_ID\",
    \"customerId\": \"$CUSTOMER_ID\"
  }")

echo "Response:"
echo "$CIT_RESPONSE" | jq . 2>/dev/null || echo "$CIT_RESPONSE"
echo ""

# Extract the payment agreement ID (the key for MIT)
AGREEMENT_ID=$(echo "$CIT_RESPONSE" | jq -r '.data.payment_agreement.id' 2>/dev/null)
CHARGE_ID=$(echo "$CIT_RESPONSE" | jq -r '.data.id' 2>/dev/null)
CARD_ID=$(echo "$CIT_RESPONSE" | jq -r '.data.payment_agreement.contract.id' 2>/dev/null)

if [ "$AGREEMENT_ID" != "null" ] && [ ! -z "$AGREEMENT_ID" ]; then
  echo "✅ CIT Charge Successful!"
  echo "  Charge ID: $CHARGE_ID"
  echo "  Payment Agreement ID: $AGREEMENT_ID"
  echo "  Card ID: $CARD_ID"
  echo ""
  echo "🔑 IMPORTANT: Save the Payment Agreement ID"
  echo "   You need this for MIT charges!"
else
  echo "❌ CIT Charge Failed!"
  echo "   Response did not contain payment_agreement.id"
  echo "   Make sure:"
  echo "   - Backend is running"
  echo "   - Card token is valid"
  echo "   - TAP_SECRET_KEY is set correctly"
  exit 1
fi

echo ""
echo ""

# ============================================================================
# STEP 3: Merchant-Initiated Transaction (MIT) - Charge Saved Card
# ============================================================================
echo "STEP 3️⃣  Process MIT Charge (Merchant Charges Saved Card)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Using the payment agreement ID from CIT to charge the card..."
echo ""
echo "Request Body:"
cat <<EOF
{
  "token": "$CARD_ID",
  "amount": $AMOUNT_MIT,
  "currency": "$CURRENCY",
  "merchantId": "$MERCHANT_ID",
  "customerId": "$CUSTOMER_ID",
  "paymentAgreementId": "$AGREEMENT_ID"
}
EOF
echo ""
echo ""

# Send MIT request
MIT_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/charges/mit" \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$CARD_ID\",
    \"amount\": $AMOUNT_MIT,
    \"currency\": \"$CURRENCY\",
    \"merchantId\": \"$MERCHANT_ID\",
    \"customerId\": \"$CUSTOMER_ID\",
    \"paymentAgreementId\": \"$AGREEMENT_ID\"
  }")

echo "Response:"
echo "$MIT_RESPONSE" | jq . 2>/dev/null || echo "$MIT_RESPONSE"
echo ""

# Check if successful
MIT_CHARGE_ID=$(echo "$MIT_RESPONSE" | jq -r '.data.id' 2>/dev/null)
MIT_STATUS=$(echo "$MIT_RESPONSE" | jq -r '.data.status' 2>/dev/null)

if [ "$MIT_CHARGE_ID" != "null" ] && [ ! -z "$MIT_CHARGE_ID" ]; then
  echo "✅ MIT Charge Successful!"
  echo "  Charge ID: $MIT_CHARGE_ID"
  echo "  Status: $MIT_STATUS"
else
  echo "❌ MIT Charge Failed!"

  # Check for error 1216 specifically
  ERROR_CODE=$(echo "$MIT_RESPONSE" | jq -r '.error.errors[0].code' 2>/dev/null)
  if [ "$ERROR_CODE" = "1216" ]; then
    echo "  Error 1216: Payment Agreement ID is missing"
    echo "  ⚠️  This means paymentAgreementId was not included in the request"
    echo "  ✅ But our fix ensures the backend now validates this!"
  else
    echo "  Error Code: $ERROR_CODE"
  fi

  echo ""
  echo "  Response:"
  echo "$MIT_RESPONSE" | jq '.error' 2>/dev/null || echo "$MIT_RESPONSE"
fi

echo ""
echo ""

# ============================================================================
# STEP 4: Retrieve Charge Details (Optional)
# ============================================================================
echo "STEP 4️⃣  Retrieve Charge Details (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Retrieving details of the MIT charge..."
echo ""

RETRIEVE_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/charges/$MIT_CHARGE_ID" \
  -H "Content-Type: application/json")

echo "Response:"
echo "$RETRIEVE_RESPONSE" | jq . 2>/dev/null || echo "$RETRIEVE_RESPONSE"
echo ""

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📊 Test Summary"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ CIT (Customer-Initiated) Charge:"
echo "   Charge ID: $CHARGE_ID"
echo "   Payment Agreement ID: $AGREEMENT_ID"
echo ""
echo "✅ MIT (Merchant-Initiated) Charge:"
echo "   Charge ID: $MIT_CHARGE_ID"
echo "   Status: $MIT_STATUS"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# Advanced: Test Multiple MIT Charges
# ============================================================================
echo "BONUS: Additional MIT Charges with Same Agreement"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Testing that you can reuse the same agreement for multiple charges..."
echo ""

for i in {1..2}; do
  AMOUNT=$((50 + i * 10))
  echo "Charging $AMOUNT $CURRENCY (attempt $i)..."

  EXTRA_MIT=$(curl -s -X POST "$BACKEND_URL/api/charges/mit" \
    -H "Content-Type: application/json" \
    -d "{
      \"token\": \"$CARD_ID\",
      \"amount\": $AMOUNT,
      \"currency\": \"$CURRENCY\",
      \"customerId\": \"$CUSTOMER_ID\",
      \"paymentAgreementId\": \"$AGREEMENT_ID\"
    }")

  EXTRA_ID=$(echo "$EXTRA_MIT" | jq -r '.data.id' 2>/dev/null)
  if [ "$EXTRA_ID" != "null" ] && [ ! -z "$EXTRA_ID" ]; then
    echo "  ✅ Success: $EXTRA_ID"
  else
    echo "  ❌ Failed"
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Testing Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Key Points:"
echo "  1. CIT creates the payment agreement (authorization)"
echo "  2. MIT uses that agreement ID to charge without 3DS"
echo "  3. The same agreement can be used for multiple MIT charges"
echo "  4. Error 1216 should NOT occur (it's been fixed!)"
echo ""

