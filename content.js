/**
 * Configuration & Constants
 */
const CONFIG = {
  CACHE_TTL: 1000 * 60 * 10,
  CSS_ID: 'gitlab-mr-preview-styles',
  SELECTOR: "a[href*='/merge_requests/']"
};

const MR_REGEX = /https?:\/\/([^\/]+)\/(.+?)\/-\/merge_requests?\/(\d+)/;

/**
 * CSS Styles - Separated from Logic
 */
  // language=CSS
const STYLES = `
    .gl-card {
      all: initial; /* Reset inherited styles */
      display: block;
      max-width: 520px;
      padding: 12px;
      margin: 8px 0;
      border: 1px solid var(--color-border, #ddd);
      border-radius: 8px;
      background: var(--color-bg, #fff);
      color: var(--color-text, #111);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      cursor: pointer;
      transition: transform 0.1s ease;

      &:hover {
        transform: translateY(-1px);
        border-color: #aaa;
      }
    }

    .title {
      font-weight: 600;
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: space-between;
    }

    .meta {
      font-size: 12px;
      display: flex;
      gap: 12px;
      color: var(--color-text-secondary, #333);
      justify-content: space-between;
      
      .author {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .avatar {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        object-fit: cover;
        background: #eee; /* Fallback placeholder */
      }
    }

    @media (prefers-color-scheme: dark) {
      .gl-card {
        --color-bg: #2b2b2b;
        --color-text: #eee;
        --color-border: #444;
        --color-text-secondary: #ccc;
      }
    }
  `;

/**
 * Handles persistence and memory caching
 */
const Cache = {
  _memory: new Map(),

  async get(key) {
    if (this._memory.has(key)) return this._memory.get(key);

    const store = await chrome.storage.local.get(key);
    const entry = store[key];

    if (entry && Date.now() < entry.expiry) {
      this._memory.set(key, entry.data);
      return entry.data;
    }
    return null;
  },

  async set(key, data) {
    const expiry = Date.now() + CONFIG.CACHE_TTL;
    this._memory.set(key, data);
    await chrome.storage.local.set({ [key]: { data, expiry } });
  }
};

/**
 * GitLab API Interactions
 */
const GitLabAPI = {
  _inFlight: new Map(),

  async fetchMR(host, projectPath, iid) {
    const key = `${host}:${projectPath}:${iid}`;

    // 1. Check Cache
    const cached = await Cache.get(`mr:${key}`);
    if (cached) return cached;

    // 2. Deduplicate simultaneous requests
    if (this._inFlight.has(key)) return this._inFlight.get(key);

    const promise = this._performFetch(host, projectPath, iid, key);
    this._inFlight.set(key, promise);
    return promise;
  },

  async _performFetch(host, projectPath, iid, key) {
    try {
      const { gitlabToken } = await chrome.storage.local.get("gitlabToken");
      if (!gitlabToken) return null;

      const baseUrl = `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests/${iid}`;
      const headers = { "PRIVATE-TOKEN": gitlabToken };

      const [resMR, resApp] = await Promise.all([
        fetch(baseUrl, { headers }),
        fetch(`${baseUrl}/approvals`, { headers }).catch(() => ({ ok: false }))
      ]);

      if (!resMR.ok) throw new Error(`HTTP ${resMR.status}`);

      const data = await resMR.json();
      data.approvals = resApp.ok ? await resApp.json() : {};

      await Cache.set(`mr:${key}`, data);
      return data;
    } catch (err) {
      console.warn("GitLab Preview skip:", err.message);
      return null;
    } finally {
      this._inFlight.delete(key);
    }
  }
};

/**
 * UI Rendering Logic
 */
const UI = {
  init() {
    if (document.getElementById(CONFIG.CSS_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = CONFIG.CSS_ID;
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  },

  async createCard(mr) {
    const card = document.createElement('div');
    card.className = 'gl-card';
    card.onclick = (e) => {
      e.stopPropagation();
      window.open(mr.web_url, '_blank');
    };

    const status = { merged: "🟣 Merged", closed: "🔴 Closed" }[mr.state] || "🟢 Open";
    const approvedCount = mr.approvals?.approved_by?.length || 0;
    const requiredCount = mr.approvals?.approvals_required || 0;

    card.innerHTML = `
    <div class="title">
       <span class="title-text"></span>
       <span class="title-id"></span>
    </div>
    <div class="meta">
      <div class="author">
        <span class="name"></span>
      </div>
      <span class="approvals"></span>
    </div>
  `;

    // 1. Securely set the text nodes
    card.querySelector('.title-text').textContent = mr.title;
    card.querySelector('.title-id').textContent = `!${mr.iid}`;
    card.querySelector('.name').textContent = mr.author?.name || 'Unknown';
    card.querySelector('.approvals').textContent = `${status} · ✔ ${approvedCount}/${requiredCount} approvals`;

    // 2. Inject the avatar if it exists
    if (mr.author?.avatar_url) {
      const img = document.createElement('img');
      img.className = 'avatar';
      img.alt = `${mr.author.name}'s avatar`;

      img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

      const nameEl = card.querySelector('.name');
      nameEl.parentNode.insertBefore(img, nameEl);

      // Safely request the image data behind the scenes
      chrome.runtime.sendMessage(
        { action: "fetchAvatar", url: mr.author.avatar_url },
        (response) => {
          if (response && response.dataUrl) {
            img.src = response.dataUrl;
            return;
          }
          img.remove();
        }
      );
    }

    return card;
  }
};

async function processLink(link) {
  if (link.dataset.mrProcessed || !link.href) return;

  const match = link.href.match(MR_REGEX);
  if (!match) return;

  link.dataset.mrProcessed = "true";
  const [, host, projectPath, iid] = match;

  const data = await GitLabAPI.fetchMR(host, projectPath, iid);
  if (data) {
    link.after(await UI.createCard(data));
  }
}

// Initialization
UI.init();

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) {
        const links = node.matches(CONFIG.SELECTOR) ? [node] : node.querySelectorAll(CONFIG.SELECTOR);
        links.forEach(processLink);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
document.querySelectorAll(CONFIG.SELECTOR).forEach(processLink);