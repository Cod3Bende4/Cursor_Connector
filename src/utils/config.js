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
  /**
   * New chat via Command Palette: paste this string (command id is most reliable).
   * Fuzzy “New Chat” often picks “New File” / “New Window”. Optional alternates if the first fails (OS error).
   */
  chat: {
    newChatPaletteQuery: process.env.NEW_CHAT_PALETTE_QUERY || 'aichat.newchataction',
    newChatPaletteAlternates: (process.env.NEW_CHAT_PALETTE_ALTERNATES || '')
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean),
    focusChatFirst: !['0', 'false', 'no'].includes(
      String(process.env.NEW_CHAT_FOCUS_CHAT_FIRST ?? 'true').toLowerCase()
    ),
  },
  /** Optional models.json — aliases for /setmodel. */
  models: {
    configPath: process.env.MODELS_CONFIG_PATH || './models.json',
    /** How to open model picker: `slash` = Cmd+/ (macOS default in Cursor). */
    openPickerShortcut: process.env.MODEL_PICKER_OPEN || 'slash',
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
  /**
   * Context % in the status widget is a bridge-side estimate (chars→tokens), not Cursor’s internal meter.
   * Optional: try to read usage from Cursor’s UI (often fails with Electron; off by default).
   */
  context: {
    estimatedWindowTokens: parseInt(process.env.CONTEXT_WINDOW_TOKENS_ESTIMATE || '100000', 10),
    preferUiReading: ['1', 'true', 'yes'].includes(
      String(process.env.CONTEXT_FROM_CURSOR_UI || '').toLowerCase()
    ),
  },
  /** Live “thinking” message while waiting for Cursor (time · mode · context · optional AX preview). */
  progress: {
    enabled: !['0', 'false', 'no'].includes(
      String(process.env.PROGRESS_UPDATES ?? 'true').toLowerCase()
    ),
    updateIntervalMs: parseInt(process.env.PROGRESS_UPDATE_INTERVAL_MS || '3500', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'INFO',
};

module.exports = { validateConfig, config };
