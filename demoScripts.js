// demoScripts.js
// Demo 用的寫死流程。語音指令命中 keywords 後，taskRunner.js 會依 steps 逐步執行並更新進度條。
//
// 每個 step 的 actions 依序執行，支援：
//   { type: "move",  selector?, x?, y?, duration? }            游標飛到目標
//   { type: "click", selector?, x?, y?, duration?, afterMs? }  有目標就先飛過去再點；沒有目標就點游標目前位置
//   { type: "type",  selector?, x?, y?, text, charDelayMs? }   點擊輸入框並逐字輸入
//   { type: "confirmClick", selector?, x?, y?, prompt?, autoPrompt? }
//                                                               手動模式：游標飛到目標後停住，等使用者按 W 才點擊（顯示 prompt）
//                                                               自動模式：游標到位後自動點擊（顯示 autoPrompt）
//   { type: "wait",  ms }                                       等待（例如等頁面載入）
//
// 點擊類動作可加 opensNewTab: true：這個點擊會開新分頁（例如 target="_blank" 的連結），
// 目前分頁停止執行，由新分頁接續後面的步驟。請搭配 confirmClick：手動模式由使用者按 W 開啟，
// 自動模式由 background 代開（瀏覽器會擋下程式觸發的開新分頁）。
//
// 步驟標題不要寫「按 W」，面板在手動模式等待時會自動顯示「等待按 W 確認」。
//
// 目標優先用 selector：不受視窗大小影響、能找同源 iframe 內的元素，找不到會重試到 timeout（預設 8000ms）。
// 加上 matchText 可以再用文字篩選，例如 { selector: ".menuContainer a", matchText: "選課" }。
// 游標抵達目標時會觸發 mouseover，網頁的 hover 反白效果會跟著出現。
// x / y 是「最外層視窗」的 viewport 座標（clientX / clientY），可以單獨使用，也可以當 selector 找不到時的備援。
// 點擊造成換頁時，taskRunner 會記住進度，新頁面載入後自動接續。
//
// 每個 step 可加 pauseMs 調整完成後到下一步的間隔（預設 500ms）。

const CLICKY_DEMO_SCENARIOS = [
  {
    id: "course-add",
    intent: "加選課程",
    keywords: ["加選", "選課", "加課", "加退選"],
    goal: "從 Portal 進入選課系統的「選課」頁面",
    summary: "從中央大學 Portal 開啟選課系統，再從「課程加退選」選單進入「選課」。",
    steps: [
      {
        // Portal：<a href="/system/cs?token=..." target="_blank">選課系統</a>
        // token 每次登入都不同，所以只比對開頭的 /system/cs
        title: "在 Portal 找到「選課系統」",
        actions: [{ type: "move", selector: 'a[href^="/system/cs"]' }]
      },
      {
        title: "開啟「選課系統」",
        actions: [
          {
            type: "confirmClick",
            selector: 'a[href^="/system/cs"]',
            duration: 300,
            prompt: "按 W 確認開啟「選課系統」",
            autoPrompt: "正在開啟「選課系統」…",
            opensNewTab: true
          }
        ]
      },
      {
        // 選課系統（cis.ncu.edu.tw，新分頁）：
        // <td class="rootVoice {menu: 'menu_sign'}" menu="menu_sign">課程加退選</td>
        // 選單（mbMenu）預設點擊才展開，點下去就會打開下拉選單。
        title: "打開「課程加退選」選單",
        actions: [
          {
            type: "confirmClick",
            selector: 'td[menu="menu_sign"]',
            timeout: 15000,
            prompt: "按 W 打開「課程加退選」",
            autoPrompt: "正在打開「課程加退選」…"
          }
        ]
      },
      {
        // 下拉選單的項目是點開選單後才動態產生在 .menuContainer 裡的 <a>，所以用文字比對。
        // 點擊後在同一個分頁換頁，進度會自動接續。
        // 注意：這兩步期間不要移動真的滑鼠，選單在滑鼠移出後約 1 秒會自動關閉。
        title: "進入「選課」",
        actions: [
          {
            type: "confirmClick",
            selector: ".menuContainer a",
            matchText: "選課",
            prompt: "按 W 進入「選課」",
            autoPrompt: "正在進入「選課」…"
          }
        ],
        pauseMs: 800
      }
    ]
  }
];
