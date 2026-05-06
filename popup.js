const ELEMENTS = {
	inputToken: document.getElementById("token"),
	inputDomain: document.getElementById("domain"),
	form: document.getElementById("form"),
	status: document.getElementById("status"),
};

document.addEventListener('DOMContentLoaded', async () => {
	const { gitlabToken } = await chrome.storage.local.get("gitlabToken");
	if (gitlabToken) ELEMENTS.inputToken.value = gitlabToken;
	const { gitlabDomain } = await chrome.storage.local.get("gitlabDomain");
	if (gitlabDomain) ELEMENTS.inputDomain.value = gitlabDomain;
});

ELEMENTS.form.addEventListener('submit', async (e) => {
	e.preventDefault();
	await chrome.storage.local.clear();

	const token = ELEMENTS.inputToken.value.trim();
	const domain = ELEMENTS.inputDomain.value.trim();

	if (!token) {
		showStatus("Personal Access Token is required", "#e24329");
		return;
	}

	try {
		if(domain) {
			await registerCustomDomain(domain);
		}
		await chrome.storage.local.set({ gitlabToken: token });
		showStatus("¡Saved!", "#108548");
		setTimeout(() => window.close(), 1000);
	} catch (err) {
		showStatus(`Error while saving... ${err}`, "#e24329");
	}
});

function showStatus(text, color) {
	ELEMENTS.status.textContent = text;
	ELEMENTS.status.style.color = color;
}

async function registerCustomDomain(userDomain) {
	return new Promise((resolve, reject) => {
		const urlPattern = `${userDomain}/*`;

		chrome.permissions.remove({
			origins: [urlPattern]
		}, async (removed) => {
			if (removed) {
				chrome.permissions.request({ origins: [urlPattern] }, async (granted) => {
					if (granted) {
						await chrome.storage.local.set({ gitlabDomain: userDomain });
						resolve();
					} else {
						reject("Permission denied by user.");
					}
				});
			} else {
				console.warn("Permissions could not be removed (or weren't granted in the first place).");
			}
		});
	});
}