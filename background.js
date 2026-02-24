// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convertDownload",
    title: "Download With Format...",
    contexts: ["image"]
  });
});

// When user selects the menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "convertDownload") {
    chrome.storage.local.set({ imageUrl: info.srcUrl }, () => {
      // Open the popup programmatically
      chrome.action.openPopup();
    });
  }
});