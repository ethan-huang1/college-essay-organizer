/**
 * The one place this app talks to Travila, and nothing more than that.
 *
 * This file owns the transport only: the async create-thread -> send-message
 * -> poll contract Travila actually exposes, expressed once as runTravilaTurn.
 * It holds no profile id, no instruction text, and no feature logic - every
 * caller is a coach in src/lib/coaches/*.ts, and each of those owns its own
 * profile id, instruction, result types and parsing.
 *
 * Nothing here is thrown. A failed AI call is an expected state the UI has to
 * render, not an exception path, mirroring DraftSaveResult in essays.ts.
 */

const BASE_URL = "https://api.travila.ai";
const POLL_INTERVAL_MS = 1500;
// TEMPORARY: raised from 45s to let a V6 reasoning-config run finish so we can
// see whether reasoning.maxTokens is actually honored. Revert once confirmed.
const POLL_TIMEOUT_MS = 75_000;

export type TravilaErrorReason = "not-configured" | "invalid-input" | "timeout" | "malformed" | "http";

/** Shared error shape, assignable into any coach's own result union. */
type TravilaError = { status: "error"; reason: TravilaErrorReason; detail?: string };

type TravilaContentPart = { type: string; content: string };
type TravilaUsage = {
  promptTokens?: number;
  completionTokens?: number;
  completionTokensDetails?: { reasoningTokens?: number };
  totalTokens?: number;
  costEstimate?: number;
};
type TravilaGenerationContext = {
  model?: string;
  profileVersion?: string | number;
  resolvedMcpServers?: unknown;
};
type TravilaMessage = {
  role: string;
  generatedBy?: string;
  content: TravilaContentPart[];
  usage?: TravilaUsage;
  generationContext?: TravilaGenerationContext;
};

function headers(apiKey: string, userId: string) {
  return {
    "X-API-Key": apiKey,
    "X-On-Behalf-Of": userId,
    "Content-Type": "application/json",
  };
}

async function createThread(apiKey: string, userId: string): Promise<{ threadId: string } | { error: TravilaError }> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/v1/llm/create-thread`, {
      method: "POST",
      headers: headers(apiKey, userId),
      body: JSON.stringify({ title: "Essay Editor" }),
    });
  } catch (error) {
    return { error: { status: "error", reason: "http", detail: error instanceof Error ? error.message : "fetch failed" } };
  }
  if (!response.ok) return { error: { status: "error", reason: "http", detail: `create-thread: ${response.status}` } };
  const body = await response.json().catch(() => null);
  const threadId = body?.thread?.threadId;
  if (typeof threadId !== "string" || !threadId) {
    return { error: { status: "error", reason: "malformed", detail: "create-thread: missing thread.threadId" } };
  }
  return { threadId };
}

async function sendMessage(
  apiKey: string,
  userId: string,
  threadId: string,
  profileId: string,
  instruction: string,
): Promise<{ runId: string } | { error: TravilaError }> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/v1/llm/send-message`, {
      method: "POST",
      headers: headers(apiKey, userId),
      body: JSON.stringify({
        conversationKey: threadId,
        setActiveProfileId: profileId,
        userMessage: {
          role: "ROLE_USER",
          content: [{ type: "CONTENT_PART_TYPE_TEXT", content: instruction }],
        },
      }),
    });
  } catch (error) {
    return { error: { status: "error", reason: "http", detail: error instanceof Error ? error.message : "fetch failed" } };
  }
  if (!response.ok) return { error: { status: "error", reason: "http", detail: `send-message: ${response.status}` } };
  const body = await response.json().catch(() => null);
  const runId = body?.runId;
  if (typeof runId !== "string" || !runId) {
    return { error: { status: "error", reason: "malformed", detail: "send-message: missing runId" } };
  }
  return { runId };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForCompletion(
  apiKey: string,
  userId: string,
  threadId: string,
  runId: string,
): Promise<{ message: TravilaMessage } | { error: TravilaError }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/v1/llm/conversation-state`, {
        method: "POST",
        headers: headers(apiKey, userId),
        body: JSON.stringify({ conversationKey: threadId }),
      });
    } catch (error) {
      return { error: { status: "error", reason: "http", detail: error instanceof Error ? error.message : "fetch failed" } };
    }
    if (!response.ok) return { error: { status: "error", reason: "http", detail: `conversation-state: ${response.status}` } };
    const body = await response.json().catch(() => null);
    const messageHistory = body?.messageHistory;
    if (!Array.isArray(messageHistory)) {
      return { error: { status: "error", reason: "malformed", detail: "conversation-state: messageHistory is not an array" } };
    }
    const found = messageHistory.find(
      (entry): entry is TravilaMessage => entry?.role === "ROLE_ASSISTANT" && entry?.generatedBy === runId,
    );
    if (found) {
      // TEMPORARY DEBUG LOGGING - requested for local diagnostics only. Never
      // logs essay content, the API key, auth headers, or reasoning text.
      // Remove this block once it's no longer needed.
      if (process.env.NODE_ENV !== "production") {
        console.log("[travila:debug] shorten run completed", {
          runId,
          threadId,
          usage: {
            promptTokens: found.usage?.promptTokens,
            completionTokens: found.usage?.completionTokens,
            reasoningTokens: found.usage?.completionTokensDetails?.reasoningTokens,
            totalTokens: found.usage?.totalTokens,
            costEstimate: found.usage?.costEstimate,
          },
          generationContext: {
            model: found.generationContext?.model,
            profileVersion: found.generationContext?.profileVersion,
            resolvedMcpServers: found.generationContext?.resolvedMcpServers,
          },
        });
      }
      return { message: found };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { error: { status: "error", reason: "timeout" } };
}

function extractText(message: TravilaMessage): { text: string } | { error: TravilaError } {
  const parts = Array.isArray(message.content) ? message.content : [];
  const textParts = parts
    .filter((part) => part?.type === "CONTENT_PART_TYPE_TEXT")
    .map((part) => part.content)
    .filter((text): text is string => typeof text === "string");
  if (textParts.length === 0) {
    return { error: { status: "error", reason: "malformed", detail: "assistant message has no text content parts" } };
  }
  return { text: textParts.join("\n\n") };
}

/** The create-thread -> send-message -> poll -> extract-text sequence, shared
 * by every coach in src/lib/coaches/*.ts. Each caller supplies its own profile
 * id and instruction text; this never inspects or shapes the returned text. */
export async function runTravilaTurn(
  apiKey: string,
  userId: string,
  profileId: string,
  instruction: string,
): Promise<{ text: string } | { error: TravilaError }> {
  const thread = await createThread(apiKey, userId);
  if ("error" in thread) return thread;

  const sent = await sendMessage(apiKey, userId, thread.threadId, profileId, instruction);
  if ("error" in sent) return sent;

  const completed = await pollForCompletion(apiKey, userId, thread.threadId, sent.runId);
  if ("error" in completed) return completed;

  return extractText(completed.message);
}
