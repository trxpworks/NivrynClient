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
  if (name.includes("launcher")) score += 8;
  if (type === "setup" && /(setup|installer|install)/.test(name)) score += 36;
  if (type === "setup" && /(portable|blockmap|yml|yaml)/.test(name)) score -= 45;
  if (type === "portable" && name.includes("portable")) score += 36;
  if (type === "portable" && /(setup|installer|install|blockmap|yml|yaml)/.test(name)) score -= 45;
  if (type === "portable" && name.endsWith(".exe") && !/(setup|installer|install)/.test(name)) score += 12;
  if (/(debug|symbols|source)/.test(name)) score -= 20;
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

function setButtons(buttons, asset, label) {
  for (const button of buttons) {
    if (asset) {
      button.href = asset.browser_download_url;
      button.textContent = label;
      button.setAttribute("data-asset", asset.name || "");
    } else {
      button.href = releasesPage;
      button.textContent = `${label} on GitHub`;
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
  return cleaned.length > 210 ? `${cleaned.slice(0, 210)}...` : cleaned;
}

function renderReleaseList(releases) {
  if (!els.releaseList) return;
  if (!releases.length) {
    els.releaseList.innerHTML = `<article class="release-item"><div><h3>No public releases found</h3><p>Open GitHub Releases to check the latest downloadable Flow builds.</p></div><a href="${releasesPage}" target="_blank" rel="noreferrer">Open</a></article>`;
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
    const publicReleases = Array.isArray(releases) ? releases.filter((release) => !release.draft) : [];
    const stable = publicReleases.find((release) => !release.prerelease) || publicReleases[0];
    if (!stable) throw new Error("No public release assets found");

    const setup = bestAsset(stable, "setup");
    const portable = bestAsset(stable, "portable");
    const tag = stable.tag_name || stable.name || "Latest";

    if (els.latestVersion) els.latestVersion.textContent = `Flow Client ${tag}`;
    if (els.latestSummary) {
      els.latestSummary.textContent = setup || portable
        ? "Latest public build is ready. The installer bundles Flow Launcher and the Flow Client jar, then sets up official Minecraft runtime files on first launch."
        : "Release found, but no Windows EXE assets were detected. Open GitHub Releases to download manually.";
    }
    if (els.releaseDate) els.releaseDate.textContent = `Published: ${formatDate(stable.published_at)}`;
    if (els.releaseStatus) els.releaseStatus.textContent = setup || portable ? "Status: assets ready" : "Status: release page only";
    if (els.feedHint) els.feedHint.textContent = "Pulled live from GitHub Releases.";

    setButtons(setupButtons, setup, "Download Setup");
    setButtons(portableButtons, portable, "Portable EXE");
    renderReleaseList(publicReleases.slice(0, 5));
  } catch (error) {
    if (els.latestVersion) els.latestVersion.textContent = "Flow Client Releases";
    if (els.latestSummary) els.latestSummary.textContent = `Could not load GitHub releases automatically: ${error.message}. Use the GitHub Releases button instead.`;
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
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  items.forEach((item) => observer.observe(item));
}

initReveal();
loadReleases();