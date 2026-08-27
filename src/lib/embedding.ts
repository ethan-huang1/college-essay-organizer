/**
 * Local sentence embeddings, for the semantic-similarity factor in matching.ts.
 *
 * Runs entirely on this machine. No API key, no network request at inference
 * time, and no essay text leaves the process - which is what lets this exist at
 * all under MVP_SPEC.md §5 and matches the privacy constraint that ruled out
 * Google Docs sync in docs/reuse-scoring.md.
 *
 * The model weights (~25MB quantized) are fetched once from the Hugging Face
 * hub into .model-cache/ and reused. That download is the only network access,
 * it happens outside request handling, and everything after it is offline.
 *
 * Deliberately fails soft. If the model cannot be loaded - not installed, no
 * cache, a platform without the native ONNX runtime - `embedTexts` returns null
 * and matching scores the semantic factor at its neutral value. Every band
 * stays reachable and nothing errors, which is also what makes this feature
 * revertible: removing it is the same code path as never having it.
 */

/**
 * Pinned deliberately. Embeddings are only comparable to other embeddings from
 * the same model, and docs/evaluation/reuse-scoring.md reports numbers produced
 * by this one - so changing it invalidates both the committed prompt vectors and
 * the evaluation, and must be a reviewed commit rather than a silent upgrade.
 */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DTYPE = "q8";
export const EMBEDDING_DIMENSIONS = 384;

type Extractor = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

/**
 * Set to disable semantic similarity in this process.
 *
 * The test suite sets it, so that the same assertions hold on a machine with the
 * model cached and one without. Without this, whether an integration test passed
 * would depend on whether a 25MB download had happened - which is a flaky suite
 * dressed up as a passing one. The deterministic path is also the one that runs
 * when no provider is configured, so pinning it in tests is pinning real
 * behaviour rather than a fiction.
 *
 * src/lib/embedding.test.ts opts back in and skips itself if the model is
 * genuinely unavailable, so the embedding path is still covered where it can be.
 */
export const DISABLE_ENV_VAR = "DISABLE_LOCAL_EMBEDDINGS";

let loading: Promise<Extractor | null> | null = null;

/**
 * Loads the model once per process, and remembers a failure as a failure.
 *
 * Without the memoised null, a machine that cannot load the model would retry
 * the import - and pay the failure cost - on every single match recomputation.
 */
async function getExtractor(): Promise<Extractor | null> {
  loading ??= (async () => {
    if (process.env[DISABLE_ENV_VAR]) return null;
    try {
      const { env, pipeline } = await import("@huggingface/transformers");
      // Keep the weights inside the repo rather than under node_modules, so a
      // reinstall does not silently trigger a fresh 25MB download.
      env.cacheDir = ".model-cache";
      const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: EMBEDDING_DTYPE });
      return extractor as unknown as Extractor;
    } catch {
      // Intentionally quiet: an absent provider is a supported configuration,
      // not an error condition. Callers see null and score neutral.
      return null;
    }
  })();
  return loading;
}

/** True when semantic similarity is available in this process. */
export async function embeddingsAvailable() {
  return (await getExtractor()) !== null;
}

/** Test-only: forgets a cached load so the disable flag can be toggled. */
export function resetEmbeddingProviderForTests() {
  loading = null;
}

/**
 * Unit-normalised mean-pooled embeddings, or null when unavailable.
 *
 * Normalisation is done by the pipeline, which is what makes a dot product a
 * cosine similarity - see `cosine` below.
 *
 * **One text per call, deliberately.** Passing several at once pads them all to
 * the longest sequence, and the mean pooling then averages over the padding, so
 * the embedding of a text depends on what else was in the batch. Measured: the
 * same prompt embedded alongside a short text and alongside a long one differed
 * by cosine 0.991, while embedding it twice on its own is bit-identical. That
 * would have been a quiet disaster here - the committed prompt vectors are
 * produced in one pass and essay vectors at request time in another, so every
 * comparison would carry an error of the same order as the differences between
 * prompts, which live in a 0.02-0.25 band.
 *
 * It is also faster: 60 texts one at a time took 249ms against 376ms as a single
 * batch, because padding wastes compute on tokens that are then discarded.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  if (!extractor) return null;
  const vectors: number[][] = [];
  for (const text of texts) {
    const output = await extractor([text], { pooling: "mean", normalize: true });
    vectors.push(output.tolist()[0]);
  }
  return vectors;
}

/** Dot product, which is cosine similarity for unit-normalised vectors. */
export function cosine(a: readonly number[], b: readonly number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

/**
 * Turns raw similarities into z-scores against their own distribution.
 *
 * This is the whole reason factor 2 is usable. Measured on this model, an essay
 * about rebuilding a free library scores cosine 0.253 against the prompt it
 * actually answers and 0.020 against "why engineering at Princeton" - a real
 * signal, but living in a 0.02-0.25 band that no absolute threshold could read,
 * and one that shifts with text length and phrasing. Comparing each prompt
 * against the mean and spread for *that essay* asks the question that matters:
 * is this prompt closer than the average prompt?
 *
 * Returns zeros when the spread is degenerate (one prompt, or identical
 * similarities), because "everything is equally close" carries no information
 * and must not be amplified into a large positive or negative score.
 */
export function calibrate(similarities: readonly number[]): number[] {
  if (similarities.length < 2) return similarities.map(() => 0);
  const mean = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  const variance = similarities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / similarities.length;
  const deviation = Math.sqrt(variance);
  if (deviation < 1e-6) return similarities.map(() => 0);
  return similarities.map((value) => (value - mean) / deviation);
}

// ---------------------------------------------------------------------------
// Committed vector storage
//
// 255 catalogue prompts x 384 dimensions as JSON floats is ~700KB of diff noise
// no reviewer can read. Quantising to int8 costs ~150KB instead.
//
// The scale is per vector, and that detail matters more than it looks. A unit
// vector in 384 dimensions has components around 1/sqrt(384) ~ 0.05, so a fixed
// scale of 127 maps a typical component onto about 6 of the 127 available
// levels - an 8% per-component error, which measured out at cosine 0.988
// against the original. Scaling by each vector's own largest component uses the
// full range and brings that to better than 0.9999, for four extra characters
// per row.
// ---------------------------------------------------------------------------

/** `<scale>:<base64 int8>`, where scale is the vector's largest magnitude. */
export function encodeVector(vector: readonly number[]): string {
  const peak = Math.max(...vector.map((value) => Math.abs(value)));
  const scale = peak < 1e-9 ? 1 : peak;
  const bytes = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    bytes[i] = Math.max(-127, Math.min(127, Math.round((vector[i] / scale) * 127)));
  }
  const encoded = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  return `${scale.toFixed(6)}:${encoded}`;
}

/** Decodes and re-normalises, since quantisation costs the vector its unit length. */
export function decodeVector(encoded: string): number[] {
  const separator = encoded.indexOf(":");
  if (separator === -1) throw new Error("Malformed vector: expected `<scale>:<base64>`.");
  const scale = Number(encoded.slice(0, separator));
  const buffer = Buffer.from(encoded.slice(separator + 1), "base64");
  const bytes = new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const vector = Array.from(bytes, (byte) => (byte / 127) * scale);
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return length < 1e-9 ? vector : vector.map((value) => value / length);
}
