/**
 * telegram/formatter.js
 *
 * Formats Cursor responses for Telegram's MarkdownV2 parse mode.
 * Handles: code blocks, inline code, bold, links, and character escaping.
 * Also splits long messages into chunks within Telegram's 4096-char limit.
 */

const MAX_LENGTH = 4096;

/**
 * Escape special MarkdownV2 characters outside of code blocks.
 */
function escapeMarkdownV2(text) {
  // Characters that must be escaped in MarkdownV2
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Convert a plain text Cursor response to Telegram MarkdownV2.
 *
 * Preserves:
 *  - ``` code blocks ``` (with language hint)
 *  - `inline code`
 *  - **bold** → *bold*
 *  - Numbered lists, bullet lists (left as-is, escaped)
 *
 * @param {string} text
 * @returns {string}
 */
function formatResponse(text) {
  if (!text) return '_(empty response)_';

  // Process line by line to handle code blocks correctly
  const lines = text.split('\n');
  const output = [];
  let inCodeBlock = false;
  let codeLang = '';

  for (const line of lines) {
    if (!inCodeBlock && line.startsWith('```')) {
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      output.push('```' + codeLang);
      continue;
    }

    if (inCodeBlock) {
      if (line.startsWith('```')) {
        inCodeBlock = false;
        output.push('```');
      } else {
        // Inside code block — no escaping needed
        output.push(line);
      }
      continue;
    }

    // Outside code block — escape and convert markdown
    let processed = escapeMarkdownV2(line)
      // Bold: **text** → *text*
      .replace(/\\\*\\\*(.+?)\\\*\\\*/g, '*$1*')
      // Inline code: `text` (re-add backticks escaped by escapeMarkdownV2)
      .replace(/\\`(.+?)\\`/g, '`$1`');

    output.push(processed);
  }

  return output.join('\n');
}

/**
 * Split a message into chunks of at most MAX_LENGTH characters.
 * Tries to split at newlines to avoid cutting mid-word.
 * @param {string} text
 * @returns {string[]}
 */
function splitMessage(text) {
  if (text.length <= MAX_LENGTH) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > MAX_LENGTH) {
    // Find a good split point (last newline before the limit)
    let splitAt = remaining.lastIndexOf('\n', MAX_LENGTH);
    if (splitAt < MAX_LENGTH * 0.5) splitAt = MAX_LENGTH; // no good newline, hard cut

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Build the status widget message.
 * @param {{ mode, contextPercent, project }} state
 * @returns {string}
 */
function formatStatusWidget(state) {
  const modeEmojis = {
    ask:   '💬 Ask',
    agent: '🤖 Agent',
    plan:  '📋 Plan',
    debug: '🐛 Debug',
    unknown: '❓ Unknown',
  };

  const mode = modeEmojis[state.mode] || modeEmojis.unknown;
  const ctx = state.contextPercent || 0;

  // Build context bar (10 chars)
  const filled = Math.round(ctx / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  const project = state.project
    ? `${state.project.emoji || '📁'} ${state.project.displayName || state.project.name}`
    : '📁 None';

  const skill = state.pendingSkill
    ? `\n🎯 Next skill: ${state.pendingSkill.emoji} ${state.pendingSkill.name}`
    : '';

  const ts = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return [
    '🖥️ *Cursor Bridge — ACTIVE*',
    '',
    `${project}`,
    `⚙️ Mode: ${mode}`,
    `🧠 Context: ${bar} ${ctx}%`,
    skill,
    '',
    `_Last sync: ${ts}_`,
  ].filter(l => l !== undefined).join('\n');
}

/**
 * Format an error message for Telegram.
 */
function formatError(message) {
  return `⚠️ *Error*\n\n${escapeMarkdownV2(message)}`;
}

module.exports = {
  formatResponse,
  splitMessage,
  formatStatusWidget,
  formatError,
  escapeMarkdownV2,
};
