// taskRunner.js
// Demo 任務流程：辨認需求 → 檢索流程 → 產生規劃 → 依 demoScripts.js 的腳本逐步執行並更新進度。
// 流程只在最外層視窗執行；iframe 內辨識到的語音會透過 requestTaskFlow 轉交給最外層。
// 與 content.js 共用 content script 全域：emitPlanningOverlayEvent、showSpeechBox、hideSpeechBox、
// moveSpeechBoxNearCursor、setCursorState、flyCursorTo、clickAtCursor、setAiControl。

// 各階段停留時間（毫秒），demo 節奏想調快或調慢改這裡。
const PHASE_DELAY_MS = {
  analyzing: 2000,   // 辨認需求
  retrieving: 2500,  // 檢索校園流程
  planning: 2500,    // 產生任務規劃
  planReady: 2000,   // 顯示規劃結果後，開始執行前
  resume: 800        // 換頁後接續前
};
const STEP_GAP_MS = 500;
const DEFAULT_MOVE_MS = 1500;  // 游標飛行時間，想更慢就調大
const DEFAULT_CLICK_AFTER_MS = 600;
const DEFAULT_CHAR_DELAY_MS = 90;
const DEFAULT_TARGET_TIMEOUT_MS = 8000;
// 換頁後超過這個時間才載入完成，就不再自動接續，避免殘留進度誤觸發。
const TASK_RESUME_WINDOW_MS = 60 * 1000;

let isTaskRunning = false;
let taskRunId = 0;

class TaskCancelledError extends Error {}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 對外入口 ---

function requestTaskFlow(transcript) {
  if (isTopWindow) {
    startTaskFlow(transcript);
    return;
  }

  window.top.postMessage(
    { source: CLICKY_MESSAGE_SOURCE, kind: "run-task", transcript },
    "*"
  );

  // 流程交給最外層處理，iframe 自己的游標與提示框回到待命狀態。
  setCursorState("idle");
  hideSpeechBox(1200);
}

function cancelTaskFlow() {
  taskRunId += 1;
  isTaskRunning = false;
  cancelPendingConfirm();
  setAiControl(false);
  clearTaskProgress();
}

async function startTaskFlow(transcript) {
  if (isTaskRunning) {
    return;
  }

  const run = beginRun();

  try {
    setCursorState("thinking");

    emitPlanningOverlayEvent("clicky:task-stage", {
      stage: "analyzing",
      transcript,
      message: "正在辨認你的需求…"
    });
    showSpeechBox("正在辨認需求…", { tone: "thinking" });
    await run.wait(PHASE_DELAY_MS.analyzing);

    const scenario = findDemoScenario(transcript);

    if (!scenario) {
      throw new Error(`目前沒有對應「${transcript}」的流程，請按 Q 再說一次。`);
    }

    emitPlanningOverlayEvent("clicky:task-stage", {
      stage: "retrieving",
      transcript,
      message: `已辨認需求：${scenario.intent}，正在檢索校園操作流程…`
    });
    showSpeechBox(`需求：${scenario.intent}，正在檢索流程…`, { tone: "thinking" });
    await run.wait(PHASE_DELAY_MS.retrieving);

    emitPlanningOverlayEvent("clicky:task-stage", {
      stage: "planning",
      transcript,
      message: `找到「${scenario.intent}」流程，正在規劃 ${scenario.steps.length} 個步驟…`
    });
    showSpeechBox("正在產生任務規劃…", { tone: "thinking" });
    await run.wait(PHASE_DELAY_MS.planning);

    emitPlanningOverlayEvent("clicky:plan-ready", {
      transcript,
      plan: buildPlan(scenario)
    });
    showSpeechBox(`規劃完成，共 ${scenario.steps.length} 步，準備開始執行`, {
      tone: "success"
    });
    await run.wait(PHASE_DELAY_MS.planReady);

    await executePlan(run, scenario, transcript, 0, 0);
  } catch (error) {
    handleRunError(run, error);
  } finally {
    endRun(run);
  }
}

