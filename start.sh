#!/bin/bash

# Quick Start Script for Tap Payments Integration
# Run this to start the development server

echo "🚀 Starting Tap Payments Integration..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

echo "✅ Dependencies ready!"
echo ""
echo "🌐 Starting development server..."
echo ""

# Start Vite
npm run dev

