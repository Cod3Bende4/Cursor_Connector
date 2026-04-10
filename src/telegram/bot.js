/**
 * telegram/bot.js
 *
 * Main Telegram bot: receives messages → injects into Cursor → returns responses.
 * Also manages the pinned status widget.
 */

const TelegramBot = require('node-telegram-bot-api');
const { config } = require('../utils/config');
const logger = require('../utils/logger');
const { injectMessage, isCursorRunning } = require('../cursor/injector');
const { waitForResponse } = require('../cursor/responseCapture');
const { applyPendingSkill, getPendingSkill } = require('../cursor/skillsManager');
const { monitor } = require('../monitor/contextMonitor');
const { getCurrentProject } = require('../cursor/projectSwitch');
const { registerCommands } = require('./commands');
const { formatResponseHtml, splitMessage, formatStatusWidget } = require('./formatter');
const { createProgressTicker } = require('./progressUpdates');

// Approx tokens per character (rough heuristic)
const CHARS_PER_TOKEN = 4;

/** Raw chunk size before HTML formatting (tags + &amp; expand the payload). */
const TELEGRAM_RAW_CHUNK_LEN = 2400;

// Debounce incoming messages (ms)
const MESSAGE_DEBOUNCE_MS = 1500;

let bot = null;
let statusMessageId = null;
let lastMessageTime = 0;

/**
 * Create and manage the pinned status widget.
 */
function createStatusWidget(chatId) {
  return {
    async init() {
      try {
        const state = monitor.getState();
        const project = getCurrentProject();
        const text = formatStatusWidget({ ...state, project, pendingSkill: getPendingSkill() });
        const msg = await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
        statusMessageId = msg.message_id;
        try {
          await bot.pinChatMessage(chatId, statusMessageId, { disable_notification: true });
        } catch { /* pin may require admin rights in group chats */ }
        logger.info('Status widget initialized');
      } catch (err) {
        logger.warn('Could not init status widget:', err.message);
      }
    },

    async update() {
      if (!statusMessageId) return;
      try {
        const state = monitor.getState();
        const project = getCurrentProject();
        const text = formatStatusWidget({ ...state, project, pendingSkill: getPendingSkill() });
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: statusMessageId,
          parse_mode: 'MarkdownV2',
        });
      } catch (err) {
        if (!err.message.includes('message is not modified')) {
          logger.debug('Status widget update error:', err.message);
        }
      }
    },
  };
}

/**
 * Send a long response as multiple messages if needed.
 * Uses Telegram HTML (bold, code, pre, links) — more reliable than MarkdownV2 for AI text.
 */
async function sendLongMessage(chatId, text, replyToId) {
  const rawChunks = splitMessage(text, TELEGRAM_RAW_CHUNK_LEN);
  for (let i = 0; i < rawChunks.length; i++) {
    const opts = i === 0 && replyToId
      ? { reply_to_message_id: replyToId }
      : {};
    const formatted = formatResponseHtml(rawChunks[i]);
    try {
      await bot.sendMessage(chatId, formatted, { parse_mode: 'HTML', ...opts });
    } catch (err) {
      logger.warn('Telegram HTML send failed, plain fallback:', err.message);
      await bot.sendMessage(chatId, rawChunks[i], opts);
    }
  }
}

/**
 * Start the Telegram bot.
 */
async function startBot() {
  const chatId = config.telegram.allowedChatId;

  bot = new TelegramBot(config.telegram.token, { polling: true });

  // Security: ignore all messages from non-allowed chat
  bot.on('message', async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) {
      logger.warn(`Ignored message from unauthorized chat: ${msg.chat.id}`);
      return;
    }
  });

  // Create status widget
  const statusWidget = createStatusWidget(chatId);
  await statusWidget.init();

  // Register commands
  registerCommands(bot, chatId, statusWidget);

  // Subscribe to monitor state changes → update status widget
  monitor.on('change', () => {
    statusWidget.update().catch(() => {});
  });

  // Main message handler (non-command messages → forward to Cursor)
  bot.on('message', async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return; // handled by command handlers

    // Debounce
    const now = Date.now();
    if (now - lastMessageTime < MESSAGE_DEBOUNCE_MS) {
      logger.debug('Message debounced');
      return;
    }
    lastMessageTime = now;

    const userMessage = msg.text.trim();

    // Check Cursor is running
    const running = await isCursorRunning();
    if (!running) {
      await bot.sendMessage(chatId,
        '⚠️ Cursor is not running\\. Start it and try again\\.',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    // Send "thinking" indicator
    let thinkingMsg;
    try {
      thinkingMsg = await bot.sendMessage(chatId, '⏳ Sending to Cursor…');
    } catch (err) {
      logger.error('Could not send thinking indicator:', err.message);
    }

    try {
      // Apply any pending skill prefix
      const messageToSend = applyPendingSkill(userMessage);

      // Inject into Cursor
      await injectMessage(messageToSend);
      logger.info(`Injected message (${messageToSend.length} chars)`);

      // Update thinking indicator
      if (thinkingMsg) {
        await bot.editMessageText('⏳ Waiting for Cursor…', {
          chat_id: chatId,
          message_id: thinkingMsg.message_id,
        });
      }

      // Track approximate tokens sent
      monitor.addTokens(Math.ceil(messageToSend.length / CHARS_PER_TOKEN));

      let progressTicker = null;
      if (thinkingMsg && config.progress?.enabled) {
        progressTicker = createProgressTicker({
          bot,
          chatId,
          messageId: thinkingMsg.message_id,
        });
        progressTicker.start();
      }

      let response;
      try {
        response = await waitForResponse({ timeoutMs: config.capture.timeoutMs });
      } finally {
        if (progressTicker) progressTicker.stop();
      }

      logger.info(`Response captured via [${response.strategy}] (${response.text.length} chars)`);

      // Track approximate tokens received
      monitor.addTokens(Math.ceil(response.text.length / CHARS_PER_TOKEN));

      // Delete thinking indicator
      if (thinkingMsg) {
        try { await bot.deleteMessage(chatId, thinkingMsg.message_id); } catch { /* ignore */ }
      }

      // Send response
      await sendLongMessage(chatId, response.text, msg.message_id);

      // Update status widget
      await statusWidget.update();

    } catch (err) {
      logger.error('Message handling error:', err.message);

      // Delete thinking indicator
      if (thinkingMsg) {
        try { await bot.deleteMessage(chatId, thinkingMsg.message_id); } catch { /* ignore */ }
      }

      const errText = err.message.includes('timeout')
        ? `⏱️ Cursor didn't respond within ${config.capture.timeoutMs / 1000}s\\. Try again\\.`
        : `❌ Error: ${err.message.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')}`;

      await bot.sendMessage(chatId, errText, { parse_mode: 'MarkdownV2' });
    }
  });

  // Error handling
  bot.on('polling_error', (err) => {
    logger.error('Polling error:', err.message);
  });

  // Send startup notification
  try {
    await bot.sendMessage(chatId, '🟢 Cursor Bridge connected\\. Send a message to begin\\.', {
      parse_mode: 'MarkdownV2'
    });
  } catch (err) {
    logger.warn('Could not send startup message:', err.message);
  }

  logger.info(`Telegram bot started. Listening for messages from chat ${chatId}`);
}

module.exports = { startBot };
