const REPO_OWNER = "trxpworks";
const REPO_NAME = "FlowClient";

const RELEASES_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=6`;
const RELEASE_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

const revealItems = Array.from(document.querySelectorAll(".reveal"));

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.18, rootMargin: "0px 0px -5% 0px" },
  );

  for (const item of revealItems) {
    observer.observe(item);
  }
} else {
  for (const item of revealItems) {
    item.classList.add("revealed");
  }
}

const latestVersionEl = document.getElementById("latestVersion");
const latestPublishedEl = document.getElementById("latestPublished");
const latestChannelEl = document.getElementById("latestChannel");
const downloadStatusEl = document.getElementById("downloadStatus");
const feedHintEl = document.getElementById("feedHint");
const releaseListEl = document.getElementById("releaseList");
const downloadHintEl = document.getElementById("downloadHint");

const setupButtons = [document.getElementById("heroDownloadBtn"), document.getElementById("setupBtn")].filter(Boolean);
const releaseButtons = [document.getElementById("heroReleaseBtn")].filter(Boolean);
const portableButtons = [document.getElementById("portableBtn")].filter(Boolean);

function formatDate(input) {
  if (!input) {
    return "-";
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeTag(value) {
  return String(value || "").replace(/^v/i, "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function scoreAsset(name, type) {
  const lower = String(name || "").toLowerCase();

  let score = 0;

  if (lower.endsWith(".exe")) {
    score += 20;
  }

  if (lower.includes("flow")) {
    score += 20;
  }

  if (lower.includes("client")) {
    score += 8;
  }

  if (lower.includes("launcher")) {
    score += 8;
  }

  if (type === "setup" && /(setup|installer|install)/.test(lower)) {
    score += 22;
  }

  if (type === "setup" && /portable/.test(lower)) {
    score -= 30;
  }

  if (type === "portable" && /portable/.test(lower)) {
    score += 22;
  }

  if (type === "portable" && /(setup|installer|install|blockmap)/.test(lower)) {
    score -= 34;
  }

  if (type === "portable" && lower.endsWith(".exe") && !/(setup|installer|install)/.test(lower)) {
    score += 14;
  }

  if (lower.includes("debug") || lower.includes("source") || lower.includes("symbols")) {
    score -= 12;
  }

  return score;
}

function getBestAssetUrl(release, type) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (!assets.length) {
    return "";
  }

  const ranked = assets
    .filter((asset) => String(asset?.browser_download_url || ""))
    .map((asset) => ({ asset, score: scoreAsset(asset?.name, type) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 14) {
    return "";
  }

  return String(best.asset.browser_download_url || "");
}

function setStatus(label, tone) {
  if (!downloadStatusEl) {
    return;
  }

  downloadStatusEl.textContent = label;
  downloadStatusEl.classList.remove("status-loading", "status-good", "status-empty", "status-error");

  if (tone === "good") {
    downloadStatusEl.classList.add("status-good");
    return;
  }

  if (tone === "empty") {
    downloadStatusEl.classList.add("status-empty");
    return;
  }

  if (tone === "error") {
    downloadStatusEl.classList.add("status-error");
    return;
  }

  downloadStatusEl.classList.add("status-loading");
}

function applyLink(button, url) {
  if (!button) {
    return;
  }

  if (!url) {
    button.href = RELEASE_PAGE_URL;
    button.setAttribute("aria-disabled", "true");
    button.classList.add("btn-disabled");
    return;
  }

  button.href = url;
  button.removeAttribute("aria-disabled");
  button.classList.remove("btn-disabled");
}

function setReleasePageButtons() {
  for (const button of releaseButtons) {
    button.href = RELEASE_PAGE_URL;
  }
}

function setNoReleaseState() {
  if (latestVersionEl) {
    latestVersionEl.textContent = "No release";
  }

  if (latestPublishedEl) {
    latestPublishedEl.textContent = "-";
  }

  if (latestChannelEl) {
    latestChannelEl.textContent = "-";
  }

  setStatus("Waiting", "empty");

  for (const button of setupButtons) {
    applyLink(button, "");
    if (button.id === "heroDownloadBtn") {
      button.textContent = "No Build Published Yet";
    }
  }

  for (const button of portableButtons) {
    applyLink(button, "");
    button.textContent = "Portable Not Available";
  }

  if (downloadHintEl) {
    downloadHintEl.innerHTML = `
      <h3>Release Check</h3>
      <p>No Flow Client release is published yet. Publish a GitHub release in <strong>${escapeHtml(`${REPO_OWNER}/${REPO_NAME}`)}</strong> and setup/portable buttons will auto-activate.</p>
    `;
  }

  if (feedHintEl) {
    feedHintEl.textContent = "No public versions yet.";
  }

  if (releaseListEl) {
    releaseListEl.innerHTML = `
      <article class="release-item">
        <h3>No releases published</h3>
        <p>Flow Client will appear here once a GitHub release is created.</p>
        <div class="release-links">
          <a class="mini-link" href="${escapeHtml(RELEASE_PAGE_URL)}" target="_blank" rel="noreferrer">Open Releases Page</a>
        </div>
      </article>
    `;
  }
}

function setErrorState(message) {
  setStatus("Unavailable", "error");

  if (feedHintEl) {
    feedHintEl.textContent = "Failed to load release timeline.";
  }

  if (downloadHintEl) {
    downloadHintEl.innerHTML = `
      <h3>Release Check</h3>
      <p>${escapeHtml(message)}. You can still use the releases page directly.</p>
    `;
  }

  if (releaseListEl) {
    releaseListEl.innerHTML = `
      <article class="release-item">
        <h3>Could not load releases</h3>
        <p>${escapeHtml(message)}</p>
        <div class="release-links">
          <a class="mini-link" href="${escapeHtml(RELEASE_PAGE_URL)}" target="_blank" rel="noreferrer">Open Releases Page</a>
        </div>
      </article>
    `;
  }

  for (const button of setupButtons) {
    button.href = RELEASE_PAGE_URL;
    button.removeAttribute("aria-disabled");
    button.classList.remove("btn-disabled");
  }

  for (const button of portableButtons) {
    button.href = RELEASE_PAGE_URL;
    button.removeAttribute("aria-disabled");
    button.classList.remove("btn-disabled");
  }
}

function sanitizeNotes(body) {
  const compact = String(body || "")
    .replace(/\r/g, "")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return "No release notes provided.";
  }

  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function applyLatestRelease(release) {
  const version = normalizeTag(release?.tag_name || release?.name || "Unknown");
  const published = formatDate(release?.published_at || release?.created_at);
  const channel = release?.prerelease ? "Preview" : "Stable";

  if (latestVersionEl) {
    latestVersionEl.textContent = `v${version}`;
  }

  if (latestPublishedEl) {
    latestPublishedEl.textContent = published;
  }

  if (latestChannelEl) {
    latestChannelEl.textContent = channel;
  }

  const setupUrl = getBestAssetUrl(release, "setup");
  const portableUrl = getBestAssetUrl(release, "portable");

  if (setupUrl || portableUrl) {
    setStatus("Ready", "good");
  } else {
    setStatus("Partial", "empty");
  }

  for (const button of setupButtons) {
    applyLink(button, setupUrl);
    if (button.id === "heroDownloadBtn" && setupUrl) {
      button.textContent = "Download Latest";
    }
  }

  for (const button of portableButtons) {
    applyLink(button, portableUrl);
    if (portableUrl) {
      button.textContent = "Portable EXE";
    }
  }

  if (downloadHintEl) {
    const setupState = setupUrl ? "Setup asset detected." : "Setup asset not found in latest release.";
    const portableState = portableUrl ? "Portable asset detected." : "Portable asset not found in latest release.";

    downloadHintEl.innerHTML = `
      <h3>Release Check</h3>
      <p>Latest version <strong>v${escapeHtml(version)}</strong> published ${escapeHtml(published)}.</p>
      <p>${escapeHtml(setupState)} ${escapeHtml(portableState)}</p>
    `;
  }
}

function buildReleaseCard(release) {
  const version = normalizeTag(release?.tag_name || release?.name || "Unknown");
  const title = String(release?.name || release?.tag_name || "Release").trim();
  const published = formatDate(release?.published_at || release?.created_at);
  const notes = sanitizeNotes(release?.body);
  const releaseUrl = String(release?.html_url || RELEASE_PAGE_URL);
  const setupUrl = getBestAssetUrl(release, "setup");
  const portableUrl = getBestAssetUrl(release, "portable");

  const links = [];
  links.push(`<a class="mini-link" href="${escapeHtml(releaseUrl)}" target="_blank" rel="noreferrer">Notes</a>`);

  if (setupUrl) {
    links.push(`<a class="mini-link" href="${escapeHtml(setupUrl)}" target="_blank" rel="noreferrer">Setup</a>`);
  }

  if (portableUrl) {
    links.push(`<a class="mini-link" href="${escapeHtml(portableUrl)}" target="_blank" rel="noreferrer">Portable</a>`);
  }

  return `
    <article class="release-item">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(notes)}</p>
      <p class="meta">v${escapeHtml(version)} | ${escapeHtml(published)}</p>
      <div class="release-links">${links.join("")}</div>
    </article>
  `;
}

async function loadReleases() {
  setReleasePageButtons();

  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      let details = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.message) {
          details = `${details} - ${payload.message}`;
        }
      } catch {
        // Ignore parse errors.
      }

      throw new Error(details);
    }

    const payload = await response.json();
    const releases = Array.isArray(payload) ? payload.filter((entry) => !entry?.draft) : [];

    if (!releases.length) {
      setNoReleaseState();
      return;
    }

    applyLatestRelease(releases[0]);

    if (feedHintEl) {
      feedHintEl.textContent = "Synced with FlowClient GitHub releases.";
    }

    if (releaseListEl) {
      releaseListEl.innerHTML = releases.slice(0, 4).map((release) => buildReleaseCard(release)).join("");
    }
  } catch (error) {
    setErrorState(String(error?.message || "Unknown error"));
  }
}

loadReleases();
