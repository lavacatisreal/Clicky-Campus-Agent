# Clicky Campus Agent

一個以 Chrome Extension 製作的校園網頁語音導覽原型。使用者按下 `Q` 後說出需求，Extension 會將語音轉文字、交給本機 Node.js 後端與 Azure OpenAI 判斷，再把虛擬游標導向目標位置。

目前專案重點是驗證以下流程：

```text
Q 鍵啟動語音辨識
→ SpeechRecognition 轉成繁體中文文字
→ 顯示辨識文字與游標狀態
→ background.js 呼叫後端 API
→ Azure OpenAI 回傳目標座標
→ 虛擬游標飛往目標位置
→ W 鍵執行目前目標的點擊流程
```

> 目前 `fakeUIInfo` 內的按鈕資料仍是測試資料

## 目前功能

- 虛擬游標跟隨真實滑鼠。
- 按 `Q` 啟動繁體中文語音辨識。
- 語音辨識期間顯示游標狀態，例如聆聽、思考、導引、錯誤。
- 顯示使用者剛辨識完成的語音文字。
- `background.js` 將語音指令與測試 UI 資訊傳給本機後端。
- Express 後端串接 Azure OpenAI。
- Cosmos DB 保存以 `installId`、`conversationId` 區分的對話紀錄。
- 後端保留最近幾輪對話作為 AI 上下文。
- AI 回傳座標後，虛擬游標飛向對應位置。
- 按 `W` 執行目前 AI 導引位置的點擊流程。
- 後端提供 Azure Speech TTS API 端點，但 Extension UI 尚未完整串接朗讀流程。

## 專案結構

```text
campus-ai-agent-extension/
├─ manifest.json
├─ content.js
├─ background.js
├─ index.html
├─ server.js
├─ azureOpenAIAdapter.js
├─ repositories/
│  └─ conversationRepository.js
├─ package.json
├─ package-lock.json
├─ .env.example
```

| 檔案 | 用途 |
|---|---|
| `manifest.json` | Chrome Extension Manifest V3 設定、背景 Service Worker、Content Script 與權限 |
| `content.js` | 注入網頁；建立虛擬游標、處理滑鼠跟隨、語音辨識、顯示文字提示、接收 AI 導引與執行頁面點擊 |
| `background.js` | 接收語音指令、呼叫本機後端 API、解析 AI 回傳座標，並傳送 `AI_FLY` 給目前分頁 |
| `server.js` | Express 後端入口，提供聊天與 TTS API，協調 Azure OpenAI、Azure Speech、Cosmos DB |
| `repositories/conversationRepository.js` | Cosmos DB 對話資料存取層，負責建立、讀取與更新 conversation 文件 |
| `.env.example` | 環境變數範本 |

## 需求

- Google Chrome 或 Chromium 瀏覽器。
- Node.js 20 以上。
- npm。
- Azure OpenAI 資源、模型部署名稱與 API Key。
- Azure Cosmos DB for NoSQL 帳戶、Database 與 Container。
- 選用：Azure AI Speech 資源，用於文字轉語音。

## 建置環境

### 1. 安裝 Node.js 套件

在專案根目錄執行：

```powershell
npm install
```

若專案尚未安裝必要套件，可確認至少包含：

```powershell
npm install express dotenv openai @azure/cosmos
```

### 2. 建立 `.env`

將範本複製為本機設定檔：

```powershell
Copy-Item .env.example .env
```

將 `.env` 填入自己的 Azure 設定。

範例：

```dotenv
PORT=3000
AI_PROVIDER=azure-openai

AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE_NAME.openai.azure.com
AZURE_OPENAI_API_KEY=YOUR_AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT=YOUR_DEPLOYMENT_NAME

COSMOS_ENDPOINT=https://YOUR_COSMOS_ACCOUNT.documents.azure.com:443/
COSMOS_KEY=YOUR_COSMOS_PRIMARY_KEY
COSMOS_DATABASE_ID=voiceAssistantDb
COSMOS_CONTAINER_ID=conversations

SPEECH_KEY=YOUR_AZURE_SPEECH_KEY
SPEECH_REGION=YOUR_AZURE_SPEECH_REGION
SPEECH_VOICE=zh-TW-HsiaoChenNeural
```

### 3. Azure Cosmos DB 設定

建立 Azure Cosmos DB for NoSQL 後，在 Data Explorer 建立：