// 點擊造成換頁後，新頁面的 content script 從這裡接續未完成的任務。
async function resumeTaskFlowIfNeeded() {
  if (!isTopWindow || isTaskRunning) {
    return;
  }

  const saved = await loadTaskProgress();

  if (!saved) {
    return;
  }

  const scenario = CLICKY_DEMO_SCENARIOS.find((item) => item.id === saved.scenarioId);

  if (!scenario || Date.now() - saved.updatedAt > TASK_RESUME_WINDOW_MS) {
    clearTaskProgress();
    return;
  }

  const run = beginRun();

  try {
    emitPlanningOverlayEvent("clicky:plan-ready", {
      transcript: saved.transcript,
      plan: buildPlan(scenario, saved.stepIndex)
    });
    showSpeechBox("頁面已載入，繼續執行任務…", { tone: "normal" });
    await run.wait(PHASE_DELAY_MS.resume);

    await executePlan(run, scenario, saved.transcript, saved.stepIndex, saved.actionIndex);
  } catch (error) {
    handleRunError(run, error);
  } finally {
    endRun(run);
  }
}

// --- 流程控制 ---

function beginRun() {
  isTaskRunning = true;
  const id = ++taskRunId;

  const run = {
    stepIndex: -1,
    isCancelled: () => id !== taskRunId,
    async wait(ms) {
      await sleep(ms);

      if (run.isCancelled()) {
        throw new TaskCancelledError();
      }
    }
  };

  return run;
}

function endRun(run) {
  if (!run.isCancelled()) {
    isTaskRunning = false;
  }
}

function handleRunError(run, error) {
  if (error instanceof TaskCancelledError || run.isCancelled()) {
    return;
  }

  console.error("[Clicky] 任務流程中斷：", error);

  const message = error?.message || "任務流程發生錯誤。";

  clearTaskProgress();
  setAiControl(false);
  setCursorState("error");
  showSpeechBox(message, { tone: "error" });

  if (run.stepIndex >= 0) {
    emitPlanningOverlayEvent("clicky:step-update", {
      stepIndex: run.stepIndex,
      status: "error",
      message: `第 ${run.stepIndex + 1} 步失敗：${message}`
    });
  } else {
    emitPlanningOverlayEvent("clicky:task-stage", {
      stage: "error",
      message
    });
  }

  setTimeout(() => {
    if (!isTaskRunning) {
      setCursorState("idle");
      hideSpeechBox(0);
    }
  }, 2500);
}

async function executePlan(run, scenario, transcript, startStepIndex, startActionIndex) {
  const total = scenario.steps.length;

  setAiControl(true);
  setCursorState("guiding");

  for (let stepIndex = startStepIndex; stepIndex < total; stepIndex += 1) {
    const step = scenario.steps[stepIndex];
    const actions = step.actions ?? [];
    run.stepIndex = stepIndex;

    emitPlanningOverlayEvent("clicky:step-update", {
      stepIndex,
      status: "running",
      message: `正在執行第 ${stepIndex + 1} / ${total} 步：${step.title}`
    });
    showSpeechBox(`第 ${stepIndex + 1}/${total} 步：${step.title}`, { tone: "normal" });

    const firstActionIndex = stepIndex === startStepIndex ? startActionIndex : 0;

    for (let actionIndex = firstActionIndex; actionIndex < actions.length; actionIndex += 1) {
      const action = actions[actionIndex];
      // 先記下「下一個動作」再執行：若這個動作造成換頁，新頁面會從下一個動作接續，不會重複點擊。
      // opensNewTab 的進度會被 background 轉交給新開的分頁。
      const progress = {
        scenarioId: scenario.id,
        transcript,
        stepIndex,
        actionIndex: actionIndex + 1,
        handoff: Boolean(action.opensNewTab)
      };

      await saveTaskProgress(progress);
      await runAction(run, action, progress);

      if (action.opensNewTab) {
        if (actionIndex === actions.length - 1) {
          emitPlanningOverlayEvent("clicky:step-update", {
            stepIndex,
            status: "completed",
            message: `已完成第 ${stepIndex + 1} / ${total} 步：${step.title}`
          });
        }

        finishWithHandoff(run);
        return;
      }
    }

    emitPlanningOverlayEvent("clicky:step-update", {
      stepIndex,
      status: "completed",
      message: `已完成第 ${stepIndex + 1} / ${total} 步：${step.title}`
    });

    await run.wait(step.pauseMs ?? STEP_GAP_MS);
  }

  run.stepIndex = -1;
  clearTaskProgress();
  setAiControl(false);
  setCursorState("idle");

  emitPlanningOverlayEvent("clicky:task-completed", {
    message: `「${scenario.intent}」已完成，共 ${total} 個步驟。`
  });
  showSpeechBox(`✓ 任務完成：${scenario.goal}`, { tone: "success" });
  hideSpeechBox(4000);
}

