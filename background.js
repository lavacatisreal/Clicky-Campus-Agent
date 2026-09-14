// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'AI_FLY' || msg.type === 'AI_CLICK' || msg.type === 'AI_RELEASE') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, msg);
            }
        });
    }
    // 💡 Demo 腳本進度：依分頁保存，點擊換頁後新頁面可以接續（taskRunner.js）
    else if (msg.type === 'CLICKY_TASK_SAVE' || msg.type === 'CLICKY_TASK_CLEAR' || msg.type === 'CLICKY_TASK_LOAD') {
        const key = `clickyTask:${sender.tab?.id}`;
        const done = (response = { ok: true }) => sendResponse(response);

        if (msg.type === 'CLICKY_TASK_SAVE') {
            chrome.storage.session.set({ [key]: msg.progress }).then(() => done());
        } else if (msg.type === 'CLICKY_TASK_CLEAR') {
            chrome.storage.session.remove(key).then(() => done());
        } else {
            // 自己分頁沒有進度時，接手「開啟這個分頁的分頁」標記為 handoff 的進度（target="_blank" 開新分頁）
            const openerKey = `clickyTask:${sender.tab?.openerTabId}`;

            chrome.storage.session.get([key, openerKey]).then(async (result) => {
                if (result[key]) {
                    done({ progress: result[key] });
                    return;
                }

                const handoff = result[openerKey];
                if (sender.tab?.openerTabId !== undefined && handoff?.handoff) {
                    const progress = { ...handoff, handoff: false };
                    await chrome.storage.session.remove(openerKey);
                    await chrome.storage.session.set({ [key]: progress });
                    done({ progress });
                    return;
                }

                done({ progress: null });
            });
        }

        return true;
    }
    else if (msg.type === 'ASK_AI') {
        const aiPrompt = `使用者語音指令: "${msg.transcript}"\n畫面按鈕資訊: ${JSON.stringify(msg.uiInfo)}\n請根據指令判斷使用者想點擊哪個按鈕，並嚴格只回傳 JSON 格式，例如 {"x": 270, "y": 190}，不要任何其他文字或 markdown 標籤。`;

        fetch("http://127.0.0.1:3000/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                // 💡 全部交給 crypto.randomUUID() 產生絕對合法的標準 UUID！
                installId: crypto.randomUUID(),
                conversationId: crypto.randomUUID(),
                text: aiPrompt
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok') {
                const jsonStr = data.reply.replace(/```json|```/g, '').trim();
                const target = JSON.parse(jsonStr);
                
                if (target && target.x && target.y) {
                    console.log("[Background] AI 決策座標:", target);
                    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: 'AI_FLY',
                                targetX: target.x,
                                targetY: target.y
                            });
                        }
                    });
                }
            }
        })
        .catch(err => console.error("[Background] AI API 請求錯誤:", err));

        // 💡 核心修復：告訴 Chrome 這個處理是非同步的，請不要關閉通訊埠
        return true; 
    }
});