/**
 * Deterministic test for Strategy B (file watcher) without Cursor.
 * Run: node tests/test-capture-unit.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `cursor-bridge-capture-test-${Date.now()}.txt`);

const { waitForResponse, BRIDGE_START, BRIDGE_END, newBlocksAfter, endIndexAfterLastClosedBlock } = require('../src/cursor/responseCapture');

function assert(name, cond) {
  if (!cond) {
    console.error(`❌ ${name}`);
    process.exit(1);
  }
  console.log(`✅ ${name}`);
}

async function main() {
  console.log('─'.repeat(50));
  console.log('Response capture — file strategy unit test');
  console.log('─'.repeat(50));

  // Parsers
  const sample = `noise\n${BRIDGE_START}\nhello\n${BRIDGE_END}\n`;
  assert('newBlocksAfter finds block after anchor', newBlocksAfter(sample, 0).join('') === 'hello');
  assert('endIndexAfterLastClosedBlock', endIndexAfterLastClosedBlock(sample) > 0);

  fs.writeFileSync(tmp, 'old\n', 'utf8');

  const append = `${BRIDGE_START}\nLine one.\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n${BRIDGE_END}\n`;

  setTimeout(() => {
    fs.appendFileSync(tmp, append, 'utf8');
  }, 400);

  const result = await waitForResponse({ timeoutMs: 8000, outputWatchFile: tmp });

  assert('strategy is file', result.strategy === 'file');
  assert('preserves code fence', result.text.includes('```'));
  assert('multi-line body', result.text.includes('Line one'));

  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  console.log('\n🟢 test-capture-unit PASSED');
}

main().catch((err) => {
  console.error('❌ FAILED:', err.message);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
