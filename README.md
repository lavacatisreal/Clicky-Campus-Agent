# NCU 校園 Agent — 截圖定位 Pipeline

目標：`截圖 + 關鍵字` → `該關鍵字在畫面上的像素座標`，作為 DOM 解析法的備援方案（DOM
抓不到元件位置時，改用截圖 + AI 視覺辨識找出來）。

純 JavaScript（ESM），設計上要能直接整合進 browser extension 的 background /
content script。

## 架構

混合式：**OCR 為主、LLM 視覺為輔**——關鍵字定位本質上大多是「畫面上有沒有這段文字、它在
哪」的文字偵測問題，OCR 比讓 LLM 用視覺猜像素座標更準、更快、更便宜。LLM 只在 OCR 找不到
時介入（圖示按鈕、語意查詢、需要消歧義）。

```
screenshot + keyword
        │
        ▼
 ┌─────────────────┐   有信心的文字比對結果
 │  OCR Provider    │───────────────────────────► 回傳座標（source: "ocr"）
 │  (Azure AI Vision) │
 └─────────────────┘
        │ 沒有信心的比對結果（比對分數 < 門檻，或根本沒有這段文字）
        ▼
 ┌─────────────────────────┐
 │ Vision Fallback Provider │
 │ (Azure OpenAI GPT-4o)    │──────► 回傳座標（source: "llm-vision"）
 └─────────────────────────┘
```

`locateKeyword()`（orchestrator）只依賴 provider 介面，不管背後是哪家廠商，OCR 或
vision fallback 都可以直接替換，不用改 orchestrator 本身。

## 目前狀態

| 服務 | 狀態 |
|---|---|
| **Azure AI Vision（OCR 主線路）** | ✅ 已串接、已用四個真實頁面驗證，56 個關鍵字裡 54 個直接解出座標 |
| **Azure OpenAI（GPT-4o vision fallback）** | ⏸️ 暫緩——Azure for Students 訂閱不支援部署，需要企業版訂閱或付費升級才能繼續，目前用 stub 頂著（能驗證轉接邏輯，驗證不了真實準確度） |

## 檔案位置

```
src/
  pipeline/
    locateKeyword.js    # 主要 orchestrator：keyword + image -> 座標，只依賴 provider 介面
    imageUtils.js         # image 輸入格式轉換 (path/buffer/dataUrl 互轉)
  providers/
    azureVisionOcr.js         # OCR 主線路（正式版用這個）
    azureOpenAiVision.js      # vision fallback（正式版用這個，目前暫緩）
    claudeVision.js            # 備用 fallback，可選走 Microsoft Foundry 或 Anthropic 直連
    tesseractOcr.js             # 本機 OCR，不用金鑰，只給本機測試用，不用整合進 extension
  matching/
    textMatch.js          # 關鍵字 <-> OCR 文字比對邏輯（精確/子字串/模糊/跨字合併）
    setOfMark.js           # 幫 vision fallback 畫候選框編號（Set-of-Mark 技巧）
test/
  providers.mjs          # 測試腳本共用：依 .env 自動選真的 Azure 或本機替代方案
  checkKeywords.mjs       # 批次驗證整份關鍵字清單，見下方「怎麼測試」
  keywords/*.json         # 各頁面的關鍵字清單
  fixtures/*.png           # 各頁面的測試截圖
```

## 輸入 / 輸出介面

```js
// 輸入
locateKeyword({
  image: { dataUrl: "data:image/png;base64,...", width, height },  // extension 用 dataUrl
  keyword: "登入 Portal",
}, { ocr, visionFallback })

// 輸出
{
  found: true,
  source: "ocr",   // "ocr" | "llm-vision" | "none"
  primaryMatch: {
    boundingBox: { x, y, width, height },  // 圖片像素座標，原點左上角
    center: { x, y },                       // 單一座標點（外框正中心），要單點座標直接拿這個
    confidence: 0.96,
  },
  candidates: [ /* 其餘候選 */ ],
}
```

**⚠️ 座標系統換算**：`boundingBox` / `center` 是**截圖點陣圖的像素座標**，不是 CSS/DOM
座標。整合時要注意三層換算：

1. 截圖像素座標（本 pipeline 輸出）
2. CSS viewport 座標 = 截圖像素座標 ÷ `devicePixelRatio`
3. 頁面座標（含捲動）= CSS viewport 座標 + `window.scrollX / scrollY`

要模擬點擊：用第 2 層配合 `chrome.debugger` 的 `Input.dispatchMouseEvent`，或轉成第 3 層
後用 `document.elementFromPoint()` 拿 DOM 節點再 `.click()`。

## 跟 DOM 方案合併時要注意的地方

`src/` 大部分可以直接搬進 extension，但這幾點需要留意（目前只在 Node.js 測試環境跑過，
**還沒有在真的 browser extension 裡驗證過**）：

- **一定要用 `dataUrl` 當 image 輸入**（不要用 `path`，那是 Node-only，extension 裡沒有
  檔案系統）。`chrome.tabs.captureVisibleTab` 本來就直接回傳 dataUrl 格式，天生就相容。
- `imageUtils.js` 目前用 Node 的 `Buffer.from(...)` 解 base64，extension 的 service
  worker 預設沒有這個全域變數（除非打包工具有 polyfill）。改成 `atob()` + `Uint8Array`
  是小改動，整合時記得處理。
- `setOfMark.js`（畫候選框編號，只有 vision fallback 會用到）用 `jimp` 套件畫圖，這是
  Node 導向的套件，Manifest V3 service worker 沒有 DOM/`<canvas>`，能不能直接跑沒驗證過。
  真的要用的話比較保險是改用 Chrome extension 原生的 `OffscreenCanvas` API 重寫這段。
- `tesseractOcr.js` 不用搬——只是本機免金鑰測試用的替代品，正式版走 Azure，不需要它。

## 怎麼測試

```bash
npm install
cp .env.example .env   # 填 AZURE_VISION_ENDPOINT / AZURE_VISION_KEY 就能用真的 Azure OCR

npm run test:fallback           # 純邏輯測試，< 1 秒，不用金鑰
npm run test:keywords           # 批次驗證所有頁面的關鍵字清單，有 .env 就自動用真的 Azure
npm run demo -- --keyword "X"   # 單一關鍵字 + 產生標註結果圖 (test/output/result-annotated.png)
```

`npm run test:keywords` 加 `--annotate` 可以把一整份清單裡所有找到的關鍵字同時框在同一張
圖上（`test/output/<fixture>-annotated-all.png`），適合一次檢視某個頁面的整體覆蓋狀況。

新增其他頁面測試：`node test/screenshotUrl.mjs <url> test/fixtures/<name>.png` 截圖
（限免登入頁面；需登入的頁面自己截圖存進 `test/fixtures/`，**存之前務必檢查畫面上有沒有
個資，這個 repo 是 Public**），再寫一份同檔名的 `test/keywords/<name>.json` 關鍵字清單，
`npm run test:keywords` 會自動抓到一起跑。
