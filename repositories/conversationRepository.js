// Cosmos DB 的建立、讀取、更新 conversation
import "dotenv/config";
import { CosmosClient } from "@azure/cosmos";

const {
  COSMOS_ENDPOINT,
  COSMOS_KEY,
  COSMOS_DATABASE_ID,
  COSMOS_CONTAINER_ID,
} = process.env;

if (
  !COSMOS_ENDPOINT ||
  !COSMOS_KEY ||
  !COSMOS_DATABASE_ID ||
  !COSMOS_CONTAINER_ID
) {
  throw new Error(
    "缺少 Cosmos DB 環境變數，請確認 COSMOS_ENDPOINT、COSMOS_KEY、COSMOS_DATABASE_ID、COSMOS_CONTAINER_ID。"
  );
}

const client = new CosmosClient({
  endpoint: COSMOS_ENDPOINT,
  key: COSMOS_KEY,
});

const container = client
  .database(COSMOS_DATABASE_ID)
  .container(COSMOS_CONTAINER_ID);

const MAX_STORED_MESSAGES = 40;

function nowIso() {
  return new Date().toISOString();
}

export async function getConversation(installId, conversationId) {
  try {
    const { resource } = await container
      .item(conversationId, installId)
      .read();

    return resource ?? null;
  } catch (error) {
    if (error.code === 404 || error.statusCode === 404) {
      return null;
    }

    throw error;
  }
}

export async function createConversation({
  installId,
  conversationId,
}) {
  const now = nowIso();

  const conversation = {
    id: conversationId,
    type: "conversation",
    installId,
    conversationId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const { resource } = await container.items.create(conversation);
  return resource;
}

export async function getOrCreateConversation({
  installId,
  conversationId,
}) {
  const existing = await getConversation(installId, conversationId);

  if (existing) {
    return existing;
  }

  return createConversation({
    installId,
    conversationId,
  });
}

export async function appendMessage({
  installId,
  conversationId,
  role,
  content,
}) {
  const conversation = await getOrCreateConversation({
    installId,
    conversationId,
  });

  const message = {
    role,
    content,
    createdAt: nowIso(),
  };

  conversation.messages = [
    ...(conversation.messages ?? []),
    message,
  ].slice(-MAX_STORED_MESSAGES);

  conversation.updatedAt = nowIso();

  const { resource } = await container
    .item(conversationId, installId)
    .replace(conversation);

  return resource;
}

export async function getRecentMessages({
  installId,
  conversationId,
  limit = 8,
}) {
  const conversation = await getConversation(
    installId,
    conversationId
  );

  if (!conversation?.messages) {
    return [];
  }

  return conversation.messages.slice(-limit);
}

export async function deleteConversation({
  installId,
  conversationId,
}) {
  const { statusCode } = await container
    .item(conversationId, installId)
    .delete();

  if (statusCode !== 204) {
    throw new Error(`刪除對話失敗，HTTP status: ${statusCode}`);
  }
}