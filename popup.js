const input = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.local.get(["gitlabToken"], (res) => {
	if (res.gitlabToken) input.value = res.gitlabToken;
});

document.getElementById("save").onclick = () => {
	chrome.storage.local.set({ gitlabToken: input.value }, () => {
		status.textContent = "Saved";
		setTimeout(() => (status.textContent = ""), 1000);
	});
};