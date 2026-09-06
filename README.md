# NCU 校園 Agent — 截圖定位 Pipeline（第一階段 PoC）

目標：`截圖 + 關鍵字` → `該關鍵字在畫面上的 HTML/像素座標`，作為 DOM 解析法的備援方案。

這是純 JavaScript（ESM）套件，之後可直接被整合進 browser extension 的 background /
content script（fetch-based，沒有 Node-only API 依賴，`src/` 底下的程式碼可以直接搬過去）。

## 1. 模型/API 比較與建議

因為參賽組別是「Microsoft AI 及 Data 生態系應用組」，選型時把「是否為 Microsoft 生態系」
也列為評估項目之一，不只看單純的定位準確度。

| 方案 | 定位方式 | 準確度（座標） | 是否 Microsoft 生態系 | 成本/延遲 | 適用情境 |
|---|---|---|---|---|---|
| **Azure AI Vision — Image Analysis「Read」OCR**（建議：**主線路**） | 純文字偵測，直接回傳每個字/行的 bounding polygon + 信心值，非用 LLM 猜座標 | 高（像素等級誤差） | ✅ | 低延遲（約 0.3–1s）、便宜 | 畫面上有文字標籤的按鈕/連結/欄位（校務系統絕大多數元件都是這類） |
| **Azure OpenAI（GPT-4o / GPT-4o-mini）+ Set-of-Mark**（建議：**備援**） | 把 OCR 候選框編號畫在圖上，讓模型「選號碼」而非直接猜 x,y | 中高（靠 SoM 提升，直接猜座標則明顯較差） | ✅ | 較慢（1–3s）、較貴 | 純圖示按鈕、語意查詢（如「送出選課的按鈕」）、OCR 沒抓到文字時 |
| **Claude（Sonnet 5 / Opus 5 等）via Microsoft Foundry** | 專門訓練過的螢幕座標/computer-use 定位能力，直接猜座標通常比 GPT-4o 準 | 中高，且直接猜座標比 GPT-4o 穩定 | ✅（2026/07 GA，透過 Foundry 資源呼叫算 Microsoft 生態系；直接打 Anthropic API 則不算，見下方說明） | 中；但**需要有真實付款方式的 Azure 訂閱**，學生/免費試用訂閱不支援部署 | 想要比 GPT-4o 更準的直接座標定位、且隊上能拿到符合資格的 Azure 訂閱時 |
| **OmniParser**（Microsoft Research，開源，Azure AI Foundry model catalog 可用） | 專門訓練來解析 GUI 截圖，直接輸出「所有可互動元件」的 bbox + 語意描述 | 高，且對圖示按鈕也有效 | ✅（微軟自家研究） | 需要自架/GPU 或走 Azure AI Foundry endpoint，複雜度較高 | 進階/加分項：若時間允許，可在展示時特別強調「用了微軟自己的 GUI-agent 研究成果」 |
| **Florence-2**（Microsoft，開源小模型） | 單一模型同時做 OCR + grounding + region captioning | 中高 | ✅ | 比 GPT-4o 便宜快速 | 可用來取代「Azure Vision OCR + GPT-4o SoM」兩段式流程，之後優化延遲時可考慮 |

**核心判斷**：關鍵字定位本質上大多是「畫面上有沒有這段文字、它在哪」的**文字偵測**問題，
不是開放式的視覺推理問題。OCR 是為這個任務量身打造的工具，比讓 LLM 用視覺猜像素座標更準、
更快、更便宜、也更少 hallucination 風險。LLM vision 只在 OCR 覆蓋不到的情況（圖示按鈕、
語意查詢、需要消歧義）才介入 —— 這也是本 repo 採用的**混合式架構**（見下方）。

