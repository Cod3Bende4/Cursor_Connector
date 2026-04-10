/**
 * cursor-telegram-bridge — entry point
 * Starts all modules: Telegram bot, Cursor automation, context monitor
 */

require('dotenv').config();
const { validateConfig } = require('./utils/config');
const logger = require('./utils/logger');
const { startBot } = require('./telegram/bot');
const { startMonitor } = require('./monitor/contextMonitor');

async function main() {
  logger.info('🚀 Cursor Telegram Bridge starting...');

  // Validate all required env vars before doing anything
  try {
    validateConfig();
  } catch (err) {
    logger.error(`Config error: ${err.message}`);
    logger.error('Copy .env.example to .env and fill in all required values.');
    process.exit(1);
  }

  // Start the context/mode monitor
  startMonitor();
  logger.info('✅ Context monitor started');

  // Start the Telegram bot
  await startBot();
  logger.info('✅ Telegram bot started');

  logger.info('🟢 Bridge is live. Send a message in Telegram to begin.');
}

main().catch(err => {
  logger.error('Fatal error during startup:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('👋 Shutting down bridge...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('👋 Shutting down bridge...');
  process.exit(0);
});
