(function () {
  const L = self.LAMPLIGHT || (self.LAMPLIGHT = {});
  const H = L.heuristics;
  const F = L.familiarity;

  function domainFromUrl(u) {
    try { return new URL(u).hostname; }
    catch { return ""; }
  }

  function hasTrackingParams(url) {
    try {
      const u = new URL(url);
      for (const k of u.searchParams.keys()) {
        if (k.startsWith("utm_") || k === "gclid" || k === "fbclid") {
          return true;
        }
      }
    } catch {}
    return false;
  }

  function computeScore(signals, redirectAnalysis) {
    let value = 0;
    const reasons = [];

    if (redirectAnalysis.totalRedirects > 1) {
      value += 3;
      reasons.push("Multiple redirects");
    }

    if (redirectAnalysis.domainChanges > 1) {
      value += 2;
      reasons.push("Redirect crosses domains");
    }

    if (redirectAnalysis.containsShortener) {
      value += 2;
      reasons.push("URL shortener in redirect chain");
    }

    if (signals.trackingParams) {
      value += 2;
      reasons.push("Tracking parameters detected");
    }

    if (signals.downloadLike) {
      value += 3;
      reasons.push("Download-like response");
    }

    if (signals.httpDowngrade) {
      value += 2;
      reasons.push("HTTPS → HTTP downgrade");
    }

    if (signals.typosquatPattern) {
      value += 3;
      reasons.push("Suspicious domain pattern");
    }

    if (signals.suspiciousTLD) {
      value += 2;
      reasons.push("Suspicious TLD");
    }

    let label = "LOW";
    if (value >= 7) label = "HIGH";
    else if (value >= 3) label = "MED";

    return { label, value, reasons };
  }

  L.runScope = async function (targetUrl) {
    const startTime = Date.now();

    const redirects = [];
    let current = targetUrl;
    let response;

    try {
      for (let i = 0; i < 5; i++) {
        response = await fetch(current, {
          method: "GET",
          redirect: "manual"
        });

        redirects.push({
          url: current,
          domain: domainFromUrl(current)
        });

        if (response.status >= 300 && response.status < 400) {
          const loc = response.headers.get("location");
          if (!loc) break;

          current = new URL(loc, current).href;
        } else {
          break;
        }
      }
    } catch (e) {
      throw e;
    }

    const finalUrl = current;
    const finalDomain = domainFromUrl(finalUrl);

    const contentType = response?.headers.get("content-type") || "";
    const setCookie = response?.headers.get("set-cookie");

    const redirectAnalysis = H.analyzeRedirects(redirects);

    const signals = {
      trackingParams: hasTrackingParams(targetUrl),
      downloadLike: H.detectDownloadLike(contentType, finalUrl),
      cookieOnFirstContact: !!setCookie,
      httpDowngrade:
        targetUrl.startsWith("https://") &&
        finalUrl.startsWith("http://"),
      typosquatPattern: H.detectTyposquatPattern(finalDomain),
      suspiciousTLD: H.detectSuspiciousTLD(finalDomain)
    };

    const familiarityLabel = await F.getFamiliarity(finalDomain);
    await F.incrementDomain(finalDomain);

    const score = computeScore(signals, redirectAnalysis);

    return {
      targetUrl,
      finalUrl,
      redirects,
      redirectAnalysis,
      signals,
      familiarity: {
        domain: finalDomain,
        label: familiarityLabel
      },
      footprint: {
        domains: [],
        count: 0
      },
      explanations: {},
      meta: {
        version: "scope-v1",
        durationMs: Date.now() - startTime
      },
      score,
      generatedAt: new Date().toISOString()
    };
  };
})();