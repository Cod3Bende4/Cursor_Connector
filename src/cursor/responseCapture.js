/**
 * cursor/responseCapture.js
 *
 * Captures Cursor AI responses using three strategies (PLAN.md order):
 *   A — Clipboard watcher (primary): poll + optional copy-last-response.applescript
 *   B — Output file watcher (secondary): telegram-bridge.mdc → OUTPUT_WATCH_FILE
 *   C — AX read (fallback): last text area in window (fragile with Electron)
 */

const fs = require('fs');
const path = require('path');
const { execFile, execSync } = require('child_process');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { config } = require('../utils/config');

const BRIDGE_START = '---CURSOR-BRIDGE-START---';
const BRIDGE_END = '---CURSOR-BRIDGE-END---';

const COPY_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'copy-last-response.applescript');
const CLIPBOARD_POLL_MS = 500;
const COPY_ASSIST_INTERVAL_MS = 2500;
const CLIPBOARD_MIN_WAIT_MS = 1000;

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

function runAppleScriptFile(scriptPath) {
  return new Promise((resolve, reject) => {
    execFile('osascript', [scriptPath], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/**
 * Optional: run copy-last-response.applescript so clipboard updates with the last reply.
 */
async function attemptCopyLastResponseToClipboard() {
  try {
    await fs.promises.access(COPY_SCRIPT, fs.constants.R_OK);
  } catch {
    return;
  }
  try {
    await runAppleScriptFile(COPY_SCRIPT);
  } catch (err) {
    logger.debug('copy-last-response.applescript:', err.message);
  }
}

// ─── Strategy B: Output file watcher ────────────────────────────────────────

/**
 * Index in `content` after the last complete delimiter (only new appends count).
 */
function endIndexAfterLastClosedBlock(content) {
  const lastEnd = content.lastIndexOf(BRIDGE_END);
  if (lastEnd === -1) return 0;
  return lastEnd + BRIDGE_END.length;
}

/**
 * Parse complete blocks whose closing delimiter ends after `minEndIndex`.
 */
function newBlocksAfter(content, minEndIndex) {
  const out = [];
  let search = 0;
  while (true) {
    const start = content.indexOf(BRIDGE_START, search);
    if (start === -1) break;
    const end = content.indexOf(BRIDGE_END, start + BRIDGE_START.length);
    if (end === -1) break;
    const endExclusive = end + BRIDGE_END.length;
    if (endExclusive > minEndIndex) {
      out.push(content.slice(start + BRIDGE_START.length, end).trim());
    }
    search = endExclusive;
  }
  return out;
}

/**
 * @param {number} timeoutMs
 * @param {string} [watchFileOverride]
 * @param {AbortSignal} [signal]
 */
function waitForFileResponse(timeoutMs, watchFileOverride, signal) {
  return new Promise((resolve, reject) => {
    const watchFile = watchFileOverride || config.capture.outputWatchFile;

    let minEndIndex = 0;
    try {
      const c = fs.existsSync(watchFile) ? fs.readFileSync(watchFile, 'utf8') : '';
      minEndIndex = endIndexAfterLastClosedBlock(c);
    } catch {
      minEndIndex = 0;
    }

    const watcher = chokidar.watch(watchFile, { usePolling: true, interval: 300 });

    const teardown = () => {
      watcher.close();
    };

    const fail = (err) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      teardown();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new Error('File response timeout'));
    }, timeoutMs);

    const onAbort = () => {
      fail(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) {
        fail(new Error('aborted'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const tryResolveFromContent = () => {
      try {
        if (!fs.existsSync(watchFile)) return;
        const content = fs.readFileSync(watchFile, 'utf8');
        const blocks = newBlocksAfter(content, minEndIndex);
        if (blocks.length > 0) {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
          teardown();
          resolve(blocks[blocks.length - 1]);
        }
      } catch (err) {
        logger.debug('File initial read error:', err.message);
      }
    };

    tryResolveFromContent();

    watcher.on('change', () => {
      try {
        const content = fs.readFileSync(watchFile, 'utf8');
        const blocks = newBlocksAfter(content, minEndIndex);
        if (blocks.length > 0) {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
          teardown();
          resolve(blocks[blocks.length - 1]);
        }
      } catch (err) {
        logger.debug('File watcher read error:', err.message);
      }
    });

    watcher.on('add', tryResolveFromContent);

    watcher.on('error', (err) => {
      logger.debug('Chokidar error:', err.message);
    });
  });
}

// ─── Strategy A: Clipboard watcher ──────────────────────────────────────────

function getClipboard() {
  try {
    return execSync('pbpaste', { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/**
 * Poll clipboard; optional copy-assist helps populate clipboard with the assistant reply.
 * @param {string} previousClipboard
 * @param {number} timeoutMs
 * @param {AbortSignal} [signal]
 */
function waitForClipboardResponse(previousClipboard, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let copyAssistTimer = null;

    const stop = () => {
      clearInterval(interval);
      if (copyAssistTimer) clearInterval(copyAssistTimer);
    };

    const tick = () => {
      if (signal?.aborted) {
        stop();
        reject(new Error('aborted'));
        return;
      }

      const current = getClipboard();
      if (
        current !== previousClipboard &&
        current.trim().length > 0 &&
        Date.now() - start > CLIPBOARD_MIN_WAIT_MS
      ) {
        stop();
        resolve(current);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        stop();
        reject(new Error('Clipboard response timeout'));
      }
    };

    const interval = setInterval(tick, CLIPBOARD_POLL_MS);

    try {
      copyAssistTimer = setInterval(() => {
        attemptCopyLastResponseToClipboard().catch(() => {});
      }, COPY_ASSIST_INTERVAL_MS);
    } catch {
      /* ignore */
    }

    signal?.addEventListener(
      'abort',
      () => {
        stop();
        reject(new Error('aborted'));
      },
      { once: true }
    );
  });
}

// ─── Strategy C: AX text read ────────────────────────────────────────────────

/**
 * Read the last AI message from Cursor's chat via accessibility tree.
 * Note: Often empty for Electron web-view chat; used as last resort.
 */
async function readLastAIMessageFromAX() {
  const script = `
    tell application "System Events"
      tell process "${config.cursor.appName}"
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
 * Wait for Cursor's response using strategies A and B in parallel; C if both fail.
 *
 * @param {{ timeoutMs?: number, outputWatchFile?: string }} options
 * @returns {Promise<{ text: string, strategy: 'clipboard' | 'file' | 'ax' }>}
 */
async function waitForResponse(options = {}) {
  const timeoutMs = options.timeoutMs || config.capture.timeoutMs;
  const watchFile = options.outputWatchFile || config.capture.outputWatchFile;
  const previousClipboard = getClipboard();

  logger.debug('Starting response capture (clipboard + file; AX fallback)...');

  const ac = new AbortController();
  const { signal } = ac;

  const clip = waitForClipboardResponse(previousClipboard, timeoutMs, signal).then((text) => ({
    text,
    strategy: /** @type {const} */ ('clipboard'),
  }));

  const file = waitForFileResponse(timeoutMs, watchFile, signal).then((text) => ({
    text,
    strategy: /** @type {const} */ ('file'),
  }));

  try {
    const result = await Promise.any([clip, file]);
    ac.abort();
    return result;
  } catch (err) {
    ac.abort();
    logger.debug('Clipboard + file both failed:', err instanceof AggregateError ? 'AggregateError' : err.message);
    try {
      const axText = await readLastAIMessageFromAX();
      if (axText && axText.trim()) {
        return { text: axText.trim(), strategy: 'ax' };
      }
    } catch (e) {
      logger.debug('Strategy C (AX):', e.message);
    }
    throw new Error('All capture strategies exhausted with no response');
  }
}

// Test runner
if (require.main === module) {
  console.log('Waiting for a Cursor response (max 30s)...');
  waitForResponse({ timeoutMs: 30000 })
    .then((r) => {
      console.log(`\n--- Response via [${r.strategy}] ---\n${r.text}\n---`);
      process.exit(0);
    })
    .catch((e) => {
      console.error('Failed:', e.message);
      process.exit(1);
    });
}

module.exports = {
  waitForResponse,
  getClipboard,
  waitForFileResponse,
  waitForClipboardResponse,
  readLastAIMessageFromAX,
  attemptCopyLastResponseToClipboard,
  BRIDGE_START,
  BRIDGE_END,
  newBlocksAfter,
  endIndexAfterLastClosedBlock,
};
