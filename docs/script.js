const OWNER = "trxpworks";
const REPO = "FlowClient";
const releasesUrl = `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=5`;
const releasesPage = `https://github.com/${OWNER}/${REPO}/releases`;

const els = {
  latestVersion: document.getElementById("latestVersion"),
  latestSummary: document.getElementById("latestSummary"),
  releaseDate: document.getElementById("releaseDate"),
  releaseStatus: document.getElementById("releaseStatus"),
  releaseList: document.getElementById("releaseList"),
  feedHint: document.getElementById("feedHint"),
};

const setupButtons = ["heroSetupBtn", "setupBtn"].map((id) => document.getElementById(id)).filter(Boolean);
const portableButtons = ["heroPortableBtn", "portableBtn"].map((id) => document.getElementById(id)).filter(Boolean);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function assetScore(assetName, type) {
  const name = String(assetName || "").toLowerCase();
  let score = 0;
  if (name.endsWith(".exe")) score += 20;
  if (name.includes("flow")) score += 14;
  if (name.includes("launcher")) score += 10;
  if (type === "setup" && /(setup|installer|install)/.test(name)) score += 30;
  if (type === "setup" && name.includes("portable")) score -= 40;
  if (type === "portable" && name.includes("portable")) score += 30;
  if (type === "portable" && /(setup|installer|install|blockmap)/.test(name)) score -= 40;
  if (type === "portable" && name.endsWith(".exe") && !/(setup|installer|install)/.test(name)) score += 12;
  if (/(debug|source|symbols|yml|yaml|blockmap)/.test(name)) score -= 18;
  return score;
}

function bestAsset(release, type) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const ranked = assets
    .filter((asset) => asset?.browser_download_url)
    .map((asset) => ({ asset, score: assetScore(asset.name, type) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 10 ? ranked[0].asset : null;
}

function setButtons(buttons, asset, fallbackLabel) {
  for (const button of buttons) {
    if (asset) {
      button.href = asset.browser_download_url;
      button.textContent = fallbackLabel;
      button.setAttribute("data-asset", asset.name || "");
    } else {
      button.href = releasesPage;
      button.textContent = `${fallbackLabel} (GitHub)`;
    }
  }
}

function shortBody(body) {
  const cleaned = String(body || "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/[#>*_`\[\]()]/g, "")
    .replace(/\r?\n+/g, " ")
    .trim();
  if (!cleaned) return "Release notes available on GitHub.";
  return cleaned.length > 190 ? `${cleaned.slice(0, 190)}...` : cleaned;
}

function renderReleaseList(releases) {
  if (!els.releaseList) return;
  if (!releases.length) {
    els.releaseList.innerHTML = `<div class="release-item"><div><h3>No releases found</h3><p>GitHub did not return public releases yet.</p></div><a href="${releasesPage}">Open GitHub</a></div>`;
    return;
  }

  els.releaseList.innerHTML = releases
    .map((release) => `
      <article class="release-item">
        <div>
          <h3>${escapeHtml(release.name || release.tag_name || "Flow Release")}</h3>
          <p>${escapeHtml(formatDate(release.published_at))} - ${escapeHtml(shortBody(release.body))}</p>
        </div>
        <a href="${escapeHtml(release.html_url || releasesPage)}" target="_blank" rel="noreferrer">View</a>
      </article>
    `)
    .join("");
}

async function loadReleases() {
  try {
    const response = await fetch(releasesUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const releases = await response.json();
    const stable = Array.isArray(releases) ? releases.find((release) => !release.draft && !release.prerelease) || releases[0] : null;

    if (!stable) throw new Error("No public releases found");

    const setup = bestAsset(stable, "setup");
    const portable = bestAsset(stable, "portable");
    const tag = stable.tag_name || stable.name || "Latest Release";

    if (els.latestVersion) els.latestVersion.textContent = `Flow Client ${tag}`;
    if (els.latestSummary) {
      els.latestSummary.textContent = setup || portable
        ? "Latest public build is available. The installer includes the Flow launcher and bundled Flow Client jar."
        : "Release found, but no EXE assets were detected. Open GitHub Releases to download manually.";
    }
    if (els.releaseDate) els.releaseDate.textContent = `Published: ${formatDate(stable.published_at)}`;
    if (els.releaseStatus) els.releaseStatus.textContent = setup || portable ? "Status: assets ready" : "Status: release page only";
    if (els.feedHint) els.feedHint.textContent = "Pulled live from GitHub Releases.";

    setButtons(setupButtons, setup, "Download Setup");
    setButtons(portableButtons, portable, "Portable EXE");
    renderReleaseList(releases.slice(0, 5));
  } catch (error) {
    if (els.latestVersion) els.latestVersion.textContent = "Flow Client Releases";
    if (els.latestSummary) els.latestSummary.textContent = `Could not load GitHub releases automatically: ${error.message}. Use the GitHub releases button instead.`;
    if (els.releaseStatus) els.releaseStatus.textContent = "Status: GitHub fallback";
    if (els.feedHint) els.feedHint.textContent = "Release feed could not be loaded in this browser session.";
    renderReleaseList([]);
  }
}

function initReveal() {
  const items = Array.from(document.querySelectorAll(".reveal"));
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("revealed");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.15, rootMargin: "0px 0px -7% 0px" });

  items.forEach((item) => observer.observe(item));
}

initReveal();
loadReleases();