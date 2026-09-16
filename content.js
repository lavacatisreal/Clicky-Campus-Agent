// content.js
console.log("[*] Clicky Extension 載入！(頂層渲染 + 跨視窗通訊版)");

// 💡 判斷當前腳本是不是在「最外層的父網頁」執行
const isTopWindow = (window === window.top);
const CLICKY_MESSAGE_SOURCE = "clicky-campus-agent";

// --- Planning Overlay 溝通橋梁 ---
// Overlay 只存在於最外層視窗；iframe 內的事件轉送到最外層再派發。
function emitPlanningOverlayEvent(type, detail = {}) {
  const payload = {
    ...detail,
    timestamp: Date.now()
  };

  if (!isTopWindow) {
    window.top.postMessage(
      { source: CLICKY_MESSAGE_SOURCE, kind: "overlay-event", type, detail: payload },
      "*"
    );
    return;
  }

  window.dispatchEvent(new CustomEvent(type, { detail: payload }));
}

// --- 使用者設定（深淺色主題、自動 / 手動模式）---
// 存在 chrome.storage.local，Portal 與選課系統等所有分頁同步。allowedValues 第一個是預設值。
function createSyncedSetting(storageKey, allowedValues) {
  const listeners = new Set();

  const setting = {
    value: allowedValues[0],

    onChange(listener) {
      listeners.add(listener);
      listener(setting.value);
    },

    set(value) {
      apply(value);

      try {
        chrome.storage.local.set({ [storageKey]: setting.value });
      } catch (error) {
        console.warn(`[Clicky] 無法保存設定 ${storageKey}：`, error);
      }
    }
  };

  function apply(value) {
    setting.value = allowedValues.includes(value) ? value : allowedValues[0];
    listeners.forEach((listener) => listener(setting.value));
  }

  try {
    chrome.storage.local
      .get(storageKey)
      .then((result) => apply(result[storageKey]))
      .catch((error) => console.warn(`[Clicky] 無法讀取設定 ${storageKey}：`, error));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[storageKey]) {
        apply(changes[storageKey].newValue);
      }
    });
  } catch (error) {
    console.warn(`[Clicky] 無法讀取設定 ${storageKey}，使用預設值：`, error);
  }

  return setting;
}

// Overlay 與游標旁對話框共用
const themeSetting = createSyncedSetting("clickyTheme", ["light", "dark"]);
// manual：每次 confirmClick 前等使用者按 W；auto：游標到位後自動點擊
const clickModeSetting = createSyncedSetting("clickyClickMode", ["manual", "auto"]);
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
        <polygon points="5,3 18,16 12,17 9,22 5,3" fill="#0f6cbd" stroke="white" stroke-width="1.5" />
    </svg>
