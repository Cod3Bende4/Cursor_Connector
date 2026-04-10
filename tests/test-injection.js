/**
 * tests/test-injection.js
 *
 * Manual test: inject a message into Cursor chat.
 * Run with: node tests/test-injection.js "your message here"
 *
 * Prerequisites:
 *   - Cursor must be open with a project loaded
 *   - Terminal must have Accessibility permission in macOS
 */

require('dotenv').config();

const { injectMessage, isCursorRunning, discoverChatInput } = require('../src/cursor/injector');

async function main() {
  const message = process.argv[2] || 'Hello! This is a test from the Cursor Telegram Bridge. Please respond briefly.';

  console.log('─'.repeat(60));
  console.log('Cursor Telegram Bridge — Injection Test');
  console.log('─'.repeat(60));

  // Check Cursor is running
  console.log('\n1. Checking if Cursor is running...');
  const running = await isCursorRunning();
  if (!running) {
    console.error('❌ Cursor is not running. Open Cursor and try again.');
    process.exit(1);
  }
  console.log('✅ Cursor is running');

  // Discover chat input
  console.log('\n2. Discovering chat input element...');
  try {
    const path = await discoverChatInput();
    console.log('✅ Chat input found:', path);
  } catch (err) {
    console.warn('⚠️  Discovery failed (will try all strategies on inject):', err.message);
  }

  // Inject
  console.log(`\n3. Injecting message: "${message}"`);
  console.log('   → Watch Cursor — the message should appear in the chat input and submit.');
  try {
    const result = await injectMessage(message);
    console.log('✅ Injected successfully via strategy:', result.strategy);
  } catch (err) {
    console.error('❌ Injection failed:', err.message);
    console.log('\nTroubleshooting:');
    console.log('  - Ensure Terminal has Accessibility access in System Settings → Privacy');
    console.log('  - Make sure Cursor\'s chat panel is open (Cmd+L)');
    console.log('  - Try running with LOG_LEVEL=DEBUG for more info');
    process.exit(1);
  }

  console.log('\n─'.repeat(60));
  console.log('Test complete. Check Cursor to verify the message was submitted.');
}

main().catch(console.error);
