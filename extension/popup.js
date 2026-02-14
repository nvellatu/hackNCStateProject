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

  const url = new URL(tab.url);
  if (cookies.length === 0) {
    status.textContent = `Site: ${url.hostname} — No cookies found`;
    return;
  }

  // Summary counts
  let persistent = 0, session = 0, secure = 0, httpOnly = 0;
  for (const c of cookies) {
    if (c.session) session++; else persistent++;
    if (c.secure) secure++;
    if (c.httpOnly) httpOnly++;
  }

  status.textContent =
    `Site: ${url.hostname} — ${cookies.length} cookie(s) • ` +
    `${persistent} persistent / ${session} session • ` +
    `${secure} Secure • ${httpOnly} HttpOnly`;

  // Display cookies with delete button
  for (const c of cookies) {
    const li = document.createElement("li");
    li.className = "cookie-item";

    const header = document.createElement("div");
    header.className = "cookie-header";

    const name = document.createElement("div");
    name.className = "cookie-name";
    name.textContent = c.name;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "Delete";
    delBtn.title = "Remove this cookie";
    delBtn.addEventListener("click", () => {
      if (confirm(`Really delete cookie "${c.name}"?`)) {
        deleteCookie(c, tab.url);
      }
    });

    header.appendChild(name);
    header.appendChild(delBtn);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML =
      `Domain: <span class="mono">${c.domain}</span><br>` +
      `Path: <span class="mono">${c.path}</span><br>` +
      `Expires: ${formatExpiry(c)}<br>` +
      `Secure: ${c.secure ? "Yes" : "No"} | HttpOnly: ${c.httpOnly ? "Yes" : "No"} | SameSite: ${c.sameSite || "?"}`;

    li.appendChild(header);
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

  // Cookies
  await loadCookiesForTab(tab);
}

// Initial load
refreshAll();

document.getElementById("refresh")?.addEventListener("click", refreshAll);