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
    // 💡 自動模式開新分頁：頁面腳本觸發的 target="_blank" 會被瀏覽器擋下，改由 extension 開啟。
    //    帶 openerTabId，新分頁才能透過上面的 handoff 接續任務進度。
    else if (msg.type === 'CLICKY_OPEN_TAB') {
        if (!/^https?:/i.test(msg.url ?? '')) {
            sendResponse({ ok: false, error: '只允許開啟 http / https 網址' });
            return;
        }

        chrome.tabs.create({
            url: msg.url,
            openerTabId: sender.tab?.id,
            index: sender.tab ? sender.tab.index + 1 : undefined
        })
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: String(error) }));

        return true;
    }
    else if (msg.type === 'CLICKY_MAIN_WORLD_EVENT') {
        if (
            !sender.tab?.id ||
            !msg.marker ||
            !msg.locator?.selector ||
            !['hover', 'click'].includes(msg.eventType)
        ) {
            sendResponse({ ok: false, error: 'Main World 事件參數不完整。' });
            return;
        }

        const runMainWorldEvent = (searchNestedDocuments) => chrome.scripting.executeScript({
            target: searchNestedDocuments
                ? { tabId: sender.tab.id, frameIds: [0] }
                : { tabId: sender.tab.id, allFrames: true },
            world: 'MAIN',
            args: [msg.marker, msg.eventType, msg.locator, searchNestedDocuments],
            func: (marker, eventType, locator, searchNestedDocuments) => {
                const getLabel = (element) => (
                    element.value ||
                    element.textContent ||
                    element.getAttribute('aria-label') ||
                    element.title ||
                    ''
                ).trim();

                const matchesLocator = (element) => {
                    if (locator.matchText !== undefined && element.textContent.trim() !== locator.matchText) {
                        return false;
                    }

                    if (locator.matchPrefix !== undefined && !element.textContent.trim().startsWith(locator.matchPrefix)) {
                        return false;
                    }

                    const context = locator.matchContext;

                    if (context?.targetLabel !== undefined && getLabel(element) !== context.targetLabel) {
                        return false;
                    }

                    if (!context?.ancestorSelector) {
                        return true;
                    }

                    const ancestor = element.closest(context.ancestorSelector);

                    if (!ancestor) {
                        return false;
                    }

                    return (context.descendantMatches ?? []).every((condition) => {
                        const descendant = ancestor.querySelector(condition.selector);
                        const text = descendant?.textContent.trim();

                        return Boolean(descendant) &&
                            (condition.matchText === undefined || text === condition.matchText) &&
                            (condition.matchPrefix === undefined || text.startsWith(condition.matchPrefix));
                    });
                };

                const findInDocument = (doc, includeNested) => {
                    const marked = doc.querySelector(`[data-clicky-main-target="${CSS.escape(marker)}"]`);

                    if (marked) {
                        return { element: marked, source: 'marker' };
                    }

                    for (const candidate of doc.querySelectorAll(locator.selector)) {
                        if (matchesLocator(candidate)) {
                            return { element: candidate, source: 'locator' };
                        }
                    }

                    if (includeNested) {
                        for (const frame of doc.querySelectorAll('iframe, frame')) {
                            try {
                                const found = frame.contentDocument && findInDocument(frame.contentDocument, true);
                                if (found) return found;
                            } catch {
                                // Chrome injects separately into accessible cross-origin frames.
                            }
                        }
                    }

                    return null;
                };

                const found = findInDocument(document, searchNestedDocuments);
                const element = found?.element;

                if (!element) {
                    return { ok: false, error: 'Main World 找不到目標元素。' };
                }

                const pageJQuery = globalThis.jQuery;

                if (eventType === 'click') {
                    if (typeof pageJQuery === 'function') {
                        pageJQuery(element).trigger('click');

                        if (locator.closeDialog) {
                            const dialogContent = element.closest('.ui-dialog-content');

                            if (dialogContent && typeof pageJQuery(dialogContent).dialog === 'function') {
                                pageJQuery(dialogContent).dialog('close');
                            }
                        }

                        return { ok: true, method: 'jquery-trigger-click', source: found.source };
                    }

                    element.click();
                    return { ok: true, method: 'native-click', source: found.source };
                }

                const hoverTargets = [element, element.querySelector?.('.class_title')].filter(Boolean);

                if (typeof pageJQuery === 'function') {
                    for (const target of hoverTargets) {
                        pageJQuery(target)
                            .trigger('mouseenter')
                            .trigger('mouseover')
                            .trigger('mousemove');
                    }
                    return { ok: true, method: 'jquery-trigger-hover', source: found.source };
                }

                for (const target of hoverTargets) {
                    const rect = target.getBoundingClientRect();
                    const options = {
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    };
                    target.dispatchEvent(new MouseEvent('mouseover', options));
                    target.dispatchEvent(new MouseEvent('mouseenter', { ...options, bubbles: false }));
                    target.dispatchEvent(new MouseEvent('mousemove', options));
                }

                return { ok: true, method: 'native-hover', source: found.source };
            }
        });

        runMainWorldEvent(false)
            .then(async (results) => {
                const directSuccess = results.find((entry) => entry.result?.ok);

                if (directSuccess) {
                    return directSuccess.result;
                }

                const nestedResults = await runMainWorldEvent(true);
                const nestedSuccess = nestedResults.find((entry) => entry.result?.ok);

                return nestedSuccess?.result ?? {
                    ok: false,
                    error: `Main World 已掃描 ${results.length} 個 Chrome frame 與同源 nested documents，仍找不到目標元素。`
                };
            })
            .then(sendResponse)
            .catch((error) => sendResponse({ ok: false, error: String(error) }));

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