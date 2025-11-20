import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';

const MODULE_NAME = 'asterisk-wrapper';

function wrapWithAsterisks(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    // Split text into paragraphs (separated by line breaks)
    const paragraphs = text.split(/(\n+)/);

    const processedParagraphs = paragraphs.map(paragraph => {
        // If it's just newlines, keep them as is
        if (/^\n+$/.test(paragraph)) {
            return paragraph;
        }

        // Skip empty or whitespace-only paragraphs
        if (!paragraph.trim()) {
            return paragraph;
        }

        // Split paragraph into chunks by quoted text and already asterisked text
        const chunks = [];
        let currentPos = 0;
        let inQuotes = false;
        let inAsterisks = false;
        let chunkStart = 0;

        for (let i = 0; i < paragraph.length; i++) {
            const char = paragraph[i];

            // Handle quotes
            if (char === '"') {
                // Save any plain text before the quote
                if (i > chunkStart && !inQuotes && !inAsterisks) {
                    chunks.push({ text: paragraph.substring(chunkStart, i), type: 'plain' });
                }

                // Find the closing quote
                if (!inQuotes) {
                    inQuotes = true;
                    chunkStart = i;
                } else {
                    // Closing quote found
                    chunks.push({ text: paragraph.substring(chunkStart, i + 1), type: 'quoted' });
                    inQuotes = false;
                    chunkStart = i + 1;
                }
            }
            // Handle asterisks
            else if (char === '*' && !inQuotes) {
                // Save any plain text before the asterisk
                if (i > chunkStart && !inAsterisks) {
                    chunks.push({ text: paragraph.substring(chunkStart, i), type: 'plain' });
                }

                if (!inAsterisks) {
                    inAsterisks = true;
                    chunkStart = i;
                } else {
                    // Closing asterisk found
                    chunks.push({ text: paragraph.substring(chunkStart, i + 1), type: 'asterisked' });
                    inAsterisks = false;
                    chunkStart = i + 1;
                }
            }
        }

        // Add any remaining text
        if (chunkStart < paragraph.length) {
            const remaining = paragraph.substring(chunkStart);
            if (remaining.trim()) {
                chunks.push({ text: remaining, type: inQuotes || inAsterisks ? (inQuotes ? 'quoted' : 'asterisked') : 'plain' });
            } else {
                chunks.push({ text: remaining, type: 'whitespace' });
            }
        }

        // Process chunks and wrap plain text with asterisks (if not already wrapped)
        const result = chunks.map((chunk, index) => {
            if (chunk.type === 'plain') {
                const trimmed = chunk.text.trim();
                if (!trimmed) {
                    return chunk.text; // Keep whitespace as is
                }

                // Check if this plain text is already surrounded by asterisks from adjacent chunks
                const prevChunk = index > 0 ? chunks[index - 1] : null;
                const nextChunk = index < chunks.length - 1 ? chunks[index + 1] : null;

                // Check if preceded by an asterisked chunk that ends with *
                const hasAsteriskBefore = prevChunk && prevChunk.type === 'asterisked' && prevChunk.text.endsWith('*');
                // Check if followed by an asterisked chunk that starts with *
                const hasAsteriskAfter = nextChunk && nextChunk.type === 'asterisked' && nextChunk.text.startsWith('*');

                // If already surrounded by asterisks, don't add more
                if (hasAsteriskBefore && hasAsteriskAfter) {
                    return chunk.text;
                }

                const leadingSpace = chunk.text.match(/^\s*/)[0];
                const trailingSpace = chunk.text.match(/\s*$/)[0];

                // Add asterisks only where needed
                const prefix = hasAsteriskBefore ? '' : '*';
                const suffix = hasAsteriskAfter ? '' : '*';

                return leadingSpace + prefix + trimmed + suffix + trailingSpace;
            }
            return chunk.text;
        }).join('');

        return result;
    });

    return processedParagraphs.join('');
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