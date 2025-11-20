import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';

const MODULE_NAME = 'asterisk-wrapper';

function wrapWithAsterisks(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    // Step 1: Parse the text into tokens (quoted text and non-quoted text)
    const tokens = [];
    let currentPos = 0;
    const quoteRegex = /"[^"]*"/g;
    let match;

    // Extract all quoted sections
    const quotes = [];
    while ((match = quoteRegex.exec(text)) !== null) {
        quotes.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0]
        });
    }

    // Build tokens array with quoted and unquoted sections
    quotes.forEach(quote => {
        // Add text before quote
        if (currentPos < quote.start) {
            tokens.push({
                type: 'unquoted',
                text: text.substring(currentPos, quote.start)
            });
        }
        // Add quoted text
        tokens.push({
            type: 'quoted',
            text: quote.text
        });
        currentPos = quote.end;
    });

    // Add remaining text after last quote
    if (currentPos < text.length) {
        tokens.push({
            type: 'unquoted',
            text: text.substring(currentPos)
        });
    }

    // If no quotes found, entire text is unquoted
    if (tokens.length === 0) {
        tokens.push({
            type: 'unquoted',
            text: text
        });
    }

    // Step 2: Process each token
    const processedTokens = tokens.map(token => {
        if (token.type === 'quoted') {
            // Keep quoted text as is
            return token.text;
        }

        // For unquoted text, remove single asterisks but keep double asterisks
        let cleaned = token.text;

        // Temporarily replace ** with a placeholder
        const placeholder = '\u0000DOUBLEASTERISK\u0000';
        cleaned = cleaned.replace(/\*\*/g, placeholder);

        // Remove all remaining single asterisks
        cleaned = cleaned.replace(/\*/g, '');

        // Restore double asterisks
        cleaned = cleaned.replace(new RegExp(placeholder, 'g'), '**');

        // Wrap the entire cleaned segment with asterisks if it has content
        const trimmed = cleaned.trim();
        if (trimmed.length > 0) {
            const leadingSpace = cleaned.match(/^\s*/)[0];
            const trailingSpace = cleaned.match(/\s*$/)[0];
            return leadingSpace + '*' + trimmed + '*' + trailingSpace;
        }

        return cleaned;
    });

    return processedTokens.join('');
}

async function addAsterisksToMessage(messageIndex) {
    const context = getContext();
    const chat = context.chat;

    if (messageIndex < 0 || messageIndex >= chat.length) {
        toastr.error('Invalid message index');
        return;
    }

    const message = chat[messageIndex];
    const originalText = message.mes;

    if (!originalText || !originalText.trim()) {
        toastr.warning('Message is empty');
        return;
    }

    const modifiedText = wrapWithAsterisks(originalText);

    // Only update if the text actually changed
    if (modifiedText === originalText) {
        toastr.info('No changes needed - text already formatted');
        return;
    }

    // Update the message
    message.mes = modifiedText;

    // Trigger UI update
    await eventSource.emit(event_types.CHAT_CHANGED, -1);
    context.clearChat();
    await context.printMessages();
    await context.saveChat();

    toastr.success('Asterisks added to message');
}

function injectAsteriskButtons() {
    $('.extraMesButtons').each(function () {
        const $container = $(this);

        // Skip if button already exists
        if ($container.find('.asterisk_wrap_button').length > 0) {
            return;
        }

        const asteriskButton = `
            <div title="Wrap with Asterisks" class="mes_button asterisk_wrap_button fa-solid fa-asterisk" data-i18n="[title]Wrap with Asterisks"></div>
        `;

        // Add button at the beginning of the container
        $container.prepend(asteriskButton);
    });
}

function observeForNewMessages() {
    const observer = new MutationObserver(function (mutations) {
        let shouldInject = false;

        mutations.forEach(function (mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const $node = $(node);
                        if ($node.hasClass('mes') || $node.find('.mes').length > 0) {
                            shouldInject = true;
                        }
                    }
                });
            }
        });

        if (shouldInject) {
            setTimeout(injectAsteriskButtons, 50);
        }
    });

    const chatContainer = document.getElementById('chat');
    if (chatContainer) {
        observer.observe(chatContainer, {
            childList: true,
            subtree: true
        });
    }
}

jQuery(async () => {
    try {
        // Inject buttons into existing messages
        setTimeout(injectAsteriskButtons, 100);

        // Watch for new messages
        observeForNewMessages();

        // Re-inject on chat changes
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(injectAsteriskButtons, 100);
        });

        // Handle button clicks
        $(document).on('click', '.asterisk_wrap_button', async function (e) {
            const $icon = $(e.currentTarget);
            const $mes = $icon.closest('.mes');
            const messageId = parseInt($mes.attr('mesid'));

            await addAsterisksToMessage(messageId);
        });

        console.log('[asterisk-wrapper] Extension initialized successfully');
    } catch (error) {
        console.error('[asterisk-wrapper] Failed to initialize extension:', error);
    }
});