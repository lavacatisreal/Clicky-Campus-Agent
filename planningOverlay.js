(() => {
  const OVERLAY_HOST_ID = "clicky-task-overlay-host";

  if (document.getElementById(OVERLAY_HOST_ID)) {
    return;
  }

  const Stage = {
    IDLE: "idle",
    LISTENING: "listening",
    TRANSCRIPT_READY: "transcript_ready",
    ANALYZING: "analyzing",
    PLANNING: "planning",
    PLAN_READY: "plan_ready",
    GUIDING: "guiding",
    EXECUTING: "executing",
    COMPLETED: "completed",
    ERROR: "error"
  };

    const state = {
        stage: Stage.IDLE,
        message: "按 Q 開始語音輸入",
        transcript: "",
        plan: null,

        //目前顯示的頁面
        view: "voice",

        //任務實際進度
        currentStepIndex: -1,
        completedStepCount: 0,

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
      }

      * {
        box-sizing: border-box;
      }

      .card {
        width: 360px;
        max-width: calc(100vw - 32px);
        overflow: hidden;
        color: #f8fafc;
        background:
          radial-gradient(circle at top right, rgba(79, 70, 229, 0.32), transparent 44%),
          linear-gradient(145deg, #111827, #1f2937);
        border: 1px solid rgba(148, 163, 184, 0.26);
        border-radius: 18px;
        box-shadow: 0 18px 55px rgba(0, 0, 0, 0.42);
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
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
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
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
        color: #ffffff;
        font-size: 14px;
        font-weight: 750;
        letter-spacing: 0.01em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .subtitle {
        overflow: hidden;
        margin-top: 2px;
        color: #a5b4fc;
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        color: #cbd5e1;
        background: transparent;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        place-items: center;
        font-size: 17px;
        line-height: 1;
      }

      .icon-button:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.10);
      }

      .body {
        padding: 15px 16px 16px;
      }

      .status-row {
        display: flex;
        align-items: center;
        min-height: 24px;
        gap: 8px;
      }

      .dot {
        width: 9px;
        height: 9px;
        background: #64748b;
        border-radius: 50%;
      }

      .dot.listening,
      .dot.analyzing,
      .dot.planning,
      .dot.executing {
        background: #60a5fa;
        box-shadow: 0 0 0 5px rgba(96, 165, 250, 0.13);
        animation: pulse 1.15s infinite;
      }

      .dot.guiding {
        background: #facc15;
        box-shadow: 0 0 0 5px rgba(250, 204, 21, 0.13);
        animation: pulse 1.15s infinite;
      }

      .dot.plan_ready,
      .dot.completed {
        background: #34d399;
        box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.12);
      }

      .dot.error {
        background: #fb7185;
        box-shadow: 0 0 0 5px rgba(251, 113, 133, 0.12);
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }

        50% {
          opacity: 0.46;
        }
      }

      .status-message {
        color: #e2e8f0;
        font-size: 13px;
        line-height: 1.45;
      }

      .empty {
        color: #94a3b8;
      }

      .goal {
        color: #f8fafc;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.55;
      }

      .summary {
        margin-top: 6px;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.5;
      }

      .steps {
        display: grid;
        gap: 8px;
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
      }

      .step {
        display: grid;
        grid-template-columns: 23px 1fr;
        align-items: start;
        gap: 9px;
        color: #e2e8f0;
        font-size: 13px;
        line-height: 1.4;
      }

      .step-mark {
        display: grid;
        width: 23px;
        height: 23px;
        color: #c7d2fe;
        background: rgba(99, 102, 241, 0.18);
        border: 1px solid rgba(129, 140, 248, 0.22);
        border-radius: 50%;
        place-items: center;
        font-size: 11px;
        font-weight: 750;
      }

      .step.running .step-mark {
        color: #dbeafe;
        background: rgba(59, 130, 246, 0.22);
        border-color: rgba(96, 165, 250, 0.6);
        animation: pulse 1.15s infinite;
      }

      .step.completed {
        color: #a7f3d0;
      }

      .step.completed .step-mark {
        color: #d1fae5;
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(52, 211, 153, 0.5);
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 16px;
      }

      .shortcut {
        color: #64748b;
        font-size: 11px;
      }

      .key {
        display: inline-grid;
        min-width: 19px;
        padding: 1px 5px;
        color: #cbd5e1;
        background: rgba(148, 163, 184, 0.14);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 5px;
        place-items: center;
        font-size: 10px;
        font-weight: 700;
      }

      .reset {
        padding: 8px 10px;
        color: #e2e8f0;
        background: rgba(148, 163, 184, 0.1);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 9px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 650;
      }

      .reset:hover {
        background: rgba(148, 163, 184, 0.18);
      }

      .view {
        min-height: 270px;
        }

        .section-label {
        margin-bottom: 8px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        }

        .voice-status {
        min-height: 24px;
        color: #e2e8f0;
        font-size: 14px;
        font-weight: 650;
        line-height: 1.45;
        }

        .transcript-box {
        min-height: 104px;
        margin-top: 14px;
        padding: 14px;
        color: #dbeafe;
        background: rgba(15, 23, 42, 0.58);
        border: 1px solid rgba(96, 165, 250, 0.26);
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.65;
        overflow-wrap: anywhere;
        }

        .empty {
        color: #94a3b8;
        }

        .shortcut-hint {
        margin-top: 14px;
        color: #64748b;
        font-size: 12px;
        }

        .analyzing-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 18px 6px;
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
        0%,
        100% {
            transform: translateY(0) scale(1);
        }

        50% {
            transform: translateY(-5px) scale(1.04);
        }
        }

        .analyzing-title {
        margin-top: 18px;
        color: #ffffff;
        font-size: 17px;
        font-weight: 750;
        }

        .analyzing-message {
        max-width: 270px;
        margin-top: 8px;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.55;
        }

        .analysis-transcript {
        max-width: 290px;
        margin-top: 16px;
        color: #a5b4fc;
        font-size: 12px;
        line-height: 1.5;
        overflow-wrap: anywhere;
        }

        .loading-dots {
        display: flex;
        gap: 7px;
        margin-top: 20px;
        }

        .loading-dots span {
        width: 8px;
        height: 8px;
        background: #a5b4fc;
        border-radius: 50%;
        animation: loading-bounce 0.9s ease-in-out infinite;
        }

        .loading-dots span:nth-child(2) {
        animation-delay: 0.15s;
        }

        .loading-dots span:nth-child(3) {
        animation-delay: 0.3s;
        }

        @keyframes loading-bounce {
        0%,
        100% {
            opacity: 0.35;
            transform: translateY(0);
        }

        50% {
            opacity: 1;
            transform: translateY(-6px);
        }
        }

        .goal {
        color: #ffffff;
        font-size: 15px;
        font-weight: 750;
        line-height: 1.55;
        }

        .summary {
        margin-top: 8px;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.55;
        }

        .task-progress-text {
        margin-top: 18px;
        padding: 9px 11px;
        color: #c7d2fe;
        background: rgba(99, 102, 241, 0.13);
        border: 1px solid rgba(129, 140, 248, 0.22);
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        }

        .steps {
        display: grid;
        gap: 10px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
        }

        .step {
        display: grid;
        grid-template-columns: 28px 1fr;
        align-items: center;
        gap: 10px;
        min-height: 40px;
        padding: 8px 9px;
        color: #94a3b8;
        background: rgba(15, 23, 42, 0.30);
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.4;
        transition:
            color 180ms ease,
            background 180ms ease,
            border-color 180ms ease;
        }

        .step-mark {
        display: grid;
        width: 24px;
        height: 24px;
        color: #94a3b8;
        background: rgba(148, 163, 184, 0.10);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 50%;
        place-items: center;
        font-size: 11px;
        font-weight: 800;
        }

        .step.running {
        color: #dbeafe;
        background: rgba(59, 130, 246, 0.13);
        border-color: rgba(96, 165, 250, 0.45);
        }

        .step.running .step-mark {
        color: #ffffff;
        background: #2563eb;
        border-color: #60a5fa;
        box-shadow: 0 0 0 5px rgba(96, 165, 250, 0.12);
        animation: current-step-pulse 1.15s infinite;
        }

        @keyframes current-step-pulse {
        0%,
        100% {
            transform: scale(1);
        }

        50% {
            transform: scale(1.12);
        }
        }

        .step.completed {
        color: #bbf7d0;
        background: rgba(16, 185, 129, 0.10);
        border-color: rgba(52, 211, 153, 0.28);
        }

        .step.completed .step-mark {
        color: #ecfdf5;
        background: #059669;
        border-color: #34d399;
        }

        .task-result {
        margin-top: 16px;
        padding: 12px;
        color: #d1fae5;
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(52, 211, 153, 0.32);
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.5;
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
          <button
            class="icon-button"
            id="minimizeButton"
            type="button"
            title="最小化"
            aria-label="最小化"
          >
            −
          </button>

          <button
            class="icon-button"
            id="closeButton"
            type="button"
            title="關閉"
            aria-label="關閉"
          >
            ×
          </button>
        </div>
      </header>

        <div class="body">
            <!-- 畫面 1：語音輸入 -->
            <section class="view voice-view" id="voiceView">
                <div class="section-label">語音輸入</div>

                <div class="voice-status" id="voiceStatus">
                按 Q 開始語音輸入
                </div>

                <div class="transcript-box" id="transcript">
                <span class="empty">尚未收到語音內容</span>
                </div>

                <div class="shortcut-hint">
                按 <span class="key">Q</span> 開始語音輸入
                </div>
            </section>

            <!-- 畫面 2：AI 分析 -->
            <section class="view analyzing-view" id="analyzingView" hidden>
                <div class="analyzing-icon">✦</div>

                <div class="analyzing-title">AI 正在分析需求</div>

                <div class="analyzing-message" id="analyzingMessage">
                正在理解你的語音指令與頁面內容…
                </div>

                <div class="loading-dots" aria-label="分析中">
                <span></span>
                <span></span>
                <span></span>
                </div>

                <div class="analysis-transcript" id="analysisTranscript"></div>
            </section>

            <!-- 畫面 3 / 4：任務步驟 -->
            <section class="view steps-view" id="stepsView" hidden>
                <div class="section-label">任務目標</div>

                <div class="goal" id="goal"></div>

                <div class="summary" id="summary"></div>

                <div class="task-progress-text" id="taskProgressText">
                等待開始執行
                </div>

                <ol class="steps" id="steps"></ol>

                <div class="task-result" id="taskResult" hidden></div>
            </section>

            <footer class="footer">
                <div class="shortcut">
                <span class="key">Q</span> 開始語音　
                <span class="key">W</span> 確認點擊
                </div>

                <button class="reset" id="resetButton" type="button">
                重新開始
                </button>
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
    analyzingMessage: shadow.querySelector("#analyzingMessage"),
    analysisTranscript: shadow.querySelector("#analysisTranscript"),

    goal: shadow.querySelector("#goal"),
    summary: shadow.querySelector("#summary"),
    taskProgressText: shadow.querySelector("#taskProgressText"),
    steps: shadow.querySelector("#steps"),
    taskResult: shadow.querySelector("#taskResult"),

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
      [Stage.ANALYZING]: "正在分析需求",
      [Stage.PLANNING]: "正在建立計畫",
      [Stage.PLAN_READY]: "任務規劃完成",
      [Stage.GUIDING]: "正在導引目標",
      [Stage.EXECUTING]: "正在執行操作",
      [Stage.COMPLETED]: "任務已完成",
      [Stage.ERROR]: "發生錯誤"
    };

    return titles[stage] ?? "處理中";
  }

  function getStepIcon(step) {
    if (step.status === "completed") {
      return "✓";
    }

    if (step.status === "running") {
      return "●";
    }

    return String(step.order);
  }

  function updateState(patch) {
    Object.assign(state, patch);
    render();
  }

  function resetState() {
    updateState({
      stage: Stage.IDLE,
      message: "按 Q 開始語音輸入",
      transcript: "",
      plan: null,
      isMinimized: false
    });
  }

  function markPlanProgress(stage) {
    if (!state.plan?.steps?.length) {
      return;
    }

    let currentIndex = -1;

    if (stage === Stage.GUIDING) {
      currentIndex = Math.max(0, state.plan.steps.length - 2);
    }

    if (stage === Stage.EXECUTING) {
      currentIndex = state.plan.steps.length - 1;
    }

    if (stage === Stage.COMPLETED) {
      updateState({
        plan: {
          ...state.plan,
          steps: state.plan.steps.map((step) => ({
            ...step,
            status: "completed"
          }))
        }
      });

      return;
    }

    if (currentIndex < 0) {
      return;
    }

    updateState({
      plan: {
        ...state.plan,
        steps: state.plan.steps.map((step, index) => ({
          ...step,
          status:
            index < currentIndex
              ? "completed"
              : index === currentIndex
                ? "running"
                : "pending"
        }))
      }
    });
  }

    function render() {
    if (state.isClosed) {
        return;
    }

    elements.subtitle.textContent = getStageTitle(state.stage);

    // 決定要顯示哪一個頁面
    elements.voiceView.hidden = state.view !== "voice";
    elements.analyzingView.hidden = state.view !== "analyzing";
    elements.stepsView.hidden = state.view !== "steps";

    // ----- 畫面 1：語音輸入頁 -----
    elements.voiceStatus.textContent = state.message;

    if (state.transcript) {
        elements.transcript.textContent = `「${state.transcript}」`;
    } else {
        elements.transcript.innerHTML =
        '<span class="empty">尚未收到語音內容</span>';
    }

    // ----- 畫面 2：AI 分析頁 -----
    elements.analyzingMessage.textContent = state.message;

    elements.analysisTranscript.textContent = state.transcript
        ? `語音指令：「${state.transcript}」`
        : "";

    // ----- 畫面 3 / 4：任務步驟頁 -----
    if (state.plan) {
        elements.goal.textContent = state.plan.goal;
        elements.summary.textContent = state.plan.summary;

        const total = state.plan.steps.length;
        const completed = state.plan.steps.filter(
        (step) => step.status === "completed"
        ).length;

        const runningIndex = state.plan.steps.findIndex(
        (step) => step.status === "running"
        );

        if (state.stage === Stage.COMPLETED) {
        elements.taskProgressText.textContent =
            `任務完成：${total} / ${total} 步已完成`;

        elements.taskResult.hidden = false;
        elements.taskResult.textContent = "✓ 任務已完成";
        } else if (runningIndex >= 0) {
        elements.taskProgressText.textContent =
            `正在執行第 ${runningIndex + 1} / ${total} 步`;

        elements.taskResult.hidden = true;
        } else if (completed > 0) {
        elements.taskProgressText.textContent =
            `已完成 ${completed} / ${total} 步`;

        elements.taskResult.hidden = true;
        } else {
        elements.taskProgressText.textContent =
            `任務已建立，共 ${total} 個步驟`;

        elements.taskResult.hidden = true;
        }

        elements.steps.innerHTML = state.plan.steps
        .map((step) => {
            const status = step.status ?? "pending";

            let mark = String(step.order);

            if (status === "completed") {
            mark = "✓";
            } else if (status === "running") {
            mark = "●";
            }

            return `
            <li class="step ${escapeHtml(status)}">
                <span class="step-mark">${escapeHtml(mark)}</span>
                <span>${escapeHtml(step.title)}</span>
            </li>
            `;
        })
        .join("");
    }

    elements.card.classList.toggle("minimized", state.isMinimized);

    elements.minimizeButton.textContent = state.isMinimized ? "+" : "−";
    elements.minimizeButton.title = state.isMinimized ? "展開" : "最小化";
    elements.minimizeButton.setAttribute(
        "aria-label",
        state.isMinimized ? "展開" : "最小化"
    );
    }

    function handleTaskStage(event) {
    const detail = event.detail ?? {};
    const stage = detail.stage ?? Stage.IDLE;

    let nextView = state.view;

    if (stage === Stage.LISTENING || stage === Stage.TRANSCRIPT_READY) {
        nextView = "voice";
    }

    if (stage === Stage.ANALYZING || stage === Stage.PLANNING) {
        nextView = "analyzing";
    }

    if (
        stage === Stage.PLAN_READY ||
        stage === Stage.GUIDING ||
        stage === Stage.EXECUTING ||
        stage === Stage.COMPLETED
    ) {
        nextView = "steps";
    }

    updateState({
        stage,
        view: nextView,
        message: detail.message ?? state.message,
        transcript: detail.transcript ?? state.transcript
    });
    }

    function handlePlanReady(event) {
        const detail = event.detail ?? {};

        updateState({
            stage: Stage.PLAN_READY,
            view: "steps",
            message: "任務規劃完成，準備開始執行",
            transcript: detail.transcript ?? state.transcript,
            plan: detail.plan ?? null,
            currentStepIndex: -1,
            completedStepCount: 0
        });
    }

    function handleDemoStep(event) {
    const detail = event.detail ?? {};
    const stepIndex = detail.stepIndex;

    if (
        !state.plan ||
        !Number.isInteger(stepIndex) ||
        stepIndex < 0 ||
        stepIndex >= state.plan.steps.length
    ) {
        return;
    }

    const status = detail.status ?? "running";

    const updatedSteps = state.plan.steps.map((step, index) => {
        if (index === stepIndex) {
        return {
            ...step,
            status
        };
        }

        if (status === "running" && index < stepIndex) {
        return {
            ...step,
            status: "completed"
        };
        }

        return step;
    });

    updateState({
        stage: status === "completed" ? Stage.PLAN_READY : Stage.EXECUTING,
        view: "steps",
        message:
        detail.message ??
        (status === "running"
            ? `正在執行：${state.plan.steps[stepIndex].title}`
            : `已完成：${state.plan.steps[stepIndex].title}`),
        plan: {
        ...state.plan,
        steps: updatedSteps
        },
        currentStepIndex: stepIndex,
        completedStepCount: updatedSteps.filter(
        (step) => step.status === "completed"
        ).length
    });
    }

    function handleTaskCompleted(event) {
        const detail = event.detail ?? {};

        if (!state.plan) {
            updateState({
            stage: Stage.COMPLETED,
            view: "steps",
            message: detail.message ?? "任務已完成。"
            });

            return;
        }

        updateState({
            stage: Stage.COMPLETED,
            view: "steps",
            message: detail.message ?? "任務已完成。",
            plan: {
            ...state.plan,
            steps: state.plan.steps.map((step) => ({
                ...step,
                status: "completed"
            }))
            },
            completedStepCount: state.plan.steps.length
        });
    }

  window.addEventListener("clicky:task-stage", handleTaskStage);
  window.addEventListener("clicky:plan-ready", handlePlanReady);
  window.addEventListener("clicky:task-completed", handleTaskCompleted);

  elements.minimizeButton.addEventListener("click", () => {
    updateState({
      isMinimized: !state.isMinimized
    });
  });

  elements.resetButton.addEventListener("click", () => {
    window.dispatchEvent(
        new CustomEvent("clicky:reset-request", {
        detail: {
            source: "planning-overlay"
        }
        })
    );
  });

  elements.closeButton.addEventListener("click", () => {
    state.isClosed = true;

    window.removeEventListener("clicky:task-stage", handleTaskStage);
    window.removeEventListener("clicky:plan-ready", handlePlanReady);
    window.removeEventListener("clicky:task-completed", handleTaskCompleted);

    host.remove();
  });

  render();

  console.log("[Clicky] Planning overlay loaded.");
})();

function handleTaskReset() {
  resetState();
}

window.addEventListener("clicky:task-reset", handleTaskReset);
window.addEventListener("clicky:demo-step", handleDemoStep);