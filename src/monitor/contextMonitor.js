/**
 * monitor/contextMonitor.js
 *
 * Polls Cursor's UI state and emits events when things change:
 *   - mode changes (ask/agent/plan/debug)
 *   - context window usage changes
 *
 * Consumers (the Telegram bot) subscribe to state change events.
 */

const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const { config } = require('../utils/config');
const { detectCurrentMode } = require('../cursor/modeSwitch');
const { execFile } = require('child_process');

class ContextMonitor extends EventEmitter {
  constructor() {
    super();
    this.state = {
      mode: 'unknown',
      contextPercent: 0,
      contextTokens: 0,
      projectName: null,
      lastUpdated: null,
    };
    this._interval = null;
    this._tokenCounter = 0; // heuristic token accumulator
  }

  /**
   * Start polling.
   */
  start() {
    if (this._interval) return;
    logger.info(`Context monitor started (poll every ${config.polling.intervalMs}ms)`);
    this._interval = setInterval(() => this._poll(), config.polling.intervalMs);
    this._poll(); // immediate first poll
  }

  /**
   * Stop polling.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /**
   * Update the heuristic token counter (called when messages are sent/received).
   * @param {number} approxTokens
   */
  addTokens(approxTokens) {
    this._tokenCounter += approxTokens;
    const win = config.context?.estimatedWindowTokens || 100000;
    const rawPct = Math.min(100, (this._tokenCounter / win) * 100);
    // Avoid showing 0% for small usage: keep one decimal below 10%
    const contextPercent =
      rawPct === 0
        ? 0
        : rawPct >= 10
          ? Math.round(rawPct)
          : Math.round(rawPct * 10) / 10;
    this._updateState({ contextPercent, contextTokens: this._tokenCounter });
  }

  /**
   * Reset the token counter (e.g. after /clear).
   */
  resetTokens() {
    this._tokenCounter = 0;
    this._updateState({ contextPercent: 0, contextTokens: 0 });
  }

  /**
   * Run one poll immediately (e.g. before Telegram status widget so mode is not stuck on "unknown").
   */
  async syncNow() {
    await this._poll();
  }

  /**
   * Poll Cursor for current state.
   */
  async _poll() {
    try {
      // 1. Detect mode
      const mode = await detectCurrentMode();
      const changed = {};
      if (mode !== this.state.mode && mode !== 'unknown') {
        changed.mode = mode;
      }

      // 2. Optional: read context from Cursor UI (Electron often hides this from AX; off by default)
      if (config.context?.preferUiReading) {
        const uiPct = await this._readContextFromUI();
        if (uiPct !== null && uiPct !== this.state.contextPercent) {
          changed.contextPercent = uiPct;
        }
      }

      if (Object.keys(changed).length > 0) {
        this._updateState(changed);
      }
    } catch (err) {
      logger.debug('Monitor poll error:', err.message);
    }
  }

  /**
   * Try to read the context usage percentage from Cursor's UI.
   * Returns a number 0-100 or null if not readable.
   */
  async _readContextFromUI() {
    // Cursor sometimes shows a context indicator like "45k / 100k tokens"
    // or a progress bar near the chat input
    // This is highly version-dependent — implement based on what you see in your Cursor version

    try {
      const script = `
        tell application "System Events"
          tell process "${config.cursor.appName}"
            -- Look for static text elements containing "k" or "tokens"
            set allTexts to every static text of window 1
            repeat with t in allTexts
              try
                set v to value of t
                if v contains "k /" or v contains "tokens" then
                  return v
                end if
              end try
            end repeat
            return ""
          end tell
        end tell
      `;
      const result = await new Promise((resolve, reject) => {
        execFile('osascript', ['-e', script], (err, stdout) => {
          if (err) resolve('');
          else resolve(stdout.trim());
        });
      });

      if (result) {
        // Parse "45k / 100k" or "45000 / 100000 tokens"
        const match = result.match(/(\d+(?:\.\d+)?)\s*k?\s*\/\s*(\d+(?:\.\d+)?)\s*k?/i);
        if (match) {
          const used = parseFloat(match[1]) * (result.includes('k') ? 1000 : 1);
          const total = parseFloat(match[2]) * (result.includes('k') ? 1000 : 1);
          if (total > 0) return Math.round((used / total) * 100);
        }
      }
    } catch { /* ignore */ }

    return null;
  }

  /**
   * Update internal state and emit change event.
   */
  _updateState(changes) {
    const prev = { ...this.state };
    this.state = { ...this.state, ...changes, lastUpdated: new Date() };
    logger.debug('State updated:', changes);
    this.emit('change', this.state, prev);
  }

  /**
   * Get current state snapshot.
   */
  getState() {
    return {
      ...this.state,
      contextWindowEstimate: config.context?.estimatedWindowTokens || 100000,
    };
  }
}

// Singleton instance
const monitor = new ContextMonitor();

function startMonitor() {
  monitor.start();
}

async function syncMonitor() {
  await monitor.syncNow();
}

module.exports = { monitor, startMonitor, syncMonitor };