> **關於 Claude 算不算「Microsoft 生態系」**：主辦單位在主題一「Agentic Frontier」明確列出
> Microsoft Foundry 可選 GPT / Claude / Llama / Mistral 等模型，而 Anthropic 的 Claude
> 系列已於 2026 年 7 月在 Microsoft Foundry **正式 GA**（[Microsoft Azure Blog 公告](https://azure.microsoft.com/en-us/blog/introducing-anthropics-claude-models-in-microsoft-foundry-bringing-frontier-intelligence-to-azure/)、
> [Microsoft Learn 文件](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/claude-models)）。
> 關鍵是**怎麼呼叫**：
> - 走 **Microsoft Foundry 的資源端點**（`https://<resource-name>.services.ai.azure.com/anthropic/v1/messages`）
>   → 算 Microsoft 生態系，因為走的是 Azure 資源、Azure Marketplace 訂閱、Azure RBAC 權限管理。
> - 直接打 `api.anthropic.com`（Anthropic 官方 API）→ 不算，跟 Azure 完全無關。
>
> 兩者的請求格式幾乎一模一樣（同樣是 `x-api-key` + `anthropic-version` header、一樣的
> Messages API JSON），差別只在 base URL，以及 `model` 欄位在 Foundry 情境下要填**你部署時取的
> deployment name**（不一定等於模型代號）。`src/providers/claudeVision.js` 已經同時支援兩種模式
> （傳入 `foundryEndpoint` 參數即可切到 Foundry 模式）。
>
> **但有一個重要限制**：Claude 在 Foundry 上是透過 **Azure Marketplace** 訂閱購買，需要**有效的
> 隨付即用（pay-as-you-go）付款方式**——Microsoft Learn 的文件明確排除了「student、free trial、
> startup credit-based」這類訂閱（也就是我們前面建議申請的 **Azure for Students** 剛好就在被排除
> 名單裡）。這個限制**只有 Claude-on-Foundry 這個模型系列**才有，Azure AI Vision 跟 Azure OpenAI
> 不受影響。所以：如果隊上只有學生訂閱，Claude 這條路線在部署前就會卡關，正式提交版本建議還是
> 以 Azure OpenAI GPT-4o 當 fallback；如果能透過學校、指導老師或比賽主辦方拿到有正式付款方式的
> Azure 訂閱，Claude-on-Foundry 才會是可行選項，屆時可以直接把 `visionFallback` 換成
> `createClaudeVisionProvider({ apiKey, foundryEndpoint, model })`。

## 2. Pipeline 架構

```
screenshot + keyword
        │
        ▼
 ┌─────────────────┐   有信心的文字比對結果
 │  OCR Provider    │───────────────────────────► 回傳座標（source: "ocr"）
 │ (Azure Vision /  │
 │  Tesseract 本機)  │
 └─────────────────┘
        │ 沒有信心的比對結果（比對分數 < 門檻，或根本沒有這段文字）
        ▼
 ┌─────────────────────────┐
 │ Vision Fallback Provider │
 │ (Azure OpenAI GPT-4o)    │
 │  1. Set-of-Mark：把 OCR  │
 │     候選框編號畫在圖上,   │  ─────► 回傳座標（source: "llm-vision"）
 │     問模型選哪個號碼      │
 │  2. 都沒選中 → 直接讓模型 │
 │     猜 bounding box      │
 └─────────────────────────┘
```

程式碼位置：

```
src/
  pipeline/
    locateKeyword.js   # 主要 orchestrator，只依賴 provider 介面，跟廠商無關
    imageUtils.js       # image 輸入格式轉換 (path/buffer/dataUrl 互轉)
  providers/
    azureVisionOcr.js        # 主線路（正式提交版本用這個）
    azureOpenAiVision.js     # 備援（正式提交版本用這個）
    tesseractOcr.js           # 本機 OCR，不用任何 API key，這次 PoC 驗證用
    claudeVision.js           # Claude fallback；傳 foundryEndpoint 走 Microsoft Foundry(算生態系)，不傳則走 Anthropic 直連(僅供參考)
  matching/
    textMatch.js        # 關鍵字 <-> OCR 文字 的比對邏輯（精確/子字串/模糊/跨字合併）
    setOfMark.js         # 畫編號框，給 LLM fallback 用
test/
  generateFixture.mjs   # 產生測試截圖（本機 Edge headless 渲染一個貼近真實 Portal 頁面的 mockup）
  run.mjs                # 端對端 demo：截圖 → OCR → 關鍵字 → 座標 → 標註結果圖
  unit-fallback.mjs      # 不需要任何雲端金鑰，驗證 orchestrator 的 fallback 分支邏輯正確
```

## 3. 輸入 / 輸出介面

### 輸入

```js
{
  image: {
    // 三選一即可，各 provider 內部會自動轉換
    path: "C:/.../screenshot.png",      // Node 測試用
    buffer: Buffer,                      // 二進位資料
    dataUrl: "data:image/png;base64,...", // extension 用 chrome.tabs.captureVisibleTab 拿到的格式
    width: 1000,   // 截圖的像素寬（extension 端請填 captureVisibleTab 回傳影像的實際寬高）
    height: 620,
  },
  keyword: "登入 Portal",   // 要找的文字，或語意描述（給 LLM fallback 用）
  options: {
    minConfidence: 0.55,   // 低於這個分數才會觸發 LLM fallback
    fuzzyThreshold: 0.72,  // OCR 文字模糊比對的相似度門檻
    maxResults: 5,
  },
}
```

### 輸出

```js
{
  found: true,
  source: "ocr",   // "ocr" | "llm-vision" | "none"
  imageSize: { width: 1000, height: 620 },
  primaryMatch: {
    text: "忘記密碼",
    boundingBox: { x: 402, y: 149, width: 54, height: 12 },  // 圖片像素座標，原點左上角
    center: { x: 429, y: 155 },
    confidence: 0.96,
    matchType: "exact",
  },
  candidates: [ /* 其餘候選，用來人工除錯或消歧義 */ ],
  timing: { ocrMs: 1552, llmMs: 0, totalMs: 1553 },
  providers: { ocr: "azure-ai-vision-read", visionFallback: "azure-openai-gpt4o-vision" },
}
```

### ⚠️ 座標系統換算（給整合 DOM 方案的組員）

`boundingBox` / `center` 是**截圖點陣圖的像素座標**（原點左上角），不是 CSS/DOM 座標。
串進 extension 時要注意三層座標的換算：

1. **截圖像素座標**（本 pipeline 輸出）
2. **CSS viewport 座標** = 截圖像素座標 ÷ `devicePixelRatio`（`chrome.tabs.captureVisibleTab`
   在 HiDPI 螢幕上截出來的圖，實際像素會比 CSS 大）
3. **頁面座標**（含捲動）= CSS viewport 座標 + `window.scrollX / scrollY`

要真的模擬點擊，用第 2 層（CSS viewport 座標）配合 `chrome.debugger` 的
`Input.dispatchMouseEvent`，或轉成第 3 層座標後用 `document.elementFromPoint()` 取得
DOM 節點、再 `.click()`。這段建議在整合完整 extension 時再對齊 DOM 方案怎麼發送點擊事件。

## 4. 這次驗證到的結果（本機可重現，不需要任何雲端金鑰）

跑法：

```bash
npm install
npm run test:fallback   # 驗證 orchestrator 的 fallback 分支邏輯（純邏輯測試，< 1 秒）
npm run demo -- --keyword "忘記密碼"   # 端對端：產生測試截圖 -> 本機 OCR -> 找關鍵字 -> 標註結果圖
```

`npm run demo` 用的測試圖是 `test/generateFixture.mjs` 透過本機安裝的 Edge（headless）渲染出來的
中央大學 Portal 登入頁面 mockup（版面/文案照真實頁面重建，非直接擷取正式站的畫面像素）。
`npm run demo -- --keyword "忘記密碼"` 這次實測結果：

- **OCR 主線路成功**：`忘記密碼` 被正確定位到 `(402, 149, 54, 12)`，`matchType: "exact"`，
  信心值 0.96。標註結果圖：`test/output/result-annotated.png`。
- **發現一個真實的 OCR 弱點**：藍底白字的「登入 Portal」按鈕，OCR 完全沒偵測到文字
  （對比色文字是傳統 OCR 的已知弱點）。這正好驗證了本設計為什麼需要 LLM fallback——
  純 OCR 沒辦法涵蓋所有情況，需要 vision LLM 補位。
- **發現多欄版面會讓 OCR 的「整行」判斷失準**：例如同一水平帶上左欄的「帳號」跟右欄的
  「English Version」被誤判成同一行。`matchKeyword()` 因此同時做「整行比對」與「逐字合併
  跨框比對」兩種策略，這次沒受影響是因為關鍵字剛好落在乾淨的單一行內；但這也代表**正式版
  改用 Azure AI Vision 的 Read API 後應該重新驗證**，因為它的版面分析（layout analysis）
  比 Tesseract 好，這類跨欄誤判可能不會發生，須以實測為準。
- **Set-of-Mark 標記機制驗證**：`test/output/som-preview.png` 顯示把 OCR 偵測到的每一行
  文字都畫上紅框 + 編號，這就是要送給 GPT-4o fallback 的圖片，可以確認「畫框、編號、產生
  data URL」這段程式碼是正確的（尚未實際打 Azure OpenAI API，因為還沒有金鑰）。

### 4.1 對真實選課系統公告頁的驗證（不是 mockup，是真的線上頁面）

`https://cis.ncu.edu.tw/Course/main/news/announce`（課務組公告）不需要登入就能看到，所以這次
不用 mockup，改用 `test/screenshotUrl.mjs`（透過本機 Edge headless）直接對正式站截圖，存成
`test/fixtures/course-announce.png`，跑法：

```bash
node test/screenshotUrl.mjs "https://cis.ncu.edu.tw/Course/main/news/announce" test/fixtures/course-announce.png
npm run demo -- --image test/fixtures/course-announce.png --keyword "選課相關資訊"
```

結果：

- **OCR 正確定位到公告內文裡的關鍵字**：`選課相關資訊`（出現在「115(一)課務日程表及選課
  相關資訊」這則公告標題裡）被正確框到，信心值 0.93。標註圖：`test/output/result-annotated.png`。
- **踩到一個真正的 Tesseract 地雷，而且修好了**：對這個真實頁面整張截圖直接跑 OCR，一開始
  完全失敗（127 個「行」幾乎全是亂碼），但把同一張圖裁小一塊再單獨跑 OCR 卻讀得很準
  （信心值 0.85–0.93）。反覆測試後找到原因：Tesseract 預設的自動版面分析在處理這種「大範圍
  單色背景 header + 側邊欄 + 多欄內容」的複雜頁面時會整個失準。解法分兩步，缺一不可：
  1. **辨識前把圖片放大 2 倍**——這個修正已經內建進 `src/providers/tesseractOcr.js`
     （預設 `upscale: 2`）。
  2. **把 PSM（page segmentation mode）從預設的 `AUTO` 改成 `SPARSE_TEXT`**——`AUTO` 會先
     試著把整頁切成幾個大區塊再逐塊辨識，遇到這種「導覽列 + 側邊欄 + 內文」混雜的版面容易
     整塊漏掉；`SPARSE_TEXT` 不假設版面結構，直接找散落各處的文字，涵蓋率明顯更好。這個
     也已經是 `tesseractOcr.js` 的新預設（可用 `opts.pageSegMode` 覆寫）。
  
  套用這兩個修正後，抓到的文字行數從 1 行可用暴增到 32 個候選區塊，額外抓到了先前完全
  漏掉的標題「課務組公告」、側邊欄標題「相關網站」、側邊欄連結「政治大學」「清華大學」等等
  ——`test/output/course-som-preview.png`（見下方送出的圖）可以看到現在幾乎整頁都被正確框出。
- **唯一還是找不到的：導覽列的分頁按鈕**（相關資訊／課程查詢／登入系統）。就算用了上面兩個
  修正，這三個分頁還是完全沒被偵測到——這跟 Portal 頁面「藍底白字的登入按鈕讀不到」是同一類
  問題，在真實正式站上又重現了一次，而且這次是試過三種不同 PSM 模式、兩種縮放倍率後**仍然
  無法用調參數解決**，代表這不是 Tesseract 設定沒調好，而是這類「分頁式導覽列」元件對
  傳統 OCR 來說本質上就很難處理（很可能是很窄的固定寬度分頁格 + 置中文字，版面分析容易把它
  跟上方的深色 header banner 判成同一個非文字區塊）。實務上代表：選課系統的「登入系統」
  分頁這種導覽元件，正式版一定要靠 Azure OpenAI GPT-4o fallback 才能定位，這已經不是能靠
  調 OCR 參數解決的問題；之後對 Portal、iNCU 服務櫃台實測時，也請優先留意有沒有類似的
  分頁式導覽列。

### 4.2 那要怎麼「識別」分頁式導覽列？——不用，pipeline 本來就不需要知道

重點是：**orchestrator 不需要先判斷「這是不是分頁式導覽列」才能處理它**。
`locateKeyword.js` 只問一件事：「OCR 有沒有夠有信心的比對結果？」沒有的話，不管原因是
分頁式導覽列、圖示按鈕、還是任何其他理由，都會自動轉給 vision fallback——系統不需要
事先分類 UI 元件類型。

`test/nav-fallback-demo.mjs` 用真實 Tesseract OCR（我們已知它找不到「課程查詢」「登入系統」）
搭配一個 stub vision provider（代替還沒接上金鑰的 `azureOpenAiVision.js`）跑一次完整流程，
證明這個轉接是自動發生的：

```bash
npm run test:nav-fallback
```

```
[nav-fallback-demo] LLM fallback invoked: keyword="課程查詢", 32 OCR boxes given as context
[nav-fallback-demo] "課程查詢" -> source: llm-vision, found: true, coordinate: (255, 94)
[nav-fallback-demo] LLM fallback invoked: keyword="登入系統", 32 OCR boxes given as context
[nav-fallback-demo] "登入系統" -> source: llm-vision, found: true, coordinate: (255, 94)
[nav-fallback-demo] PASS — nav-bar keywords correctly routed to the vision fallback with no special-case detection needed
```

（座標 `(255, 94)` 是 stub 寫死的假值，只是用來證明「轉接有發生」，不是真的定位結果。）

> **更新（接上真的 Azure AI Vision 後）**：這個示範故意用 Tesseract 而不是 Azure，因為
> 它需要一個「本機 OCR 保證找不到」的案例才能在沒有雲端金鑰時也能重現。接上真的 Azure AI
> Vision 之後，實測發現「課程查詢」「登入系統」這兩個關鍵字其實**直接被 Azure OCR 找到了**
> （見 4.4），Tesseract 找不到純粹是它自己的版面分析能力比較弱，不代表這類元件本質上一定
> 要靠 LLM——這支示範現在的意義純粹是「證明轉接機制本身沒問題」，不是「證明分頁式導覽列
> 一定需要 vision fallback」。真正還需要 vision fallback 的案例，見 4.4 的麵包屑連結問題。

如果之後真的想要更進一步優化（**目前不建議花時間做，因為現有架構已經正確處理了**）：
可以額外加一個「影像層面的區域偵測」，找出畫面上「OCR 完全沒讀到任何文字、但夾在兩塊
有讀到文字的區域中間」的長條區塊（例如這次的導覽列，夾在 header 跟麵包屑之間），把這些
區塊也一起當成候選框傳給 LLM，讓 GPT-4o 不用整張圖用猜的，可以進一步提高 fallback 的
準確度。但這是錦上添花的優化，不是必要條件——沒有它，pipeline 現在就已經能正確定位
分頁式導覽列了，只是準確度取決於 GPT-4o 的能力而不是預先給的候選框。

### 4.3 怎麼在本機完整測試「所有關鍵字抓不抓得到」

一個一個手動跑 `npm run demo -- --keyword "X"` 太慢，用 `test/checkKeywords.mjs` 一次跑完
一整份關鍵字清單：

```bash
npm run test:keywords            # 跑 test/keywords/ 底下每一份清單，對應同名的 test/fixtures/*.png
# 或針對單一頁面：
node test/checkKeywords.mjs --image test/fixtures/course-announce.png --keywords test/keywords/course-announce.json
```

關鍵字清單是純文字 JSON 陣列，放在 `test/keywords/<跟 fixture 同檔名>.json`（例如
`test/keywords/course-announce.json` 對應 `test/fixtures/course-announce.png`）。
**要測其他系統或其他頁面**：先用 `node test/screenshotUrl.mjs <url> test/fixtures/<name>.png`
截圖（免登入頁面才能這樣直接抓），或用 `test/generateFixture.mjs` 的寫法照著刻一個 mockup
（需要登入的頁面），再照畫面上實際的文字寫一份同檔名的 `test/keywords/<name>.json`，接著
`npm run test:keywords` 就會自動抓到並一起跑。

輸出對每個關鍵字給兩欄結果，這就是實際回答你這兩個問題的地方：

1. **「所有關鍵字是否抓到」** —— 看 `OCR` 那欄。目前兩份清單（Portal mockup + 選課系統
   公告頁）合計 26 個關鍵字，**21 個 OCR 直接找到，0 個完全找不到**：

   ```
   === TOTAL: 26 keywords across 2 pages — 21 via OCR, 5 via fallback, 0 unresolved ===
   ```

2. **「OCR 辨識不到的要怎麼辦」** —— 看 `with fallback` 那欄。這 5 個 OCR 抓不到的
   （課程查詢、登入系統、新選課登記系統、陽明交通大學、登入 Portal），全部在加上 vision
   fallback 後都能解出結果（`source: llm-vision`）。**這就是本機能驗證到的極限**：能確認
   「轉接邏輯正確」（OCR 找不到 → 一定會轉給 LLM），但**驗證不了「LLM 猜的座標準不準」**，
   因為本機沒有真的 Azure OpenAI 金鑰，`with fallback` 欄目前用的是寫死假座標的 stub。
   要驗證真實準確度，把 `.env` 填好、跑 `npm run test:keywords` 就會自動偵測到
   `AZURE_OPENAI_*` 環境變數並自動改用真的 `azureOpenAiVision.js`（`test/providers.mjs`
   裡的 `pickVisionFallback()` 已經處理好這個切換，不用改程式碼；OCR 那端的自動切換是
   同一支檔案裡的 `pickOcrProvider()`，`npm run test:keywords` 這個 npm script 本身也已經
   內建 `--env-file-if-exists=.env`，直接跑就會讀到 `.env`，不用自己加參數），畫面上會顯示
   `fallback: azure-openai-gpt4o` 而不是 `stub`（OCR 那欄現在已經是
   `OCR: azure-ai-vision`，見 §4.4）。
   - 如果加了 fallback 後還是有某一行印出 `NOT FOUND ⚠️`，那不是「這個元件比較難找」的
     正常現象，是 `locateKeyword.js` 的轉接邏輯本身出了 bug，要直接去查那支檔案，不是去
     調 OCR 參數。

### 4.4 接上真的 Azure AI Vision 之後的完整重測結果

Part 1（見 §6.2）建好 Azure AI Vision 資源、填完 `.env` 後，`pickOcrProvider()`
（`test/providers.mjs`）會自動偵測到 `AZURE_VISION_*` 環境變數、把兩個 fixture 全部
改用真的 Azure Read OCR，不用改任何程式碼。重跑 `npm run test:keywords`：

```
=== course-announce.png：15/16 found by OCR directly, 1/16 needed the vision fallback, 0/16 unresolved ===
=== portal-mockup.png：10/10 found by OCR directly, 0/10 needed the vision fallback, 0/10 unresolved ===
=== TOTAL: 26 keywords across 2 pages — 25 via OCR, 1 via fallback, 0 unresolved ===
```

**跟本機 Tesseract 的結果對照，差距很明顯**：

- Tesseract：21/26 靠 OCR 直接找到，「課程查詢」「登入系統」「登入 Portal」（藍底白字按鈕）
  等 5 個完全找不到。
- **Azure AI Vision：25/26 靠 OCR 直接、有信心地找到**，包含上面那 5 個 Tesseract 完全
  抓不到的全部找到了，而且信心值都在 0.95–1.00 之間。這證實了先前的預測：Azure Read API
  的版面分析／對比色文字辨識能力確實比本機 Tesseract 強很多，「分頁式導覽列」「藍底白字
  按鈕」這類元件對它來說根本不是問題。

**唯一還需要 fallback 的 1 個案例，是新發現的、更精確的邊界情況**：查詢單一麵包屑連結
「新選課登記系統」時，Azure 把整條麵包屑「Home >新選課登記系統>相關資訊>課務組公告」
（四段連結，中間沒有空格分隔）OCR 成同一行文字。這代表如果直接信任這個「行」的座標，
點下去容易點到隔壁的連結而不是「新選課登記系統」本身——所以 `locateKeyword.js` 正確地把
它標記為「信心不足」（`matchScore` 只有 0.30，因為關鍵字只佔整行文字的一小部分），轉給
vision fallback 處理。這是目前唯一還「活著」、需要 vision fallback 才能精準定位的真實
案例——但因為 GPT-4o 目前暫緩（見下方），這個案例現在還沒有真的解法，先記錄下來。

### 4.5 登入後頁面的驗證（選課系統主頁面）

前面兩次驗證的都是不需要登入的公開頁面。這次測試登入後的「選課面板」主頁面（截圖由使用者
自行登入後截取並提供，**送出前已把畫面上的學號區塊塗黑**，因為 repo 是 Public，這點很重要，
細節見對話紀錄——之後有其他登入後頁面要測試都比照這個流程：自己截圖、檢查個資、有需要就
塗黑再存進 `test/fixtures/`）。

```bash
node test/checkKeywords.mjs --image test/fixtures/course-selection-main.png --keywords test/keywords/course-selection-main.json
```

結果：**21/22 個關鍵字用 Azure AI Vision 直接、有信心地找到**，包含這頁本身也有的分頁式
導覽列（課程加退選／個人功能表／課程查詢／相關資訊）——再次確認這類元件對 Azure 完全不是
問題。唯一需要 fallback 的 1 個，是查詢課程名稱「5G資通安全導論」時，Azure 把課程代碼跟
課程名稱 OCR 成同一行「CE3070* 5G資通安全導論」，道理跟 4.4 的麵包屑問題一模一樣：關鍵字
只佔整行文字的一部分，系統正確判斷信心不足、轉給 fallback。

**三個真實頁面加總**（Portal 登入頁 mockup + 選課系統公告頁 + 選課系統登入後主頁面）：

```
=== TOTAL: 48 keywords across 3 pages — 46 via OCR, 2 via fallback, 0 unresolved ===
```

**兩個案例現在都完全一致**：「代碼/路徑前綴 + 目標文字被 OCR 黏成同一行」——這個模式
已經在兩個不同真實系統上重現了兩次，可以確定是一個系統性的、可預期的邊界情況，不是隨機
誤判。這也是目前最需要 GPT-4o vision fallback 真正發揮作用的具體場景（比分頁式導覽列更
需要，因為導覽列 Azure 都能直接處理）。

### 4.6 彈出視窗（modal）的驗證——「加選」按鈕

實際會被 agent 操作的關鍵按鈕，很多是點擊後才跳出來的彈出視窗（例如按「加選」課程後跳出
「課程加退選 / Add and Drop Courses」這個浮動視窗，裡面才有真正的「加選」「取消」按鈕）。
用 `test/fixtures/add-drop-course.png`（同樣截圖前已自行處理過畫面上的學號欄位）測試：

```bash
node test/checkKeywords.mjs --image test/fixtures/add-drop-course.png --keywords test/keywords/add-drop-course.json
```

結果：**8/8 全部用 Azure AI Vision 直接、有信心地找到**，包含「加選」按鈕本身（信心值
1.00）。特別驗證過一個容易誤判的細節：畫面右上角圖例區有「已登記加選」這幾個字，跟彈出
視窗裡的「加選」按鈕文字重疊，但 `matchKeyword()` 正確辨別出**精確符合（`matchType:
"exact"`）優先於子字串符合**，結果選中的是彈出視窗裡真正的「加選」按鈕
`(x:897, y:523)`，沒有被右上角的干擾文字誤導。這代表彈出視窗、疊加在原頁面上方的 UI，
對這條 pipeline 來說跟一般頁面沒有差別，不需要額外處理。

**四個真實頁面加總**：

```
=== TOTAL: 56 keywords across 4 pages — 54 via OCR, 2 via fallback, 0 unresolved ===
```

### 4.7 一次把整份清單全部框出來 —— `--annotate`

`npm run demo` 一次只能標一個關鍵字的框（見 §「怎麼在 VSCode 測試」的說明）。如果想一次
看到整份清單裡**所有**找到的關鍵字分別在畫面上的哪個位置，`checkKeywords.mjs` 加一個
`--annotate` 參數就會多存一張合併圖，每個框旁邊標號碼，對照 console 印出的圖例（例如
`1=課程加退選, 2=Add and Drop Courses, ...`）：

```bash
npm run test:keywords:annotate          # 四個頁面各自產生一張
# 或針對單一頁面：
node --env-file-if-exists=.env test/checkKeywords.mjs --image test/fixtures/add-drop-course.png --keywords test/keywords/add-drop-course.json --annotate
```

輸出檔名是 `test/output/<fixture 檔名>-annotated-all.png`，跟 `npm run demo` 的
`result-annotated.png` 是分開的兩個檔案，不會互相覆蓋。實作上直接重用了
`src/matching/setOfMark.js` 的畫框/編號邏輯（本來是給 GPT-4o fallback 用的 Set-of-Mark
標記機制），這裡拿來做視覺化除錯剛好合用，不用另外寫一套畫框程式碼。

**過程中意外抓到一個真實限制**：在 `add-drop-course.png` 這張圖上，查詢「日文(一)A」時，
框到的其實是**左邊底層頁面**「語言中心」清單裡的「LN0025D 日文(一)A」，不是彈出視窗裡
「課程名稱」欄位真正該框的「[00001] 日文(一)A」——雖然兩處文字很接近但不是同一個東西。
原因是：**同一段文字同時出現在畫面上的多個地方**（彈出視窗前景 + 底層頁面背景）時，OCR
純比對文字內容，沒有能力分辨「哪一個在視覺上最上層、才是使用者實際看得到/點得到的」——
這是純文字比對的天生限制，跟座標抓不抓得到無關，是**語意/場景層面**的問題。

**實務上的因應方式**：查詢關鍵字時盡量用**更完整、更獨特**的字串（例如查
`[00001] 日文(一)A` 這種帶課程代碼的完整內容，而不是單獨查 `日文(一)A`），減少撞到畫面
上其他重複文字的機率。這點之後跟 DOM 解析法整合時也可以互相驗證：如果 DOM 那邊能拿到
「目前彈出視窗裡的欄位」這個範圍資訊，可以把這個範圍一起傳進來、只在該範圍內找關鍵字，
從根本解決這類重複文字誤判的問題（目前的 pipeline 介面還沒支援「限定搜尋範圍」，是可以
考慮的下一步優化方向）。

## 5. 目前的串接狀態

| 服務 | 狀態 |
|---|---|
| **Azure AI Vision（OCR 主線路）** | ✅ 已串接，`npm run test:azure-vision` 驗證通過，`test:keywords` / `demo` 都已自動改用真的 Azure |
| **Azure OpenAI（GPT-4o vision fallback）** | ⏸️ **暫緩**——見 §6.3，Azure for Students 訂閱不支援部署 Azure OpenAI，需要先解決訂閱問題才能繼續 |

現況：OCR 主線路已經做到 25/26 關鍵字有信心地直接解出座標（§4.4），對兩個真實系統
（Portal、選課系統）都驗證過。剩下唯一需要 vision fallback 的案例（麵包屑連結）目前
暫時沒有真的解法，先記錄在 §4.4，等 Azure OpenAI 訂閱問題解決後再回來處理，不影響
目前已經很紮實的 OCR 線路繼續往下發展（例如開始跟 DOM 方案整合）。

## 6. Azure 服務串接流程

這個 pipeline 設計上會用到兩個 Azure 服務：**Azure AI Vision**（OCR 主線路，已完成）和
**Azure OpenAI**（GPT-4o vision fallback，目前暫緩）。以下是完整步驟跟目前卡在哪裡。

### 6.1 準備 Azure 帳號

- 用學校信箱（`@g.ncu.edu.tw`）申請 **Azure for Students**
  （<https://azure.microsoft.com/free/students/>）：免信用卡、有 100 美元額度。
- **重要更新**：$100 額度可以用來建 Azure AI Vision（有獨立免費層，完全不會扣到額度），
  但**不能拿來部署 Azure OpenAI（GPT-4o）**——微軟官方政策是 Azure for Students 訂閱
  已經不允許使用 Azure OpenAI，這個限制看的是「訂閱類型」，跟額度還剩多少無關。詳見 §6.3。
- **建議額外確認**：InnoServe 這類「Microsoft AI 生態系」組別，主辦單位/微軟有時會
  另外發放 Azure 額度兌換碼給報名隊伍，去比賽官網、報名信、或參賽群組公告確認一下，
  有的話優先用那個額度，不用先燒學生額度——**這也是解決 Azure OpenAI 訂閱問題的可能
  途徑之一，如果主辦方發的是企業版訂閱而不是學生版**。

### 6.2 建立 Azure AI Vision 資源（OCR 主線路）—— ✅ 已完成、已驗證

1. 登入 [portal.azure.com](https://portal.azure.com) → 「建立資源」→ 搜尋 **Computer Vision**。
   **實測踩到的坑**：直接搜「Computer Vision」，搜尋結果幾乎全部是第三方廠商上架的
   VM/SaaS 服務（例如 pcloudhosting 的「Computer Vision CLI」），不是微軟官方服務。
   **解法**：用搜尋結果右側的篩選欄位，把「發行者名稱/Publisher name」設成 **Microsoft**，
   再改搜尋 **`Azure AI services`**（微軟現在把 Computer Vision 等多個 AI 功能包在這個
   資源底下），應該會看到一張卡片：名稱 **Azure AI services**、發行者 **Microsoft**、
   說明「讓強大的 API 與您的應用程式相連」——這才是對的，點進去建立。
2. 建立時填：
   - **Subscription**：你的 Azure for Students 訂閱
   - **Resource group**：新建一個，例如 `ncu-agent-rg`
   - **Region**：建議 **East Asia** 或 **Japan East**（Read OCR 功能可用、對台灣延遲較低）
   - **Pricing tier**：**F0（免費）**——每月 5000 次呼叫、每分鐘 20 次，開發階段夠用；
     正式展示前若怕超額可以再升級到 S1
3. 建立完成後，進資源頁面左側選單「**金鑰與端點 / Keys and Endpoint**」，複製：
   - `KEY 1` → 對應 `.env` 的 `AZURE_VISION_KEY`
   - `Endpoint` → 對應 `.env` 的 `AZURE_VISION_ENDPOINT`（形如
     `https://<你的資源名稱>.cognitiveservices.azure.com`）

### 6.3 建立 Azure OpenAI 資源並部署 GPT-4o（vision fallback）—— ⏸️ 暫緩

**實測結果：Azure for Students 訂閱建不了。** 微軟官方政策明確寫「Azure for Students
已不再允許使用 Azure OpenAI」——這個限制看的是訂閱類型，跟 $100 額度還剩多少無關，就算
額度全滿也一樣會被擋下來。這不是操作步驟的問題，是資格問題，繼續往下走原本的建立流程
只會卡在部署那一步。

**目前團隊的決定：先跳過，把 Azure AI Vision 這條 OCR 主線路做穩**（見 §4.4，已經做到
25/26 關鍵字有信心地直接解出座標）。之後要重新啟用這條線，可行的路徑：

1. **問學校/指導老師有沒有企業版 Azure 訂閱**——中央大學電算中心或指導老師名下如果有
   企業版訂閱，直接用那個訂閱建 Azure OpenAI 資源即可，完全不用付費，只是要花時間去問、
   去申請權限。
2. **自己的 Azure 帳號加信用卡，升級成 Pay-As-You-Go**——升級後 $100 額度會保留、優先
   扣款，GPT-4o 這種低用量的開發測試大概率花不到 $100，但這是要放一張真的信用卡在帳號上
   的財務決定，要自己評估風險。實務上部分人反應 Azure for Students 升級要聯繫 Azure
   Support 才能轉換，不一定能在 Portal 上直接按鈕升級。
3. **確認 InnoServe 有沒有發放企業版 Azure 額度給參賽隊伍**（見 §6.1）——如果主辦方發的
   是企業版而非學生版訂閱，就不會有這個限制。

等訂閱問題解決、真的建好 Azure OpenAI 資源後，步驟是：登入 **Azure AI Foundry**
（<https://ai.azure.com>）→ 建立 **Project** → 左側「**Deployments**」→「**+ Deploy
model**」→ 選 **gpt-4o**（或先選 **gpt-4o-mini** 省成本）→ 取一個 **Deployment name**
（這個名字對應 `.env` 的 `AZURE_OPENAI_DEPLOYMENT`，不是模型代號本身）→ 到「**Keys and
Endpoint**」頁面複製 `Key`／`Endpoint`。

### 6.4 填入 `.env` 並測試連線

**只有 Azure AI Vision 那兩個值的階段**（目前狀態）：

```bash
cp .env.example .env
# 填入 AZURE_VISION_ENDPOINT 跟 AZURE_VISION_KEY 這兩個就好，Azure OpenAI 那三個先留空
npm run test:azure-vision
```

`test/azure-vision-test.mjs` 只檢查這兩個變數，跑完會印出：

```
[vision-test] OK — Azure detected N lines of text on the test screenshot
[vision-test] locating "忘記密碼"...
[vision-test] FOUND via ocr at (x, y), confidence 0.99
[vision-test] Azure AI Vision is wired up correctly.
```

**等 Azure OpenAI 也解決後**，把 `.env` 剩下三個值填齊，改跑完整版：

```bash
npm run test:azure
```

`test/azure-connection-test.mjs` 會依序打兩個服務並各測一個情境，兩者都成功才會印出
最後那行「both services responded successfully」。

**兩支腳本都能用的排查方式**：如果某一步失敗，錯誤訊息會直接印出 Azure 回傳的 HTTP
狀態碼跟原始錯誤內容（例如 401 通常是金鑰貼錯、404 常是 endpoint 打錯），照訊息排查即可。

### 6.5 確認 Azure API 實際被呼叫了幾次

**權威答案在 Azure Portal，不要自己用猜的**：登入 [portal.azure.com](https://portal.azure.com) →
進到你的 Azure AI services 資源 → 左側選單「**Metrics / 度量**」→ Metric 選
**「Total Calls」**，這是 Azure 官方計費用的實際數字，F0 免費層每月上限 5000 次，可以直接
對照確認還剩多少額度。

**本機這幾支腳本各會打幾次 Azure Vision**（已修正過重複呼叫的問題）：

| 指令 | 每次執行實際打幾次 Azure AI Vision |
|---|---|
| `npm run test:azure-vision` | 1 次 |
| `npm run test:azure` | 1 次（另外還會打 1 次 Azure OpenAI，如果那三個變數也填了） |
| `npm run test:keywords`（`--all`，四個頁面） | 4 次（每個 fixture 各 1 次，`test/providers.mjs` 的 `cacheOcr()` 確保同一張圖裡不管查幾個關鍵字都只呼叫一次 API，結果重複使用） |
| `npm run demo -- --keyword "X"` | 1 次 |

**補充**：`test/azure-vision-test.mjs` 跟 `test/azure-connection-test.mjs` 原本各自多打了
1–2 次沒必要的 Azure Vision 請求（同一張圖被 `locateKeyword()` 內部又重新呼叫一次 OCR），
已經改成跟 `checkKeywords.mjs` 一樣、共用 `test/providers.mjs` 裡的 `cacheOcr()`，同一張圖
在同一次執行裡保證只打一次 API。

## 7. 下一階段還沒做的事（有意先不做）

- 真正串上 Azure AI Vision / Azure OpenAI 並在真實登入後的 Portal / iNCU / 選課系統頁面上
  實測（目前用 mockup 頁面驗證是因為登入頁以外的頁面需要帳密，且截圖 pipeline 本身跟頁面
  來源無關，先驗證機制可行即可）。
- 把 `imageSize` + `boundingBox` 換算成 CSS/DOM 座標並實際觸發點擊的整合層（跟 DOM 方案
  組員對接時再一起做）。
- 完整 browser extension 打包（manifest、background/content script、跟主要 DOM 解析法的
  切換邏輯）。