// 這個分頁的工作結束，進度留給新分頁接續（不清除進度）。
function finishWithHandoff(run) {
  run.stepIndex = -1;
  setAiControl(false);
  setCursorState("idle");

  emitPlanningOverlayEvent("clicky:task-stage", {
    stage: "handoff",
    message: "已開啟新分頁，任務會在新分頁繼續。"
  });
  showSpeechBox("已開啟新分頁，請到新分頁繼續。", { tone: "success" });
  hideSpeechBox(3000);
}

// --- 等待使用者按 W 確認點擊（manual 模式）---

let pendingConfirm = null;

// 回傳 "key"：使用者按 W 並已點擊；"auto"：等待中切換成自動模式，由呼叫端自動點擊。
function waitForConfirm(run, element, beforeClick) {
  return new Promise((resolve, reject) => {
    pendingConfirm = { element, beforeClick, resolve, reject };
  }).then((how) => {
    if (run.isCancelled()) {
      throw new TaskCancelledError();
    }

    return how;
  });
}

// content.js 的 W 鍵呼叫。直接在按鍵事件中點擊，瀏覽器才會允許 target="_blank" 開新分頁。
function confirmPendingClick() {
  if (!pendingConfirm) {
    return false;
  }

  const { element, beforeClick, resolve } = pendingConfirm;
  pendingConfirm = null;

  beforeClick?.();
  clickAtCursor(element);
  resolve("key");

  return true;
}

function cancelPendingConfirm() {
  pendingConfirm?.reject(new TaskCancelledError());
  pendingConfirm = null;
}

// 等待按 W 的途中切換成自動模式：不用再等，直接自動點擊。
clickModeSetting.onChange((mode) => {
  if (mode === "auto" && pendingConfirm) {
    const { resolve } = pendingConfirm;
    pendingConfirm = null;
    resolve("auto");
  }
});

// --- 自動點擊（auto 模式）---

const AUTO_CLICK_DELAY_MS = 700;

async function autoClick(run, action, target, progress) {
  emitPlanningOverlayEvent("clicky:step-update", {
    stepIndex: run.stepIndex,
    status: "running",
    message: action.autoPrompt ?? "自動點擊中…"
  });
  showSpeechBox(action.autoPrompt ?? "自動點擊中…", { tone: "normal" });

  // 游標停一下再點，錄影時看得出點了哪裡
  await run.wait(AUTO_CLICK_DELAY_MS);

  if (!action.opensNewTab) {
    clickAtCursor(target.element);
    return;
  }

  // 瀏覽器會擋下「程式觸發」的 target="_blank" 開新分頁，改請 background 用 chrome.tabs 開啟。
  const url = target.element?.href;

  if (!/^https?:/i.test(url ?? "")) {
    throw new Error("自動模式無法取得要開啟的連結網址，請改用手動模式按 W。");
  }

  await saveTaskProgress(progress);
  clickAtCursor(target.element, { skipClick: true });

  const response = await chrome.runtime.sendMessage({ type: "CLICKY_OPEN_TAB", url });

  if (!response?.ok) {
    throw new Error(`無法開啟新分頁：${response?.error ?? "未知錯誤"}`);
  }
}

// --- 腳本動作 ---

async function runAction(run, action, progress) {
  switch (action.type) {
    case "wait":
      await run.wait(action.ms ?? 1000);
      return;

    case "move": {
      const target = await resolveActionTarget(run, action);
      await moveCursorTo(run, target, action.duration);
      return;
    }

    case "click": {
      if (hasTarget(action)) {
        const target = await resolveActionTarget(run, action);
        await moveCursorTo(run, target, action.duration);
        clickAtCursor(target.element);
      } else {
        clickAtCursor();
      }

      await run.wait(action.afterMs ?? DEFAULT_CLICK_AFTER_MS);
      return;
    }

    case "confirmClick": {
      const target = await resolveActionTarget(run, action);
      await moveCursorTo(run, target, action.duration);

      if (clickModeSetting.value === "auto") {
        await autoClick(run, action, target, progress);
      } else {
        const prompt = action.prompt ?? "按 W 確認點擊";
        emitPlanningOverlayEvent("clicky:step-update", {
          stepIndex: run.stepIndex,
          status: "waiting",
          message: prompt
        });
        showSpeechBox(prompt, { tone: "success" });

        // 等待期間可能很久，確認當下重新保存進度，避免新分頁以為進度過期。
        const how = await waitForConfirm(run, target.element, () => saveTaskProgress(progress));

        if (how === "auto") {
          await autoClick(run, action, target, progress);
        }
      }

      if (!action.opensNewTab) {
        await run.wait(action.afterMs ?? DEFAULT_CLICK_AFTER_MS);
      }
      return;
    }

    case "type": {
      const target = await resolveActionTarget(run, action);
      await moveCursorTo(run, target, action.duration);

      if (!isTextInput(target.element)) {
        throw new Error("type 動作的目標不是輸入框，請確認 selector 或座標。");
      }

      clickAtCursor(target.element);
      await typeText(run, target.element, action.text ?? "", action.charDelayMs);
      target.element.blur();
      target.element.ownerDocument?.body?.focus();
      return;
    }

    default:
      throw new Error(`未知的腳本動作：${action.type}`);
  }
}

