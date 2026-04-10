/**
 * cursor/responseCapture.js
 *
 * Captures Cursor AI responses using three parallel strategies:
 *   A — Output file watcher (most reliable — requires .cursor/rules/telegram-bridge.mdc)
 *   B — Clipboard watcher (works without rules, but needs auto-copy or manual copy)
 *   C — AX screen read (fallback — reads text area content via accessibility)
 *
 * Returns the first strategy that produces a result.
 */

const fs = require('fs');
const { execFile, execSync } = require('child_process');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { config } = require('../utils/config');

const BRIDGE_START = '---CURSOR-BRIDGE-START---';
const BRIDGE_END   = '---CURSOR-BRIDGE-END---';

// ─── Strategy A: Output file watcher ────────────────────────────────────────

/**
 * Wait for a new response to appear in the output watch file.
 * The Cursor rule appends delimited blocks; we watch for a new END marker.
 * @param {number} timeoutMs
 * @returns {Promise<string>} response text
 */
function waitForFileResponse(timeoutMs) {
  return new Promise((resolve, reject) => {
    const watchFile = config.capture.outputWatchFile;

    // Record file size before injection so we can detect new content
    let prevSize = 0;
    try { prevSize = fs.statSync(watchFile).size; } catch { prevSize = 0; }

    const watcher = chokidar.watch(watchFile, { usePolling: true, interval: 300 });
    const timer = setTimeout(() => {
      watcher.close();
      reject(new Error('File response timeout'));
    }, timeoutMs);

    watcher.on('change', () => {
      try {
        const content = fs.readFileSync(watchFile, 'utf8');
        // Find all complete blocks
        const blocks = [];
        let searchFrom = 0;
        while (true) {
          const start = content.indexOf(BRIDGE_START, searchFrom);
          if (start === -1) break;
          const end = content.indexOf(BRIDGE_END, start);
          if (end === -1) break;
          const blockContent = content.slice(start + BRIDGE_START.length, end).trim();
          blocks.push(blockContent);
          searchFrom = end + BRIDGE_END.length;
        }

        if (blocks.length > 0) {
          // Take the last complete block (newest response)
          const lastBlock = blocks[blocks.length - 1];
          // Verify it's new content (after the previous file size)
          const blockPosition = content.lastIndexOf(BRIDGE_START);
          if (blockPosition >= prevSize || prevSize === 0) {
            clearTimeout(timer);
            watcher.close();
            resolve(lastBlock);
          }
        }
      } catch (err) {
        logger.debug('File watcher read error:', err.message);
      }
    });
  });
}

// ─── Strategy B: Clipboard watcher ──────────────────────────────────────────

function getClipboard() {
  try {
    return execSync('pbpaste', { encoding: 'utf8' });
  } catch { return ''; }
}

/**
 * Poll clipboard for a change that looks like a Cursor response.
 * Before calling this, snapshot the current clipboard content.
 * @param {string} previousClipboard
 * @param {number} timeoutMs
 */
function waitForClipboardResponse(previousClipboard, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const interval = setInterval(() => {
      const current = getClipboard();
      if (
        current !== previousClipboard &&
        current.trim().length > 0 &&
        Date.now() - start > 1000  // at least 1s after injection
      ) {
        clearInterval(interval);
        resolve(current);
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Clipboard response timeout'));
      }
    }, 500);
  });
}

// ─── Strategy C: AX text read ────────────────────────────────────────────────

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/**
 * Read the last AI message from Cursor's chat via accessibility tree.
 * Note: This is fragile and depends on Cursor's AX element structure.
 */
async function readLastAIMessageFromAX() {
  const script = `
    tell application "System Events"
      tell process "${config.cursor.appName}"
        -- Try to get the last non-input text area (the last AI message bubble)
        set allTextAreas to every text area of window 1
        if (count of allTextAreas) > 1 then
          return value of last item of allTextAreas
        end if
        return ""
      end tell
    end tell
  `;
  const result = await runAppleScript(script);
  return result;
}

// ─── Master capture function ─────────────────────────────────────────────────

/**
 * Wait for Cursor's response using all three strategies in parallel.
 * The fastest one that returns a non-empty result wins.
 *
 * @param {{ timeoutMs?: number }} options
 * @returns {Promise<{ text: string, strategy: string }>}
 */
async function waitForResponse(options = {}) {
  const timeoutMs = options.timeoutMs || config.capture.timeoutMs;
  const previousClipboard = getClipboard();

  logger.debug('Starting response capture (all strategies)...');

  const strategies = [
    // Strategy A
    waitForFileResponse(timeoutMs)
      .then(text => ({ text, strategy: 'file' }))
      .catch(err => { logger.debug('Strategy A failed:', err.message); return null; }),

    // Strategy B
    waitForClipboardResponse(previousClipboard, timeoutMs)
      .then(text => ({ text, strategy: 'clipboard' }))
      .catch(err => { logger.debug('Strategy B failed:', err.message); return null; }),
  ];

  // Race all strategies
  return new Promise((resolve, reject) => {
    let settled = false;
    const results = [];

    strategies.forEach(p => {
      p.then(result => {
        results.push(result);
        if (!settled && result && result.text) {
          settled = true;
          resolve(result);
        }
      });
    });

    // If all strategies fail, return the best effort from AX
    Promise.all(strategies).then(async () => {
      if (!settled) {
        try {
          const axText = await readLastAIMessageFromAX();
          if (axText) {
            settled = true;
            resolve({ text: axText, strategy: 'ax' });
          } else {
            reject(new Error('All capture strategies exhausted with no response'));
          }
        } catch (err) {
          reject(new Error('All capture strategies failed: ' + err.message));
        }
      }
    });
  });
}

// Test runner
if (require.main === module) {
  console.log('Waiting for a Cursor response (max 30s)...');
  waitForResponse({ timeoutMs: 30000 })
    .then(r => {
      console.log(`\n--- Response via [${r.strategy}] ---\n${r.text}\n---`);
      process.exit(0);
    })
    .catch(e => {
      console.error('Failed:', e.message);
      process.exit(1);
    });
}

module.exports = { waitForResponse, getClipboard };
