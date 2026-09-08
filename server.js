// HTTP request/response、輸入驗證、呼叫服務
import express from "express";
import "dotenv/config";
import OpenAI from "openai";

import {
  appendMessage,
  getRecentMessages,
} from "./repositories/conversationRepository.js";

const app = express();
const port = process.env.PORT || 3000;

const MAX_TEXT_LENGTH = 2000;
const HISTORY_MESSAGE_LIMIT = 8;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.use(express.json({ limit: "50kb" }));
app.use(express.static("public"));

app.post("/api/chat", async (req, res) => {
  try {
    const {
      installId,
      conversationId,
      text: rawText,
    } = req.body ?? {};

    const text = typeof rawText === "string" ? rawText.trim() : "";

    if (!isValidUuid(installId)) {
      return res.status(400).json({
        status: "error",
        reply: "installId 必須是有效的 UUID。",
      });
    }

    if (!isValidUuid(conversationId)) {
      return res.status(400).json({
        status: "error",
        reply: "conversationId 必須是有效的 UUID。",
      });
    }

    if (!text) {
      return res.status(400).json({
        status: "error",
        reply: "沒有收到語音轉換後的文字。",
      });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        status: "error",
        reply: `單次訊息不可超過 ${MAX_TEXT_LENGTH} 個字元。`,
      });
    }

    // 1. 先把本次使用者輸入寫入 Cosmos DB。
    await appendMessage({
      installId,
      conversationId,
      role: "user",
      content: text,
    });

    // 2. 取出該對話最近 8 則訊息，約等於最近 4 輪問答。
    const recentMessages = await getRecentMessages({
      installId,
      conversationId,
      limit: HISTORY_MESSAGE_LIMIT,
    });

    // 3. 將近期對話歷史交給 AI。
    const result = await askAI(recentMessages);

    // 4. 把 AI 回覆寫回同一段 conversation。
    await appendMessage({
      installId,
      conversationId,
      role: "assistant",
      content: result.reply,
    });

    return res.json({
      status: "ok",
      reply: result.reply,
      provider: result.provider,
      conversationId,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      status: "error",
      reply: "目前無法取得 AI 回覆。",
    });
  }
});

function isValidUuid(value) {
  if (typeof value !== "string") {
    return false;
  }

  if (!UUID_REGEX.test(value)) {
    return false;
  }

  // 額外用 Node.js 驗證格式，避免前端傳入非預期字串。
  try {
    return crypto.randomUUID && value.length === 36;
  } catch {
    return false;
  }
}

async function askAI(messages) {
  const provider = process.env.AI_PROVIDER || "mock";

  if (provider === "azure-openai") {
    return askAzureOpenAI(messages);
  }

  return {
    reply: mockAI(messages),
    provider: "mock",
  };
}

function mockAI(messages) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  const previousUserMessages = messages.filter(
    (message) => message.role === "user"
  );

  if (!latestUserMessage) {
    return "我沒有收到可處理的使用者訊息。";
  }

  if (previousUserMessages.length > 1) {
    return `我收到你的最新內容：「${latestUserMessage.content}」。目前已保留這段對話的上下文。`;
  }

  return `我收到你的語音內容是：「${latestUserMessage.content}」`;
}

async function askAzureOpenAI(historyMessages) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Azure OpenAI 設定不完整：請確認 Endpoint、API Key、Deployment。"
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, "")}/openai/v1/`,
  });

  const completion = await client.chat.completions.create({
    model: deployment,
    messages: [
      {
        role: "system",
        content: `
你是一個友善的繁體中文語音助理。
請以台灣繁體中文回答。
請根據前面的對話脈絡理解追問，例如「那再詳細一點」或「換個例子」。
如果上下文不足，請簡短詢問使用者想針對什麼內容繼續。
回答最多兩句，每句盡量不超過 25 個字。
        `.trim(),
      },
      ...historyMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
    max_completion_tokens: 2000,
  });

  const choice = completion.choices[0];
  const reply = choice?.message?.content?.trim();

  console.log("Azure finish_reason:", choice?.finish_reason);
  console.log("Azure usage:", completion.usage);
  console.log("Azure raw message:", choice?.message);

  if (!reply) {
    throw new Error(
      `Azure OpenAI 沒有產生可見回覆，finish_reason=${
        choice?.finish_reason || "unknown"
      }`
    );
  }

  return {
    reply,
    provider: "azure-openai",
  };
}

app.post("/api/tts", async (req, res) => {
  try {
    const text = req.body?.text?.trim();

    if (!text) {
      return res.status(400).json({
        status: "error",
        message: "沒有可轉換成語音的文字。",
      });
    }

    const speechKey = process.env.SPEECH_KEY;
    const speechRegion = process.env.SPEECH_REGION;
    const speechVoice =
      process.env.SPEECH_VOICE || "zh-TW-HsiaoChenNeural";

    if (!speechKey || !speechRegion) {
      throw new Error(
        "Azure Speech 設定不完整：請確認 SPEECH_KEY 與 SPEECH_REGION。"
      );
    }

    const ssml = `
<speak version="1.0" xml:lang="zh-TW">
  <voice name="${speechVoice}">
    ${escapeXml(text)}
  </voice>
</speak>
    `.trim();

    const response = await fetch(
      `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": speechKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "voice-ai-mvp",
        },
        body: ssml,
      }
    );

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `Azure Speech TTS error ${response.status}: ${detail}`
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);

    return res.send(audioBuffer);
  } catch (error) {
    console.error("TTS error:", error);

    return res.status(500).json({
      status: "error",
      message: "目前無法將文字轉換成語音。",
    });
  }
});

function escapeXml(text) {
  const xmlEntities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  };

  return text.replace(/[&<>"']/g, (character) => {
    return xmlEntities[character];
  });
}

app.listen(port, () => {
  console.log(`Server: http://localhost:${port}`);
  console.log(`AI provider: ${process.env.AI_PROVIDER || "mock"}`);
});