function hasTarget(action) {
  return Boolean(action.selector) || hasCoordinates(action);
}

function hasCoordinates(action) {
  return Number.isFinite(action.x) && Number.isFinite(action.y);
}

async function moveCursorTo(run, target, duration = DEFAULT_MOVE_MS) {
  flyCursorTo(target.x, target.y, duration);
  await run.wait(duration + 120);
  moveSpeechBoxNearCursor();
  hoverElement(target.element);
}

// 游標抵達時觸發 mouseover，讓網頁的 hover 效果（例如選單反白）跟著出現。
function hoverElement(element) {
  if (!element || element.tagName === "IFRAME" || element.tagName === "FRAME") {
    return;
  }

  const targetWindow = element.ownerDocument?.defaultView ?? window;

  for (const type of ["mouseover", "mouseenter", "mousemove"]) {
    element.dispatchEvent(
      new targetWindow.MouseEvent(type, {
        bubbles: type !== "mouseenter",
        cancelable: true,
        view: targetWindow
      })
    );
  }
}

async function resolveActionTarget(run, action) {
  if (!action.selector) {
    if (!hasCoordinates(action)) {
      throw new Error("腳本動作缺少 selector 或 x / y 座標。");
    }

    return {
      element: findElementAtPoint(action.x, action.y),
      x: action.x,
      y: action.y
    };
  }

  const deadline = Date.now() + (action.timeout ?? DEFAULT_TARGET_TIMEOUT_MS);

  while (Date.now() <= deadline) {
    const target = findTargetBySelector(
      action.selector,
      action.matchText,
      document,
      0,
      0,
      action.matchPrefix,
      action.matchContext
    );

    if (target) {
      if (isInViewport(target)) {
        return target;
      }

      target.element.scrollIntoView({ block: "center" });
      await run.wait(300);

      return findTargetBySelector(
        action.selector,
        action.matchText,
        document,
        0,
        0,
        action.matchPrefix,
        action.matchContext
      ) ?? target;
    }

    await run.wait(200);
  }

  if (hasCoordinates(action)) {
    console.warn(`[Clicky] 找不到 ${action.selector}，改用座標 (${action.x}, ${action.y})。`);
    return {
      element: findElementAtPoint(action.x, action.y),
      x: action.x,
      y: action.y
    };
  }

  throw new Error(`找不到目標元素：${action.selector}${action.matchText ? `（文字「${action.matchText}」）` : ""}`);
}

