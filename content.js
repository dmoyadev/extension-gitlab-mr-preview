/**
 * Configuration & Constants
 */
const CONFIG = {
  CACHE_TTL: 1000 * 60 * 10,
  CSS_ID: 'gitlab-mr-previewer-styles',
  SELECTOR: "a[href*='/merge_requests/']"
};

// Captures: 1. Host, 2. Path, 3. IID, 4. Note ID (optional)
const MR_REGEX = /https?:\/\/([^\/]+)\/(.+?)\/-\/merge_requests?\/(\d+)(?:#note_(\d+))?/;

/**
 * CSS Styles - Separated from Logic
 */
  // language=CSS
const STYLES = `
  .gl-card {
    --color-bg: #fff;
    --color-text: #111;
    --color-border: #ddd;
    --color-text-secondary: #333;
    
    all: initial; /* Reset inherited styles */
    display: block;
    max-width: 520px;
    padding: 12px;
    margin: 8px 0;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
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
    color: var(--color-text-secondary);
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

  .note {
    margin-top: 10px;
    padding: 8px;
    color: var(--color-text);
    display: -webkit-box;
    -webkit-line-clamp: 3; /* Limit to 3 lines */
    -webkit-box-orient: vertical;
    overflow: hidden;
    background: var(--color-border);
    border-radius: 4px;
  }
  
  /* Dark mode */
  html[data-theme="dark"] .gl-card,
  body.dark-mode .gl-card,
  [data-theme="dark"] .gl-card {
      --color-bg: #2b2b2b;
      --color-text: #eee;
      --color-border: #444;
      --color-text-secondary: #ccc;
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

  async fetchNote(host, projectPath, iid, noteId) {
    const key = `note:${host}:${projectPath}:${noteId}`;
    const cached = await Cache.get(key);
    if (cached) return cached;

    try {
      const { gitlabToken } = await chrome.storage.local.get("gitlabToken");
      const url = `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests/${iid}/notes/${noteId}`;

      const res = await fetch(url, { headers: { "PRIVATE-TOKEN": gitlabToken } });
      if (!res.ok) return null;

      const data = await res.json();
      await Cache.set(key, data);
      return data;
    } catch (err) {
      return null;
    }
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
      console.warn("GitLab Previewer skip:", err.message);
      return null;
    } finally {
      this._inFlight.delete(key);
    }
  },
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

  createCard(mr, url, note = null) {
    const card = document.createElement('div');
    card.className = 'gl-card';
    card.title = mr.description;
    card.onclick = () => window.open(url, '_blank');

    // Use the specific note author if it's a note, otherwise the MR author
    const author = note ? note.author : mr.author;
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
    ${note ? '<div class="note"></div>' : ''}
  `;

    card.querySelector('.title-text').textContent = mr.title;
    card.querySelector('.title-id').textContent = `!${mr.iid}`;
    card.querySelector('.name').textContent = `${author?.name || 'Unknown'} ${note ? ' commented:' : ''}`;
    card.querySelector('.approvals').textContent = `${status} · ✔ ${approvedCount}/${requiredCount} approvals`;

    if (note) {
      card.querySelector('.note').textContent = `💬 ${note.body}`;
    }

    // Handle Avatar (using the background script logic from before)
    if (author?.avatar_url) {
      this.injectAvatar(card, author);
    }

    return card;
  },

  injectAvatar(card, user) {
    // 2. Inject the avatar if it exists
    if (user.avatar_url) {
      const img = document.createElement('img');
      img.className = 'avatar';
      img.alt = `${user.name}'s avatar`;

      img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

      const nameEl = card.querySelector('.name');
      nameEl.parentNode.insertBefore(img, nameEl);

      // Safely request the image data behind the scenes
      chrome.runtime.sendMessage(
        { action: "fetchAvatar", url: user.avatar_url },
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

  const [, host, projectPath, iid, noteId] = match;
  link.dataset.mrProcessed = "true";

  // Fetch MR data always (for the title)
  const mrData = await GitLabAPI.fetchMR(host, projectPath, iid);
  if (!mrData) return;

  let noteData = null;
  if (noteId) {
    noteData = await GitLabAPI.fetchNote(host, projectPath, iid, noteId);
  }

  link.after(UI.createCard(mrData, link, noteData));
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