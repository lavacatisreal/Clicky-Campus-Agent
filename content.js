// content.js
console.log("[*] Clicky Extension 載入！(頂層渲染 + 跨視窗通訊版)");

// 💡 判斷當前腳本是不是在「最外層的父網頁」執行
const isTopWindow = (window === window.top);

const oldCursor = document.getElementById('ai-fake-cursor');
if (oldCursor) oldCursor.remove();

const fakeCursor = document.createElement('div');
fakeCursor.id = 'ai-fake-cursor';
fakeCursor.style.position = 'fixed';
fakeCursor.style.zIndex = '99999999';
fakeCursor.style.pointerEvents = 'none'; 
fakeCursor.style.width = '30px';
fakeCursor.style.height = '30px';
fakeCursor.style.opacity = '0'; 

const normalTransition = 'top 0.03s linear, left 0.03s linear, transform 0.1s ease';
fakeCursor.style.transition = normalTransition;

fakeCursor.innerHTML = `
    <svg viewBox="0 0 24 24" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
        <polygon points="5,3 18,16 12,17 9,22 5,3" fill="#3498db" stroke="white" stroke-width="1.5" />
    </svg>
`;
document.body.appendChild(fakeCursor);

// --- 狀態紀錄 ---
let isAiControlled = false; 
let currentCursorX = 0;     
let currentCursorY = 0;     
let isFirstMove = true; 

// --- 跟隨真實滑鼠邏輯 ---
const mouseMoveHandler = (e) => {
    if (isAiControlled) return; 
    currentCursorX = e.clientX + 30;
    currentCursorY = e.clientY + 30;
    
    if (isFirstMove || fakeCursor.style.opacity === '0') {
        fakeCursor.style.transition = 'none'; 
        fakeCursor.style.left = `${currentCursorX}px`;
        fakeCursor.style.top = `${currentCursorY}px`;
        fakeCursor.style.opacity = '1';
        void fakeCursor.offsetWidth; 
        fakeCursor.style.transition = normalTransition;
        isFirstMove = false;
    } else {
        fakeCursor.style.left = `${currentCursorX}px`;
        fakeCursor.style.top = `${currentCursorY}px`;
    }
};
document.addEventListener('mousemove', mouseMoveHandler);
document.addEventListener('mouseout', (e) => {
    if (isAiControlled) return;
    if (!e.relatedTarget || e.relatedTarget.tagName === 'IFRAME' || e.relatedTarget.tagName === 'FRAME') {
        fakeCursor.style.opacity = '0'; 
        isFirstMove = true; 
    }
});

// --- 動畫與實際點擊邏輯 ---
function createRippleAnimation(x, y) {
    const ripple = document.createElement('div');
    ripple.style.position = 'fixed';
    ripple.style.left = `${x + 5}px`;
    ripple.style.top = `${y + 3}px`;
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    ripple.style.borderRadius = '50%';
    ripple.style.backgroundColor = 'rgba(241, 196, 15, 0.6)';
    ripple.style.border = '2px solid #f39c12';
    ripple.style.pointerEvents = 'none';
    ripple.style.zIndex = '99999998';
    ripple.style.transform = 'translate(-50%, -50%)'; 
    document.body.appendChild(ripple);
    
    ripple.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(6)', opacity: 0 }
    ], { duration: 500, easing: 'ease-out' });
    setTimeout(() => { if (document.body.contains(ripple)) document.body.removeChild(ripple); }, 500);
}

function doActualClick(el) {
    console.log("[*] 點擊成功！目標元素：", el);
    const originalBoxShadow = el.style.boxShadow;
    const originalTransition = el.style.transition;
    el.style.transition = 'box-shadow 0.2s';
    el.style.boxShadow = "0 0 15px 5px rgba(231, 76, 60, 0.9)";
    el.click();
    setTimeout(() => { 
        el.style.boxShadow = originalBoxShadow; 
        el.style.transition = originalTransition;
    }, 400);
}

// --- 語音辨識初始化 ---
let recognition = null;
let isListening = false; // 💡 新增：紀錄是否正在錄音中

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'zh-TW';
    recognition.continuous = false; 
    recognition.interimResults = false;

    // 💡 錄音自然結束時，把狀態重置
    recognition.onend = () => {
        isListening = false;
        console.log("[*] 語音聆聽結束。");
    };

    // 💡 發生錯誤時，也要把狀態重置
    recognition.onerror = (event) => {
        console.error("[*] 語音辨識發生錯誤:", event.error);
        isListening = false; 
    };
}

