/**
 * tests/test-bot.js
 *
 * End-to-end round-trip test without Telegram.
 * Injects a message into Cursor and captures the response.
 *
 * Run with: node tests/test-bot.js "your message"
 */

require('dotenv').config();

const { injectMessage, isCursorRunning } = require('../src/cursor/injector');
const { waitForResponse } = require('../src/cursor/responseCapture');

async function main() {
  const message = process.argv[2] || 'Say exactly: "Bridge test successful." and nothing else.';

  console.log('─'.repeat(60));
  console.log('Cursor Telegram Bridge — End-to-End Test');
  console.log('─'.repeat(60));

  const running = await isCursorRunning();
  if (!running) {
    console.error('❌ Cursor is not running.');
    process.exit(1);
  }

  console.log(`\nMessage: "${message}"`);
  console.log('\n1. Injecting...');
  await injectMessage(message);
  console.log('✅ Injected');

  console.log('\n2. Waiting for response (max 60s)...');
  const t0 = Date.now();
  const result = await waitForResponse({ timeoutMs: 60000 });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n✅ Response in ${elapsed}s via [${result.strategy}]:`);
  console.log('─'.repeat(40));
  console.log(result.text);
  console.log('─'.repeat(40));
  console.log('\n🟢 Round-trip test PASSED');
}

main().catch(err => {
  console.error('❌ Test FAILED:', err.message);
  process.exit(1);
});