```text
Database: voiceAssistantDb
Container: conversations
Partition key: /installId
```

每段對話會以一份 conversation document 保存，概念如下：

```json
{
  "id": "conversation-uuid",
  "type": "conversation",
  "installId": "anonymous-install-uuid",
  "conversationId": "conversation-uuid",
  "messages": [],
  "createdAt": "2026-09-10T00:00:00.000Z",
  "updatedAt": "2026-09-10T00:00:00.000Z"
}
```

## 啟動方式

### 1. 啟動後端

開啟終端機並在專案根目錄執行：

```powershell
npm start
```

若 `package.json` 沒有設定 `start` script，可直接執行：

```powershell
node server.js
```

成功時應看到類似：

```text
Server: http://localhost:3000
AI provider: azure-openai
```

啟動後請保持這個終端機開啟。

### 2. 載入 Chrome Extension

1. 在 Chrome 網址列開啟：

   ```text
   chrome://extensions
   ```

2. 開啟右上角的「開發人員模式」。
3. 點選「載入未封裝項目」。
4. 選擇此專案根目錄，也就是包含 `manifest.json` 的資料夾。
5. 確認畫面上出現 **Clicky Campus Agent**。

每次修改 `content.js`、`background.js` 或 `manifest.json` 後：

1. 回到 `chrome://extensions`。
2. 按 Extension 的重新載入按鈕。
3. 回到測試網頁後按 `Ctrl + Shift + R` 強制重新整理。

### 3. 測試操作

1. 開啟可測試的網頁。
2. 移動滑鼠，確認虛擬游標出現並跟隨滑鼠。
3. 按 `Q`。
4. 第一次使用時，在 Chrome 允許麥克風權限。
5. 說出測試指令，例如：

   ```text
   幫我找選課按鈕
   ```

6. 應看到游標從聆聽狀態切換為思考狀態，並顯示辨識文字。
7. AI 成功回傳座標後，游標會飛往目標位置。
8. 按 `W` 執行目前的測試點擊流程。

## API

### `POST /api/chat`

用途：接收語音轉文字後的指令，保存對話上下文，呼叫 Azure OpenAI 並回傳文字結果。

本機 URL：

```text
http://127.0.0.1:3000/api/chat
```

Request body：

```json
{
  "installId": "550e8400-e29b-41d4-a716-446655440000",
  "conversationId": "4fd755ae-9ac1-4c5c-9034-f5f56bf23b70",
  "text": "使用者語音指令: 幫我找選課按鈕"
}
```

欄位說明：

| 欄位 | 說明 |
|---|---|
| `installId` | 匿名安裝識別 ID；應在 Extension 第一次啟動時建立並長期保存 |
| `conversationId` | 目前對話 ID；新開對話時才建立新的 UUID |
| `text` | 使用者的語音辨識文字，或經過 Extension 組裝後的 AI prompt |

成功回應：

```json
{
  "status": "ok",
  "reply": "{\"x\":300,\"y\":450}",
  "provider": "azure-openai",
  "conversationId": "4fd755ae-9ac1-4c5c-9034-f5f56bf23b70"
}
```

目前 `background.js` 期待 `reply` 是 JSON 字串，內容至少包含：

```json
{
  "x": 300,
  "y": 450
}
```

### `POST /api/tts`

用途：將文字轉換為 Azure Speech 產生的 MP3 音訊。

本機 URL：

```text
http://127.0.0.1:3000/api/tts
```

Request body：

```json
{
  "text": "已找到選課按鈕，請自行點擊。"
}
```

成功時回傳：

```text
Content-Type: audio/mpeg
```

前端可用 `Blob` 與 `Audio` 播放回傳音訊。

## 重要開發注意事項

### no-speech

如果出現：

```text
語音辨識發生錯誤: no-speech
```

表示該次錄音沒有偵測到可辨識的人聲。確認麥克風權限後，按 Q 並立即說出完整句子即可。

### 對話記憶

目前 `background.js` 若每次都使用：

```js
installId: crypto.randomUUID(),
conversationId: crypto.randomUUID(),
```

每個請求都會建立新的使用者與對話，Cosmos DB 的多輪記憶不會生效。

後續應改為：

- `installId`：第一次安裝時建立，保存在 `chrome.storage.local`。
- `conversationId`：一段對話維持固定，保存在 `chrome.storage.session` 或 `chrome.storage.local`。
- 使用者點擊「新增對話」時才建立新的 `conversationId`。
