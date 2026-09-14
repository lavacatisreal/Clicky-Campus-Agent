// demoScripts.js
// Demo 用的寫死流程。語音指令命中 keywords 後，taskRunner.js 會依 steps 逐步執行並更新進度條。
//
// 每個 step 的 actions 依序執行，支援：
//   { type: "move",  selector?, x?, y?, duration? }            游標飛到目標
//   { type: "click", selector?, x?, y?, duration?, afterMs? }  有目標就先飛過去再點；沒有目標就點游標目前位置
//   { type: "type",  selector?, x?, y?, text, charDelayMs? }   點擊輸入框並逐字輸入
//   { type: "confirmClick", selector?, x?, y?, prompt? }       游標飛到目標後停住，等使用者按 W 才點擊
//   { type: "wait",  ms }                                       等待（例如等頁面載入）
//
// 點擊類動作可加 opensNewTab: true：這個點擊會開新分頁（例如 target="_blank" 的連結），
// 目前分頁停止執行，由新分頁接續後面的步驟。瀏覽器只允許使用者按鍵觸發開新分頁，所以請搭配 confirmClick。
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
    keywords: ["加選", "選課", "加課", "加退選"],
    goal: "從 Portal 進入選課系統的課程加退選",
    summary: "從中央大學 Portal 開啟選課系統，再進入「課程加退選」。",
    steps: [
      {
        // Portal：<a href="/system/cs?token=..." target="_blank">選課系統</a>
        // token 每次登入都不同，所以只比對開頭的 /system/cs
        title: "在 Portal 找到「選課系統」",
        actions: [{ type: "move", selector: 'a[href^="/system/cs"]' }]
      },
      {
        title: "按 W 確認開啟選課系統",
        actions: [
          {
            type: "confirmClick",
            selector: 'a[href^="/system/cs"]',
            duration: 300,
            prompt: "按 W 確認開啟「選課系統」",
            opensNewTab: true
          }
        ]
      },
      {
        // 選課系統（cis.ncu.edu.tw，新分頁）：
        // <td class="rootVoice {menu: 'menu_sign'}" menu="menu_sign">課程加退選</td>
        title: "點擊「課程加退選」",
        actions: [
          { type: "click", selector: 'td[menu="menu_sign"]', timeout: 15000 }
        ],
        pauseMs: 800
      }
    ]
  }
];
