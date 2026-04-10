/**
 * Open a new AI chat in Cursor via the Command Palette.
 *
 * Uses the command id (e.g. aichat.newchataction) pasted into the palette — fuzzy
 * text like "New Chat" often selects the wrong row (New File, New Window, …).
 */

const { execSync } = require('child_process');
const logger = require('../utils/logger');
const { config } = require('../utils/config');
const { focusCursor, focusCursorChat } = require('./injector');
const { sleep, runAppleScript } = require('./applescriptUtil');

const proc = () => config.cursor.appName;

/**
 * Open Command Palette, paste `query` from clipboard, press Enter.
 * More reliable than keystroke() for ids like aichat.newchataction
 */
async function runCommandPalette(query) {
  await focusCursor();
  await sleep(350);
  await runAppleScript(`
    tell application "System Events"
      tell process "${proc()}"
        keystroke "p" using {command down, shift down}
      end tell
    end tell
  `);
  await sleep(900);

  try {
    execSync(`printf '%s' ${JSON.stringify(query)} | pbcopy`, { stdio: 'ignore' });
  } catch (e) {
    throw new Error(`pbcopy failed: ${e.message}`);
  }

  await runAppleScript(`
    tell application "System Events"
      tell process "${proc()}"
        keystroke "a" using command down
        keystroke "v" using command down
      end tell
    end tell
  `);
  await sleep(750);
  await runAppleScript(`
    tell application "System Events"
      tell process "${proc()}"
        key code 36
      end tell
    end tell
  `);
}

/**
 * Optional: Cmd+L first so the AI side panel is focused before running the command.
 */
async function openNewAgentChat() {
  const q = config.chat?.newChatPaletteQuery || 'aichat.newchataction';
  const focusFirst = config.chat?.focusChatFirst !== false;

  if (focusFirst) {
    try {
      await focusCursorChat();
      await sleep(450);
    } catch (e) {
      logger.warn('focusCursorChat before new chat:', e.message);
    }
  }

  const alternates = (config.chat?.newChatPaletteAlternates || [])
    .map((s) => String(s).trim())
    .filter(Boolean);

  const tries = [q, ...alternates];
  let lastErr = null;
  for (let i = 0; i < tries.length; i++) {
    const query = tries[i];
    try {
      await runCommandPalette(query);
      logger.info(`New chat: command palette "${query}" (${i + 1}/${tries.length})`);
      return { success: true, method: 'command-palette', query };
    } catch (err) {
      lastErr = err;
      logger.warn(`New chat attempt "${query}" failed:`, err.message);
      if (i < tries.length - 1) await sleep(600);
    }
  }
  throw lastErr || new Error('Could not run new chat command');
}

module.exports = { openNewAgentChat, runCommandPalette };
