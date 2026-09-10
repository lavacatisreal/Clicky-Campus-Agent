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
const defaultCursorHtml = fakeCursor.innerHTML;//--new
document.body.appendChild(fakeCursor);
//--new
const oldSpeechBox = document.getElementById('ai-speech-box');
if (oldSpeechBox) oldSpeechBox.remove();

const speechBox = document.createElement('div');
speechBox.id = 'ai-speech-box';

speechBox.style.position = 'fixed';
speechBox.style.zIndex = '99999997';
speechBox.style.pointerEvents = 'none';

speechBox.style.left = '0';
speechBox.style.top = '0';

speechBox.style.maxWidth = '280px';
speechBox.style.padding = '10px 12px';

speechBox.style.borderRadius = '10px';
speechBox.style.background = 'rgba(20, 24, 33, 0.92)';
speechBox.style.color = '#ffffff';

speechBox.style.fontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
speechBox.style.fontSize = '14px';
speechBox.style.lineHeight = '1.5';

speechBox.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.25)';
speechBox.style.opacity = '0';
speechBox.style.transform = 'translateY(6px)';
speechBox.style.transition = 'opacity 0.18s ease, transform 0.18s ease';

speechBox.style.whiteSpace = 'pre-wrap';
speechBox.style.wordBreak = 'break-word';

document.body.appendChild(speechBox);

let cursorState = 'idle';

function setCursorState(state) {
  cursorState = state;

  fakeCursor.className = `ai-fake-cursor--${state}`;

  const cursorIcons = {
    listening: '🎙️',
    thinking: '⏳',
    error: '⚠️'
  };

  if (state === 'guiding' || state === 'idle') {
    fakeCursor.innerHTML = defaultCursorHtml;
  } else {
    fakeCursor.textContent = cursorIcons[state];
  }

  const cursorStyles = {
    idle: {
      filter: 'drop-shadow(0 0 3px rgba(52, 152, 219, 0.8))',
      transform: 'scale(1)',
      opacity: '1'
    },
    listening: {
      filter: 'drop-shadow(0 0 10px rgba(231, 76, 60, 0.95))',
      transform: 'scale(1.15)',
      opacity: '1'
    },
    thinking: {
      filter: 'drop-shadow(0 0 10px rgba(155, 89, 182, 0.95))',
      transform: 'scale(1.1)',
      opacity: '1'
    },
    guiding: {
      filter: 'drop-shadow(0 0 10px rgba(46, 204, 113, 0.95))',
      transform: 'scale(1)',
      opacity: '1'
    },
    error: {
      filter: 'drop-shadow(0 0 10px rgba(231, 76, 60, 1))',
      transform: 'scale(1.2)',
      opacity: '1'
    }
  };

  Object.assign(fakeCursor.style, cursorStyles[state] ?? cursorStyles.idle);
}
//--new
let speechBoxHideTimer = null;

function showSpeechBox(message, options = {}) {
  const {
    tone = 'normal',
    followCursor = true
  } = options;

  const toneStyles = {
    normal: {
      background: 'rgba(20, 24, 33, 0.92)',
      border: '1px solid rgba(255, 255, 255, 0.16)'
    },

    listening: {
      background: 'rgba(120, 30, 36, 0.94)',
      border: '1px solid rgba(255, 100, 110, 0.75)'
    },

    thinking: {
      background: 'rgba(66, 41, 109, 0.94)',
      border: '1px solid rgba(180, 128, 255, 0.75)'
    },

    success: {
      background: 'rgba(24, 92, 65, 0.94)',
      border: '1px solid rgba(90, 230, 170, 0.75)'
    },

    error: {
      background: 'rgba(126, 35, 35, 0.96)',
      border: '1px solid rgba(255, 120, 120, 0.8)'
    }
  };

  const style = toneStyles[tone] ?? toneStyles.normal;

  if (speechBoxHideTimer) {
    clearTimeout(speechBoxHideTimer);
    speechBoxHideTimer = null;
  }

  speechBox.textContent = message;
  speechBox.style.background = style.background;
  speechBox.style.border = style.border;

  if (followCursor) {
    moveSpeechBoxNearCursor();
  }

  speechBox.style.opacity = '1';
  speechBox.style.transform = 'translateY(0)';
}

function hideSpeechBox(delay = 0) {
  if (speechBoxHideTimer) {
    clearTimeout(speechBoxHideTimer);
  }

  speechBoxHideTimer = setTimeout(() => {
    speechBox.style.opacity = '0';
    speechBox.style.transform = 'translateY(6px)';
  }, delay);
}

