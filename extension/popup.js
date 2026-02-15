function fogLabel(thirdPartyCount, top) {
  const totalReqs = top.reduce((s, x) => s + x.count, 0);
  const score = thirdPartyCount * 2 + totalReqs / 10;
  if (score >= 25) return "High Fog";
  if (score >= 10) return "Medium Fog";
  return "Low Fog";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function renderDomains(res) {
  const meta = document.getElementById("meta");
  const fog = document.getElementById("fog");
  const list = document.getElementById("list");

  if (!res) {
    meta.textContent = "No data (try refreshing the page).";
    fog.textContent = "";
    list.innerHTML = "";
    return;
  }

  meta.textContent = `Site: ${res.firstParty || "?"} • 3rd parties: ${res.thirdPartyCount}`;
  fog.textContent = fogLabel(res.thirdPartyCount, res.top);

  list.innerHTML = "";
  if (res.top.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No third-party domains observed yet (refresh page).";
    list.appendChild(li);
    return;
  }

  for (const item of res.top) {
    const li = document.createElement("li");
    li.textContent = `${item.domain} (${item.count})`;
    list.appendChild(li);
  }
}

function formatExpiry(cookie) {
  if (!cookie.expirationDate) return "Session";
  return new Date(cookie.expirationDate * 1000).toLocaleString();
}

async function deleteCookie(cookie, tabUrl) {
  try {
    const removed = await chrome.cookies.remove({
      url: tabUrl,
      name: cookie.name,
      // storeId: cookie.storeId,     // usually not needed
      // partitionKey: cookie.partitionKey  // if using partitioned storage (Chrome 119+)
    });

    if (removed) {
      console.log(`Deleted cookie: ${cookie.name}`);
      // Optional: show brief feedback
      document.getElementById("cookieStatus").textContent = `Deleted ${cookie.name} — refreshing list...`;
      // Re-load cookies after short delay to let browser update
      setTimeout(() => loadCookiesForTab({ url: tabUrl }), 300);
    } else {
      document.getElementById("cookieStatus").textContent = `Could not delete ${cookie.name}`;
    }
  } catch (err) {
    console.error("Delete failed:", err);
    document.getElementById("cookieStatus").textContent = `Error deleting ${cookie.name}: ${err.message}`;
  }
}

async function loadCookiesForTab(tab) {
  const status = document.getElementById("cookieStatus");
  const ul = document.getElementById("cookieList");
  ul.innerHTML = "";

  if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:")) {
    status.textContent = "Cannot read cookies on this page (internal Chrome page).";
    return;
  }

  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ url: tab.url });
  } catch (err) {
    status.textContent = "Error reading cookies: " + err.message;
    return;
  }

  const urlObj = new URL(tab.url);
  if (cookies.length === 0) {
    status.textContent = `Site: ${urlObj.hostname} — No cookies found`;
    return;
  }

  // Summary counts (your existing logic)
  let persistent = 0, session = 0, secure = 0, httpOnly = 0;
  for (const c of cookies) {
    if (c.session) session++; else persistent++;
    if (c.secure) secure++;
    if (c.httpOnly) httpOnly++;
  }

  status.textContent =
    `Site: ${urlObj.hostname} — ${cookies.length} cookie(s) • ` +
    `${persistent} persistent / ${session} session • ` +
    `${secure} Secure • ${httpOnly} HttpOnly`;

  for (const c of cookies) {
    const li = document.createElement("li");
    li.className = "cookie-item";

    const header = document.createElement("div");
    header.className = "cookie-header";

    const name = document.createElement("div");
    name.className = "cookie-name";
    name.textContent = c.name;

    const actions = document.createElement("div");
    actions.className = "actions";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn actions-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (confirm(`Delete cookie "${c.name}"?`)) {
        deleteCookie(c, tab.url); // your existing delete function
      }
    });

    const infoBtn = document.createElement("button");
    infoBtn.className = "info-btn actions-btn";
    infoBtn.textContent = "Info";
    infoBtn.disabled = !GEMINI_API_KEY;
    infoBtn.title = GEMINI_API_KEY ? "Get AI explanation" : "Set API key first";
    infoBtn.addEventListener("click", async () => {
      infoBtn.disabled = true;
      infoBtn.textContent = "Loading...";
      const descDiv = li.querySelector(".description") || document.createElement("div");
      descDiv.className = "description";
      descDiv.textContent = "Thinking...";
      li.appendChild(descDiv);

      const description = await getCookieDescription(
        c.name,
        c.domain,
        c.value || ""
      );
      descDiv.textContent = description;
      infoBtn.textContent = "Info";
      infoBtn.disabled = false;
    });

    actions.appendChild(infoBtn);
    actions.appendChild(delBtn);

    header.appendChild(name);
    header.appendChild(actions);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `Domain: <span class="mono">${c.domain}</span><br>Path: <span class="mono">${c.path}</span><br>Expires: ${formatExpiry(c)}<br>Secure: ${c.secure ? "Yes" : "No"} | HttpOnly: ${c.httpOnly ? "Yes" : "No"} | SameSite: ${c.sameSite || "?"}`;

    li.appendChild(header);
    li.appendChild(meta);
    ul.appendChild(li);
  }
}

