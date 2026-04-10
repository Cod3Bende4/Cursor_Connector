/**
 * Switch the AI model in Cursor using the model picker (Cmd+/ on macOS).
 * User types a search string to filter the list; Enter confirms.
 */

const { execSync } = require('child_process');
const logger = require('../utils/logger');
const { config } = require('../utils/config');
const { focusCursor } = require('./injector');
const { sleep, runAppleScript } = require('./applescriptUtil');

/**
 * Open model dropdown and select by filter string (paste + Enter).
 * @param {string} searchQuery - substring that uniquely matches one model in the list
 */
async function switchModelBySearch(searchQuery) {
  if (!searchQuery || !String(searchQuery).trim()) {
    throw new Error('Model search string is required');
  }
  const q = String(searchQuery).trim();

  await focusCursor();
  await sleep(200);

  const openPicker = config.models?.openPickerShortcut || 'slash';
  if (openPicker === 'slash') {
    await runAppleScript(`
      tell application "System Events"
        tell process "${config.cursor.appName}"
          keystroke "/" using command down
        end tell
      end tell
    `);
  } else {
    throw new Error(`Unknown MODEL_PICKER_OPEN value: ${openPicker}`);
  }

  await sleep(550);

  try {
    execSync(`printf '%s' ${JSON.stringify(q)} | pbcopy`, { stdio: 'ignore' });
  } catch (e) {
    throw new Error(`pbcopy failed: ${e.message}`);
  }

  await runAppleScript(`
    tell application "System Events"
      tell process "${config.cursor.appName}"
        keystroke "a" using command down
        keystroke "v" using command down
      end tell
    end tell
  `);
  await sleep(280);
  await runAppleScript(`
    tell application "System Events"
      tell process "${config.cursor.appName}"
        key code 36
      end tell
    end tell
  `);

  logger.info(`Model picker: searched for "${q}"`);
  return { success: true, search: q };
}

module.exports = { switchModelBySearch };
