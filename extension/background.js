// background.js
// Minimal third-party domain tracker per tab.

const WINDOW_MS = 2 * 60 * 1000; // keep last 2 minutes of activity
const tabs = Object.create(null); // tabs[tabId] = { firstParty, seen: Map(domain -> {count,lastSeen}) }

function hostnameOf(urlStr) {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Simple heuristic: last 2 labels. Fine for hackathon MVP.
function baseDomain(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

function getTabState(tabId) {
  if (!tabs[tabId]) tabs[tabId] = { firstParty: "", seen: new Map() };
  return tabs[tabId];
}

function cleanupSeen(seen) {
  const now = Date.now();
  for (const [domain, rec] of seen.entries()) {
    if (now - rec.lastSeen > WINDOW_MS) seen.delete(domain);
  }
}

// Reset per-tab state when navigation starts.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.url) return;
  if (changeInfo.status === "loading") {
    const host = hostnameOf(tab.url);
    if (!host) return;
    const st = getTabState(tabId);
    st.firstParty = baseDomain(host);
    st.seen.clear();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabs[tabId];
});

// Log completed requests and count third-party domains.
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return; // ignore extension/background requests
    const reqHost = hostnameOf(details.url);
    if (!reqHost) return;

    const st = getTabState(details.tabId);
    if (!st.firstParty) return;

    const reqBase = baseDomain(reqHost);
    if (reqBase === st.firstParty) return; // first-party request

    cleanupSeen(st.seen);

    const now = Date.now();
    const rec = st.seen.get(reqBase) || { count: 0, lastSeen: now };
    rec.count += 1;
    rec.lastSeen = now;
    st.seen.set(reqBase, rec);
  },
  { urls: ["<all_urls>"] }
);

// Popup asks for current tab stats.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "GET_TAB_DATA") return;

  const st = getTabState(msg.tabId);
  cleanupSeen(st.seen);

  const items = Array.from(st.seen.entries())
    .map(([domain, rec]) => ({ domain, count: rec.count }))
    .sort((a, b) => b.count - a.count);

  sendResponse({
    firstParty: st.firstParty,
    thirdPartyCount: items.length,
    top: items.slice(0, 25)
  });

  return true;
});