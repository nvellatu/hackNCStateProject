const tabs = Object.create(null);

chrome.webRequest.onCompleted.addListener((details) => {
  if (details.tabId < 0) return;
  const url = new URL(details.url);
  const host = url.hostname;
  
  if (!tabs[details.tabId]) tabs[details.tabId] = { seen: new Map(), thirdPartyCount: 0 };
  const st = tabs[details.tabId];
  
  if (!st.seen.has(host)) {
    st.seen.set(host, 1);
    st.thirdPartyCount++;
  } else {
    st.seen.set(host, st.seen.get(host) + 1);
  }
}, { urls: ["<all_urls>"] });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_DATA") {
    const st = tabs[msg.tabId] || { seen: new Map(), thirdPartyCount: 0 };
    const top = Array.from(st.seen.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a,b) => b.count - a.count).slice(0, 5);
    sendResponse({ thirdPartyCount: st.thirdPartyCount, top });
  }
  return true;
});