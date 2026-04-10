/**
 * While waiting for Cursor's reply, periodically edit the "thinking" Telegram message
 * with elapsed time, detected mode, context heuristic, and (when AX works) a short
 * preview of the last chat text — the closest we get to "what the agent is doing"
 * without a Cursor API.
 */

const logger = require('../utils/logger');
const { config } = require('../utils/config');
const { detectCurrentMode } = require('../cursor/modeSwitch');
const { readLastAIMessageFromAX } = require('../cursor/responseCapture');
const { monitor } = require('../monitor/contextMonitor');
const { buildContextDisplay } = require('./formatter');

const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

/**
 * @param {{ bot: import('node-telegram-bot-api'), chatId: string|number, messageId?: number }} opts
 * @returns {{ start: () => void, stop: () => void }}
 */
function createProgressTicker(opts) {
  const { bot, chatId, messageId } = opts;
  const intervalMs = Math.max(
    2000,
    config.progress?.updateIntervalMs || 3500
  );

  if (!messageId) {
    return { start() {}, stop() {} };
  }

  let timer = null;
  let stopped = false;
  const t0 = Date.now();

  async function tick() {
    if (stopped) return;

    const secs = Math.floor((Date.now() - t0) / 1000);
    let modeLabel = '—';
    try {
      const m = await detectCurrentMode();
      if (m && m !== 'unknown') modeLabel = m;
    } catch {
      /* ignore */
    }

    const state = monitor.getState();
    const { progressShort } = buildContextDisplay(state);

    let snippet = '';
    try {
      const ax = await readLastAIMessageFromAX();
      if (ax && ax.trim().length > 20) {
        snippet = ax.trim().replace(/\s+/g, ' ');
        if (snippet.length > 220) {
          snippet = snippet.slice(-220);
        }
        snippet = snippet.replace(CTRL, '');
      }
    } catch {
      /* AX often empty for Electron */
    }

    let text = `⏳ Cursor agent… ${secs}s\nMode: ${modeLabel} · ${progressShort}`;
    if (snippet) {
      text += `\n\n…${snippet}`;
    }
    if (text.length > 3900) {
      text = `${text.slice(0, 3890)}…`;
    }

    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (err) {
      const msg = err.message || String(err);
      if (!msg.includes('message is not modified')) {
        logger.debug('Progress tick edit failed:', msg);
      }
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        tick().catch(() => {});
      }, intervalMs);
      setImmediate(() => tick().catch(() => {}));
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

module.exports = { createProgressTicker };
