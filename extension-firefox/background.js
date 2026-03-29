const BRIDGE_URL = 'http://127.0.0.1:52945';
const POLL_INTERVAL = 5000;

// Firefox uses persistent background scripts — no service worker lifecycle issues.
// Simple setInterval works reliably here.

// Tab-to-channel mapping stored in browser.storage.local
// Format: { "tabId:1234": "project-a", "tabId:5678": "backend" }

async function getTabChannelMap() {
  const data = await browser.storage.local.get('tabChannels');
  return data.tabChannels || {};
}

async function setTabChannel(tabId, channel) {
  const map = await getTabChannelMap();
  map[`tabId:${tabId}`] = channel;
  await browser.storage.local.set({ tabChannels: map });
}

async function getChannelForTab(tabId) {
  const map = await getTabChannelMap();
  return map[`tabId:${tabId}`] || null;
}

async function pollAllChannels() {
  try {
    const tabs = await browser.tabs.query({ url: 'https://gemini.google.com/*' });
    const map = await getTabChannelMap();

    // Group tabs by channel
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
              await browser.tabs.sendMessage(tab.id, {
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

// Start polling
setInterval(pollAllChannels, POLL_INTERVAL);
pollAllChannels();

// Listen for messages from popup and content scripts
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'GET_STATUS') {
    return fetch(`${BRIDGE_URL}/health`)
      .then(r => r.json())
      .then(() => ({ connected: true }))
      .catch(() => ({ connected: false }));
  }

  if (msg.type === 'SET_CHANNEL') {
    return setTabChannel(msg.tabId, msg.channel).then(() => {
      browser.tabs.sendMessage(msg.tabId, {
        type: 'SET_CHANNEL',
        channel: msg.channel
      });
      return { ok: true, channel: msg.channel };
    });
  }

  if (msg.type === 'GET_CHANNEL') {
    return getChannelForTab(msg.tabId).then(channel => ({ channel }));
  }

  if (msg.type === 'GET_CHANNELS') {
    return fetch(`${BRIDGE_URL}/channels`)
      .then(r => r.json())
      .then(channels => ({ channels }))
      .catch(() => ({ channels: [] }));
  }

  if (msg.type === 'GET_ALL_TABS') {
    return (async () => {
      const tabs = await browser.tabs.query({ url: 'https://gemini.google.com/*' });
      const map = await getTabChannelMap();
      return {
        tabs: tabs.map(t => ({
          id: t.id,
          title: t.title,
          channel: map[`tabId:${t.id}`] || null
        }))
      };
    })();
  }

  if (msg.type === 'TOGGLE_POLLING') {
    // Polling is always on via setInterval in Firefox; this is a no-op placeholder
    return Promise.resolve({ polling: msg.enabled });
  }
});

// Clean up closed tabs
browser.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getTabChannelMap();
  delete map[`tabId:${tabId}`];
  await browser.storage.local.set({ tabChannels: map });
});