// 在最外層與同源 iframe 中尋找可見元素，回傳元素與它在最外層視窗的中心座標。
// matchText 有值時只接受完全相同的文字；matchPrefix 有值時接受指定開頭的文字。
function findTargetBySelector(
  selector,
  matchText,
  doc = document,
  offsetX = 0,
  offsetY = 0,
  matchPrefix,
  matchContext
) {
  // 同一個 selector 可能對到多個元素（例如隱藏的選單），取第一個看得到的。
  for (const element of doc.querySelectorAll(selector)) {
    if (matchText !== undefined && element.textContent.trim() !== matchText) {
      continue;
    }

    if (matchPrefix !== undefined && !element.textContent.trim().startsWith(matchPrefix)) {
      continue;
    }

    if (!matchesTargetContext(element, matchContext)) {
      continue;
    }

    if (matchContext?.revealAncestorSelector) {
      const ancestor = element.closest(matchContext.revealAncestorSelector);

      if (ancestor) {
        hoverElement(ancestor);
      }
    }

    const rect = element.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      return {
        element,
        x: offsetX + rect.left + rect.width / 2,
        y: offsetY + rect.top + rect.height / 2
      };
    }

    if (matchContext?.allowHidden) {
      const anchor = element.closest(
        matchContext.revealAncestorSelector ?? matchContext.ancestorSelector
      );
      const anchorRect = anchor?.getBoundingClientRect();

      if (anchorRect && anchorRect.width > 0 && anchorRect.height > 0) {
        return {
          element,
          x: offsetX + anchorRect.left + anchorRect.width / 2,
          y: offsetY + anchorRect.top + anchorRect.height / 2
        };
      }
    }
  }

  for (const frame of doc.querySelectorAll("iframe, frame")) {
    const childDoc = getSameOriginDocument(frame);

    if (!childDoc) {
      continue;
    }

    const frameRect = frame.getBoundingClientRect();
    const found = findTargetBySelector(
      selector,
      matchText,
      childDoc,
      offsetX + frameRect.left + frame.clientLeft,
      offsetY + frameRect.top + frame.clientTop,
      matchPrefix,
      matchContext
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function matchesTargetContext(element, matchContext) {
  if (!matchContext) {
    return true;
  }

  const ancestor = element.closest(matchContext.ancestorSelector);

  if (!ancestor) {
    return false;
  }

  const descendantMatches = matchContext.descendantMatches ?? [
    {
      selector: matchContext.descendantSelector,
      matchText: matchContext.descendantMatchText,
      matchPrefix: matchContext.descendantMatchPrefix
    }
  ];

  return descendantMatches.every((condition) => {
    const descendant = ancestor.querySelector(condition.selector);

    if (!descendant) {
      return false;
    }

    const text = descendant.textContent.trim();

    return (
      (condition.matchText === undefined || text === condition.matchText) &&
      (condition.matchPrefix === undefined || text.startsWith(condition.matchPrefix))
    );
  });
}

// 依最外層座標找元素；遇到同源 iframe 會往內找，跨域 iframe 則回傳 iframe 本身交給 clickAtCursor 轉發。
function findElementAtPoint(x, y, doc = document) {
  const element = doc.elementFromPoint(x, y);

  if (element && (element.tagName === "IFRAME" || element.tagName === "FRAME")) {
    const childDoc = getSameOriginDocument(element);

    if (childDoc) {
      const rect = element.getBoundingClientRect();
      return findElementAtPoint(
        x - rect.left - element.clientLeft,
        y - rect.top - element.clientTop,
        childDoc
      );
    }
  }

  return element;
}

function getSameOriginDocument(frame) {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

function isInViewport(target) {
  return (
    target.x >= 0 &&
    target.y >= 0 &&
    target.x <= window.innerWidth &&
    target.y <= window.innerHeight
  );
}

function isTextInput(element) {
  return Boolean(element) && (element.tagName === "INPUT" || element.tagName === "TEXTAREA");
}

async function typeText(run, element, text, charDelayMs = DEFAULT_CHAR_DELAY_MS) {
  // 用原生 setter 設值，讓框架綁定的輸入框也能收到變更。
  const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  const setValue = (value) => {
    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
  };

  element.focus();
  setValue("");

  for (const char of text) {
    setValue(element.value + char);
    await run.wait(charDelayMs);
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// --- 規劃資料 ---

function findDemoScenario(transcript) {
  const text = transcript.replace(/\s+/g, "");

  return CLICKY_DEMO_SCENARIOS.find((scenario) =>
    scenario.keywords.some((keyword) => text.includes(keyword))
  );
}

function buildPlan(scenario, completedStepCount = 0) {
  return {
    scenarioId: scenario.id,
    goal: scenario.goal,
    summary: scenario.summary,
    steps: scenario.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      order: index + 1,
      title: step.title,
      status: index < completedStepCount ? "completed" : "pending"
    }))
  };
}

// --- 換頁接續用的進度保存（background 依分頁存在 chrome.storage.session）---

async function saveTaskProgress(progress) {
  await sendTaskProgressMessage({
    type: "CLICKY_TASK_SAVE",
    progress: { ...progress, updatedAt: Date.now() }
  });
}

function clearTaskProgress() {
  sendTaskProgressMessage({ type: "CLICKY_TASK_CLEAR" });
}

async function loadTaskProgress() {
  const response = await sendTaskProgressMessage({ type: "CLICKY_TASK_LOAD" });
  return response?.progress ?? null;
}

async function sendTaskProgressMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("[Clicky] 無法保存任務進度，換頁後將不會自動接續：", error);
    return null;
  }
}

setTimeout(resumeTaskFlowIfNeeded, 0);