// --- 鍵盤監聽 (Q: 錄音並呼叫 AI, W: 點擊) ---
document.addEventListener('keydown', (e) => {
    // 💡 防呆 1：如果使用者長按著鍵盤不放，直接忽略，避免重複觸發
    if (e.repeat) return; 

    const key = e.key.toLowerCase();
    
    if (key === 'q' && !isAiControlled) {
        if (!recognition) {
            console.error("[*] 你的瀏覽器不支援 Web Speech API");
            return;
        }

        // 💡 防呆 2：如果已經在錄音了，就不要再 start 一次
        if (isListening) {
            console.log("[*] 已經在聆聽中，請勿重複按下 Q 鍵...");
            return;
        }

        console.log("[*] 正在聆聽語音指令 (請允許麥克風權限)...");
        isListening = true; // 標記為正在錄音中
        recognition.start();

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            console.log("[*] 語音內容:", transcript);

            const fakeUIInfo = {
                available_buttons: [
                    { label: "選課按鈕", x: 300, y: 450 },
                    { label: "請假系統", x: 600, y: 200 },
                    { label: "成績查詢", x: 800, y: 150 }
                ]
            };

            console.log("[*] 傳送語音與 UI 資訊給 AI 思考中...");
            chrome.runtime.sendMessage({ 
                type: 'ASK_AI', 
                transcript: transcript, 
                uiInfo: fakeUIInfo 
            });
        };
        
    } else if (key === 'w' && isAiControlled) {
        chrome.runtime.sendMessage({ type: 'AI_CLICK' });
    }
});

// --- 接收 Background 的指令廣播 ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AI_FLY') {
        isAiControlled = true;
        currentCursorX = msg.targetX;
        currentCursorY = msg.targetY;

        if (isTopWindow) {
            // 💡 只有最外層網頁負責畫游標與飛行！
            fakeCursor.style.opacity = '1';
            fakeCursor.style.transition = 'top 0.8s ease-in-out, left 0.8s ease-in-out';
            fakeCursor.style.left = `${currentCursorX}px`;
            fakeCursor.style.top = `${currentCursorY}px`;
        } else {
            // 所有 iframe 乖乖把自己的游標藏起來
            fakeCursor.style.opacity = '0';
        }
    } 
    else if (msg.type === 'AI_CLICK') {
        if (isTopWindow) {
            // 💡 只有最外層網頁負責處理點擊動畫與邏輯
            fakeCursor.style.transform = 'scale(0.8)';
            setTimeout(() => { fakeCursor.style.transform = 'scale(1)'; }, 150);
            createRippleAnimation(currentCursorX, currentCursorY);

            const elementToClick = document.elementFromPoint(currentCursorX, currentCursorY);
            if (elementToClick) {
                // 如果最外層網頁發現底下是個 iframe
                if (elementToClick.tagName === 'IFRAME' || elementToClick.tagName === 'FRAME') {
                    console.log("[*] 目標在 iframe 內，發送跨視窗指令請它代點...");
                    const rect = elementToClick.getBoundingClientRect();
                    // 換算成 iframe 內部的相對座標
                    const localX = currentCursorX - rect.left;
                    const localY = currentCursorY - rect.top;
                    
                    // 透過 postMessage 把點擊指令傳給那個特定的 iframe
                    elementToClick.contentWindow.postMessage({
                        type: 'EXECUTE_IFRAME_CLICK',
                        localX: localX,
                        localY: localY
                    }, '*');
                } else {
                    // 目標就在外層網頁，直接點擊
                    doActualClick(elementToClick);
                }
            }

            setTimeout(() => { chrome.runtime.sendMessage({ type: 'AI_RELEASE' }); }, 600);
        }
    }
    else if (msg.type === 'AI_RELEASE') {
        isAiControlled = false;
        isFirstMove = true;
    }
});

// --- 接收外層網頁傳來的代點指令 (專門給 iframe 用的) ---
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'EXECUTE_IFRAME_CLICK') {
        // iframe 收到指令後，用自己內部的座標找出元素並點擊
        const elementToClick = document.elementFromPoint(event.data.localX, event.data.localY);
        if (elementToClick) {
            doActualClick(elementToClick);
        }
    }
});