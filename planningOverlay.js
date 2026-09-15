(() => {
  const OVERLAY_HOST_ID = "clicky-task-overlay-host";

  // Overlay 只畫在最外層視窗；iframe 內的事件由 content.js 轉送上來。
  if (window !== window.top || document.getElementById(OVERLAY_HOST_ID)) {
    return;
  }

  const Stage = {
    IDLE: "idle",
    LISTENING: "listening",
    TRANSCRIPT_READY: "transcript_ready",
    ANALYZING: "analyzing",
    RETRIEVING: "retrieving",
    PLANNING: "planning",
    PLAN_READY: "plan_ready",
    GUIDING: "guiding",
    EXECUTING: "executing",
    HANDOFF: "handoff",
    COMPLETED: "completed",
    ERROR: "error"
  };

  // 分析頁的三個階段：辨認需求 → 檢索流程 → 產生規劃
  const PHASES = [
    { stage: Stage.ANALYZING, label: "辨認需求", title: "正在辨認需求" },
    { stage: Stage.RETRIEVING, label: "檢索校園流程", title: "正在檢索流程" },
    { stage: Stage.PLANNING, label: "產生任務規劃", title: "正在產生規劃" }
  ];

  const state = {
    stage: Stage.IDLE,
    message: "按 Q 開始語音輸入",
    transcript: "",
    plan: null,
    view: "voice",
    isMinimized: false,
    isClosed: false
  };

  const host = document.createElement("div");
  host.id = OVERLAY_HOST_ID;

  Object.assign(host.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "99999990",
    pointerEvents: "none"
  });

  const shadow = host.attachShadow({ mode: "open" });
  const logoUrl = chrome.runtime.getURL("assets/icons/campux-128.png");

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;

        /* Fluent 深色主題 */
        --bg: #292929;
        --border: #525252;
        --shadow: 0 8px 24px rgba(0, 0, 0, 0.36);
        --divider: #484848;
        --text-strong: #ffffff;
        --text: #f5f5f5;
        --text-soft: #d6d6d6;
        --text-muted: #adadad;
        --text-faint: #8a8a8a;
        --accent-text: #75b6e7;
        --hover-bg: rgba(255, 255, 255, 0.08);
        --chip-bg: #333333;
        --chip-border: #525252;
        --chip-text: #d6d6d6;
        --surface: #333333;
        --surface-border: #484848;
        --mark-bg: #3d3d3d;
        --mark-border: #666666;
        --transcript-bg: #333333;
        --transcript-border: #525252;
        --transcript-text: #ffffff;
        --track: #525252;
        --shimmer: rgba(255, 255, 255, 0.22);
        --progress-head: #75b6e7;
        --blue-text: #dbeafe;
        --blue-bg: rgba(59, 130, 246, 0.13);
        --blue-border: rgba(96, 165, 250, 0.45);
        --green-text: #bbf7d0;
        --green-bg: rgba(16, 185, 129, 0.10);
        --green-border: rgba(52, 211, 153, 0.28);
        --green-head: #6ee7b7;
        --result-text: #d1fae5;
        --result-bg: rgba(16, 185, 129, 0.12);
        --result-border: rgba(52, 211, 153, 0.32);
        --amber-text: #fef3c7;
        --amber-bg: rgba(245, 158, 11, 0.13);
        --amber-border: rgba(251, 191, 36, 0.55);
        --amber-head: #fcd34d;
        --red-text: #fecdd3;
        --red-bg: rgba(225, 29, 72, 0.12);
        --red-border: rgba(251, 113, 133, 0.45);
        --red-head: #fda4af;
        --info-text: #cfe4fa;
        --info-bg: rgba(15, 108, 189, 0.20);
        --info-border: rgba(117, 182, 231, 0.45);
      }

      /* 淺色主題 */
      :host([data-theme="light"]) {
        --bg: #ffffff;
        --border: #d1d1d1;
        --shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
        --divider: #e0e0e0;
        --text-strong: #242424;
        --text: #424242;
        --text-soft: #616161;
        --text-muted: #707070;
        --text-faint: #8a8a8a;
        --accent-text: #0f6cbd;
        --hover-bg: #f5f5f5;
        --chip-bg: #f5f5f5;
        --chip-border: #d1d1d1;
        --chip-text: #424242;
        --surface: #fafafa;
        --surface-border: #e0e0e0;
        --mark-bg: #f5f5f5;
        --mark-border: #b3b3b3;
        --transcript-bg: #f5faff;
        --transcript-border: #b4d6fa;
        --transcript-text: #0f548c;
        --track: #e0e0e0;
        --shimmer: rgba(255, 255, 255, 0.7);
        --progress-head: #0f6cbd;
        --blue-text: #0f548c;
        --blue-bg: #eff6fc;
        --blue-border: #62abdc;
        --green-text: #047857;
        --green-bg: #ecfdf5;
        --green-border: #a7f3d0;
        --green-head: #047857;
        --result-text: #065f46;
        --result-bg: #ecfdf5;
        --result-border: #6ee7b7;
        --amber-text: #92400e;
        --amber-bg: #fffbeb;
        --amber-border: #fbbf24;
        --amber-head: #b45309;
        --red-text: #be123c;
        --red-bg: #fff1f2;
        --red-border: #fda4af;
        --red-head: #e11d48;
        --info-text: #0f548c;
        --info-bg: #eff6fc;
        --info-border: #b4d6fa;
      }

      * {
        box-sizing: border-box;
      }

      [hidden] {
        display: none !important;
      }

      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        width: var(--card-width, 360px);
        max-width: calc(100vw - 16px);
        overflow: hidden;
        color: var(--text);
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: var(--shadow);
        font-family:
          "Segoe UI Variable",
          "Segoe UI",
          "Microsoft JhengHei",
          system-ui,
          sans-serif;
        pointer-events: auto;
      }

      /* 使用者調整過高度：固定卡片高度，內容區自己捲動 */
      .card.sized {
        height: var(--card-height);
        max-height: calc(100vh - 16px);
      }

      .card.minimized {
        width: auto;
        height: auto;
        min-width: 224px;
      }

      .card.minimized .body,
      .card.minimized .card-footer,
      .card.minimized .resize-handle {
        display: none;
      }

      /* 調整大小的把手：左邊、下邊、左下角（右上角固定不動） */
      .resize-handle {
        position: absolute;
        z-index: 2;
        touch-action: none;
      }

      .resize-handle.left {
        top: 56px;
        bottom: 14px;
        left: 0;
        width: 7px;
        cursor: ew-resize;
      }

      .resize-handle.bottom {
        right: 18px;
        bottom: 0;
        left: 14px;
        height: 7px;
        cursor: ns-resize;
      }

      .resize-handle.corner {
        bottom: 0;
        left: 0;
        width: 16px;
        height: 16px;
        cursor: nesw-resize;
      }

      /* 左下角的斜線提示 */
      .resize-handle.corner::after {
        position: absolute;
        bottom: 4px;
        left: 4px;
        width: 8px;
        height: 8px;
        border-bottom: 2px solid var(--text-faint);
        border-left: 2px solid var(--text-faint);
        border-bottom-left-radius: 3px;
        opacity: 0.7;
        content: "";
      }

      .card.resizing,
      .card.resizing * {
        user-select: none;
      }

      .header {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--divider);
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      .card.dragging .header {
        cursor: grabbing;
      }

      .card.minimized .header {
        border-bottom: 0;
      }

      .brand {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 10px;
      }

      .logo {
        flex: 0 0 auto;
        width: 32px;
        height: 32px;
      }

      .logo img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .title-wrap {
        min-width: 0;
      }

      .title {
        overflow: hidden;
        color: var(--text-strong);
        font-size: 14px;
        font-weight: 750;
        letter-spacing: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .subtitle {
        overflow: hidden;
        margin-top: 2px;
        color: var(--accent-text);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .subtitle.completed {
        color: var(--green-head);
      }

      .subtitle.error {
        color: var(--red-head);
      }

      .actions {
        display: flex;
        gap: 4px;
      }

      .icon-button {
        display: grid;
        width: 28px;
        height: 28px;
        padding: 0;
        color: var(--text-muted);
        background: transparent;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        place-items: center;
        font-size: 17px;
        line-height: 1;
      }

      .icon-button svg {
        width: 16px;
        height: 16px;
      }

      .icon-button:hover {
        color: var(--text-strong);
        background: var(--hover-bg);
      }

      .body {
        flex: 1 1 auto;
        min-height: 0;
        max-height: calc(100vh - 170px);
        padding: 15px 16px 4px;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .card.sized .body {
        max-height: none;
      }

      /* 調整過高度時整個內容區一起捲動，步驟清單不再另外限制高度 */
      .card.sized .steps {
        max-height: none;
      }

      .view {
        min-height: 270px;
      }

      .card.sized .view {
        min-height: 0;
      }

      .card-footer {
        flex: none;
        padding: 10px 16px 14px;
      }

      .section-label {
        margin-bottom: 8px;
        color: var(--text-muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .key {
        display: inline-grid;
        min-width: 19px;
        padding: 1px 5px;
        color: var(--chip-text);
        background: var(--chip-bg);
        border: 1px solid var(--chip-border);
        border-radius: 5px;
        place-items: center;
        font-size: 10px;
        font-weight: 700;
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }

        50% {
          opacity: 0.46;
        }
      }

      /* ----- 畫面 1：語音輸入 ----- */

      .voice-status {
        min-height: 24px;
        color: var(--text);
        font-size: 14px;
        font-weight: 650;
        line-height: 1.45;
      }

      .voice-status.error {
        color: var(--red-head);
      }

      .transcript-box {
        min-height: 104px;
        margin-top: 14px;
        padding: 14px;
        color: var(--transcript-text);
        background: var(--transcript-bg);
        border: 1px solid var(--transcript-border);
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.65;
        overflow-wrap: anywhere;
      }

      .empty {
        color: var(--text-muted);
      }

      .shortcut-hint {
        margin-top: 14px;
        color: var(--text-faint);
        font-size: 12px;
      }

      /* ----- 畫面 2：辨認需求 / 檢索流程 / 規劃 ----- */

      .analyzing-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 14px 6px 4px;
        text-align: center;
      }

      .analyzing-icon {
        width: 32px;
        height: 32px;
        border: 3px solid var(--track);
        border-top-color: #0f6cbd;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .analyzing-title {
        margin-top: 16px;
        color: var(--text-strong);
        font-size: 17px;
        font-weight: 750;
      }

      .analyzing-message {
        max-width: 290px;
        min-height: 40px;
        margin-top: 6px;
        color: var(--text-soft);
        font-size: 13px;
        line-height: 1.55;
      }

      .pipeline {
        display: grid;
        width: 100%;
        gap: 8px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
        text-align: left;
      }

      .phase {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        color: var(--text-faint);
        background: var(--surface);
        border: 1px solid var(--surface-border);
        border-radius: 10px;
        font-size: 13px;
        transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
      }

      .phase-mark {
        display: grid;
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        border: 1px solid var(--mark-border);
        border-radius: 50%;
        place-items: center;
        font-size: 11px;
        font-weight: 800;
      }

      .phase.running {
        color: var(--blue-text);
        background: var(--blue-bg);
        border-color: var(--blue-border);
      }

      .phase.running .phase-mark {
        border: 2px solid rgba(96, 165, 250, 0.3);
        border-top-color: #60a5fa;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .phase.completed {
        color: var(--green-text);
      }

      .phase.completed .phase-mark {
        color: #ecfdf5;
        background: #059669;
        border-color: #34d399;
      }

      .analysis-transcript {
        max-width: 290px;
        margin-top: 14px;
        color: var(--accent-text);
        font-size: 12px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      /* ----- 畫面 3：任務規劃與執行進度 ----- */

      .goal {
        color: var(--text-strong);
        font-size: 15px;
        font-weight: 750;
        line-height: 1.55;
      }

      .summary {
        margin-top: 6px;
        color: var(--text-soft);
        font-size: 13px;
        line-height: 1.55;
      }

      .progress {
        margin-top: 16px;
      }

      .progress-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        color: var(--progress-head);
        font-size: 12px;
        font-weight: 700;
      }

      .progress-percent {
        color: var(--text-strong);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }

      .progress-track {
        position: relative;
        height: 8px;
        margin-top: 8px;
        overflow: hidden;
        background: var(--track);
        border-radius: 999px;
      }

      .progress-fill {
        width: 0;
        height: 100%;
        background: #0f6cbd;
        border-radius: inherit;
        transition: width 500ms ease, background 300ms ease;
      }

      .progress.running .progress-track::after {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, var(--shimmer), transparent);
        animation: shimmer 1.3s linear infinite;
        content: "";
      }

      @keyframes shimmer {
        from {
          transform: translateX(-100%);
        }

        to {
          transform: translateX(100%);
        }
      }

      .progress.completed .progress-fill {
        background: linear-gradient(90deg, #059669, #34d399);
      }

      /* 完成時文字用主題的最強文字色（深色：白、淺色：黑），在綠色背景上比較清楚 */
      .progress.completed .progress-head {
        color: var(--text-strong);
      }

      .progress.error .progress-fill {
        background: linear-gradient(90deg, #e11d48, #fb7185);
      }

      .progress.error .progress-head {
        color: var(--red-head);
      }

      .steps {
        position: relative;
        display: grid;
        max-height: 40vh;
        gap: 8px;
        margin: 14px 0 0;
        padding: 0;
        overflow-y: auto;
        list-style: none;
        scrollbar-width: thin;
      }

      .step {
        display: grid;
        grid-template-columns: 28px 1fr;
        align-items: center;
        gap: 10px;
        min-height: 40px;
        padding: 8px 9px;
        color: var(--text-muted);
        background: var(--surface);
        border: 1px solid var(--surface-border);
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.4;
        transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
      }

      .step-mark {
        display: grid;
        width: 24px;
        height: 24px;
        color: var(--text-muted);
        background: var(--mark-bg);
        border: 1px solid var(--mark-border);
        border-radius: 50%;
        place-items: center;
        font-size: 11px;
        font-weight: 800;
      }

      .step.running {
        color: var(--blue-text);
        background: var(--blue-bg);
        border-color: var(--blue-border);
      }

      .step.running .step-mark {
        color: #ffffff;
        background: #2563eb;
        border-color: #60a5fa;
        box-shadow: 0 0 0 5px rgba(96, 165, 250, 0.12);
        animation: current-step-pulse 1.15s infinite;
      }

      @keyframes current-step-pulse {
        0%, 100% {
          transform: scale(1);
        }

        50% {
          transform: scale(1.12);
        }
      }

      .step.completed {
        color: var(--text-strong);
        font-weight: 700;
        background: var(--green-bg);
        border-color: var(--green-border);
      }

      .step.completed .step-mark {
        color: #ecfdf5;
        background: #059669;
        border-color: #34d399;
      }

      .step.waiting {
        color: var(--amber-text);
        background: var(--amber-bg);
        border-color: var(--amber-border);
      }

      .step.waiting .step-mark {
        color: #1f2937;
        background: #fbbf24;
        border-color: #fcd34d;
        box-shadow: 0 0 0 5px rgba(251, 191, 36, 0.14);
        animation: pulse 1.15s infinite;
      }

      .progress.waiting .progress-head {
        color: var(--amber-head);
      }

      .task-result.info {
        color: var(--info-text);
        background: var(--info-bg);
        border-color: var(--info-border);
      }

      .task-result.info .result-icon {
        background: #0f6cbd;
      }

      .step.error {
        color: var(--red-text);
        background: var(--red-bg);
        border-color: var(--red-border);
      }

      .step.error .step-mark {
        color: #ffffff;
        background: #e11d48;
        border-color: #fb7185;
      }

      .task-result {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-top: 14px;
        padding: 12px;
        color: var(--text-strong);
        font-weight: 700;
        background: var(--result-bg);
        border: 1px solid var(--result-border);
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.5;
        animation: result-in 320ms ease-out;
      }

      .task-result.error {
        color: var(--red-text);
        background: var(--red-bg);
        border-color: var(--red-border);
      }

      .result-icon {
        display: grid;
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        color: #ffffff;
        background: #059669;
        border-radius: 50%;
        place-items: center;
        font-size: 14px;
        font-weight: 800;
      }

      .task-result.error .result-icon {
        background: #e11d48;
      }

      .result-title {
        font-weight: 750;
      }

      .result-message {
        margin-top: 2px;
        color: inherit;
        opacity: 0.85;
      }

      .task-result:not(.error):not(.info) .result-message {
        opacity: 1;
      }

      @keyframes result-in {
        from {
          opacity: 0;
          transform: translateY(6px) scale(0.98);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* ----- Footer ----- */

      .test-request {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        margin-bottom: 10px;
      }

      .test-request-input {
        min-width: 0;
        padding: 8px 10px;
        color: var(--text-strong);
        background: var(--surface);
        border: 1px solid var(--surface-border);
        border-radius: 4px;
        outline: none;
        font-family: inherit;
        font-size: 12px;
      }

      .test-request-input:focus {
        border-color: #60a5fa;
        box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.18);
      }

      .test-request-button {
        padding: 8px 12px;
        color: #ffffff;
        background: #0f6cbd;
        border: 1px solid #0f6cbd;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 650;
      }

      .test-request-button:hover:not(:disabled) {
        background: #115ea3;
      }

      .test-request-button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .shortcut {
        margin-top: 10px;
        color: var(--text-faint);
        font-size: 11px;
      }

      .mode-switch {
        display: inline-flex;
        gap: 2px;
        padding: 3px;
        background: var(--chip-bg);
        border: 1px solid var(--chip-border);
        border-radius: 6px;
      }

      .mode-option {
        padding: 5px 11px;
        color: var(--text-muted);
        background: transparent;
        border: 0;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 650;
      }

      .mode-option:hover {
        color: var(--text-strong);
      }

      .mode-option.active {
        color: #ffffff;
        background: #0f6cbd;
      }

      .reset {
        padding: 8px 10px;
        color: var(--text);
        background: var(--chip-bg);
        border: 1px solid var(--chip-border);
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 650;
      }

      .reset:hover {
        background: var(--hover-bg);
      }
    </style>

    <section class="card" id="card" aria-live="polite">
      <header class="header" id="header" title="拖曳可移動，雙擊恢復預設位置與大小">
        <div class="brand">
          <div class="logo" aria-hidden="true"><img src="${logoUrl}" alt="" /></div>

          <div class="title-wrap">
            <div class="title">Clicky Campus Agent</div>
            <div class="subtitle" id="subtitle">等待語音指令</div>
          </div>
        </div>

        <div class="actions">
          <button class="icon-button" id="themeButton" type="button"></button>
          <button class="icon-button" id="minimizeButton" type="button" title="最小化" aria-label="最小化">−</button>
          <button class="icon-button" id="closeButton" type="button" title="關閉" aria-label="關閉">×</button>
        </div>
      </header>

      <div class="body">
        <!-- 畫面 1：語音輸入 -->
        <section class="view voice-view" id="voiceView">
          <div class="section-label">語音輸入</div>
          <div class="voice-status" id="voiceStatus">按 Q 開始語音輸入</div>
          <div class="transcript-box" id="transcript">
            <span class="empty">尚未收到語音內容</span>
          </div>
          <div class="shortcut-hint">按 <span class="key">Q</span> 開始語音輸入</div>
        </section>

        <!-- 畫面 2：辨認需求 → 檢索流程 → 產生規劃 -->
        <section class="view analyzing-view" id="analyzingView" hidden>
          <div class="analyzing-icon" aria-hidden="true"></div>
          <div class="analyzing-title" id="analyzingTitle">正在辨認需求</div>
          <div class="analyzing-message" id="analyzingMessage"></div>
          <ol class="pipeline" id="pipeline"></ol>
          <div class="analysis-transcript" id="analysisTranscript"></div>
        </section>

        <!-- 畫面 3：任務規劃與執行進度 -->
        <section class="view steps-view" id="stepsView" hidden>
          <div class="section-label">任務目標</div>
          <div class="goal" id="goal"></div>
          <div class="summary" id="summary"></div>

          <div class="progress" id="progress">
            <div class="progress-head">
              <span id="progressLabel"></span>
              <span class="progress-percent" id="progressPercent">0%</span>
            </div>
            <div
              class="progress-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              id="progressTrack"
            >
              <div class="progress-fill" id="progressFill"></div>
            </div>
          </div>

          <ol class="steps" id="steps"></ol>

          <div class="task-result" id="taskResult" hidden>
            <span class="result-icon" id="resultIcon">✓</span>
            <div>
              <div class="result-title" id="resultTitle"></div>
              <div class="result-message" id="resultMessage"></div>
            </div>
          </div>
        </section>

      </div>

      <div class="card-footer">
        <div class="test-request">
          <input
            class="test-request-input"
            id="testRequestInput"
            type="text"
            value="幫我加選資工系的計算機概論"
            aria-label="測試指令"
          />
          <button class="test-request-button" id="testRequestButton" type="button">執行測試</button>
        </div>
        <footer class="footer">
          <div class="mode-switch" role="group" aria-label="執行模式">
            <button class="mode-option" id="manualModeButton" type="button" title="每一步點擊前等你按 W 確認">手動</button>
            <button class="mode-option" id="autoModeButton" type="button" title="游標到位後自動點擊並進入下一步">自動</button>
          </div>
          <button class="reset" id="resetButton" type="button">重新開始</button>
        </footer>
        <div class="shortcut">
          <span class="key">Q</span> 開始語音
          <span id="confirmShortcut"><span class="key">W</span> 確認點擊</span>
        </div>
      </div>

      <div class="resize-handle left" data-edge="left" title="拖曳調整寬度"></div>
      <div class="resize-handle bottom" data-edge="bottom" title="拖曳調整高度"></div>
      <div class="resize-handle corner" data-edge="corner" title="拖曳調整大小"></div>
    </section>
  `;

  document.documentElement.appendChild(host);

  const elements = {
    card: shadow.querySelector("#card"),
    header: shadow.querySelector("#header"),
    subtitle: shadow.querySelector("#subtitle"),

    voiceView: shadow.querySelector("#voiceView"),
    analyzingView: shadow.querySelector("#analyzingView"),
    stepsView: shadow.querySelector("#stepsView"),

    voiceStatus: shadow.querySelector("#voiceStatus"),
    transcript: shadow.querySelector("#transcript"),

    analyzingTitle: shadow.querySelector("#analyzingTitle"),
    analyzingMessage: shadow.querySelector("#analyzingMessage"),
    pipeline: shadow.querySelector("#pipeline"),
    analysisTranscript: shadow.querySelector("#analysisTranscript"),

    goal: shadow.querySelector("#goal"),
    summary: shadow.querySelector("#summary"),
    progress: shadow.querySelector("#progress"),
    progressLabel: shadow.querySelector("#progressLabel"),
    progressPercent: shadow.querySelector("#progressPercent"),
    progressTrack: shadow.querySelector("#progressTrack"),
    progressFill: shadow.querySelector("#progressFill"),
    steps: shadow.querySelector("#steps"),
    taskResult: shadow.querySelector("#taskResult"),
    resultIcon: shadow.querySelector("#resultIcon"),
    resultTitle: shadow.querySelector("#resultTitle"),
    resultMessage: shadow.querySelector("#resultMessage"),

    themeButton: shadow.querySelector("#themeButton"),
    manualModeButton: shadow.querySelector("#manualModeButton"),
    autoModeButton: shadow.querySelector("#autoModeButton"),
    confirmShortcut: shadow.querySelector("#confirmShortcut"),
    testRequestInput: shadow.querySelector("#testRequestInput"),
    testRequestButton: shadow.querySelector("#testRequestButton"),
    minimizeButton: shadow.querySelector("#minimizeButton"),
    closeButton: shadow.querySelector("#closeButton"),
    resetButton: shadow.querySelector("#resetButton")
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getStageTitle(stage) {
    const titles = {
      [Stage.IDLE]: "等待語音指令",
      [Stage.LISTENING]: "正在聆聽",
      [Stage.TRANSCRIPT_READY]: "語音辨識完成",
      [Stage.ANALYZING]: "正在辨認需求",
      [Stage.RETRIEVING]: "正在檢索流程",
      [Stage.PLANNING]: "正在產生規劃",
      [Stage.PLAN_READY]: "任務規劃完成",
      [Stage.GUIDING]: "等待按 W 確認點擊",
      [Stage.EXECUTING]: "正在執行任務",
      [Stage.HANDOFF]: "已在新分頁繼續",
      [Stage.COMPLETED]: "任務已完成",
      [Stage.ERROR]: "發生錯誤"
    };

    return titles[stage] ?? "處理中";
  }

  function getViewForStage(stage) {
    if (PHASES.some((phase) => phase.stage === stage)) {
      return "analyzing";
    }

    if (
      stage === Stage.PLAN_READY ||
      stage === Stage.GUIDING ||
      stage === Stage.EXECUTING ||
      stage === Stage.HANDOFF ||
      stage === Stage.COMPLETED
    ) {
      return "steps";
    }

    if (stage === Stage.ERROR) {
      return state.plan ? "steps" : "voice";
    }

    return "voice";
  }

  function getProgress() {
    const steps = state.plan?.steps ?? [];
    const total = steps.length;
    const completed = steps.filter((step) => step.status === "completed").length;

    return {
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      runningIndex: steps.findIndex((step) => step.status === "running"),
      waitingIndex: steps.findIndex((step) => step.status === "waiting"),
      errorIndex: steps.findIndex((step) => step.status === "error")
    };
  }

  function updateState(patch) {
    Object.assign(state, patch);
    render();
  }

  function render() {
    if (state.isClosed) {
      return;
    }

    const progress = getProgress();

    elements.subtitle.textContent =
      state.stage === Stage.EXECUTING && progress.total
        ? `正在執行任務 · ${progress.percent}%`
        : getStageTitle(state.stage);
    elements.subtitle.classList.toggle("completed", state.stage === Stage.COMPLETED);
    elements.subtitle.classList.toggle("error", state.stage === Stage.ERROR);

    elements.voiceView.hidden = state.view !== "voice";
    elements.analyzingView.hidden = state.view !== "analyzing";
    elements.stepsView.hidden = state.view !== "steps";

    renderVoiceView();
    renderAnalyzingView();
    renderStepsView(progress);

    const canStartTest = [Stage.IDLE, Stage.COMPLETED, Stage.ERROR].includes(state.stage);
    elements.testRequestInput.disabled = !canStartTest;
    elements.testRequestButton.disabled = !canStartTest;

    elements.card.classList.toggle("minimized", state.isMinimized);
    elements.minimizeButton.textContent = state.isMinimized ? "+" : "−";
    elements.minimizeButton.title = state.isMinimized ? "展開" : "最小化";
    elements.minimizeButton.setAttribute("aria-label", elements.minimizeButton.title);

    // 內容高度改變後，確保卡片仍在畫面內
    applyPosition();
  }

  function renderVoiceView() {
    elements.voiceStatus.textContent = state.message;
    elements.voiceStatus.classList.toggle("error", state.stage === Stage.ERROR);

    if (state.transcript) {
      elements.transcript.textContent = `「${state.transcript}」`;
    } else {
      elements.transcript.innerHTML = '<span class="empty">尚未收到語音內容</span>';
    }
  }

  function renderAnalyzingView() {
    const currentIndex = PHASES.findIndex((phase) => phase.stage === state.stage);

    elements.analyzingTitle.textContent = PHASES[currentIndex]?.title ?? "正在辨認需求";
    elements.analyzingMessage.textContent = state.message;
    elements.analysisTranscript.textContent = state.transcript
      ? `語音指令：「${state.transcript}」`
      : "";

    elements.pipeline.innerHTML = PHASES.map((phase, index) => {
      const status =
        index < currentIndex ? "completed" : index === currentIndex ? "running" : "pending";
      const mark = status === "completed" ? "✓" : "";

      return `
        <li class="phase ${status}">
          <span class="phase-mark">${mark}</span>
          <span>${escapeHtml(phase.label)}</span>
        </li>
      `;
    }).join("");
  }

  function renderStepsView(progress) {
    const { plan } = state;

    elements.goal.textContent = plan?.goal ?? state.message;
    elements.summary.textContent = plan?.summary ?? "";
    elements.progress.hidden = !plan;

    const { total, completed, percent, runningIndex, waitingIndex, errorIndex } = progress;

    elements.progress.classList.toggle("running", state.stage === Stage.EXECUTING);
    elements.progress.classList.toggle("waiting", waitingIndex >= 0);
    elements.progress.classList.toggle("completed", state.stage === Stage.COMPLETED);
    elements.progress.classList.toggle("error", state.stage === Stage.ERROR);

    if (state.stage === Stage.COMPLETED) {
      elements.progressLabel.textContent = `全部完成 ${total} / ${total} 步`;
    } else if (errorIndex >= 0) {
      elements.progressLabel.textContent = `第 ${errorIndex + 1} 步失敗 · 已完成 ${completed} / ${total} 步`;
    } else if (state.stage === Stage.HANDOFF) {
      elements.progressLabel.textContent = `已完成 ${completed} / ${total} 步 · 在新分頁繼續`;
    } else if (waitingIndex >= 0) {
      elements.progressLabel.textContent = `第 ${waitingIndex + 1} / ${total} 步：等待按 W 確認`;
    } else if (runningIndex >= 0) {
      elements.progressLabel.textContent = `正在執行第 ${runningIndex + 1} / ${total} 步`;
    } else if (completed > 0) {
      elements.progressLabel.textContent = `已完成 ${completed} / ${total} 步`;
    } else {
      elements.progressLabel.textContent = `規劃完成，共 ${total} 個步驟`;
    }

    elements.progressPercent.textContent = `${percent}%`;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(percent));

    elements.steps.innerHTML = (plan?.steps ?? [])
      .map((step) => {
        const status = step.status ?? "pending";
        const marks = { completed: "✓", running: "●", waiting: "W", error: "!" };

        return `
          <li class="step ${escapeHtml(status)}">
            <span class="step-mark">${escapeHtml(marks[status] ?? step.order)}</span>
            <span>${escapeHtml(step.title)}</span>
          </li>
        `;
      })
      .join("");

    const results = {
      [Stage.COMPLETED]: { icon: "✓", title: "任務完成" },
      [Stage.ERROR]: { icon: "!", title: "任務中斷" },
      [Stage.HANDOFF]: { icon: "↗", title: "已開啟新分頁" }
    };
    const result = results[state.stage];
    elements.taskResult.hidden = !(plan && result);
    elements.taskResult.classList.toggle("error", state.stage === Stage.ERROR);
    elements.taskResult.classList.toggle("info", state.stage === Stage.HANDOFF);
    elements.resultIcon.textContent = result?.icon ?? "";
    elements.resultTitle.textContent = result?.title ?? "";
    elements.resultMessage.textContent = state.message;

    scrollActiveStepIntoView();
  }

  // 步驟多時清單會捲動，讓執行中或失敗的步驟保持可見。
  function scrollActiveStepIntoView() {
    const list = elements.steps;
    const activeStep = list.querySelector(".step.running, .step.waiting, .step.error");

    if (!activeStep || list.scrollHeight <= list.clientHeight) {
      return;
    }

    const top = activeStep.offsetTop;
    const bottom = top + activeStep.offsetHeight;

    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - 8;
    }
  }

  // --- 事件處理 ---

  function handleTaskStage(event) {
    const detail = event.detail ?? {};
    const stage = detail.stage ?? Stage.IDLE;

    updateState({
      stage,
      view: getViewForStage(stage),
      message: detail.message ?? state.message,
      transcript: detail.transcript ?? state.transcript,
      // 開始新一輪語音或分析時清掉上一輪的規劃
      plan: stage === Stage.LISTENING || stage === Stage.ANALYZING ? null : state.plan
    });
  }

  function handlePlanReady(event) {
    const detail = event.detail ?? {};

    updateState({
      stage: Stage.PLAN_READY,
      view: "steps",
      message: "任務規劃完成，準備開始執行",
      transcript: detail.transcript ?? state.transcript,
      plan: detail.plan ?? null
    });
  }

  function handleStepUpdate(event) {
    const detail = event.detail ?? {};
    const { stepIndex } = detail;
    const status = detail.status ?? "running";

    if (
      !state.plan ||
      !Number.isInteger(stepIndex) ||
      stepIndex < 0 ||
      stepIndex >= state.plan.steps.length
    ) {
      return;
    }

    const steps = state.plan.steps.map((step, index) => {
      if (index === stepIndex) {
        return { ...step, status };
      }

      if ((status === "running" || status === "waiting") && index < stepIndex) {
        return { ...step, status: "completed" };
      }

      return step;
    });

    const stageByStatus = { error: Stage.ERROR, waiting: Stage.GUIDING };

    updateState({
      stage: stageByStatus[status] ?? Stage.EXECUTING,
      view: "steps",
      message: detail.message ?? steps[stepIndex].title,
      plan: { ...state.plan, steps }
    });
  }

  function handleTaskCompleted(event) {
    const detail = event.detail ?? {};

    updateState({
      stage: Stage.COMPLETED,
      view: "steps",
      message: detail.message ?? "任務已完成。",
      plan: state.plan && {
        ...state.plan,
        steps: state.plan.steps.map((step) => ({ ...step, status: "completed" }))
      }
    });
  }

  function handleTaskReset() {
    updateState({
      stage: Stage.IDLE,
      view: "voice",
      message: "按 Q 開始語音輸入",
      transcript: "",
      plan: null,
      isMinimized: false
    });
  }

  const listeners = [
    ["clicky:task-stage", handleTaskStage],
    ["clicky:plan-ready", handlePlanReady],
    ["clicky:step-update", handleStepUpdate],
    ["clicky:task-completed", handleTaskCompleted],
    ["clicky:task-reset", handleTaskReset]
  ];

  for (const [type, handler] of listeners) {
    window.addEventListener(type, handler);
  }

  // 深淺色切換：主題狀態由 content.js 管理，並同步到所有分頁
  const THEME_ICONS = {
    // 目前是深色 → 顯示太陽（按下切到淺色）
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    // 目前是淺色 → 顯示月亮（按下切到深色）
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };

  themeSetting.onChange((theme) => {
    host.dataset.theme = theme;
    elements.themeButton.innerHTML = THEME_ICONS[theme];
    elements.themeButton.title = theme === "dark" ? "切換為淺色模式" : "切換為深色模式";
    elements.themeButton.setAttribute("aria-label", elements.themeButton.title);
  });

  elements.themeButton.addEventListener("click", () => {
    themeSetting.set(themeSetting.value === "dark" ? "light" : "dark");
  });

  // 自動 / 手動模式：設定由 content.js 管理並同步到所有分頁
  clickModeSetting.onChange((mode) => {
    elements.manualModeButton.classList.toggle("active", mode === "manual");
    elements.autoModeButton.classList.toggle("active", mode === "auto");
    elements.manualModeButton.setAttribute("aria-pressed", String(mode === "manual"));
    elements.autoModeButton.setAttribute("aria-pressed", String(mode === "auto"));
    // 自動模式不需要按 W
    elements.confirmShortcut.hidden = mode === "auto";
  });

  elements.manualModeButton.addEventListener("click", () => clickModeSetting.set("manual"));
  elements.autoModeButton.addEventListener("click", () => clickModeSetting.set("auto"));

  function submitTestRequest() {
    const transcript = elements.testRequestInput.value.trim();

    if (!transcript || elements.testRequestButton.disabled) {
      elements.testRequestInput.focus();
      return;
    }

    window.dispatchEvent(
      new CustomEvent("clicky:test-request", {
        detail: { transcript, source: "planning-overlay" }
      })
    );
  }

  elements.testRequestButton.addEventListener("click", submitTestRequest);
  elements.testRequestInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitTestRequest();
    }
  });

  elements.minimizeButton.addEventListener("click", () => {
    updateState({ isMinimized: !state.isMinimized });
  });

  elements.resetButton.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("clicky:reset-request", {
        detail: { source: "planning-overlay" }
      })
    );
  });

  elements.closeButton.addEventListener("click", () => {
    state.isClosed = true;

    for (const [type, handler] of listeners) {
      window.removeEventListener(type, handler);
    }

    host.remove();
  });

  // --- 拖曳移動 ---
  // 沒拖曳過：固定在右下角，內容變高時往上長（原本的行為）。
  // 拖曳後：改以右上角為錨點（right / top），最小化時標題列和按鈕停在原地，內容往下長。
  // 位置存在 chrome.storage.local，重新整理或切換 Portal / 選課系統分頁都會保留。
  const POSITION_STORAGE_KEY = "clickyOverlayPosition";
  const DEFAULT_OFFSET = 20;
  const EDGE_MARGIN = 8;

  // 使用者想要的位置（null = 預設右下角）。實際套用時會限制在畫面內，但不改寫這個值，
  // 避免卡片暫時變高被推回來後，縮小時回不到原位。
  let desiredPosition = null;
  let appliedPosition = null;
  let drag = null;

  function applyPosition() {
    if (!desiredPosition) {
      appliedPosition = null;
      Object.assign(host.style, {
        top: "auto",
        right: `${DEFAULT_OFFSET}px`,
        bottom: `${DEFAULT_OFFSET}px`
      });
      return;
    }

    const rect = elements.card.getBoundingClientRect();
    const maxRight = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN);
    const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN);
    const clamp = (value, max) => Math.min(Math.max(value, EDGE_MARGIN), max);

    appliedPosition = {
      right: clamp(desiredPosition.right, maxRight),
      top: clamp(desiredPosition.top, maxTop)
    };

    Object.assign(host.style, {
      top: `${appliedPosition.top}px`,
      right: `${appliedPosition.right}px`,
      bottom: "auto"
    });
  }

  function savePosition() {
    try {
      chrome.storage.local.set({ [POSITION_STORAGE_KEY]: desiredPosition });
    } catch (error) {
      console.warn("[Clicky] 無法保存面板位置：", error);
    }
  }

  elements.header.addEventListener("pointerdown", (event) => {
    // 點標題列上的按鈕（主題、最小化、關閉）不觸發拖曳
    if (event.button !== 0 || event.target.closest("button")) {
      return;
    }

    event.preventDefault();
    elements.header.setPointerCapture(event.pointerId);
    elements.card.classList.add("dragging");

    const rect = elements.card.getBoundingClientRect();
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      right: window.innerWidth - rect.right,
      top: rect.top
    };
  });

  elements.header.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }

    desiredPosition = {
      right: drag.right - (event.clientX - drag.startX),
      top: drag.top + (event.clientY - drag.startY)
    };
    applyPosition();
  });

  function endDrag() {
    if (!drag) {
      return;
    }

    drag = null;
    elements.card.classList.remove("dragging");

    // 只是點一下標題列、沒有真的移動時，維持原本位置
    if (!appliedPosition) {
      return;
    }

    // 存實際位置，拖出畫面外的部分不保留
    desiredPosition = { ...appliedPosition };
    savePosition();
  }

  elements.header.addEventListener("pointerup", endDrag);
  elements.header.addEventListener("pointercancel", endDrag);

  elements.header.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    desiredPosition = null;
    cardSize = { width: null, height: null };
    applySize();
    applyPosition();
    savePosition();
    saveSize();
  });

  // --- 調整大小 ---
  // 拖曳左邊、下邊或左下角調整；右上角固定，所以開始調整時會切換成右上角錨點。
  // 大小存在 chrome.storage.local，雙擊標題列恢復預設。
  const SIZE_STORAGE_KEY = "clickyOverlaySize";
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 240;

  // null 表示沿用預設（寬 360px、高度依內容）
  let cardSize = { width: null, height: null };
  let resize = null;

  function clampSize(width, height) {
    const maxWidth = window.innerWidth - EDGE_MARGIN * 2;
    const maxHeight = window.innerHeight - EDGE_MARGIN * 2;

    return {
      width: width === null ? null : Math.round(Math.min(Math.max(width, MIN_WIDTH), maxWidth)),
      height: height === null ? null : Math.round(Math.min(Math.max(height, MIN_HEIGHT), maxHeight))
    };
  }

  function applySize() {
    const { width, height } = clampSize(cardSize.width, cardSize.height);

    if (width === null) {
      host.style.removeProperty("--card-width");
    } else {
      host.style.setProperty("--card-width", `${width}px`);
    }

    if (height === null) {
      host.style.removeProperty("--card-height");
    } else {
      host.style.setProperty("--card-height", `${height}px`);
    }

    elements.card.classList.toggle("sized", height !== null);
  }

  function saveSize() {
    try {
      chrome.storage.local.set({ [SIZE_STORAGE_KEY]: cardSize });
    } catch (error) {
      console.warn("[Clicky] 無法保存面板大小：", error);
    }
  }

  for (const handle of shadow.querySelectorAll(".resize-handle")) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);

      const rect = elements.card.getBoundingClientRect();

      // 固定右上角：從預設右下角位置開始調整時，先換成等效的右上角位置
      desiredPosition = { right: window.innerWidth - rect.right, top: rect.top };
      applyPosition();

      resize = {
        edge: handle.dataset.edge,
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
        height: rect.height,
        right: window.innerWidth - rect.right,
        top: rect.top
      };
      elements.card.classList.add("resizing");
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resize) {
        return;
      }

      const dx = event.clientX - resize.startX;
      const dy = event.clientY - resize.startY;
      // 往左拉變寬、往下拉變高，並且不超出畫面左邊與下邊
      const maxWidth = window.innerWidth - resize.right - EDGE_MARGIN;
      const maxHeight = window.innerHeight - resize.top - EDGE_MARGIN;

      if (resize.edge === "left" || resize.edge === "corner") {
        cardSize.width = Math.min(resize.width - dx, maxWidth);
      }

      if (resize.edge === "bottom" || resize.edge === "corner") {
        cardSize.height = Math.min(resize.height + dy, maxHeight);
      }

      applySize();
    });

    const endResize = () => {
      if (!resize) {
        return;
      }

      resize = null;
      elements.card.classList.remove("resizing");
      cardSize = clampSize(cardSize.width, cardSize.height);
      applySize();
      applyPosition();
      saveSize();
      savePosition();
    };

    handle.addEventListener("pointerup", endResize);
    handle.addEventListener("pointercancel", endResize);
  }

  const handleWindowResize = () => {
    applySize();
    applyPosition();
  };

  listeners.push(["resize", handleWindowResize]);
  window.addEventListener("resize", handleWindowResize);

  try {
    chrome.storage.local
      .get(SIZE_STORAGE_KEY)
      .then((result) => {
        const saved = result[SIZE_STORAGE_KEY];
        const readSize = (value) => (Number.isFinite(value) ? value : null);

        cardSize = { width: readSize(saved?.width), height: readSize(saved?.height) };
        applySize();
        applyPosition();
      })
      .catch((error) => console.warn("[Clicky] 無法讀取面板大小：", error));
  } catch (error) {
    console.warn("[Clicky] 無法讀取面板大小：", error);
  }

  try {
    chrome.storage.local
      .get(POSITION_STORAGE_KEY)
      .then((result) => {
        const saved = result[POSITION_STORAGE_KEY];

        if (Number.isFinite(saved?.right) && Number.isFinite(saved?.top)) {
          desiredPosition = { right: saved.right, top: saved.top };
          applyPosition();
        }
      })
      .catch((error) => console.warn("[Clicky] 無法讀取面板位置：", error));
  } catch (error) {
    console.warn("[Clicky] 無法讀取面板位置：", error);
  }

  render();

  console.log("[Clicky] Planning overlay loaded.");
})();
