/**
 * cursor/modeSwitch.js
 *
 * Switches Cursor's AI mode (Ask / Agent / Plan / Debug).
 *
 * Cursor has two levels of mode:
 *   Level 1 — Top mode:   "Ask" | "Agent"  (shown in chat input toolbar)
 *   Level 2 — Sub-mode:   "Plan" | "Debug" (only available in Agent mode)
 *
 * Implementation approach:
 *   1. Try AppleScript accessibility — find the mode button by AXTitle/AXDescription
 *   2. If not found, fall back to keyboard shortcuts (if known)
 */

const { execFile } = require('child_process');
const logger = require('../utils/logger');
const { config } = require('../utils/config');
const { focusCursor } = require('./injector');

// Known Cursor mode keyboard shortcuts (verify against your Cursor version)
const MODE_SHORTCUTS = {
  ask:   { key: '1', modifiers: ['command', 'shift'] },  // ⌘⇧1 — placeholder
  agent: { key: '2', modifiers: ['command', 'shift'] },  // ⌘⇧2 — placeholder
  plan:  null,  // Sub-mode, accessed via dropdown
  debug: null,  // Sub-mode, accessed via dropdown
};

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/**
 * Click a UI element in Cursor whose AXTitle or AXDescription contains the given text.
 * @param {string} labelText - text to match (case-insensitive partial)
 */
async function clickElementByLabel(labelText) {
  const script = `
    tell application "System Events"
      tell process "${config.cursor.appName}"
        -- Try to find any button/radio whose description matches
        set allButtons to every button of window 1
        repeat with btn in allButtons
          try
            set t to description of btn
            if t contains "${labelText}" then
              click btn
              return "clicked:" & t
            end if
          end try
        end repeat
        -- Try radio buttons (mode selector is often a segmented control)
        set allRadios to every radio button of window 1
        repeat with rb in allRadios
          try
            set t to (value of attribute "AXTitle" of rb) as string
            if t contains "${labelText}" then
              click rb
              return "clicked:" & t
            end if
          end try
        end repeat
        return "not-found"
      end tell
    end tell
  `;
  return runAppleScript(script);
}

/**
 * Try to click the mode using keyboard shortcut (if known).
 */
async function switchViaKeyboard(mode) {
  const shortcut = MODE_SHORTCUTS[mode.toLowerCase()];
  if (!shortcut) return false;

  const modsStr = shortcut.modifiers.map(m => `${m} down`).join(', ');
  const script = `
    tell application "System Events"
      tell process "${config.cursor.appName}"
        keystroke "${shortcut.key}" using {${modsStr}}
      end tell
    end tell
  `;
  try {
    await runAppleScript(script);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main export: switch Cursor to the given mode.
 * @param {string} mode — 'ask' | 'agent' | 'plan' | 'debug'
 * @returns {{ success: boolean, mode: string, method: string }}
 */
async function switchMode(mode) {
  const normalizedMode = mode.toLowerCase().trim();
  const validModes = ['ask', 'agent', 'plan', 'debug'];

  if (!validModes.includes(normalizedMode)) {
    throw new Error(`Invalid mode "${mode}". Valid modes: ${validModes.join(', ')}`);
  }

  await focusCursor();

  // Strategy 1: AX label click
  // Cursor's mode buttons are labelled "Ask", "Agent" in the toolbar
  // "Plan" and "Debug" are sub-modes within the Agent dropdown
  const labelMap = { ask: 'Ask', agent: 'Agent', plan: 'Plan', debug: 'Debug' };
  const label = labelMap[normalizedMode];

  try {
    const result = await clickElementByLabel(label);
    if (result.startsWith('clicked:')) {
      logger.info(`Mode switched to "${normalizedMode}" via AX click`);
      return { success: true, mode: normalizedMode, method: 'ax-click' };
    }
  } catch (err) {
    logger.warn(`AX click failed for mode "${normalizedMode}": ${err.message}`);
  }

  // Strategy 2: Keyboard shortcut
  const kbSuccess = await switchViaKeyboard(normalizedMode);
  if (kbSuccess) {
    logger.info(`Mode switched to "${normalizedMode}" via keyboard shortcut`);
    return { success: true, mode: normalizedMode, method: 'keyboard' };
  }

  // Strategy 3: Inject @-command into chat (some modes accept slash/at commands)
  // e.g. typing "/plan" or "@plan" in the chat input
  logger.warn(`Could not switch to mode "${normalizedMode}" via automation. ` +
    'The mode button AX path may have changed. Check Cursor version and update modeSwitch.js.');

  return {
    success: false,
    mode: normalizedMode,
    method: 'none',
    hint: `Please switch to ${label} mode manually in Cursor, or update the AX paths in modeSwitch.js`
  };
}

/**
 * Try to detect the currently active mode by inspecting Cursor's UI.
 * Returns the mode string or 'unknown'.
 */
function normalizeModeFromDescription(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('plan')) return 'plan';
  if (lower.includes('debug')) return 'debug';
  if (lower.includes('agent')) return 'agent';
  if (lower.includes('ask')) return 'ask';
  return 'unknown';
}

async function detectCurrentMode() {
  try {
    const script = `
      tell application "System Events"
        tell process "${config.cursor.appName}"
          set allButtons to every button of window 1
          repeat with btn in allButtons
            try
              set isSelected to value of attribute "AXValue" of btn
              if isSelected = 1 then
                return description of btn
              end if
            end try
          end repeat
          repeat with btn in allButtons
            try
              set d to description of btn as string
              if d contains "Agent" or d contains "Ask" or d contains "Plan" or d contains "Debug" then
                set sel to value of attribute "AXSelected" of btn
                if sel is true then return d
              end if
            end try
          end repeat
          set allRadios to every radio button of window 1
          repeat with rb in allRadios
            try
              set sel to value of attribute "AXSelected" of rb
              if sel is true then
                set d to value of attribute "AXTitle" of rb as string
                return d
              end if
            end try
          end repeat
          return "unknown"
        end tell
      end tell
    `;
    const result = await runAppleScript(script);
    const m = normalizeModeFromDescription(result);
    if (m !== 'unknown') return m;
  } catch {
    /* try fallback below */
  }
  try {
    const script = `
      tell application "System Events"
        tell process "${config.cursor.appName}"
          set allTexts to every static text of window 1
          repeat with t in allTexts
            try
              set v to value of t as string
              if v is "Ask" or v is "Agent" or v is "Plan" or v is "Debug" then
                return v
              end if
            end try
          end repeat
          return "unknown"
        end tell
      end tell
    `;
    const result = await runAppleScript(script);
    return normalizeModeFromDescription(result);
  } catch {
    return 'unknown';
  }
}

// Test runner
if (require.main === module) {
  const mode = process.argv[2] || 'ask';
  switchMode(mode)
    .then(r => { console.log('Result:', r); process.exit(0); })
    .catch(e => { console.error('Failed:', e.message); process.exit(1); });
}

module.exports = { switchMode, detectCurrentMode };
