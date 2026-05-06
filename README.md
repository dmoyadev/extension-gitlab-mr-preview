# 🦊 GitLab MR Previewer

A lightweight Chrome Extension that transforms plain GitLab Merge Request links into rich, informative preview cards in Google Chat messages.

---

## ✨ Features

* **Rich Previews:** Instantly see MR titles, authors, and current status (Open, Merged, or Closed).
* **Approval Tracking:** Real-time visualization of approval counts (e.g., ✔ 2/3 approvals).
* **Deep Link Support:** If a link points to a specific comment (`#note_12345`), the card automatically pulls and displays the comment snippet.
* **Smart Theming:** Automatically detects and matches the theme (Dark/Light) of the host website (specifically optimized for Google Chat).
* **Privacy & Security:** Uses a background service worker to bypass strict **COEP/CORS** policies, ensuring avatars load even on secured internal networks.
* **Self-Hosted Ready:** Works with both `gitlab.com` and custom self-hosted GitLab instances.

---

## 🚀 Installation (Developer Mode)

Since this extension is currently in development, you can install it as an "Unpacked" extension:

1.  **Download/Clone** this repository to your local machine.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (toggle in the top right corner).
4.  Click **Load unpacked** and select the folder containing the extension files.
5.  Pin the extension to your toolbar for easy access.

---

## ⚙️ Configuration

Before the cards can appear, you need to provide an API token so the extension can talk to your GitLab instance:

1.  **Generate a Token:** GitLab > Preferences > Personal Access Tokens > Add new token
2.  Create a token with the **`read_api`** scope.
3.  **Set up the Extension:** Click the GitLab MR Preview icon in your Chrome toolbar.
4.  Enter your **Personal Access Token**.
5.  Enter your **GitLab Domain** (e.g., `gitlab.com` or `gitlab.yourcompany.io`).
6.  Click **Save**.

> **Note:** If you are using a self-hosted instance, Chrome may ask for permission to "access data on your domain" the first time you save. This is required to fetch avatars and MR data.

---

## 🛠 How it Works

* **Content Script:** Monitors the page for GitLab MR links using a `MutationObserver`. When a link is found, it injects a custom UI card.
* **Background Service Worker:** Handles all API requests. This is crucial because many modern sites (like Google Chat) block direct image loading from external domains. The background script fetches the data and avatars, converting them into safe local strings.
* **CSS Variables:** The UI uses dynamic CSS variables that sync with the `data-theme` attributes of the host page, ensuring a native-look and feel.

---

## 📝 Technical Details

* **Manifest Version:** 3
* **Permissions used:**
  * `storage`: To securely save your API token locally.
  * `host_permissions`: To allow communication with your specific GitLab instance.
* **Clean Code:** Built with a "KISS" (Keep It Simple, Stupid) philosophy—no heavy frameworks, just vanilla JS and optimized CSS.

---

## 🤝 Contributing

Feel free to open an issue or submit a pull request if you have ideas for:
* Supporting additional GitLab statuses (Drafts, WIP).
* Showing CI/CD pipeline status on the card.
* Support for other host platforms (Slack Web, Microsoft Teams).