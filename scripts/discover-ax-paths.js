/**
 * scripts/discover-ax-paths.js
 *
 * Dumps the macOS accessibility tree for Cursor to help you find the correct
 * element paths for your version of Cursor.
 *
 * Run with: node scripts/discover-ax-paths.js
 * Then look for text areas, buttons labeled "Ask"/"Agent"/"Plan"/"Debug", etc.
 */

require('dotenv').config();
const { execFile } = require('child_process');
const { config } = require('../src/utils/config');

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function main() {
  console.log('─'.repeat(60));
  console.log('Cursor AX Path Discovery Tool');
  console.log('─'.repeat(60));
  console.log('Make sure Cursor is open with the chat panel visible.\n');

  // 1. List all top-level groups
  console.log('1. Checking window structure...');
  try {
    const groups = await runAppleScript(`
      tell application "System Events"
        tell process "${config.cursor.appName}"
          return count of groups of window 1
        end tell
      end tell
    `);
    console.log(`   Top-level groups in window 1: ${groups}`);
  } catch (err) {
    console.error('   Failed:', err.message);
  }

  // 2. Find all text areas
  console.log('\n2. Finding text areas...');
  try {
    const script = `
      tell application "System Events"
        tell process "${config.cursor.appName}"
          set result to {}
          set allTAs to every text area of window 1
          repeat with i from 1 to count of allTAs
            set ta to item i of allTAs
            try
              set taVal to (value of ta) as string
              set end of result to "TextArea[" & i & "]: role=" & role of ta & ", value(50)=" & text 1 thru (min(50, length of taVal)) of taVal
            on error
              set end of result to "TextArea[" & i & "]: (unreadable)"
            end try
          end repeat
          return result as string
        end tell
      end tell
    `;
    const result = await runAppleScript(script);
    console.log('   ' + result.replace(/,/g, '\n   '));
  } catch (err) {
    console.log('   (none found or error:', err.message + ')');
  }

  // 3. Find buttons that could be mode buttons
  console.log('\n3. Finding buttons (looking for Ask/Agent/Plan/Debug)...');
  try {
    const script = `
      tell application "System Events"
        tell process "${config.cursor.appName}"
          set result to {}
          set allBtns to every button of window 1
          repeat with i from 1 to count of allBtns
            set btn to item i of allBtns
            try
              set btnDesc to description of btn
              if btnDesc contains "Ask" or btnDesc contains "Agent" or btnDesc contains "Plan" or btnDesc contains "Debug" or btnDesc contains "Mode" then
                set end of result to "Button[" & i & "]: " & btnDesc
              end if
            end try
          end repeat
          if (count of result) = 0 then return "none found"
          return result as string
        end tell
      end tell
    `;
    const result = await runAppleScript(script);
    console.log('   ' + result.replace(/,/g, '\n   '));
  } catch (err) {
    console.log('   (error:', err.message + ')');
  }

  // 4. Full dump (verbose — shows structure)
  console.log('\n4. Dumping first 3000 chars of full AX tree...');
  try {
    const dump = await runAppleScript(`
      tell application "System Events"
        tell process "${config.cursor.appName}"
          return entire contents of window 1
        end tell
      end tell
    `);
    console.log(dump.substring(0, 3000));
    if (dump.length > 3000) {
      console.log(`\n   ... (${dump.length - 3000} more chars truncated)`);
      console.log('   Saving full dump to /tmp/cursor-ax-dump.txt...');
      require('fs').writeFileSync('/tmp/cursor-ax-dump.txt', dump);
      console.log('   Saved. Open /tmp/cursor-ax-dump.txt to inspect.');
    }
  } catch (err) {
    console.log('   (error:', err.message + ')');
  }

  console.log('\n─'.repeat(60));
  console.log('Use the above to update the AX paths in:');
  console.log('  src/cursor/injector.js   → injectViaAXTextArea()');
  console.log('  src/cursor/modeSwitch.js → clickElementByLabel()');
}

main().catch(console.error);
