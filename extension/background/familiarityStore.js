// Lamplight Familiarity Store
// Tracks how often domains are seen locally.
// Designed to be replaceable by Valkey later.

(function () {
  const L = self.LAMPLIGHT || (self.LAMPLIGHT = {});
  const F = {};
  L.familiarity = F;

  const STORAGE_KEY = "lamplight_domain_counts";

  async function getAllCounts () {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        resolve(res[STORAGE_KEY] || {});
      });
    });
  }

  async function saveAllCounts (counts) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: counts }, resolve);
    });
  }

  F.incrementDomain = async function (domain) {
    if (!domain) return;

    const counts = await getAllCounts();
    counts[domain] = (counts[domain] || 0) + 1;
    await saveAllCounts(counts);
  };

  F.getFamiliarity = async function (domain) {
    const counts = await getAllCounts();
    const n = counts[domain] || 0;

    if (n > 20) return "COMMON";
    if (n > 3) return "SEEN";
    return "UNKNOWN";
  };

})();