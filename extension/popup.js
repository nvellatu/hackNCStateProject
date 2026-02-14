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