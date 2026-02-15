// Lamplight Scope Heuristics
// Pure detection and interpretation logic.
// No Chrome APIs here.

(function () {
  const H = {};
  const L = self.LAMPLIGHT || (self.LAMPLIGHT = {});
  L.heuristics = H;

  // Known URL shorteners
  const SHORTENERS = new Set([
    "bit.ly",
    "t.co",
    "tinyurl.com",
    "goo.gl",
    "ow.ly",
    "is.gd",
    "buff.ly",
    "rebrand.ly"
  ]);

  // Suspicious TLDs (not definitive — heuristic only)
  const SUSPICIOUS_TLDS = new Set([
    "zip",
    "click",
    "country",
    "gq",
    "tk",
    "ml"
  ]);

  function domainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  H.analyzeRedirects = function (redirects) {
    const domains = redirects.map(r => r.domain).filter(Boolean);

    let domainChanges = 0;
    for (let i = 1; i < domains.length; i++) {
      if (domains[i] !== domains[i - 1]) domainChanges++;
    }

    const containsShortener = domains.some(d => SHORTENERS.has(d));

    return {
      totalRedirects: redirects.length - 1,
      domainChanges,
      containsShortener,
      suspiciousPattern:
        redirects.length > 3 || domainChanges > 2 || containsShortener
    };
  };

  H.detectTyposquatPattern = function (domain) {
    if (!domain) return false;

    // repeated characters heuristic
    if (/(.)\1\1/.test(domain)) return true;

    // mixed numeric substitution heuristic
    if (/[0-9]/.test(domain) && /[a-z]/.test(domain)) return true;

    return false;
  };

  H.detectSuspiciousTLD = function (domain) {
    if (!domain) return false;
    const parts = domain.split(".");
    const tld = parts[parts.length - 1];
    return SUSPICIOUS_TLDS.has(tld);
  };

  H.detectDownloadLike = function (contentType, url) {
    if (!contentType) return false;

    if (!contentType.includes("text/html")) return true;

    const lowered = url.toLowerCase();
    if (
      lowered.endsWith(".exe") ||
      lowered.endsWith(".zip") ||
      lowered.endsWith(".dmg") ||
      lowered.endsWith(".msi")
    ) {
      return true;
    }

    return false;
  };

})();