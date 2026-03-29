// Content script running on gemini.google.com
// Receives updates from background.js and types them into Gemini's chat

let myChannel = null;

console.log('[Claude Bridge] Content script loaded on', window.location.href);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CLAUDE_UPDATE') {
    console.log(`[Claude Bridge][${msg.channel || 'default'}] Received update, attempting to send...`);
    sendToGemini(msg.message, msg.channel);
    sendResponse({ received: true });
  }

  if (msg.type === 'SET_CHANNEL') {
    myChannel = msg.channel;
    console.log(`[Claude Bridge] Channel set to: ${myChannel}`);
    showNotification(`Channel set: ${myChannel}`);
    sendResponse({ ok: true });
  }

  return true;
});

async function sendToGemini(text, channel) {
  const inputEl = findInputElement();

  if (!inputEl) {
    console.error('[Claude Bridge] Could not find Gemini input element');
    showNotification('Could not find chat input — make sure a Gemini chat is open.');
    return;
  }

  console.log('[Claude Bridge] Found input element:', inputEl.className);

  // Focus the element
  inputEl.focus();
  await sleep(200);

  // Clear existing content
  inputEl.innerHTML = '';
  inputEl.innerText = '';
  await sleep(100);

  // Method 1: Use clipboard API to paste text in (most reliable for Quill editors)
  try {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardData
    });
    inputEl.dispatchEvent(pasteEvent);
    await sleep(200);

    if (inputEl.innerText.trim().length > 0) {
      console.log('[Claude Bridge] Paste method worked');
    } else {
      throw new Error('Paste did not populate');
    }
  } catch (e) {
    console.log('[Claude Bridge] Paste method failed, trying execCommand...', e.message);

    inputEl.focus();
    inputEl.innerHTML = '';
    await sleep(100);
    document.execCommand('insertText', false, text);
    await sleep(200);

    if (inputEl.innerText.trim().length === 0) {
      console.log('[Claude Bridge] execCommand failed, trying direct innerHTML...');

      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const paragraphs = escaped.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
      inputEl.innerHTML = paragraphs;

      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }));
  inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));

  console.log('[Claude Bridge] Input text set, waiting before clicking send...');
  await sleep(1000);

  const sent = clickSend();
  if (!sent) {
    console.log('[Claude Bridge] No send button found, trying Enter key...');
    inputEl.focus();
    inputEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    }));
    inputEl.dispatchEvent(new KeyboardEvent('keypress', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    }));
  }

  showNotification(`Update sent on channel: ${channel || 'default'}`);

  // Wait for Gemini to respond, then scrape the response
  waitForGeminiResponse(channel);
}

async function waitForGeminiResponse(channel) {
  console.log('[Claude Bridge] Waiting for Gemini to respond...');

  await sleep(3000);

  let attempts = 0;
  const maxAttempts = 120;

  while (attempts < maxAttempts) {
    const isGenerating =
      document.querySelector('.loading-indicator') ||
      document.querySelector('.generating') ||
      document.querySelector('[data-is-streaming="true"]') ||
      document.querySelector('.message-pending') ||
      document.querySelector('mat-progress-bar') ||
      document.querySelector('.progress-bar') ||
      document.querySelector('button[aria-label="Stop generating"]') ||
      document.querySelector('button[aria-label="Stop response"]') ||
      document.querySelector('button[mattooltip="Stop generating"]') ||
      document.querySelector('button[mattooltip="Stop response"]');

    if (!isGenerating && attempts > 2) {
      await sleep(2000);

      const stillGenerating =
        document.querySelector('button[aria-label="Stop generating"]') ||
        document.querySelector('button[aria-label="Stop response"]') ||
        document.querySelector('button[mattooltip="Stop generating"]') ||
        document.querySelector('button[mattooltip="Stop response"]');

      if (!stillGenerating) {
        break;
      }
    }

    attempts++;
    await sleep(1000);
  }

  const response = scrapeLastResponse();
  if (response) {
    console.log('[Claude Bridge] Scraped Gemini response:', response.substring(0, 100) + '...');
    postResponseToServer(response, channel);
  } else {
    console.warn('[Claude Bridge] Could not scrape Gemini response');
  }
}

function scrapeLastResponse() {
  const selectors = [
    '.model-response-text',
    '.response-container-content',
    'div[data-message-author-role="model"]',
    'message-content.model-response-text',
    '.markdown-main-panel',
    '.response-content',
    'message-content',
  ];

  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    if (elements.length > 0) {
      const lastEl = elements[elements.length - 1];
      const text = lastEl.innerText || lastEl.textContent || '';
      if (text.trim().length > 0) {
        return text.trim();
      }
    }
  }

  const turns = document.querySelectorAll('.conversation-container > div, .chat-history > div');
  if (turns.length > 0) {
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      if (turn.querySelector('.query-content, .user-query, [data-message-author-role="user"]')) continue;
      const text = turn.innerText || turn.textContent || '';
      if (text.trim().length > 20) {
        return text.trim();
      }
    }
  }

  return null;
}

function postResponseToServer(response, channel) {
  const ch = channel || 'default';
  fetch(`http://127.0.0.1:52945/c/${ch}/response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: response })
  })
  .then(r => r.json())
  .then(data => console.log(`[Claude Bridge] Response posted for channel ${ch}:`, data))
  .catch(e => console.error('[Claude Bridge] Failed to post response:', e));
}

function findInputElement() {
  const selectors = [
    'div.ql-editor.textarea',
    'div.ql-editor[contenteditable="true"]',
    '.ql-editor',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-label*="prompt"]',
    'div[contenteditable="true"][aria-label*="message"]',
    'div[contenteditable="true"]',
    'textarea',
  ];

  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      if (el.classList.contains('ql-clipboard')) continue;
      if (el.offsetHeight < 10) continue;
      return el;
    }
  }

  return null;
}

function clickSend() {
  const selectors = [
    'button[aria-label="Send message"]',
    'button[aria-label="Send"]',
    'button[data-tooltip="Send message"]',
    'button.send-button',
    'button[mattooltip="Send message"]',
    'button[aria-label="Send prompt"]',
  ];

  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (btn && !btn.disabled) {
      console.log('[Claude Bridge] Clicking send button:', sel);
      btn.click();
      return true;
    }
  }

  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const tooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();
    const mattooltip = (btn.getAttribute('mattooltip') || '').toLowerCase();
    const combined = label + tooltip + mattooltip;
    if (combined.includes('send') || combined.includes('submit')) {
      if (!btn.disabled) {
        console.log('[Claude Bridge] Clicking send button (fuzzy match):', btn.outerHTML.substring(0, 100));
        btn.click();
        return true;
      }
    }
  }

  console.warn('[Claude Bridge] No send button found');
  showNotification('Update typed into Gemini — press Enter to send manually.');
  return false;
}

function showNotification(text) {
  const existing = document.getElementById('claude-bridge-notification');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'claude-bridge-notification';
  div.textContent = text;
  Object.assign(div.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    background: '#1a73e8',
    color: 'white',
    padding: '12px 20px',
    borderRadius: '8px',
    zIndex: '99999',
    fontSize: '14px',
    fontFamily: 'sans-serif',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    maxWidth: '400px',
    transition: 'opacity 0.3s'
  });
  document.body.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 5000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
