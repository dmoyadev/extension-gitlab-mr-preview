chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "fetchAvatar" && request.url) {

		// First, grab the saved token so GitLab accepts the request
		chrome.storage.local.get("gitlabToken").then(({ gitlabToken }) => {
			const headers = gitlabToken ? { "PRIVATE-TOKEN": gitlabToken } : {};

			return fetch(request.url, { headers });
		})
		.then(response => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.blob();
		})
		.then(blob => {
			const reader = new FileReader();
			reader.onloadend = () => sendResponse({ dataUrl: reader.result });
			reader.readAsDataURL(blob);
		})
		.catch(err => {
			console.error("Authenticated avatar fetch failed:", err);
			sendResponse({ dataUrl: null });
		});

		return true; // Keeps the message channel open for async response
	}
});