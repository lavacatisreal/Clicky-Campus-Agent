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

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;

        /* 深色主題（預設） */
        --bg:
          radial-gradient(circle at top right, rgba(79, 70, 229, 0.32), transparent 44%),
          linear-gradient(145deg, #111827, #1f2937);
        --border: rgba(148, 163, 184, 0.26);
        --shadow: 0 18px 55px rgba(0, 0, 0, 0.42);
        --divider: rgba(148, 163, 184, 0.18);
        --text-strong: #ffffff;
        --text: #e2e8f0;
        --text-soft: #cbd5e1;
        --text-muted: #94a3b8;
        --text-faint: #64748b;
        --accent-text: #a5b4fc;
        --hover-bg: rgba(255, 255, 255, 0.10);
        --chip-bg: rgba(148, 163, 184, 0.14);
        --chip-border: rgba(148, 163, 184, 0.2);
        --chip-text: #cbd5e1;
        --surface: rgba(15, 23, 42, 0.30);
        --surface-border: rgba(148, 163, 184, 0.12);
        --mark-bg: rgba(148, 163, 184, 0.10);
        --mark-border: rgba(148, 163, 184, 0.22);
        --transcript-bg: rgba(15, 23, 42, 0.58);
        --transcript-border: rgba(96, 165, 250, 0.26);
        --transcript-text: #dbeafe;
        --track: rgba(148, 163, 184, 0.16);
        --shimmer: rgba(255, 255, 255, 0.22);
        --progress-head: #c7d2fe;
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
        --info-text: #e0e7ff;
        --info-bg: rgba(99, 102, 241, 0.14);
        --info-border: rgba(129, 140, 248, 0.4);
      }

      /* 淺色主題 */
      :host([data-theme="light"]) {
        --bg:
          radial-gradient(circle at top right, rgba(99, 102, 241, 0.12), transparent 44%),
          linear-gradient(145deg, #ffffff, #f8fafc);
        --border: rgba(15, 23, 42, 0.12);
        --shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
        --divider: rgba(15, 23, 42, 0.08);
        --text-strong: #0f172a;
        --text: #1e293b;
        --text-soft: #475569;
        --text-muted: #64748b;
        --text-faint: #94a3b8;
        --accent-text: #4f46e5;
        --hover-bg: rgba(15, 23, 42, 0.06);
        --chip-bg: #f1f5f9;
        --chip-border: #e2e8f0;
        --chip-text: #334155;
        --surface: #f8fafc;
        --surface-border: #e2e8f0;
        --mark-bg: #f1f5f9;
        --mark-border: #cbd5e1;
        --transcript-bg: #eef2ff;
        --transcript-border: #c7d2fe;
        --transcript-text: #1e3a8a;
        --track: #e2e8f0;
        --shimmer: rgba(255, 255, 255, 0.7);
        --progress-head: #4338ca;
        --blue-text: #1d4ed8;
        --blue-bg: #eff6ff;
        --blue-border: #93c5fd;
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
        --info-text: #3730a3;
        --info-bg: #eef2ff;
        --info-border: #a5b4fc;
      }

      * {
        box-sizing: border-box;
      }

      [hidden] {
        display: none !important;
      }

      .card {
        width: 360px;
        max-width: calc(100vw - 32px);
        overflow: hidden;
        color: var(--text);
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: var(--shadow);
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          "Microsoft JhengHei",
          sans-serif;
        pointer-events: auto;
      }

      .card.minimized {
        width: auto;
        min-width: 224px;
      }

      .card.minimized .body {
        display: none;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--divider);
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
        display: grid;
        flex: 0 0 auto;
        width: 30px;
        height: 30px;
        color: #ffffff;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        border-radius: 10px;
        place-items: center;
        font-size: 15px;
        font-weight: 800;
      }

      .title-wrap {
        min-width: 0;
      }

      .title {
        overflow: hidden;
        color: var(--text-strong);
        font-size: 14px;
        font-weight: 750;
        letter-spacing: 0.01em;
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
        max-height: calc(100vh - 110px);
        padding: 15px 16px 16px;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .view {
        min-height: 270px;
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
        display: grid;
        width: 52px;
        height: 52px;
        color: #ffffff;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        border-radius: 17px;
        box-shadow: 0 10px 28px rgba(99, 102, 241, 0.35);
        place-items: center;
        font-size: 24px;
        animation: analyzing-float 1.4s ease-in-out infinite;
      }

      @keyframes analyzing-float {
        0%, 100% {
          transform: translateY(0) scale(1);
        }

        50% {
          transform: translateY(-5px) scale(1.04);
        }
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
        background: linear-gradient(90deg, #6366f1, #60a5fa);
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

      .progress.completed .progress-head {
        color: var(--green-head);
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
        color: var(--green-text);
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
        background: #6366f1;
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
        color: var(--result-text);
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

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 16px;
      }

      .shortcut {
        color: var(--text-faint);
        font-size: 11px;
      }

      .reset {
        padding: 8px 10px;
        color: var(--text);
        background: var(--chip-bg);
        border: 1px solid var(--chip-border);
        border-radius: 9px;
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
      <header class="header">
        <div class="brand">
          <div class="logo">✦</div>

          <div class="title-wrap">
            <div class="title">Clicky Task Planner</div>
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
          <div class="analyzing-icon">✦</div>
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

        <footer class="footer">
          <div class="shortcut">
            <span class="key">Q</span> 開始語音
            <span class="key">W</span> 確認點擊
          </div>
          <button class="reset" id="resetButton" type="button">重新開始</button>
        </footer>
      </div>
    </section>
  `;

  document.documentElement.appendChild(host);

  const elements = {
    card: shadow.querySelector("#card"),
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

    elements.card.classList.toggle("minimized", state.isMinimized);
    elements.minimizeButton.textContent = state.isMinimized ? "+" : "−";
    elements.minimizeButton.title = state.isMinimized ? "展開" : "最小化";
    elements.minimizeButton.setAttribute("aria-label", elements.minimizeButton.title);
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

  onThemeChange((theme) => {
    host.dataset.theme = theme;
    elements.themeButton.innerHTML = THEME_ICONS[theme];
    elements.themeButton.title = theme === "dark" ? "切換為淺色模式" : "切換為深色模式";
    elements.themeButton.setAttribute("aria-label", elements.themeButton.title);
  });

  elements.themeButton.addEventListener("click", () => {
    setTheme(currentTheme === "dark" ? "light" : "dark");
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

  render();

  console.log("[Clicky] Planning overlay loaded.");
})();
