const MSG_SHOW_SCOPE = "LAMPLIGHT/SHOW_SCOPE_REPORT";

function removeExistingOverlay() {
  const existing = document.getElementById("lamplight-scope-overlay");
  if (existing) existing.remove();
}

// Basic HTML escaping since we interpolate into innerHTML
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statRow(label, value, tooltip) {
  return `
    <div class="scope-row">
      <span class="scope-label" title="${escapeHtml(tooltip)}">
        ${escapeHtml(label)}
      </span>
      <span class="scope-value">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function ensureInlineStyles() {
  if (document.getElementById("lamplight-scope-inline-styles")) return;

  const style = document.createElement("style");
  style.id = "lamplight-scope-inline-styles";
  style.textContent = `
    /* Make the overlay start top-right as usual */
    #lamplight-scope-overlay {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 2147483647;
    }

    /* Header drag affordance */
    #lamplight-scope-overlay .lamplight-header {
      cursor: grab;
      user-select: none;
    }
    #lamplight-scope-overlay.lamplight-dragging .lamplight-header {
      cursor: grabbing;
    }

    /* Truncated, clickable URL */
    .lamplight-url {
      position: relative;
      display: inline-block;
      max-width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;

      /* truncation */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Tooltip shown on hover */
    .lamplight-url-tooltip {
      position: absolute;
      left: 0;
      top: 100%;
      margin-top: 6px;
      padding: 6px 8px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-2px);
      transition: opacity 120ms ease, transform 120ms ease;
      z-index: 9999;

      /* readable default */
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
    }

    .lamplight-url:hover .lamplight-url-tooltip {
      opacity: 1;
      transform: translateY(0);
    }

    /* Optional copied indicator */
    .lamplight-copied {
      margin-left: 8px;
      font-size: 12px;
      opacity: 0.85;
    }
  `;
  document.head.appendChild(style);
}

function renderCopyableUrl(url) {
  const safeUrl = escapeHtml(url || "");
  return `
    <div class="value">
      <button
        type="button"
        class="lamplight-url"
        data-full-url="${safeUrl}"
        aria-label="Copy full URL to clipboard"
      >
        ${safeUrl}
        <span class="lamplight-url-tooltip" role="tooltip">
          Click to copy full URL
        </span>
      </button>
      <span class="lamplight-copied" aria-live="polite" hidden>Copied!</span>
    </div>
  `;
}

async function copyToClipboard(text) {
  // Prefer modern API
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older contexts
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function makeDraggable(root) {
  const handle = root.querySelector(".lamplight-header");
  if (!handle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function onMouseDown(e) {
    // Don’t start drag when clicking close button
    const target = e.target;
    if (target && (target.id === "lamplight-close" || target.closest?.("#lamplight-close"))) return;

    dragging = true;
    root.classList.add("lamplight-dragging");

    const rect = root.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    // Switch to left/top positioning so drag “sticks”
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = "auto";

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);

    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const rect = root.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const maxLeft = window.innerWidth - width - 8;
    const maxTop = window.innerHeight - height - 8;

    const nextLeft = clamp(startLeft + dx, 8, maxLeft);
    const nextTop = clamp(startTop + dy, 8, maxTop);

    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("lamplight-dragging");

    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
  }

  handle.addEventListener("mousedown", onMouseDown);
}

function createOverlay(report) {
  removeExistingOverlay();
  ensureInlineStyles();

  const root = document.createElement("div");
  root.id = "lamplight-scope-overlay";

  const redirects = report.redirects || [];
  const redirectCount = redirects.length > 0 ? redirects.length - 1 : 0;

  const familiarity = report.familiarity?.level || "UNKNOWN";

  const signals = report.signals || {};
  const score = report.score || { label: "LOW", value: 0, reasons: [] };

  const activeSignals = [
    signals.trackingParams && "Tracking parameters detected",
    signals.downloadLike && "Download-like response",
    signals.cookieOnFirstContact && "Cookies set on first contact",
    signals.httpDowngrade && "HTTPS → HTTP downgrade",
    signals.suspiciousDomainPattern && "Unusual domain name structure",
    signals.suspiciousTld && "Uncommon top-level domain"
  ].filter(Boolean);

  const fogClass =
    score.label === "HIGH"
      ? "fog-high"
      : score.label === "MED"
      ? "fog-med"
      : "fog-low";

  root.innerHTML = `
    <div class="lamplight-card">
      <div class="lamplight-header">
        <span>Lamplight Scope</span>
        <button id="lamplight-close">×</button>
      </div>

      <div class="lamplight-section">
        <div class="label">Destination</div>
        ${renderCopyableUrl(report.finalUrl)}
      </div>

      <div class="lamplight-section">
        <div class="label">Stats</div>

        ${statRow(
          "Redirects",
          redirectCount,
          "How many times the link forwards you before reaching the final page."
        )}

        ${statRow(
          "Familiarity",
          familiarity,
          "How often this domain has appeared in scans."
        )}

        ${statRow(
          "Tracking Params",
          signals.trackingParams ? "YES" : "NO",
          "URL parameters commonly used for analytics tracking."
        )}

        ${statRow(
          "Cookies on Contact",
          signals.cookieOnFirstContact ? "YES" : "NO",
          "Whether the server attempted to set cookies immediately."
        )}

        ${statRow(
          "HTTPS Downgrade",
          signals.httpDowngrade ? "YES" : "NO",
          "Indicates the link moved from HTTPS to HTTP."
        )}
      </div>

      <div class="lamplight-section">
        <div class="label">Signals Detected</div>
        ${
          activeSignals.length === 0
            ? `<div class="value muted">No suspicious behavior detected.</div>`
            : `
              <ul class="signal-list">
                ${activeSignals.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
              </ul>
            `
        }
      </div>

      <div class="lamplight-section">
        <div class="label">Fog Score</div>

        <div class="fog-pill ${fogClass}">
          ${escapeHtml(score.label)} (${escapeHtml(String(score.value))}/10)
        </div>

        ${
          score.reasons?.length
            ? `
              <div class="value muted" style="margin-bottom: 6px;">
                Based on ${escapeHtml(String(score.reasons.length))} signal${
                score.reasons.length > 1 ? "s" : ""
              }
              </div>
              <ul class="signal-list">
                ${score.reasons
                  .map((r) => `<li>— ${escapeHtml(r)}</li>`)
                  .join("")}
              </ul>
            `
            : `<div class="value muted">No risk indicators.</div>`
        }
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // Enable drag (header handle)
  makeDraggable(root);

  // Close button
  document
    .getElementById("lamplight-close")
    .addEventListener("click", () => root.remove());

  // Copy full URL on click (event delegation)
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest?.(".lamplight-url");
    if (!btn) return;

    const fullUrl = btn.getAttribute("data-full-url") || "";
    try {
      await copyToClipboard(fullUrl);

      const copiedEl = root.querySelector(".lamplight-copied");
      if (copiedEl) {
        copiedEl.hidden = false;
        clearTimeout(copiedEl.__t);
        copiedEl.__t = setTimeout(() => {
          copiedEl.hidden = true;
        }, 1200);
      }
    } catch (err) {
      console.warn("Copy failed", err);
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === MSG_SHOW_SCOPE) {
    createOverlay(msg.payload.report);
  }
});