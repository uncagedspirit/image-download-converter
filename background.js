chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convertDownload",
    title: "Download With Format...",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "convertDownload") {
    chrome.storage.local.set({ imageUrl: info.srcUrl }, () => {
      chrome.action.openPopup();
    });
  }
});