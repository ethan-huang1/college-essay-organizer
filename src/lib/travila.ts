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
// Bounds the poll loop only - createThread and sendMessage have already run by
// the time pollForCompletion sets its deadline, and the loop tests the clock
// *before* a fetch, so one more round trip can start just under it. Against the
// editor route's `export const maxDuration = 60`, budgeting ~4s of pre-poll
// work, ~2s for that trailing poll and ~2s of slack leaves ~52s to spend here.
//
// 48s takes that with margin. Observed successful coach runs were 10.6s, 20.9s,
// 21s and 32.8s, so this still allows ~46% more than the slowest; the one run
// that passed 75s failed anyway, and making a student wait that long to be told
// so is worse than failing sooner.
const POLL_TIMEOUT_MS = 48_000;

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
  profileId?: string;
  profileVersion?: string | number;
  resolvedMcpServers?: unknown;
};
type TravilaMessage = {
  role: string;
  generatedBy?: string;
  content: TravilaContentPart[];
  usage?: TravilaUsage;
  generationContext?: TravilaGenerationContext;
  // Read only for the run log when Travila happens to send them. Declared
  // optional because they are not part of the contract this file relies on -
  // nothing here branches on them.
  finishReason?: string;
  endReason?: string;
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

/**
 * One compact line per Travila run, for Vercel Logs. Observability only.
 *
 * Deliberately never touches the instruction, the assistant's text, the API
 * key, the auth headers, or the caller's user id: a run log is for answering
 * "which feature, which profile, how long, how many tokens, why did it fail",
 * and a student's essay is none of those. `detail` is bounded because it is
 * the only free-text field, and its producers are all short fixed strings from
 * this file (an HTTP status, a missing-field name) or a fetch error message.
 *
 * Everything is wrapped so a logging fault cannot fail a student's request -
 * this is the least important thing happening on this code path.
 */
function logTravilaRun(input: {
  profileId: string;
  startedAt: number;
  runId?: string;
  message?: TravilaMessage;
  error?: TravilaError;
}) {
  try {
    const usage = input.message?.usage;
    const context = input.message?.generationContext;
    const payload: Record<string, unknown> = {
      // Derived from the profile id rather than threaded through every caller,
      // so no coach signature changes just to be observable.
      feature: input.profileId.replace(/^college_essay_/, "").replace(/_coach$/, "") || undefined,
      profileId: context?.profileId ?? input.profileId,
      profileVersion: context?.profileVersion,
      model: context?.model,
      runId: input.runId,
      status: input.error ? "error" : "ok",
      latencyMs: Date.now() - input.startedAt,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      reasoningTokens: usage?.completionTokensDetails?.reasoningTokens,
      totalTokens: usage?.totalTokens,
      costEstimate: usage?.costEstimate,
      finishReason: input.message?.finishReason,
      endReason: input.message?.endReason,
      errorReason: input.error?.reason,
      errorDetail: typeof input.error?.detail === "string" ? input.error.detail.slice(0, 200) : undefined,
    };
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
    console.log("[travila-run]", JSON.stringify(payload));
  } catch {
    // Never let observability break the run it is observing.
  }
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
  const startedAt = Date.now();

  const thread = await createThread(apiKey, userId);
  if ("error" in thread) { logTravilaRun({ profileId, startedAt, error: thread.error }); return thread; }

  const sent = await sendMessage(apiKey, userId, thread.threadId, profileId, instruction);
  if ("error" in sent) { logTravilaRun({ profileId, startedAt, error: sent.error }); return sent; }

  const completed = await pollForCompletion(apiKey, userId, thread.threadId, sent.runId);
  if ("error" in completed) {
    logTravilaRun({ profileId, startedAt, runId: sent.runId, error: completed.error });
    return completed;
  }

  const extracted = extractText(completed.message);
  logTravilaRun({
    profileId,
    startedAt,
    runId: sent.runId,
    message: completed.message,
    error: "error" in extracted ? extracted.error : undefined,
  });
  return extracted;
}
