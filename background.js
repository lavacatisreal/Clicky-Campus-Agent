// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 當收到飛列或點擊的指令，廣播給當前分頁的所有 frame
    if (msg.type === 'AI_FLY' || msg.type === 'AI_CLICK' || msg.type === 'AI_RELEASE') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, msg);
            }
        });
    }
});