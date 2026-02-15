const MENU_ID_SCOPE = "lamplight_scope_link";
const MSG_SHOW_SCOPE = "LAMPLIGHT/SHOW_SCOPE_REPORT";

const MENU_ID_DOSSIER = "lamplight_dossier";
const MSG_SHOW_DOSSIER = "LAMPLIGHT/SHOW_DOSSIER";

/* -------------------------
   Load background modules
-------------------------- */

try { importScripts(chrome.runtime.getURL("background/cookieRegistry.js")); }
catch (e) { console.error("Failed to load cookieRegistry.js", e); }

try { importScripts(chrome.runtime.getURL("background/cookieScanner.js")); }
catch (e) { console.error("Failed to load cookieScanner.js", e); }

try { importScripts(chrome.runtime.getURL("background/dossierController.js")); }
catch (e) { console.error("Failed to load dossierController.js", e); }

try { importScripts(chrome.runtime.getURL("background/scopeHeuristics.js")); }
catch (e) { console.error("Failed to load scopeHeuristics.js", e); }

try { importScripts(chrome.runtime.getURL("background/familiarityStore.js")); }
catch (e) { console.error("Failed to load familiarityStore.js", e); }

try { importScripts(chrome.runtime.getURL("background/scopeRunner.js")); }
catch (e) { console.error("Failed to load scopeRunner.js", e); }

try { importScripts(chrome.runtime.getURL("background/ai/aiConfig.js")); }
catch (e) { console.error("Failed to load aiConfig.js", e); }

try { importScripts(chrome.runtime.getURL("background/ai/aiPrompts.js")); }
catch (e) { console.error("Failed to load aiPrompts.js", e); }

try { importScripts(chrome.runtime.getURL("background/ai/aiService.js")); }
catch (e) { console.error("Failed to load aiService.js", e); }

try { importScripts(chrome.runtime.getURL("background/ai/aiQueue.js")); }
catch (e) { console.error("Failed to load aiQueue.js", e); }

try { importScripts(chrome.runtime.getURL("background/ai/aiWorker.js")); }
catch (e) { console.error("Failed to load aiWorker.js", e); }

/* -------------------------
   Context menus
-------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID_SCOPE,
      title: "Lamplight: Scope link",
      contexts: ["link"]
    });

    chrome.contextMenus.create({
      id: MENU_ID_DOSSIER,
      title: "Lamplight: Dossier",
      contexts: ["page"]
    });
  });
});

/* -------------------------
   Helpers
-------------------------- */

function isInjectableUrl(url) {
  return typeof url === "string" &&
    (url.startsWith("http://") || url.startsWith("https://"));
}

function hostFromUrl(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

async function ensureOverlayInjected(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/overlayStyles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/scopeOverlay.js"]
  });
}

async function ensureDossierOverlayInjected(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/overlayStyles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/dossierOverlay.js"]
  });
}

function buildCookieUrlForRemoval(cookieLike) {
  // cookieLike: { domain, path, secure }
  const rawDomain = cookieLike?.domain || "";
  const domain = rawDomain.startsWith(".") ? rawDomain.slice(1) : rawDomain;
  const path = cookieLike?.path || "/";
  const scheme = cookieLike?.secure ? "https://" : "http://";
  return `${scheme}${domain}${path}`;
}

async function refreshDossierNow(tabId) {
  if (!self.LAMPLIGHT) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    const sourceHost = hostFromUrl(tab?.url);

    if (typeof self.LAMPLIGHT.scanCookiesForActiveTab !== "function") return;
    if (typeof self.LAMPLIGHT.updateCookieRegistry !== "function") return;
    if (typeof self.LAMPLIGHT.getCookieRegistryView !== "function") return;

    const cookies = await self.LAMPLIGHT.scanCookiesForActiveTab(tabId);
    await self.LAMPLIGHT.updateCookieRegistry(cookies, { sourceHost });

    const snapshot = await self.LAMPLIGHT.getCookieRegistryView();
    await sendDossierView(tabId, { ...snapshot, generatedAt: new Date().toISOString() });
  } catch (e) {
    // If tab is gone, do nothing.
  }
}

/* -------------------------
   Messaging
-------------------------- */

async function sendScopeReport(tabId, report) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG_SHOW_SCOPE,
      payload: { report }
    });
    return;
  }
  catch (e) {
    const msg = String(e?.message || e);
    if (!msg.includes("Receiving end does not exist")) throw e;

    await ensureOverlayInjected(tabId);

    await chrome.tabs.sendMessage(tabId, {
      type: MSG_SHOW_SCOPE,
      payload: { report }
    });
  }
}

async function sendDossierView(tabId, view) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG_SHOW_DOSSIER,
      payload: { view }
    });
    return;
  } catch (e) {
    const msg = String(e?.message || e);
    if (!msg.includes("Receiving end does not exist")) throw e;

    await ensureDossierOverlayInjected(tabId);

    await chrome.tabs.sendMessage(tabId, {
      type: MSG_SHOW_DOSSIER,
      payload: { view }
    });
  }
}

// Expose dossier helper hooks to the controller.
if (self.LAMPLIGHT) {
  self.LAMPLIGHT._sendDossierView = sendDossierView;
  self.LAMPLIGHT._ensureDossierOverlayInjected = ensureDossierOverlayInjected;
}

/* -------------------------
   Dossier control + local forget + browser removal handlers
-------------------------- */

