/**
 * telegram/formatter.js
 *
 * Formats Cursor responses for Telegram: **HTML** parse mode for AI replies (reliable),
 * MarkdownV2 for the pinned status widget (short, controlled text).
 */

const MAX_LENGTH = 4096;

/** Telegram HTML: escape text outside tags. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * Escape special MarkdownV2 characters outside of code blocks.
 */
function escapeMarkdownV2(text) {
  // Characters that must be escaped in MarkdownV2
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * One line of prose: markdown-like tokens → Telegram-safe HTML.
 */
function formatMarkdownLineHtml(line) {
  if (line === '') return '';
  const re = /(\[[^\]]+\]\([^)]+\))|(`[^`]+`)|(\*\*.+?\*\*)/g;
  const parts = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIndex) {
      parts.push(escapeHtml(line.slice(lastIndex, m.index)));
    }
    const full = m[0];
    if (full.startsWith('[')) {
      const im = full.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (im) {
        const href = escapeHtmlAttr(im[2]);
        parts.push(`<a href="${href}">${escapeHtml(im[1])}</a>`);
      } else {
        parts.push(escapeHtml(full));
      }
    } else if (full.startsWith('`')) {
      parts.push(`<code>${escapeHtml(full.slice(1, -1))}</code>`);
    } else if (full.startsWith('**')) {
      parts.push(`<b>${escapeHtml(full.slice(2, -2))}</b>`);
    } else {
      parts.push(escapeHtml(full));
    }
    lastIndex = m.index + full.length;
  }
  if (lastIndex < line.length) {
    parts.push(escapeHtml(line.slice(lastIndex)));
  }
  return parts.join('');
}

/**
 * Convert a Cursor reply to Telegram **HTML** (parse_mode HTML).
 * More reliable than MarkdownV2 (fewer API rejects → no silent plain-text fallback).
 */
function formatResponseHtml(text) {
  if (!text) return '<i>(empty response)</i>';

  const lines = text.split('\n');
  const output = [];
  let inCodeBlock = false;
  let codeLines = [];

  for (const line of lines) {
    const openFence = line.match(/^(\s*)```(.*)$/);

    if (!inCodeBlock && openFence) {
      inCodeBlock = true;
      codeLines = [];
      continue;
    }

    if (inCodeBlock) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = false;
        const body = codeLines.join('\n');
        output.push(`<pre>${escapeHtml(body)}</pre>`);
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    output.push(formatMarkdownLineHtml(line));
  }

  if (inCodeBlock && codeLines.length) {
    output.push(`<pre>${escapeHtml(codeLines.join('\n'))}</pre>`);
  }

  return output.join('\n');
}

/** Alias for older requires / tests */
const formatResponse = formatResponseHtml;

/**
 * Split a message into chunks of at most `maxLen` characters.
 * Tries to split at newlines; avoids splitting inside ``` fences when possible.
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
function splitMessage(text, maxLen = MAX_LENGTH) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;

    const segment = remaining.slice(0, splitAt);
    const fenceCount = (segment.match(/```/g) || []).length;
    if (fenceCount % 2 === 1) {
      const closeIdx = remaining.indexOf('```', splitAt);
      if (closeIdx !== -1) {
        splitAt = Math.min(closeIdx + 3, remaining.length);
      }
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Bridge-side context estimate (not Cursor’s internal token count).
 * Uses contextTokens + assumed window size so small usage is not rounded to 0%.
 */
function buildContextDisplay(state) {
  const tokens = state.contextTokens ?? 0;
  const win = state.contextWindowEstimate ?? 100000;
  const rawPct = win > 0 ? Math.min(100, (tokens / win) * 100) : 0;
  let filled = Math.floor(rawPct / 10);
  if (rawPct > 0 && filled === 0) filled = 1;
  filled = Math.min(10, Math.max(0, filled));
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  let pctLabel;
  if (tokens <= 0) pctLabel = '0%';
  else if (rawPct < 10) pctLabel = `${rawPct.toFixed(1)}%`;
  else pctLabel = `${Math.round(rawPct)}%`;

  const tokLabel =
    tokens >= 1000 ? `~${(tokens / 1000).toFixed(1)}k tok` : `~${Math.round(tokens)} tok`;

  const plain = `Context: ${bar} ${pctLabel} (${tokLabel} bridge est.)`;
  return {
    markdownV2Line: '🧠 ' + escapeMarkdownV2(plain),
    /** Short fragment for progress tick (plain text). */
    progressShort: `${pctLabel} · ${tokLabel}`,
  };
}

/**
 * Build the status widget message.
 * @param {{ mode, contextPercent, project, contextTokens?, contextWindowEstimate? }} state
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
  const { markdownV2Line: contextLine } = buildContextDisplay(state);

  const project = state.project
    ? `${state.project.emoji || '📁'} ${escapeMarkdownV2(state.project.displayName || state.project.name)}`
    : '📁 None';

  const skill = state.pendingSkill
    ? `\n🎯 Next skill: ${state.pendingSkill.emoji} ${escapeMarkdownV2(state.pendingSkill.name)}`
    : '';

  const ts = state.lastUpdated
    ? escapeMarkdownV2(
        new Date(state.lastUpdated).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    : '—';

  return [
    '🖥️ *Cursor Bridge — ACTIVE*',
    '',
    `${project}`,
    `⚙️ Mode: ${mode}`,
    contextLine,
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
  formatResponseHtml,
  splitMessage,
  formatStatusWidget,
  formatError,
  escapeMarkdownV2,
  escapeHtml,
  buildContextDisplay,
};
