/**
 * Loads and validates required environment variables.
 * Throws early with a clear message if anything is missing.
 */

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_CHAT_ID',
];

function validateConfig() {
  const missing = REQUIRED.filter(key => !process.env[key] || process.env[key].includes('your_'));
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
  },
  cursor: {
    appName: process.env.CURSOR_APP_NAME || 'Cursor',
  },
  projects: {
    configPath: process.env.PROJECTS_CONFIG_PATH || './projects.json',
    defaultName: process.env.DEFAULT_PROJECT_NAME || '',
  },
  capture: {
    outputWatchFile: process.env.OUTPUT_WATCH_FILE || '/tmp/cursor-bridge-output.txt',
    timeoutMs: parseInt(process.env.RESPONSE_TIMEOUT_MS || '60000', 10),
  },
  polling: {
    intervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '1500', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'INFO',
};

module.exports = { validateConfig, config };
