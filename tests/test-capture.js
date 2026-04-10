/**
 * tests/test-capture.js
 *
 * Manual test: wait for and capture a Cursor response.
 * Run this, then manually send a message in Cursor and watch the capture happen.
 *
 * Run with: node tests/test-capture.js
 */

require('dotenv').config();

const { waitForResponse } = require('../src/cursor/responseCapture');

async function main() {
  console.log('─'.repeat(60));
  console.log('Cursor Telegram Bridge — Response Capture Test');
  console.log('─'.repeat(60));

  console.log('\nWaiting for a Cursor response (30s timeout)...');
  console.log('→ Send a message in Cursor manually now.\n');

  try {
    const result = await waitForResponse({ timeoutMs: 30000 });
    console.log(`\n✅ Response captured via strategy: [${result.strategy}]`);
    console.log('─'.repeat(40));
    console.log(result.text);
    console.log('─'.repeat(40));
    console.log(`\nLength: ${result.text.length} chars`);
  } catch (err) {
    console.error('❌ Capture failed:', err.message);
    console.log('\nTroubleshooting:');
    console.log('  - Ensure the .cursor/rules/telegram-bridge.mdc rule is in your project');
    console.log('  - Check that /tmp/cursor-bridge-output.txt is writable');
    console.log('  - Strategy B (clipboard) requires the response to be copied');
    console.log('  - Run with LOG_LEVEL=DEBUG for more info');
    process.exit(1);
  }
}

main().catch(console.error);
