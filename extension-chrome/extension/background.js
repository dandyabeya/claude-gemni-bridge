const BRIDGE_URL = 'http://127.0.0.1:52945';
const ALARM_NAME = 'claude-bridge-poll';

// Tab-to-channel mapping stored in chrome.storage.local
// Format: { "tabId:1234": "project-a", "tabId:5678": "backend" }

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  pollAllChannels();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  pollAllChannels();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollAllChannels();
  }
});

async function getTabChannelMap() {
  return new Promise((resolve) => {
    chrome.storage.local.get('tabChannels', (data) => {
      resolve(data.tabChannels || {});
    });
  });
}

async function setTabChannel(tabId, channel) {
  const map = await getTabChannelMap();
  map[`tabId:${tabId}`] = channel;
  return new Promise((resolve) => {
    chrome.storage.local.set({ tabChannels: map }, resolve);
  });
}

async function getChannelForTab(tabId) {
  const map = await getTabChannelMap();
  return map[`tabId:${tabId}`] || null;
}

async function pollAllChannels() {
  try {
    // Get all Gemini tabs
    const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
    const map = await getTabChannelMap();

    // Build a set of active channels and their tabs
    const channelTabs = {};
    for (const tab of tabs) {
      const channel = map[`tabId:${tab.id}`];
      if (channel) {
        if (!channelTabs[channel]) channelTabs[channel] = [];
        channelTabs[channel].push(tab);
      }
    }

    // Poll each active channel
    for (const [channel, channelTabList] of Object.entries(channelTabs)) {
      try {
        const resp = await fetch(`${BRIDGE_URL}/c/${channel}/updates`);
        const updates = await resp.json();

        if (updates.length > 0) {
          const message = formatUpdates(updates, channel);

          for (const tab of channelTabList) {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: 'CLAUDE_UPDATE',
                message: message,
                channel: channel
              });
            } catch (e) {
              console.warn(`Could not reach tab ${tab.id} for channel ${channel}:`, e.message);
            }
          }

          // Clear delivered updates
          await fetch(`${BRIDGE_URL}/c/${channel}/clear`, { method: 'POST' });
        }
      } catch (e) {
        // Server not reachable for this channel
      }
    }
  } catch (e) {
    // Server not running
  }

  // Supplemental fast poll
  try {
    setTimeout(() => pollAllChannels(), 5000);
  } catch (e) {}
}

function formatUpdates(updates, channel) {
  const header = `[Channel: ${channel}]`;

  if (updates.length === 1) {
    const u = updates[0];
    return `${header}\n[Claude Code Update — ${u.timestamp}]\nProject: ${u.project}\nStatus: ${u.status}\n\n${u.message}`;
  }

  return updates.map((u, i) => {
    return `${header}\n--- Update ${i + 1} (${u.timestamp}) ---\nProject: ${u.project}\nStatus: ${u.status}\n\n${u.message}`;
  }).join('\n\n');
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    fetch(`${BRIDGE_URL}/health`)
      .then(r => r.json())
      .then(() => sendResponse({ connected: true }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  if (msg.type === 'SET_CHANNEL') {
    setTabChannel(msg.tabId, msg.channel).then(() => {
      // Notify the content script of its channel
      chrome.tabs.sendMessage(msg.tabId, {
        type: 'SET_CHANNEL',
        channel: msg.channel
      });
      sendResponse({ ok: true, channel: msg.channel });
    });
    return true;
  }

  if (msg.type === 'GET_CHANNEL') {
    getChannelForTab(msg.tabId).then((channel) => {
      sendResponse({ channel: channel });
    });
    return true;
  }

  if (msg.type === 'GET_CHANNELS') {
    fetch(`${BRIDGE_URL}/channels`)
      .then(r => r.json())
      .then(channels => sendResponse({ channels }))
      .catch(() => sendResponse({ channels: [] }));
    return true;
  }

  if (msg.type === 'GET_ALL_TABS') {
    (async () => {
      const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
      const map = await getTabChannelMap();
      const result = tabs.map(t => ({
        id: t.id,
        title: t.title,
        channel: map[`tabId:${t.id}`] || null
      }));
      sendResponse({ tabs: result });
    })();
    return true;
  }

  if (msg.type === 'TOGGLE_POLLING') {
    if (msg.enabled) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
      pollAllChannels();
    } else {
      chrome.alarms.clear(ALARM_NAME);
    }
    sendResponse({ polling: msg.enabled });
  }
});

// Clean up closed tabs from the mapping
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getTabChannelMap();
  delete map[`tabId:${tabId}`];
  chrome.storage.local.set({ tabChannels: map });
});
