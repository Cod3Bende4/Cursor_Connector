#!/usr/bin/env bash
# Stop the Cursor Telegram Bridge

echo "🛑 Stopping Cursor Telegram Bridge..."
pm2 stop cursor-bridge 2>/dev/null || echo "  (was not running)"
echo "✅ Bridge stopped."