`;
const defaultCursorHtml = fakeCursor.innerHTML;
document.body.appendChild(fakeCursor);

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

// 思考中的轉圈圈（用 Web Animations，不需要在網頁插入 CSS）
const thinkingSpinner = document.createElement('div');
Object.assign(thinkingSpinner.style, {
  width: '22px',
  height: '22px',
  margin: '4px',
  boxSizing: 'border-box',
  border: '3px solid rgba(15, 108, 189, 0.22)',
  borderTopColor: '#0f6cbd',
  borderRadius: '50%'
});
let thinkingSpinnerAnimation = null;

function setCursorState(state) {
  cursorState = state;

  fakeCursor.className = `ai-fake-cursor--${state}`;

  const cursorIcons = {
    listening: '🎙️',
    error: '⚠️'
  };

  thinkingSpinnerAnimation?.cancel();
  thinkingSpinnerAnimation = null;

  if (state === 'guiding' || state === 'idle') {
    fakeCursor.innerHTML = defaultCursorHtml;
  } else if (state === 'thinking') {
    fakeCursor.replaceChildren(thinkingSpinner);
    thinkingSpinnerAnimation = thinkingSpinner.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 800, iterations: Infinity }
    );
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
      filter: 'drop-shadow(0 0 8px rgba(15, 108, 189, 0.72))',
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

let speechBoxHideTimer = null;
let speechBoxTone = 'normal';

const SPEECH_BOX_TONES = {
  dark: {
    normal: { background: 'rgba(20, 24, 33, 0.92)', border: '1px solid rgba(255, 255, 255, 0.16)', color: '#ffffff' },
    listening: { background: 'rgba(120, 30, 36, 0.94)', border: '1px solid rgba(255, 100, 110, 0.75)', color: '#ffffff' },
    thinking: { background: 'rgba(15, 84, 140, 0.96)', border: '1px solid rgba(117, 182, 231, 0.75)', color: '#ffffff' },
    success: { background: 'rgba(24, 92, 65, 0.94)', border: '1px solid rgba(90, 230, 170, 0.75)', color: '#ffffff' },
    error: { background: 'rgba(126, 35, 35, 0.96)', border: '1px solid rgba(255, 120, 120, 0.8)', color: '#ffffff' }
  },
  light: {
    normal: { background: 'rgba(255, 255, 255, 0.97)', border: '1px solid #cbd5e1', color: '#0f172a' },
    listening: { background: 'rgba(255, 241, 242, 0.97)', border: '1px solid #fb7185', color: '#9f1239' },
    thinking: { background: 'rgba(239, 246, 252, 0.98)', border: '1px solid #62abdc', color: '#0f548c' },
    success: { background: 'rgba(236, 253, 245, 0.97)', border: '1px solid #34d399', color: '#065f46' },
    error: { background: 'rgba(255, 241, 242, 0.98)', border: '1px solid #f43f5e', color: '#be123c' }
  }
};

function applySpeechBoxTone() {
  const tones = SPEECH_BOX_TONES[themeSetting.value];
  const style = tones[speechBoxTone] ?? tones.normal;

  speechBox.style.background = style.background;
  speechBox.style.border = style.border;
  speechBox.style.color = style.color;
  speechBox.style.boxShadow = themeSetting.value === 'light'
    ? '0 8px 24px rgba(15, 23, 42, 0.14)'
    : '0 8px 24px rgba(0, 0, 0, 0.25)';
}

themeSetting.onChange(applySpeechBoxTone);

function showSpeechBox(message, options = {}) {
  const {
    tone = 'normal',
    followCursor = true
  } = options;

  if (speechBoxHideTimer) {
    clearTimeout(speechBoxHideTimer);
    speechBoxHideTimer = null;
  }

  speechBox.textContent = message;
  speechBoxTone = tone;
  applySpeechBoxTone();

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

// skipClick：只顯示點擊效果不真的點（例如由 background 代開新分頁時）
function doActualClick(el, { skipClick = false } = {}) {
    console.log("[*] 點擊成功！目標元素：", el);
  revealClickTarget(el);
  const targetWindow = el.ownerDocument?.defaultView ?? window;
    const originalBoxShadow = el.style.boxShadow;
    const originalTransition = el.style.transition;
    el.style.transition = 'box-shadow 0.2s';
    el.style.boxShadow = "0 0 15px 5px rgba(231, 76, 60, 0.9)";
  if (!skipClick) {
      const rect = el.getBoundingClientRect();
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: targetWindow,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 1
      };

      if (typeof targetWindow.PointerEvent === 'function') {
        el.dispatchEvent(new targetWindow.PointerEvent('pointerover', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
        el.dispatchEvent(new targetWindow.PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
      }
      el.dispatchEvent(new targetWindow.MouseEvent('mouseover', eventOptions));
      el.dispatchEvent(new targetWindow.MouseEvent('mousedown', eventOptions));
      el.dispatchEvent(new targetWindow.MouseEvent('mouseup', eventOptions));
      if (typeof targetWindow.PointerEvent === 'function') {
        el.dispatchEvent(new targetWindow.PointerEvent('pointerup', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
      }
      const elementPrototype = targetWindow.HTMLElement?.prototype;
      if (elementPrototype?.click) {
        elementPrototype.click.call(el);
      } else {
        el.click();
      }
  }
    setTimeout(() => { 
        el.style.boxShadow = originalBoxShadow; 
        el.style.transition = originalTransition;
    }, 400);
}

function revealClickTarget(element) {
  const row = element.closest?.('li[sno]');
  const menu = element.closest?.('.append_menu') ?? row?.querySelector('.append_menu');

  if (row) {
    hoverElement(row);

    const courseTitle = row.querySelector('.class_title');
    if (courseTitle) {
      hoverElement(courseTitle);
    }
  }

  if (menu && getComputedStyle(menu).display === 'none') {
    menu.style.setProperty('display', 'inline', 'important');
  }

  // CSS :hover 無法由 dispatchEvent 建立，直接讓目標元素取得可點擊的版面。
  if (element?.style) {
    element.style.setProperty('visibility', 'visible', 'important');
    element.style.setProperty('pointer-events', 'auto', 'important');
  }
}
// --- 游標控制（AI_FLY / AI_CLICK 與 taskRunner.js 腳本共用）---
function flyCursorTo(x, y, duration = 800) {
    isAiControlled = true;
    currentCursorX = x;
    currentCursorY = y;

    if (isTopWindow) {
        // 💡 只有最外層網頁負責畫游標與飛行！
        fakeCursor.style.opacity = '1';
        fakeCursor.style.transition = `top ${duration}ms ease-in-out, left ${duration}ms ease-in-out`;
        fakeCursor.style.left = `${currentCursorX}px`;
        fakeCursor.style.top = `${currentCursorY}px`;
    } else {
        // 所有 iframe 乖乖把自己的游標藏起來
        fakeCursor.style.opacity = '0';
    }
}

// 傳入 targetElement 時直接點它（腳本已找到元素）；否則點游標目前位置的元素。
function clickAtCursor(targetElement = null, options = {}) {
    if (!isTopWindow) return;

    // 💡 只有最外層網頁負責處理點擊動畫與邏輯
    fakeCursor.style.transform = 'scale(0.8)';
    setTimeout(() => { fakeCursor.style.transform = 'scale(1)'; }, 150);
    createRippleAnimation(currentCursorX, currentCursorY);

    const elementToClick = targetElement ?? document.elementFromPoint(currentCursorX, currentCursorY);
    if (!elementToClick) return;

    // 如果點擊目標是個 iframe（跨域無法直接操作）
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
        doActualClick(elementToClick, options);
    }
}

// 腳本執行期間讓所有 iframe 隱藏各自的游標，避免畫面上出現兩個游標。
function setAiControl(active) {
    isAiControlled = active;
    if (active) {
        fakeCursor.style.opacity = isTopWindow ? '1' : '0';
    } else {
        isFirstMove = true;
    }

    for (let i = 0; i < window.frames.length; i += 1) {
        window.frames[i].postMessage(
            { source: CLICKY_MESSAGE_SOURCE, kind: 'ai-control', active },
            '*'
        );
    }
}

// --- 語音辨識初始化 ---
// 說完話後停頓超過 SILENCE_TIMEOUT_MS 才結束聆聽；也可以再按一次 Q 立即結束。
const SILENCE_TIMEOUT_MS = 2000;
// 單次聆聽最長時間，避免忘記關麥克風
const MAX_LISTEN_MS = 20000;

let recognition = null;
let isListening = false; // 💡 新增：紀錄是否正在錄音中
let heardTranscript = '';
let silenceTimer = null;
let maxListenTimer = null;

function clearListenTimers() {
    clearTimeout(silenceTimer);
    clearTimeout(maxListenTimer);
    silenceTimer = null;
    maxListenTimer = null;
}

function stopListening() {
    clearListenTimers();
    // stop() 會把還在辨識中的文字轉成最終結果，再觸發 onend
    recognition.stop();
}

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'zh-TW';
    // 💡 continuous：講話中間停頓不會被切斷，由上面的停頓計時器決定何時結束
    recognition.continuous = true;
    recognition.interimResults = true;

    // 💡 錄音結束時，有辨識到文字就進入任務流程，否則把狀態重置
    recognition.onend = () => {
        isListening = false;
        clearListenTimers();
        console.log("[*] 語音聆聽結束。");

        const transcript = heardTranscript.trim();
        heardTranscript = '';

        if (transcript && cursorState === "listening") {
            handleFinalTranscript(transcript);
            return;
        }

        if (cursorState === "listening") {
            setCursorState("idle");

            showSpeechBox("沒有收到可辨識的語音，請再試一次。", {
                tone: "normal"
            });

            emitPlanningOverlayEvent("clicky:task-stage", {
                stage: "idle",
                message: "沒有收到可辨識的語音，按 Q 再試一次。"
            });

            hideSpeechBox(1200);
        }
    };

    // 💡 發生錯誤時，也要把狀態重置
    recognition.onerror = (event) => {
        console.error("[*] 語音辨識發生錯誤:", event.error);

        isListening = false;
        clearListenTimers();
        heardTranscript = '';
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
        
        emitPlanningOverlayEvent("clicky:task-stage", {
            stage: "error",
            message:
                errorMessages[event.error] ??
                `語音辨識失敗：${event.error}`
        });

        setTimeout(() => {
            if (!isAiControlled) {
                setCursorState('idle');
                hideSpeechBox(0);
            }
        }, 1800);
    };

    recognition.onstart = () => {
        heardTranscript = '';
    };

    // 💡 麥克風真的開始收音才提示說話。按 Q 到開始收音之間約有零點幾秒，
    //    這段時間說的話瀏覽器收不到，所以先顯示「麥克風啟動中」，避免第一個字被吃掉。
    recognition.onaudiostart = () => {
        console.log("[*] 麥克風已啟動，正在聆聽...");
        setCursorState('listening');

        showSpeechBox('🎙️ 請開始說話（說完停頓 2 秒或再按 Q 結束）', {
            tone: 'listening'
        });

        emitPlanningOverlayEvent("clicky:task-stage", {
            stage: "listening",
            transcript: "",
            message: "🎙️ 請開始說話（說完停頓 2 秒或再按 Q 結束）"
        });

        maxListenTimer = setTimeout(stopListening, MAX_LISTEN_MS);
    };

    recognition.onresult = (event) => {
        // continuous 模式下 event.results 包含這次聆聽的所有片段，每次都完整重組
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; i += 1) {
            const result = event.results[i];
            const text = result[0].transcript;

            if (result.isFinal) {
                finalTranscript += text;
            } else {
                interimTranscript += text;
            }
        }

        const heardText = (finalTranscript + interimTranscript).trim();
        // 包含還沒定稿的文字：提早按 Q 結束時也不會漏掉最後幾個字
        heardTranscript = heardText;

        if (heardText) {
            showSpeechBox(`正在辨識：${heardText}`, {
                tone: 'listening'
            });

            emitPlanningOverlayEvent("clicky:task-stage", {
                stage: "listening",
                transcript: heardText,
                message: "正在辨識…說完後停頓一下或再按 Q 結束"
            });
        }

        // 每收到新的語音就重新計算停頓時間
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(stopListening, SILENCE_TIMEOUT_MS);
    };
}

function handleFinalTranscript(transcript) {
    console.log("[*] 語音內容:", transcript);

    showSpeechBox(`你說：${transcript}`, {
        tone: 'success'
    });

    setCursorState('thinking');

    emitPlanningOverlayEvent("clicky:task-stage", {
        stage: "transcript_ready",
        transcript,
        message: "語音辨識完成，準備辨認需求"
    });

    // 停留一下讓使用者看到辨識文字，再交給 taskRunner.js：
    // 辨認需求 → 檢索流程 → 產生規劃 → 依 demoScripts.js 執行並更新進度。
    // 之後接真實 AI 規劃時，替換 taskRunner.js 的 findDemoScenario / buildPlan 即可。
    setTimeout(() => requestTaskFlow(transcript), 700);
}

// --- 鍵盤監聽 (Q: 錄音並呼叫 AI, W: 點擊) ---
// 使用者正在輸入框、下拉選單或可編輯區塊打字時，快捷鍵不應觸發。
function isEditableTarget(e) {
    // composedPath()[0] 才是 Shadow DOM 內真正被聚焦的元素
    const el = e.composedPath()[0];
    if (!(el instanceof Element)) return false;
    return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

document.addEventListener('keydown', (e) => {
    // 💡 防呆 1：如果使用者長按著鍵盤不放，直接忽略，避免重複觸發
    if (e.repeat) return;

  const key = e.key.toLowerCase();

  // 腳本等待確認時，即使焦點仍在課程搜尋輸入框，也要優先處理 W。
  if (key === 'w' && !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey && confirmPendingClick()) {
    e.preventDefault();
    return;
  }

    // 💡 防呆 2：在輸入框打字、中文輸入法選字中、或按組合鍵（Ctrl+Q 等）時不觸發
    if (isEditableTarget(e) || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;

    if (key === 'q' && isTaskRunning) {
        showSpeechBox("任務執行中，完成後再按 Q 下達新指令。", {
            tone: "thinking"
        });
        return;
    }

    if (key === 'q' && !isAiControlled) {
        // 語音已結束、但 AI 還在分析或等待背景回應時，
        // 不允許用 Q 開第二個任務，避免 demo 流程互相覆蓋。
        if (cursorState === 'thinking') {
            console.log("[*] 目前 AI 正在分析需求，請稍候。");

            showSpeechBox("AI 正在分析需求，請稍候…", {
            tone: "thinking"
            });

            return;
        }

        if (!recognition) {
            console.error("[*] 你的瀏覽器不支援 Web Speech API");
            return;
        }

        if (isListening) {
            // 聆聽中再按一次 Q：立即結束聆聽並送出目前辨識到的內容
            console.log("[*] 使用者結束聆聽。");
            stopListening();
            return;
        }

        console.log("[*] 正在聆聽語音指令 (請允許麥克風權限)...");
        isListening = true;
        setCursorState('listening');
        showSpeechBox('麥克風啟動中，請稍候…', { tone: 'listening' });
        emitPlanningOverlayEvent("clicky:task-stage", {
            stage: "listening",
            transcript: "",
            message: "麥克風啟動中，請稍候…"
        });
        recognition.start();
        
    } else if (key === 'w' && isAiControlled && !isTaskRunning) {
        emitPlanningOverlayEvent("clicky:task-stage", {
            stage: "executing",
            message: "正在確認目標並執行點擊…"
        });

        chrome.runtime.sendMessage({ type: 'AI_CLICK' });
    }
});

// --- 接收 Background 的指令廣播 ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AI_FLY') {
        setCursorState('guiding');

        showSpeechBox('已找到目標，正在帶你前往…', {
            tone: 'success'
        });

        emitPlanningOverlayEvent("clicky:task-stage", {
            stage: "guiding",
            message: "已找到目標，正在帶你前往；按 W 可確認點擊。",
            targetX: msg.targetX,
            targetY: msg.targetY
        });

        flyCursorTo(msg.targetX, msg.targetY);
    }
    else if (msg.type === 'AI_CLICK') {
        if (isTopWindow) {
            clickAtCursor();
            setTimeout(() => { chrome.runtime.sendMessage({ type: 'AI_RELEASE' }); }, 600);
        }
    }
    else if (msg.type === 'AI_RELEASE') {
        isAiControlled = false;
        isFirstMove = true;
        setCursorState('idle');

        emitPlanningOverlayEvent("clicky:task-completed", {
            message: "任務流程已完成。"
        });

        hideSpeechBox(1000);
    }
});

// --- 接收外層網頁傳來的代點指令 (專門給 iframe 用的) ---
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'EXECUTE_IFRAME_CLICK') {
        // iframe 收到指令後，用自己內部的座標找出元素並點擊
        const elementToClick = document.elementFromPoint(data.localX, data.localY);
        if (elementToClick) {
            doActualClick(elementToClick);
        }
        return;
    }

    if (data.source !== CLICKY_MESSAGE_SOURCE) return;

    if (isTopWindow && data.kind === 'overlay-event') {
        // iframe 轉送上來的 Overlay 事件
        emitPlanningOverlayEvent(data.type, data.detail);
    } else if (isTopWindow && data.kind === 'run-task') {
        // iframe 內辨識完成的語音，由最外層執行任務流程
        startTaskFlow(data.transcript);
    } else if (!isTopWindow && data.kind === 'ai-control') {
        setAiControl(data.active);
    }
});

window.addEventListener("clicky:reset-request", () => {
  console.log("[*] 收到 UI 重置請求。");

  if (recognition && isListening) {
    recognition.abort();
  }

  cancelTaskFlow();
  isListening = false;

  setCursorState("idle");
  hideSpeechBox(0);

  emitPlanningOverlayEvent("clicky:task-stage", {
    stage: "idle",
    transcript: "",
    message: "按 Q 開始語音輸入"
  });

  emitPlanningOverlayEvent("clicky:task-reset");
});

window.addEventListener("clicky:test-request", (event) => {
  const transcript = event.detail?.transcript?.trim();

  if (!isTopWindow || !transcript) {
    return;
  }

  console.log("[*] 收到文字測試指令:", transcript);

  if (recognition && isListening) {
    recognition.abort();
  }

  isListening = false;
  heardTranscript = "";
  clearListenTimers();
  handleFinalTranscript(transcript);
});