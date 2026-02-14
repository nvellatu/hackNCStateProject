<<<<<<< Updated upstream
async function loadCookies() {
  const status = document.getElementById('status');
  const list = document.getElementById('cookie-list');
  list.innerHTML = ''; // clear previous

  try {
    // 1. Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      status.textContent = 'Cannot read cookies on this page (internal Chrome page)';
      return;
    }

    const url = new URL(tab.url);
    status.textContent = `Site: ${url.hostname}`;

    // 2. Fetch all cookies for this URL
    const cookies = await chrome.cookies.getAll({ url: tab.url });

    if (cookies.length === 0) {
      status.textContent += ' — No cookies found';
      return;
    }

    status.textContent += ` — ${cookies.length} cookie(s)`;

    // 3. Display them
    cookies.forEach(cookie => {
      const li = document.createElement('li');
      li.className = 'cookie-item';

      const name = document.createElement('div');
      name.className = 'cookie-name';
      name.textContent = cookie.name;

      const value = document.createElement('div');
      value.className = 'cookie-value';
      // Show only first ~100 chars to avoid huge values breaking layout
      value.textContent = cookie.value.length > 100 
        ? cookie.value.substring(0, 100) + '…' 
        : cookie.value;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        Domain: ${cookie.domain}<br>
        Path: ${cookie.path}<br>
        Expires: ${cookie.expirationDate 
          ? new Date(cookie.expirationDate * 1000).toLocaleString() 
          : 'Session cookie'}<br>
        Secure: ${cookie.secure ? 'Yes' : 'No'} | HttpOnly: ${cookie.httpOnly ? 'Yes' : 'No'}
      `;

      li.appendChild(name);
      li.appendChild(value);
      li.appendChild(meta);
      list.appendChild(li);
    });
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    console.error(err);
  }
}

// Load immediately when popup opens
loadCookies();

// Refresh button
document.getElementById('refresh').addEventListener('click', loadCookies);
=======
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

  const url = new URL(tab.url);
  if (cookies.length === 0) {
    status.textContent = `Site: ${url.hostname} — No cookies found`;
    return;
  }

  // Summary counts
  let persistent = 0;
  let session = 0;
  let secure = 0;
  let httpOnly = 0;

  for (const c of cookies) {
    if (c.session) session++;
    else persistent++;
    if (c.secure) secure++;
    if (c.httpOnly) httpOnly++;
  }

  status.textContent =
    `Site: ${url.hostname} — ${cookies.length} cookie(s) • ` +
    `${persistent} persistent / ${session} session • ` +
    `${secure} Secure • ${httpOnly} HttpOnly`;

  // Display cookie metadata (SAFE: no values)
  for (const c of cookies) {
    const li = document.createElement("li");
    li.className = "cookie-item";

    const name = document.createElement("div");
    name.className = "cookie-name";
    name.textContent = c.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML =
      `Domain: <span class="mono">${c.domain}</span><br>` +
      `Path: <span class="mono">${c.path}</span><br>` +
      `Expires: ${formatExpiry(c)}<br>` +
      `Secure: ${c.secure ? "Yes" : "No"} | HttpOnly: ${c.httpOnly ? "Yes" : "No"} | SameSite: ${c.sameSite || "?"}`;

    li.appendChild(name);
    li.appendChild(meta);
    ul.appendChild(li);
  }
}

async function refreshAll() {
  const tab = await getActiveTab();
  if (!tab) return;

  // Third-party domains (from background)
  chrome.runtime.sendMessage({ type: "GET_TAB_DATA", tabId: tab.id }, (res) => {
    renderDomains(res);
  });

  // Cookies (directly in popup)
  await loadCookiesForTab(tab);
}

// Load when popup opens
refreshAll();

// Refresh button (if present)
const btn = document.getElementById("refresh");
if (btn) btn.addEventListener("click", refreshAll);
>>>>>>> Stashed changes
