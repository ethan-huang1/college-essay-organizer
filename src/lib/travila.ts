import { cleanContent, wordCount } from "./essays";

/**
 * The one place this app talks to Travila.
 *
 * Both the Editor's manual Shorten and the Reuse flow's automatic-shorten
 * offer call this single function, so the request/response shape (and the
 * async create-thread -> send-message -> poll contract Travila actually
 * exposes) exists exactly once. Nothing here is thrown - a failed AI call is
 * an expected state the UI has to render, not an exception path, mirroring
 * DraftSaveResult in essays.ts.
 *
 * The AI Coach family (src/lib/coaches/*.ts) shares only runTravilaTurn from
 * this file - each coach's own profile id, instruction, types, and parsing
 * live in its own module, imported from there.
 */

const BASE_URL = "https://api.travila.ai";
const PROFILE_ID = "college_essay_editor";
const POLL_INTERVAL_MS = 1500;
// TEMPORARY: raised from 45s to let a V6 reasoning-config run finish so we can
// see whether reasoning.maxTokens is actually honored. Revert once confirmed.
const POLL_TIMEOUT_MS = 75_000;
const MAX_TARGET_WORD_COUNT = 10_000;

export type TravilaErrorReason = "not-configured" | "invalid-input" | "timeout" | "malformed" | "http";

/** Shared error shape, assignable into any coach's own result union. */
type TravilaError = { status: "error"; reason: TravilaErrorReason; detail?: string };

export type ShortenResult =
  | { status: "ok"; shortenedContent: string }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

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
 * by every Travila-backed feature (shortenEssay here, and every coach in
 * src/lib/coaches/*.ts). Each caller supplies its own profile id and
 * instruction text; this never inspects or shapes the returned text. */
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

function validateInput(content: string, targetWordCount: number): ShortenResult | null {
  if (content.trim().length === 0) {
    return { status: "error", reason: "invalid-input", detail: "Essay is empty." };
  }
  try {
    cleanContent(content);
  } catch {
    return { status: "error", reason: "invalid-input", detail: "Essay content must be 20,000 characters or fewer." };
  }
  if (!Number.isInteger(targetWordCount) || targetWordCount < 1) {
    return { status: "error", reason: "invalid-input", detail: "Target word count must be a positive whole number." };
  }
  if (targetWordCount > MAX_TARGET_WORD_COUNT) {
    return { status: "error", reason: "invalid-input", detail: `Target word count must be ${MAX_TARGET_WORD_COUNT} or fewer.` };
  }
  const currentWordCount = wordCount(content);
  if (targetWordCount >= currentWordCount) {
    return {
      status: "error",
      reason: "invalid-input",
      detail: `Target must be below the essay's current word count (${currentWordCount}).`,
    };
  }
  return null;
}

export async function shortenEssay(input: { content: string; targetWordCount: number; userId: string }): Promise<ShortenResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateInput(input.content, input.targetWordCount);
  if (validationError) return validationError;

  const instruction =
    `Shorten this complete essay to no more than ${input.targetWordCount} words. Use as much of the available word ` +
    `count as useful, preserve the essay's overall structure and major ideas, and prefer compressing language ` +
    `over deleting substantive content:\n\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  return { status: "ok", shortenedContent: turn.text };
}