chrome.runtime.onMessage.addListener((msg, sender) => {
  const type = msg?.type;

  // Stop observer when user closes overlay.
  if (type === "LAMPLIGHT/STOP_DOSSIER") {
    if (self.LAMPLIGHT && typeof self.LAMPLIGHT.stopDossier === "function") {
      try { self.LAMPLIGHT.stopDossier(); } catch (e) {}
    }
    return;
  }

  // Forget ONE ended entry (local/session memory only).
  if (type === "LAMPLIGHT/FORGET_COOKIE_LOCAL") {
    const tabId = sender?.tab?.id;
    const key = msg?.payload?.key;
    if (!tabId || !key) return;

    (async () => {
      try {
        if (!self.LAMPLIGHT || typeof self.LAMPLIGHT.forgetCookieEntry !== "function") return;
        const updated = await self.LAMPLIGHT.forgetCookieEntry(key);
        await sendDossierView(tabId, { ...updated, generatedAt: new Date().toISOString() });
      } catch (e) {
        console.error("Lamplight: forget cookie local failed", e);
      }
    })();

    return;
  }

  // Forget ALL ended entries (local/session memory only).
  if (type === "LAMPLIGHT/FORGET_ALL_ENDED_LOCAL") {
    const tabId = sender?.tab?.id;
    if (!tabId) return;

    (async () => {
      try {
        if (!self.LAMPLIGHT || typeof self.LAMPLIGHT.forgetAllEndedCookies !== "function") return;
        const updated = await self.LAMPLIGHT.forgetAllEndedCookies();
        await sendDossierView(tabId, { ...updated, generatedAt: new Date().toISOString() });
      } catch (e) {
        console.error("Lamplight: forget all ended local failed", e);
      }
    })();

    return;
  }

  // REMOVE ONE PRESENT cookie from the BROWSER.
  if (type === "LAMPLIGHT/REMOVE_COOKIE_BROWSER") {
    const tabId = sender?.tab?.id;
    const payload = msg?.payload || {};
    if (!tabId || !payload?.name || !payload?.domain) return;

    (async () => {
      try {
        const url = buildCookieUrlForRemoval(payload);

        await chrome.cookies.remove({
          url,
          name: payload.name,
          storeId: payload.storeId
        });

        // Immediate refresh so UI updates instantly
        await refreshDossierNow(tabId);
      } catch (e) {
        console.error("Lamplight: remove cookie browser failed", e);
      }
    })();

    return;
  }

  // REMOVE ALL PRESENT cookies from the BROWSER.
  if (type === "LAMPLIGHT/REMOVE_ALL_PRESENT_BROWSER") {
    const tabId = sender?.tab?.id;
    const cookies = Array.isArray(msg?.payload?.cookies) ? msg.payload.cookies : [];
    if (!tabId || cookies.length === 0) return;

    (async () => {
      try {
        // Best effort: remove each; then refresh once.
        for (const c of cookies) {
          if (!c?.name || !c?.domain) continue;
          const url = buildCookieUrlForRemoval(c);
          try {
            await chrome.cookies.remove({
              url,
              name: c.name,
              storeId: c.storeId
            });
          } catch (err) {
            // Continue removing others
          }
        }

        await refreshDossierNow(tabId);
      } catch (e) {
        console.error("Lamplight: remove all present browser failed", e);
      }
    })();

    return;
  }
});

// ===============================
// Dossier AI Describe Handler
// ===============================

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type) return;

  if (msg.type === "LAMPLIGHT/DESCRIBE_COOKIE") {
    const { key, name, domain } = msg.payload || {};
    if (!key || !name) return;

    if (self.LAMPLIGHT && typeof self.LAMPLIGHT.describeCookie === "function") {
      self.LAMPLIGHT.describeCookie({ key, name, domain });
    }
  }
});

/* -------------------------
   Context menu handler
-------------------------- */

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  /* ---------- DOSSIER ---------- */

  if (info.menuItemId === MENU_ID_DOSSIER) {
    if (!self.LAMPLIGHT || typeof self.LAMPLIGHT.startDossier !== "function") return;

    // Start controller loop.
    await self.LAMPLIGHT.startDossier(tab.id);

    // Immediately show cached registry snapshot.
    try {
      if (typeof self.LAMPLIGHT.getCookieRegistryView === "function") {
        const cached = await self.LAMPLIGHT.getCookieRegistryView();
        await sendDossierView(tab.id, {
          ...cached,
          generatedAt: new Date().toISOString(),
          cached: true
        });
      }
    } catch (e) {}

    return;
  }

  /* ---------- SCOPE ---------- */

  if (info.menuItemId !== MENU_ID_SCOPE) return;
  if (!info.linkUrl) return;

  const t = await chrome.tabs.get(tab.id);

  if (!isInjectableUrl(t.url)) {
    console.warn("Lamplight: cannot inject on this page:", t.url);
    return;
  }

  if (!self.LAMPLIGHT || typeof self.LAMPLIGHT.runScope !== "function") {
    console.error("Lamplight: Scope runner not available");
    return;
  }

  let report;

  try {
    report = await self.LAMPLIGHT.runScope(info.linkUrl);
  } catch (e) {
    report = {
      targetUrl: info.linkUrl,
      finalUrl: info.linkUrl,
      redirects: [{ url: info.linkUrl, domain: "" }],
      signals: { error: true },
      score: {
        label: "HIGH",
        value: 10,
        reasons: ["Scope crashed: " + String(e)]
      },
      generatedAt: new Date().toISOString()
    };
  }

  try {
    await sendScopeReport(tab.id, report);
  } catch (e) {
    console.error("Lamplight: failed to display overlay:", e);
  }
});