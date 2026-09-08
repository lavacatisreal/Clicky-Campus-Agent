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

// --- 鍵盤監聽 (將指令送給 Background) ---
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'q' && !isAiControlled) {
        // AI 的目標座標 (這會是相對於「最外層瀏覽器」的絕對座標)
        chrome.runtime.sendMessage({ type: 'AI_FLY', targetX: 270, targetY: 190 });
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