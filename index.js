import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';

const MODULE_NAME = 'asterisk-wrapper';

function wrapWithAsterisks(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    // Split text into sentences (basic sentence splitting)
    const sentences = text.split(/([.!?]+\s+)/);
    
    const processedSentences = sentences.map(segment => {
        // Skip empty segments or whitespace-only segments
        if (!segment.trim()) {
            return segment;
        }

        // Skip punctuation segments
        if (/^[.!?]+\s*$/.test(segment)) {
            return segment;
        }

        const trimmed = segment.trim();
        
        // Check if already surrounded by asterisks or quotes
        const startsWithMarker = /^[\*"]/.test(trimmed);
        const endsWithMarker = /[\*"]$/.test(trimmed);
        
        // If already surrounded by markers, return as is
        if (startsWithMarker && endsWithMarker) {
            return segment;
        }
        
        // If partially marked, return as is to avoid breaking formatting
        if (startsWithMarker || endsWithMarker) {
            return segment;
        }
        
        // Check if the sentence contains asterisks or quotes internally
        // If so, it might be intentionally formatted, so skip it
        if (/[\*"]/.test(trimmed)) {
            return segment;
        }
        
        // Wrap with asterisks, preserving leading/trailing whitespace
        const leadingSpace = segment.match(/^\s*/)[0];
        const trailingSpace = segment.match(/\s*$/)[0];
        
        return leadingSpace + '*' + trimmed + '*' + trailingSpace;
    });

    return processedSentences.join('');
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
        $(document).on('click', '.asterisk_wrap_button', async function(e) {
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