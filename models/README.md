# Committed embedding model

`Xenova/all-MiniLM-L6-v2`, int8-quantised ONNX, ~23MB across four files.

Committed rather than downloaded, for three reasons:

1. **It has to exist in production.** Vercel's filesystem is read-only outside
   `/tmp`, so a runtime download has nowhere to land. Without these files the
   semantic-similarity factor scores its neutral value and the app silently runs
   on three factors instead of four.
2. **An embedding is only comparable to another from the same model.** The 255
   committed prompt vectors in `src/lib/retrieval/prompt-vectors.ts` were produced
   by exactly these bytes. Pinning a model *name* does not pin its weights;
   pinning the file does.
3. **No network at inference.** `env.allowRemoteModels` is set to false, so the
   library cannot reach the Hugging Face hub even if a path is wrong — it fails
   loudly instead of quietly fetching something else.

Regenerate by deleting this directory, running any script that embeds (the
library downloads to `.model-cache/`), then copying `.model-cache/Xenova` here.
Re-run `scripts/precompute-prompt-vectors.mts` afterwards: different weights mean
the committed vectors no longer describe the same space.
