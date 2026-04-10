/**
 * cursor/injector.js
 *
 * Sends a message to Cursor's AI chat panel via AppleScript.
 *
 * Implementation notes for Cursor (Agent):
 * - Run `discoverChatInput()` first to find the correct AX path for this Cursor version
 * - Cache the discovered path in memory; invalidate if injection fails
 * - Always bring Cursor to front before injecting
 */

const { execFile } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const { config } = require('../utils/config');

// Cache of the discovered AX path to the chat input element
let cachedInputPath = null;

/**
 * Run an AppleScript string and return stdout.
 */
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/**
 * Run an AppleScript file with optional substitutions.
 */
function runAppleScriptFile(filePath, substitutions = {}) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    let script = fs.readFileSync(filePath, 'utf8');
    for (const [key, value] of Object.entries(substitutions)) {
      script = script.replaceAll(`{{${key}}}`, value.replace(/"/g, '\\"'));
    }
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/**
 * Check if Cursor is currently running.
 */
async function isCursorRunning() {
  try {
    const result = await runAppleScript(
      `tell application "System Events" to return (name of processes) contains "${config.cursor.appName}"`
    );
    return result === 'true';
  } catch {
    return false;
  }
}

/**
 * Bring Cursor to front.
 */
async function focusCursor() {
  await runAppleScript(`tell application "${config.cursor.appName}" to activate`);
  // Small delay to let the window come to front
  await new Promise(r => setTimeout(r, 400));
}

/**
 * Discover the AX path to Cursor's chat input textarea.
 * This may need adjustment after Cursor updates — the agent should
 * re-run this discovery if injection fails.
 *
 * Returns a descriptor object: { strategy, elementDescription }
 */
async function discoverChatInput() {
  logger.debug('Discovering Cursor chat input element...');

  // Strategy 1: Try known paths for recent Cursor versions
  const knownPaths = [
    // Try the primary chat panel textarea
    `tell application "System Events" to tell process "${config.cursor.appName}" to return exists (text area 1 of group 1 of group 1 of window 1)`,
    `tell application "System Events" to tell process "${config.cursor.appName}" to return exists (text area 1 of scroll area 1 of group 1 of window 1)`,
  ];

  for (let i = 0; i < knownPaths.length; i++) {
    try {
      const exists = await runAppleScript(knownPaths[i]);
      if (exists === 'true') {
        logger.info(`Chat input found via known path #${i + 1}`);
        return { strategy: i + 1 };
      }
    } catch { /* continue */ }
  }

  // Strategy 2: Dump the full accessibility tree (expensive, used for discovery)
  logger.warn('Known AX paths failed. Dumping accessibility tree for manual inspection...');
  try {
    const tree = await runAppleScript(
      `tell application "System Events" to tell process "${config.cursor.appName}" to return entire contents of window 1`
    );
    logger.debug('AX tree (first 2000 chars):', tree.substring(0, 2000));
  } catch (err) {
    logger.error('Could not dump AX tree:', err.message);
  }

  throw new Error(
    'Could not discover Cursor chat input. ' +
    'Check the AX tree output in DEBUG logs and update injector.js paths accordingly.'
  );
}

/**
 * Primary injection: set text area value + press Return.
 * @param {string} message
 * @param {number} strategy - which AX path to use (1-based)
 */
async function injectViaAXTextArea(message, strategy = 1) {
  const paths = {
    1: `text area 1 of group 1 of group 1 of window 1`,
    2: `text area 1 of scroll area 1 of group 1 of window 1`,
  };
  const elementPath = paths[strategy] || paths[1];
  const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const script = `
    tell application "System Events"
      tell process "${config.cursor.appName}"
        set theInput to ${elementPath}
        set focused of theInput to true
        delay 0.2
        set value of theInput to "${escaped}"
        delay 0.1
        key code 36
      end tell
    end tell
  `;
  await runAppleScript(script);
}

/**
 * Fallback injection: use clipboard + Cmd+V
 * @param {string} message
 */
async function injectViaClipboard(message) {
  const { execSync } = require('child_process');
  // Write to clipboard
  execSync(`echo ${JSON.stringify(message)} | pbcopy`);

  const script = `
    tell application "System Events"
      tell process "${config.cursor.appName}"
        keystroke "v" using command down
        delay 0.3
        key code 36
      end tell
    end tell
  `;
  await runAppleScript(script);
}

/**
 * Main export: inject a message into Cursor's chat.
 * Tries multiple strategies with fallback.
 * @param {string} message
 */
async function injectMessage(message) {
  if (!message || !message.trim()) throw new Error('Cannot inject empty message');

  const running = await isCursorRunning();
  if (!running) throw new Error('Cursor is not running');

  await focusCursor();

  // Try primary strategy
  let strategy = cachedInputPath?.strategy || 1;
  let attempts = 0;

  while (attempts < 3) {
    try {
      await injectViaAXTextArea(message, strategy);
      cachedInputPath = { strategy };
      logger.info(`Message injected via AX strategy ${strategy}`);
      return { success: true, strategy };
    } catch (err) {
      logger.warn(`AX injection strategy ${strategy} failed: ${err.message}`);
      attempts++;
      strategy = strategy + 1;

      if (strategy > 2) {
        // Last resort: clipboard
        try {
          logger.warn('Falling back to clipboard injection...');
          await injectViaClipboard(message);
          cachedInputPath = null; // reset so we rediscover next time
          return { success: true, strategy: 'clipboard' };
        } catch (clipErr) {
          throw new Error(`All injection strategies failed. Last error: ${clipErr.message}`);
        }
      }
    }
  }
}

// Allow running directly for testing: node src/cursor/injector.js "hello world"
if (require.main === module) {
  const msg = process.argv[2] || 'Hello from Cursor Telegram Bridge!';
  injectMessage(msg)
    .then(r => { console.log('Injected:', r); process.exit(0); })
    .catch(e => { console.error('Failed:', e.message); process.exit(1); });
}

module.exports = { injectMessage, isCursorRunning, focusCursor, discoverChatInput };
