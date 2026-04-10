/**
 * cursor/injector.js  — v2 (Electron/web-view safe)
 *
 * Cursor is an Electron app. Its chat input lives inside a Chromium web view
 * and is INVISIBLE to AppleScript's AX element tree. Standard text area /
 * scroll area paths will always return "Invalid index (-1719)".
 *
 * Reliable approach for Electron:
 *   1. Focus Cursor via osascript  (app-level — always works)
 *   2. Open/focus chat panel with Cmd+L
 *   3. Write message to clipboard (pbcopy)
 *   4. Cmd+V to paste into the focused chat input
 *   5. Return to submit
 */

const { execFile, execSync } = require('child_process');
const logger = require('../utils/logger');
const { config } = require('../utils/config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
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
  await sleep(400);
}

/**
 * Bring Cursor to front AND ensure the chat input is focused.
 * Cmd+L in Cursor opens/focuses the AI chat panel.
 */
async function focusCursorChat() {
  await runAppleScript(`tell application "${config.cursor.appName}" to activate`);
  await sleep(500);

  await runAppleScript(`
    tell application "System Events"
      tell process "${config.cursor.appName}"
        keystroke "l" using command down
      end tell
    end tell
  `);
  await sleep(700); // give the panel time to open and focus
}

/**
 * PRIMARY injection: clipboard paste.
 * Write to pbcopy, then Cmd+V into the focused Cursor chat input.
 * This bypasses the web-view AX limitation entirely.
 */
async function injectViaClipboard(message) {
  // printf avoids the trailing newline that echo adds
  execSync(`printf '%s' ${JSON.stringify(message)} | pbcopy`);
  await sleep(150);

  await runAppleScript(`
    tell application "${config.cursor.appName}"
      activate
    end tell
    delay 0.5
    tell application "System Events"
      tell process "${config.cursor.appName}"
        keystroke "v" using command down
        delay 0.4
        key code 36
      end tell
    end tell
  `);
}

/**
 * FALLBACK injection: character-by-character keystroke.
 * Only safe for short ASCII messages — used if clipboard write fails.
 */
async function injectViaKeystroke(message) {
  const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  await runAppleScript(`
    tell application "System Events"
      tell process "${config.cursor.appName}"
        keystroke "${escaped}"
        delay 0.2
        key code 36
      end tell
    end tell
  `);
}

/**
 * Main export: inject a message into Cursor's chat.
 * @param {string} message
 * @returns {Promise<{ success: boolean, strategy: string }>}
 */
async function injectMessage(message) {
  if (!message || !message.trim()) throw new Error('Cannot inject empty message');

  const running = await isCursorRunning();
  if (!running) throw new Error('Cursor is not running');

  // Focus Cursor and open/focus the chat panel
  await focusCursorChat();

  // Primary: clipboard (works for all lengths, all characters)
  try {
    await injectViaClipboard(message);
    logger.info(`Injected via clipboard (${message.length} chars)`);
    return { success: true, strategy: 'clipboard' };
  } catch (err) {
    logger.warn(`Clipboard injection failed: ${err.message}`);
  }

  // Fallback: keystroke (ASCII only, short messages)
  if (message.length < 200 && !/[^\x00-\x7F]/.test(message)) {
    try {
      await injectViaKeystroke(message);
      logger.info('Injected via keystroke fallback');
      return { success: true, strategy: 'keystroke' };
    } catch (err) {
      logger.warn(`Keystroke injection failed: ${err.message}`);
    }
  }

  throw new Error(
    'All injection strategies failed.\n' +
    'Check: System Settings → Privacy → Accessibility → enable your terminal app.'
  );
}

/**
 * Stub — Cursor uses a web-view input, AX discovery is not applicable.
 */
async function discoverChatInput() {
  logger.warn('Cursor uses a Chromium web-view input — AX element discovery does not apply.');
  return { strategy: 'clipboard' };
}

// CLI test: node src/cursor/injector.js "your message"
if (require.main === module) {
  require('dotenv').config();
  const msg = process.argv[2] || 'Hello from Cursor Telegram Bridge!';
  injectMessage(msg)
    .then(r => { console.log('✅ Injected:', r); process.exit(0); })
    .catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
}

module.exports = { injectMessage, isCursorRunning, focusCursor, discoverChatInput };