const MR_REGEX = /https?:\/\/([^\/]+)\/(.+?)\/-\/merge_requests?\/(\d+)/;

const CACHE_TTL = 1000 * 60 * 10;

// ---- cache ----
const memoryCache = new Map();
const pendingRequests = new Map();

function getStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() > parsed.expiry) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setStorage(key, data) {
  localStorage.setItem(
    key,
    JSON.stringify({ data, expiry: Date.now() + CACHE_TTL })
  );
}

async function fetchMR(host, projectPath, iid) {
  const TOKEN = await getToken();
  if (!TOKEN) throw new Error("Missing GitLab token");

  const key = `${host}:${projectPath}!${iid}`;

  if (memoryCache.has(key)) return memoryCache.get(key);

  const stored = getStorage(key);
  if (stored) {
    memoryCache.set(key, stored);
    return stored;
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const base = `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests/${iid}`;

  const promise = Promise.all([
    fetch(base, {
      headers: { "PRIVATE-TOKEN": TOKEN }
    }).then(r => r.json()),
    fetch(`${base}/approvals`, {
      headers: { "PRIVATE-TOKEN": TOKEN }
    }).then(r => r.json()).catch(() => null)
  ])
  .then(([mr, approvals]) => {
    const data = { ...mr, approvals };
    memoryCache.set(key, data);
    setStorage(key, data);
    pendingRequests.delete(key);
    return data;
  })
  .catch(e => {
    pendingRequests.delete(key);
    throw e;
  });

  pendingRequests.set(key, promise);
  return promise;
}

// ---- helpers ----
function isDarkMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function el(tag, styles = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e.style, styles);
  if (text) e.textContent = text;
  return e;
}

function getCardId(host, projectPath, iid) {
  return `mr-card-${host}-${projectPath}-${iid}`.replace(/[^\w-]/g, "_");
}

let cachedToken = null;
async function getToken() {
  if (cachedToken) return cachedToken;

  const res = await chrome.storage.local.get(["gitlabToken"]);
  cachedToken = res.gitlabToken;
  return cachedToken;
}

// ---- tooltip ----
function createTooltip(text) {
  const tooltip = el("div", {
    position: "fixed",
    zIndex: 9999,
    maxWidth: "300px",
    padding: "8px",
    borderRadius: "6px",
    fontSize: "12px",
    pointerEvents: "none",
    background: "#111",
    color: "#fff",
    opacity: 0,
    transition: "opacity 0.1s"
  }, text);

  document.body.appendChild(tooltip);

  return tooltip;
}

// ---- UI ----
function createCard(mr) {
  const dark = isDarkMode();

  const card = el("div", {
    border: `1px solid ${dark ? "#444" : "#ddd"}`,
    borderRadius: "10px",
    padding: "10px 12px",
    marginTop: "6px",
    background: dark ? "#2b2b2b" : "#fff",
    color: dark ? "#eee" : "#111",
    fontSize: "13px",
    maxWidth: "520px",
    cursor: "pointer"
  });

  card.onclick = () => window.open(mr.web_url, "_blank");

  // tooltip
  const tooltip = createTooltip(mr.description || "No description");

  card.onmouseenter = e => {
    tooltip.style.opacity = 1;
    tooltip.style.left = e.pageX + 10 + "px";
    tooltip.style.top = e.pageY + 10 + "px";
  };

  card.onmousemove = e => {
    tooltip.style.left = e.pageX + 10 + "px";
    tooltip.style.top = e.pageY + 10 + "px";
  };

  card.onmouseleave = () => {
    tooltip.style.opacity = 0;
  };

  // title
  const title = el("div", { fontWeight: "600", marginBottom: "4px" }, mr.title);

  // meta
  const stateEmoji =
    mr.state === "merged" ? "🟣 Merged!" :
    mr.state === "closed" ? "🔴 Closed" :
    "🟢 In progress...";
  const stateEl = el("span", { }, `${stateEmoji} !${mr.iid} · ${mr.author?.name}`);

  const meta = el("div", {
    opacity: "0.7",
    fontSize: "12px",
    display: "flex",
    gap: "4px",
    justifyContent: "space-between",
  });
  meta.appendChild(stateEl);

  // approvals
  const approvals = mr.approvals;

  if (approvals) {
    meta.appendChild(el("span", {}, `✔ ${approvals.approved_by?.length || 0}/${approvals.approvals_required || 0} approvals`));
  }

  card.appendChild(title);
  card.appendChild(meta);

  return card;
}

function createLoading() {
  return el("div", {
    fontSize: "12px",
    opacity: "0.6",
    marginTop: "4px"
  }, "Loading MR…");
}

// ---- procesamiento ----
function processLink(a) {
  const href = a.href;

  const match = href.match(MR_REGEX);
  if (!match) return;

  const [, host, projectPath, iid] = match;
  const cardId = getCardId(host, projectPath, iid);

  // 🔑 si la card ya existe en el DOM → reinyectar y salir
  const existingCard = document.getElementById(cardId);
  if (existingCard) {
    if (a.nextSibling !== existingCard) {
      a.after(existingCard);
    }
    return;
  }

  // evitar múltiples loads simultáneos
  if (a.dataset.mrLoading) return;
  a.dataset.mrLoading = "true";

  const loading = createLoading();
  a.after(loading);

  fetchMR(host, projectPath, iid)
  .then(mr => {
    if (!mr?.title) return;

    const card = createCard(mr);
    card.id = cardId; // 🔑 aquí asignas el ID estable

    loading.replaceWith(card);
  })
  .catch(() => {
    loading.textContent = "Failed to load MR";
  });
}

// ---- scan ----
function scan(root = document) {
  console.log('Scanning...')
  root.querySelectorAll("a[href*='/merge_requests/']").forEach(processLink);
}

const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;

      const links = node.querySelectorAll?.("a[href*='gitlab']");
      if (links?.length) {
        links.forEach(processLink);
      }
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

scan();