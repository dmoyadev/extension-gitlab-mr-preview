const ELEMENTS = {
	inputToken: document.getElementById("token"),
	status: document.getElementById("status")
};

document.addEventListener('DOMContentLoaded', async () => {
	const { gitlabToken } = await chrome.storage.local.get("gitlabToken");
	if (gitlabToken) ELEMENTS.inputToken.value = gitlabToken;
});

async function saveConfig() {
	const token = ELEMENTS.inputToken.value.trim();

	if (!token) {
		showStatus("Personal Access Token is required", "#e24329");
		return;
	}

	try {
		await chrome.storage.local.clear();
		await chrome.storage.local.set({ gitlabToken: token });
		showStatus("¡Saved!", "#108548");
		setTimeout(() => window.close(), 1000);
	} catch (err) {
		showStatus(`Error while saving... ${err}`, "#e24329");
	}
}

function showStatus(text, color) {
	ELEMENTS.status.textContent = text;
	ELEMENTS.status.style.color = color;
}