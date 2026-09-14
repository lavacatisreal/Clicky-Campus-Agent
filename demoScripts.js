// demoScripts.js
// Demo 用的寫死流程。語音指令命中 keywords 後，taskRunner.js 會依 steps 逐步執行並更新進度條。
//
// 每個 step 的 actions 依序執行，支援：
//   { type: "move",  selector?, x?, y?, duration? }            游標飛到目標
//   { type: "click", selector?, x?, y?, duration?, afterMs? }  有目標就先飛過去再點；沒有目標就點游標目前位置
//   { type: "type",  selector?, x?, y?, text, charDelayMs? }   點擊輸入框並逐字輸入
//   { type: "wait",  ms }                                       等待（例如等頁面載入）
//
// 目標優先用 selector：不受視窗大小影響、能找同源 iframe 內的元素，找不到會重試到 timeout（預設 8000ms）。
// x / y 是「最外層視窗」的 viewport 座標（clientX / clientY），可以單獨使用，也可以當 selector 找不到時的備援。
// 點擊造成換頁時，taskRunner 會記住進度，新頁面載入後自動接續。
//
// 每個 step 可加 pauseMs 調整完成後到下一步的間隔（預設 500ms）。

const CLICKY_DEMO_SCENARIOS = [
  {
    id: "course-add",
    intent: "加選課程",
    keywords: ["加選", "選課", "加課"],
    goal: "在選課系統加選指定課程",
    summary: "依照校園選課流程：進入加退選頁面、查詢課程，並送出加選。",
    // TODO: 以下座標都是佔位值。為了避免在真實系統亂點，目前全部只用 move（不會點擊或輸入）。
    // 換成選課系統實際的 selector / 座標後，再把對應動作改回 click / type，例如：
    //   { type: "click", selector: "#加退選按鈕" }
    //   { type: "type", selector: "#課號輸入框", text: "CE1001" }
    steps: [
      {
        title: "前往「加退選」頁面",
        actions: [{ type: "move", x: 240, y: 180 }]
      },
      {
        title: "輸入課程代碼",
        actions: [{ type: "move", x: 420, y: 260 }]
      },
      {
        title: "點擊「查詢」",
        actions: [{ type: "move", x: 620, y: 260 }]
      },
      {
        title: "點擊課程的「加選」按鈕",
        actions: [
          { type: "wait", ms: 800 },
          { type: "move", x: 900, y: 420 }
        ]
      },
      {
        title: "確認加選結果",
        actions: [{ type: "move", x: 600, y: 520 }],
        pauseMs: 800
      }
    ]
  }
];