function moveSpeechBoxNearCursor() {
  const gapX = 22;
  const gapY = 26;
  const margin = 12;

  const boxWidth = speechBox.offsetWidth || 280;
  const boxHeight = speechBox.offsetHeight || 60;

  let left = currentCursorX + gapX;
  let top = currentCursorY + gapY;

  if (left + boxWidth > window.innerWidth - margin) {
    left = currentCursorX - boxWidth - gapX;
  }

  if (top + boxHeight > window.innerHeight - margin) {
    top = currentCursorY - boxHeight - gapY;
  }

  left = Math.max(margin, left);
  top = Math.max(margin, top);

  speechBox.style.left = `${left}px`;
  speechBox.style.top = `${top}px`;
}
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
    //--new
    if (speechBox.style.opacity === '1' && !isAiControlled) {
    moveSpeechBoxNearCursor();
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
    recognition.interimResults = true;

    // 💡 錄音自然結束時，把狀態重置
    recognition.onend = () => {
        isListening = false;
        console.log("[*] 語音聆聽結束。");
        //--new
        if (cursorState === 'listening') {
            setCursorState('idle');
            showSpeechBox('沒有收到可辨識的語音，請再試一次。', {
                tone: 'normal'
            });

            hideSpeechBox(1200);
        }
        //--new
    };

    // 💡 發生錯誤時，也要把狀態重置
    recognition.onerror = (event) => {
        console.error("[*] 語音辨識發生錯誤:", event.error);

        isListening = false;
        setCursorState('error');

        const errorMessages = {
            'no-speech': '沒有偵測到語音，請靠近麥克風後再試一次。',
            'not-allowed': '麥克風權限被拒絕，請在瀏覽器允許麥克風。',
            'service-not-allowed': '瀏覽器不允許使用語音辨識服務。',
            'audio-capture': '找不到可用麥克風，請檢查裝置設定。',
            'network': '語音辨識服務連線失敗，請檢查網路。',
            'aborted': '語音辨識已取消。',
            'language-not-supported': '目前瀏覽器不支援繁體中文語音辨識。'
        };

        showSpeechBox(
            errorMessages[event.error] ?? `語音辨識失敗：${event.error}`,
            { tone: 'error' }
        );

        setTimeout(() => {
            if (!isAiControlled) {
            setCursorState('idle');
            hideSpeechBox(0);
            }
        }, 1800);
        };

    //--new
    recognition.onstart = () => {
        console.log("[*] 麥克風已啟動，正在聆聽...");
        setCursorState('listening');

        showSpeechBox('正在聆聽，請直接說出需求…', {
            tone: 'listening'
        });
    };
    //--new

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const text = result[0].transcript;

            if (result.isFinal) {
            finalTranscript += text;
            } else {
            interimTranscript += text;
            }
        }

        if (interimTranscript) {
            showSpeechBox(`正在辨識：${interimTranscript}`, {
            tone: 'listening'
            });
        }

        if (!finalTranscript) {
            return;
        }

        const transcript = finalTranscript.trim();

        if (!transcript) {
            return;
        }

        console.log("[*] 語音內容:", transcript);

        showSpeechBox(`你說：${transcript}`, {
            tone: 'success'
        });

        setCursorState('thinking');

        setTimeout(() => {
            if (cursorState === 'thinking') {
            showSpeechBox('正在分析頁面並詢問 AI…', {
                tone: 'thinking'
            });
            }
        }, 700);

        const fakeUIInfo = {
            available_buttons: [
            { label: "選課按鈕", x: 300, y: 450 },
            { label: "請假系統", x: 600, y: 200 },
            { label: "成績查詢", x: 800, y: 150 }
            ]
        };

        console.log("[*] 傳送語音與 UI 資訊給 AI 思考中...");

        try {
            chrome.runtime.sendMessage({
            type: 'ASK_AI',
            transcript,
            uiInfo: fakeUIInfo
            });
        } catch (error) {
            console.error("[*] 無法傳送 AI 請求，請重新整理網頁：", error);

            setCursorState('error');
            showSpeechBox('Extension 已更新，請重新整理此網頁後再試。', {
            tone: 'error'
            });

            setTimeout(() => {
            if (!isAiControlled) {
                setCursorState('idle');
                hideSpeechBox(0);
            }
            }, 1600);
        }
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

        
        
    } else if (key === 'w' && isAiControlled) {
        chrome.runtime.sendMessage({ type: 'AI_CLICK' });
    }
});

// --- 接收 Background 的指令廣播 ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AI_FLY') {
        setCursorState('guiding');//--new
        showSpeechBox('已找到目標，正在帶你前往…', {
            tone: 'success'
        });
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
        setCursorState('idle');//--new
        hideSpeechBox(1000);
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