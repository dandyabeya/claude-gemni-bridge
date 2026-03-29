const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const channelInput = document.getElementById('channelInput');
const assignBtn = document.getElementById('assignBtn');
const currentChannel = document.getElementById('currentChannel');
const currentChannelName = document.getElementById('currentChannelName');
const tabList = document.getElementById('tabList');

let activeTabId = null;

// Get the current active tab
browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  if (tabs[0] && tabs[0].url && tabs[0].url.includes('gemini.google.com')) {
    activeTabId = tabs[0].id;

    browser.runtime.sendMessage({ type: 'GET_CHANNEL', tabId: activeTabId }).then((resp) => {
      if (resp && resp.channel) {
        channelInput.value = resp.channel;
        currentChannelName.textContent = resp.channel;
        currentChannel.classList.add('active');
      }
    });
  }
});

// Check connection status
browser.runtime.sendMessage({ type: 'GET_STATUS' }).then((resp) => {
  if (resp && resp.connected) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected to bridge server';
  } else {
    statusText.textContent = 'Bridge server not running';
  }
}).catch(() => {
  statusText.textContent = 'Bridge server not running';
});

// Assign channel
assignBtn.addEventListener('click', () => {
  const channel = channelInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!channel) return;
  if (!activeTabId) {
    statusText.textContent = 'Open this popup from a Gemini tab';
    return;
  }

  browser.runtime.sendMessage({ type: 'SET_CHANNEL', tabId: activeTabId, channel: channel }).then((resp) => {
    if (resp && resp.ok) {
      currentChannelName.textContent = channel;
      currentChannel.classList.add('active');
      loadTabs();
    }
  });
});

channelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') assignBtn.click();
});

function loadTabs() {
  browser.runtime.sendMessage({ type: 'GET_ALL_TABS' }).then((resp) => {
    if (!resp || !resp.tabs || resp.tabs.length === 0) {
      tabList.innerHTML = '<div style="font-size:12px;color:#6c7086">No Gemini tabs open</div>';
      return;
    }

    tabList.innerHTML = resp.tabs.map(t => `
      <div class="tab-item">
        <span class="tab-title" title="${t.title}">${t.title || 'Gemini'}</span>
        <span class="tab-channel ${t.channel ? '' : 'none'}">${t.channel || 'no channel'}</span>
      </div>
    `).join('');
  });
}

loadTabs();