async function refreshAll() {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.runtime.sendMessage({ type: "GET_TAB_DATA", tabId: tab.id }, (res) => {
    renderDomains(res);
  });

  await loadCookiesForTab(tab);
}

let GEMINI_API_KEY = null;
const apiSection = document.getElementById("api-key-section");
const settingsBtn = document.getElementById("settings-btn");
const clearBtn = document.getElementById("clear-key");
const keyInput = document.getElementById("api-key-input");
const keyStatus = document.getElementById("key-status");

settingsBtn.addEventListener("click", () => {
  if (apiSection.classList.contains("hidden")) {
    apiSection.classList.remove("hidden");
    keyStatus.textContent = GEMINI_API_KEY ? "Current key loaded — edit and save to update." : "";
    keyStatus.style.color = "inherit";
  } else {
    apiSection.classList.add("hidden");
    keyStatus.textContent = "";
  }
});
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (confirm("Really remove your Gemini API key?")) {
      await chrome.storage.local.remove("geminiApiKey");
      GEMINI_API_KEY = null;
      keyInput.value = "";
      apiSection.classList.remove("hidden"); // show section after clear
      keyStatus.textContent = "Key cleared. Enter a new one if needed.";
      keyStatus.style.color = "orange";

      // Disable info buttons until new key
      document.querySelectorAll(".info-btn").forEach(btn => {
        btn.disabled = true;
        btn.title = "Set API key first";
      });
    }
  });
}

async function loadApiKey() {
  const data = await chrome.storage.local.get("geminiApiKey");
  GEMINI_API_KEY = data.geminiApiKey || null;
  
  if (GEMINI_API_KEY) {
    apiSection.classList.add("hidden");
    keyInput.value = GEMINI_API_KEY; // pre-fill for editing
  } else {
    apiSection.classList.remove("hidden");
    keyInput.value = "";
  }
}

async function saveApiKey() {
  const input = document.getElementById("api-key-input");
  const status = document.getElementById("key-status");
  const key = input.value.trim();

  if (!key) {
    status.textContent = "Please enter a key.";
    status.style.color = "red";
    return;
  }

  try {
    await chrome.storage.local.set({ geminiApiKey: key });
    GEMINI_API_KEY = key;
    status.textContent = "Key saved successfully!";
    status.style.color = "green";

    // Hide section after save (optional — or keep open for multiple edits)
    setTimeout(() => {
      apiSection.classList.add("hidden");
      status.textContent = "";
    }, 2000);

    // Re-enable info buttons
    document.querySelectorAll(".info-btn").forEach(btn => {
      btn.disabled = false;
      btn.title = "Get AI explanation";
    });

    // Optional: refresh cookie list
    const tab = await getActiveTab();
    if (tab) await loadCookiesForTab(tab);
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.style.color = "red";
  }
}

async function getCookieDescription(cookieName, cookieDomain, cookieValuePreview = "") {
  if (!GEMINI_API_KEY) return "API key not set.";

  const prompt = `
You are a privacy expert. Given this cookie from website "${cookieDomain}":

Cookie name: ${cookieName}
Value preview: ${cookieValuePreview.substring(0, 60)}${cookieValuePreview.length > 60 ? "..." : ""}

Provide a **short, human-readable** 5-15 word description of what this cookie is used for.
If unknown/common, say so.
Examples:
- "_ga": Google Analytics tracking ID for user sessions.
- "session_id": Temporary session identifier for logged-in state.
Do not speculate wildly.
`.trim();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 500,
            topP: 0.95,
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || response.statusText);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No description available.";
    return text;
  } catch (err) {
    console.error("Gemini error:", err);
    return `Error: ${err.message.includes("API key") ? "Invalid or expired API key" : err.message}`;
  }
}

async function init() {
  await loadApiKey();
  document.getElementById("save-key").addEventListener("click", saveApiKey);
  document.getElementById("refresh")?.addEventListener("click", refreshAll);
  await refreshAll();
}
init();
// Initial load
refreshAll();

document.getElementById("refresh")?.addEventListener("click", refreshAll);
