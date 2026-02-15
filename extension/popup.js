let riskMap = {}; 
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

async function getApiKey() {
  const data = await chrome.storage.local.get("geminiKey");
  return data.geminiKey || null;
}

// 1. Risk Analysis
async function getAIRiskBatch(cookieNames) {
  const key = await getApiKey();
  if (!key || cookieNames.length === 0) return null;
  const prompt = `You are a privacy expert. Classify each cookie name as:
    - "Safe": Strictly necessary/functional (e.g., login, preferences).
    - "Tracking": Analytics, advertising, behavioral.
    - "High Risk": Cross-site tracking, fingerprinting, known invasive.
    - "Unknown": Can't determine.
    Examples: _ga → Tracking, PHPSESSID → Safe, __cfduid → Safe.
    Analyze these cookie names from a website: ${cookieNames.join(", ")}.
    Return ONLY valid JSON object like: {"cookie1": "Tracking", "cookie2": "Safe"}`;
  try {
    const res = await fetch(`${API_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const result = await res.json();
    return JSON.parse(result.candidates[0].content.parts[0].text.replace(/```json|```/g, ""));
  } catch (err) { return null; }
}

// 2. Info Feature
async function getCookieInfo(name, domain) {
  const key = await getApiKey();
  if (!key) return "Set API key first.";
  const prompt = `Explain cookie "${name}" from "${domain}" in 10-15 words.`;
  try {
    const res = await fetch(`${API_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const result = await res.json();
    return result.candidates[0].content.parts[0].text.trim();
  } catch (err) { return "Error loading info."; }
}

// 3. Display a list of cookies with full technical information.
async function loadCookiesForTab(tab) {
  const ul = document.getElementById("cookieList");
  ul.innerHTML = "";
  const cookies = await chrome.cookies.getAll({ url: tab.url });
  
  // Restore the counter from the Main version.
  let persistent = 0, session = 0, secure = 0, httpOnly = 0;
  for (const c of cookies) {
    if (c.session) session++; else persistent++;
    if (c.secure) secure++;
    if (c.httpOnly) httpOnly++;
  }
  document.getElementById("cookieStatus").innerText = 
    `${cookies.length} cookies • ${persistent} persistent / ${session} session • ${secure} Secure • ${httpOnly} HttpOnly`;

  for (const c of cookies) {
    const li = document.createElement("li");
    li.className = "cookie-item";
    
    // Statues show "Unclassified" 
    const risk = riskMap[c.name] || "Unclassified";
    
    // Color for Classification
    let color = "#bbbbbb";
    if (risk === "Safe") {
      color = "#28a745";
    } else if (risk === "Tracking") {
      color = "#ffc107";
    } else if (risk === "High Risk") {
      color = "#e63946";
    }

    li.style.borderLeft = `5px solid ${color}`;
    
    // Expiration date formatting
    const expiry = !c.expirationDate ? "Session" : new Date(c.expirationDate * 1000).toLocaleString();

    // Render cookie item and inject risk data
    li.innerHTML = `
      <div class="cookie-header">
        <strong class="cookie-name" title="${c.name} [${risk}]">
          ${c.name} <small style="color:${color}">[${risk}]</small>
        </strong>
        <div class="actions">
          <button class="info-btn">Info</button>
          <button class="del-btn">Delete</button>
        </div>
      </div>
      <div class="mono">
        Domain: ${c.domain}<br>
        Expires: ${expiry}<br>
        Secure: ${c.secure ? "Yes" : "No"} | HttpOnly: ${c.httpOnly ? "Yes" : "No"} | SameSite: ${c.sameSite || "?"}
      </div>
    `;

    // Fetch cookie explanation from API
    li.querySelector(".info-btn").onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.innerText = "...";
      const info = await getCookieInfo(c.name, c.domain);
      const div = li.querySelector(".description") || document.createElement("div");
      div.className = "description";
      div.innerText = info;
      li.appendChild(div);
      btn.disabled = false;
      btn.innerText = "Info";
    };

    li.querySelector(".del-btn").onclick = () => {
      if (confirm(`Delete ${c.name}?`)) chrome.cookies.remove({ url: tab.url, name: c.name }, () => refreshAll());
    };
    ul.appendChild(li);
  }
}

// Pull fresh data for current tab
async function refreshAll() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.runtime.sendMessage({ type: "GET_TAB_DATA", tabId: tab.id }, (res) => {
    if (res) {
      document.getElementById("meta").innerText = `3rd parties: ${res.thirdPartyCount}`;
      document.getElementById("list").innerHTML = res.top.map(i => `<li>${i.domain} (${i.count})</li>`).join("");
    }
  });
  loadCookiesForTab(tab);
}

// Setup listeners
document.addEventListener('DOMContentLoaded', () => {
  refreshAll();

  // Save key to local storage
  document.getElementById("saveKey").onclick = () => {
    const key = document.getElementById("apiKeyInput").value;
    chrome.storage.local.set({ geminiKey: key }, () => alert("Key Saved!"));
  };

  // Run bulk classification with Gemini 3 Flash
  document.getElementById("aiAnalyze").onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const cookies = await chrome.cookies.getAll({ url: tab.url });
    const resDiv = document.getElementById("aiResponse");
    resDiv.style.display = "block";
    resDiv.innerText = "Gemini 3 Flash is classifying...";
    const results = await getAIRiskBatch(cookies.map(c => c.name));
    if (results) {
      riskMap = results;
      resDiv.innerText = "Classification complete!";
      loadCookiesForTab(tab);
    }
  };
  document.getElementById("refresh").onclick = refreshAll;

  // Tools and links
  document.getElementById("gameBtn").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("game.html") });
};
  document.getElementById("getKeyBtn").onclick = () => {
    chrome.tabs.create({ url: "https://aistudio.google.com/app/api-keys" });
  };
});

// Launch game page
document.getElementById("playGame").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("game.html") });
};
