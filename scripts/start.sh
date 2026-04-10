#!/usr/bin/env bash
# Start the Cursor Telegram Bridge via pm2

set -e

# Check .env is configured
if grep -q "your_bot_token_here" .env 2>/dev/null; then
  echo "❌ .env is not configured yet. Edit it first."
  exit 1
fi

echo "🚀 Starting Cursor Telegram Bridge..."
pm2 start ecosystem.config.js --env production

echo ""
echo "✅ Bridge started. Monitor with:"
echo "   pm2 logs cursor-bridge"
echo "   pm2 status"
echo ""
echo "To stop: bash scripts/stop.sh"
