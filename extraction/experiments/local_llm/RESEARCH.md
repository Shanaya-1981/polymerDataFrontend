# On-device LLMs for extracting data from papers — research notes

_Compiled 2026-09-22. Model and runtime facts change monthly: re-check anything
here before relying on it. Measured results from this project's own benchmark
are in `SUMMARY.md` next to this file; this document is the desk research that
chose what to benchmark._

## The answer in one screen

The scientists who will use this pipeline work at a national lab whose machines
can't reach outside websites, so the extraction model has to run on their own
machine. The question was which open models do that well on a machine with
**8, 16 or 32 GB of RAM**.

| RAM | Recommended to benchmark | Why |
|---|---|---|
| 8 GB | **Qwen3.5-4B**; **NuExtract3** (Qwen3.5-4B fine-tuned for extraction) | Only ~1 GB of context memory at 32K tokens; best document/chart scores under 5 GB |
| 16 GB | **Qwen3.5-9B**; **Gemma 4 12B** (Google) | Fit even the longest paper with room to spare |
| 32 GB | Qwen3.6-35B-A3B or Qwen3.8-27B; Gemma 4 26B-A4B | Best open extraction/chart scores that fit |

- **Runtime:** llama.cpp's `llama-server` for measuring. Ollama or the
  llama-server zip for deploying. Both run the same GGUF model files on macOS,
  Windows and Linux, with or without a GPU.
- **In a browser:** not practical at 8 GB. At 16 GB it's prototype quality with
  a 4B model. MinerU (the PDF parser) has no browser version at all.
- **Model origin:** every top pick above except Gemma is derived from Alibaba's
  Qwen. No federal rule bans Qwen as of July 2026, but a lab may have its own
  policy, so each tier also has a Gemma option.

## 1. What the task demands (measured on this corpus, 63 papers)

| | median | p90 | max |
|---|---|---|---|
| Paper text, tokens (≈ characters ÷ 3.5) | 9K | 20K | 27K |
| System prompt + field guide | 1.4K | | |
| Figure crops per paper | 9 | 25 | 32 |
| Formulations per paper (golden CSV) | 7 | 22 | 32 |

- A fully filled 76-field record is ~650 output tokens, so the largest papers
  need 10–20K output tokens.
- **Output is the slow part on a laptop.** Generation runs at roughly 10–25
  tokens/s against 150–300 tokens/s for reading the prompt (measured on an M4
  MacBook Air: Qwen3.5-4B reads 287–315 tok/s and writes 24–26 tok/s).
- **Context needed:** ~48K tokens text-only, ~64K with figures.

## 2. Why models released in 2026 change what fits

A model needs memory for its weights **and** for its context window, the "KV
cache". For a standard-attention model the KV cache grows with every token.
Qwen3-4B (2025): 36 layers × 8 KV heads × 128 dims × 2 (K and V) × 2 bytes =
**144 KiB per token, 4.5 GB at 32K tokens**. That's more than its weights.

2026 models mostly replace standard attention with layers whose memory doesn't
grow:

- **Qwen3.5 family:** 3 of every 4 layers are Gated DeltaNet layers with a
  fixed-size state. Qwen3.5-4B keeps standard attention in only 8 of 32 layers
  (4 KV heads × 256 dims), so **32 KiB per token, ~1 GB at 32K**. Measured here:
  llama.cpp allocated 1,586 MiB of context memory for 48K tokens, matching the
  arithmetic plus ~50 MiB of fixed DeltaNet state.
- **Gemma 4:** most layers use a 1,024-token sliding window; only a few global
  layers keep the full context.
- **Nemotron 3 Nano, Granite 4:** Mamba-2 hybrids, with a handful of attention
  layers.

So at 65K tokens the 2025 models need 6–17 GB of KV cache (Qwen3-VL-8B 9.4 GB,
Ministral-3-14B 10.4 GB) against 0.4–4 GB for the 2026 models. **That, more
than parameter count, rules the 2025 generation out of the 8 and 16 GB tiers.**

**Memory budget per tier.** macOS lets the GPU use about ⅔ of RAM by default
(Metal's `recommendedMaxWorkingSetSize`): ~5.3 GB on an 8 GB Mac, ~10.7 GB on
16 GB, ~21 GB on 32 GB. (On this 24 GB M4 it reports 18,186 MiB, about 74%.)
Windows caps an integrated GPU at half of RAM. It can be raised on a Mac with
`sudo sysctl iogpu.wired_limit_mb=<MB>`; the setting resets at reboot.

## 3. Candidates by tier

Sizes are the Q4_K_M GGUF file unless noted. Benchmark numbers are
vendor-reported unless marked otherwise, usually measured at full precision,
not at Q4. Treat them as a way to pick candidates, not as results.

### 8 GB (≤ ~5 GB total)

| Model | Q4 size (+ vision) | KV per 1K tokens | Relevant scores | License |
|---|---|---|---|---|
| **Qwen3.5-4B** (2026-03) | 2.74 GB (+0.67) | 32 MB | IFEval 89.8; AA-LCR 57.0; OCRBench 85.0; CharXiv-RQ 70.8; OmniDocBench 86.2 | Apache-2.0 |
| **NuExtract3** (NuMind, 2026-05) | 2.78 GB (+0.68) | 32 MB | NuMind's 600-document extraction test: 0.651 vs 0.417 for its base model; ExtractBench 81.0 | Apache-2.0 |
| Nemotron 3 Nano 4B (NVIDIA, 2026-03) | 2.84 GB | ~16 MB | RULER-128K 91.1 without reasoning; no extraction evidence yet | NVIDIA open license |
| Gemma 4 E2B (Google, 2026-04) | 3.35 GB official 4-bit (+0.99) | ~6 MB | Weak on charts (ChartQA 43.5 per Liquid AI's tests) | Apache-2.0 |
| Granite Vision 4.1 (IBM, 2026-04) | ~2.1 GB | ? | VAREX key-value extraction 94.2% | Apache-2.0 |

Ruled out:

| Model | Reason |
|---|---|
| Qwen3-VL-4B, InternVL3.5-4B | 144 MB/1K KV (InternVL3.5 also has only 32K context) |
| LFM2.5-VL-3B | 32K context; license has a revenue cap |
| Gemma 4 E4B | 6.1 GB at 4-bit, over budget |
| SmolLM3, Phi-4-mini | Weaker, and heavy KV |

### 16 GB (≤ ~10.7 GB)

| Model | Q4 size (+ vision) | KV per 1K | Relevant scores | License |
|---|---|---|---|---|
| **Qwen3.5-9B** (2026-03) | 5.68 GB (+0.92) | 32 MB | IFEval 91.5; AA-LCR 63.0; OCRBench 89.2; CharXiv-RQ 73.0; MMLongBench-Doc 57.7. One independent paper measured ChartQA at only 70.7 | Apache-2.0 |
| **Gemma 4 12B** (Google, 2026-06/07) | 6.98 GB official 4-bit (+0.18) | 8–16 MB | AA-LCR 63.7%; MRCR-128K 43.4%; no published ChartQA/CharXiv | Apache-2.0 |
| NuExtract3 at Q8_0 | 4.61 GB | 32 MB | Same model as above, less compressed | Apache-2.0 |
| Datalab lift 9B | ≈ Qwen3.5-9B | 32 MB | Datalab's test: 90.2% field accuracy; ExtractBench 78.4 | Modified OpenRAIL-M (research / <$5M) |

Ruled out:

| Model | Reason |
|---|---|
| Qwen3-VL-8B, InternVL3.5-8B, MiniCPM-V 4.5 | 144 MB/1K KV |
| Ministral 3 8B/14B | 136–160 MB/1K KV |
| Phi-4-reasoning-vision | 16K context |
| gpt-oss-20b | 12.1 GB, too big; thinking can't be turned off |

### 32 GB (≤ ~21 GB) — not run in this benchmark; research only

| Model | Q4 size | Notes |
|---|---|---|
| Qwen3.6-35B-A3B (2026-04) | IQ4_XS 17.7 GB (+0.9) | Best open model on ExtractBench (88.1 overall). Only 3B parameters active per token, so it generates fast |
| Qwen3.8-27B (2026-08) | 16.8–17.8 GB (+0.93) | Best chart reasoning that fits (CharXiv-RQ 83.7; AA-LCR 82%). Dense, so slow: ~5 tok/s on a base M4 (estimate). Needs `--jinja` and thinking off |
| Gemma 4 26B-A4B (Google) | 14.4 GB official 4-bit (+1.19) | Non-Chinese; ExtractBench 70.3 |
| Muse Glimmer 30B (Meta, 2026-08) | 16.8 GB (+1.4) | Non-Chinese, very small KV. Six weeks old, no extraction benchmark yet, inconsistent context spec |

### Why NuExtract3 is not a drop-in replacement

NuExtract3 is not given a JSON Schema. It takes its own **template**: the
output's shape with each value replaced by a type name
(`{"formulations": [{"Tg": "number", "Anion": "string"}]}`), plus optional
plain-language `instructions`. Both are chat-template variables: on
llama-server they go in `chat_template_kwargs`, on Ollama's official
`numind/nuextract3` build in a `{"role": "template"}` message. It returns
`null` for missing fields. Its card recommends non-thinking mode at
temperature 0.2.

In this project, `pipeline/extraction/llm_client/nuextract_client.py` builds
the template from the same pydantic model the other arms get as a schema, and
sends the same instructions text.

## 4. What the extraction literature says

- **Valid JSON doesn't mean correct values.** In the Structured Output
  Benchmark, every model exceeded 84% valid JSON but none exceeded 83% correct
  values ([arXiv 2604.25359](https://arxiv.org/html/2604.25359v1)). Its inputs
  were short (~900 tokens, 4-field schemas), though, so it says little about
  our task.
- **Every model loses records on long documents.** On ExtractBench's long
  documents even the best open model scores 36.9 and GPT-6 Astra 31.7, mostly
  from missed records
  ([leaderboard, 2026-09-11](https://raw.githubusercontent.com/run-llama/ExtractBench/main/leaderboard.csv)).
  A 369-field schema produced 0% valid output from frontier models
  ([arXiv 2602.12247](https://arxiv.org/html/2602.12247v2)).
- **Below 4B parameters the main failure is the schema, not the reading.**
  Small models echo the schema back instead of filling it, and extraction
  fine-tuning of a 2B model added 81 points
  ([VAREX, arXiv 2603.15118](https://arxiv.org/abs/2603.15118)). This is the
  case for NuExtract3.
- **Splitting the job into smaller calls helps.** Evidence: schema
  decomposition ([SSRN 7493274](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7493274)),
  row-by-row table extraction reaching F1 96.8
  ([MaTableGPT](https://arxiv.org/abs/2406.05431)), and two-phase
  list-then-fill ([L3X](https://arxiv.org/abs/2405.02732)).
- **Values read off plots are the least reliable, even for frontier models.**
  They scored 94.9% on text and table values but 83.5% on figure-digitised
  ones, and two frontier models agreed on only 47.8% of figure values
  ([arXiv 2604.07584](https://arxiv.org/html/2604.07584v1)). That matters for
  MinerU's `~` rows.
- **A small local model in a good pipeline can match a frontier model.** In
  ChemX (NeurIPS 2025), gpt-oss-20b with markdown preprocessing scored F1
  0.61 against 0.58 for the same pipeline on GPT-5. GPT-5's thinking mode
  scored 0.02, and every system failed at SMILES
  ([arXiv 2510.00795](https://arxiv.org/html/2510.00795)).
- **Where it breaks is units and notation.** In alloy data extraction, all 49
  text hallucinations were composition arithmetic and 28 of 32 table
  hallucinations were wt% vs at% confusion
  ([PMC13336656](https://pmc.ncbi.nlm.nih.gov/articles/PMC13336656/)). The
  same risk exists here with EO:Li ratios vs wt% vs mol%.
- **4-bit compression can hurt more on long inputs**, by up to 59% for some
  methods and models, though GGUF K-quants weren't tested
  ([EMNLP 2025, arXiv 2505.20276](https://arxiv.org/abs/2505.20276)). Hence
  the Q4-vs-Q8 arm.

## 5. Runtimes

| | JSON schema enforced? | Prompt longer than the context | Default context | Notes |
|---|---|---|---|---|
| **llama.cpp `llama-server`** | Yes; an unsupported schema returns HTTP 400 | HTTP 400 `exceed_context_size_error` (verified here) | Model's own, but `--fit` (on by default) shrinks it to fit memory if `-c` isn't set | MIT; prebuilt for every OS and backend; `--offline`; memory breakdown at `-lv 4` |
| **Ollama** (v0.34.3) | Yes, but an unknown schema type is silently ignored | **Silently truncated** to ~half the context; only a warning in the server log | **4,096 on every 8/16/32 GB Mac**; the OpenAI-style API can't change it | MIT; easiest offline install (Windows without admin rights); Brookhaven has used it in lab systems ([OSTI 2588580](https://www.osti.gov/servlets/purl/2588580)) |
| LM Studio (0.4.25) | Yes | HTTP 400 | 4,096 | Closed-source freeware; headless install needs the internet |
| MLX `mlx_lm.server` | **Silently ignored** | n/a | `max_tokens` 512 | Mac-only. Faster than llama.cpp on Apple Silicon, but not portable |

Defaults that break a local run, and what this project does about each:

- **`openai` SDK (3.16.2) waits 600 s, then retries twice**, re-sending the
  whole request. A slow paper wastes ~30 minutes. → timeout 3600 s, 0 retries.
- **No `max_tokens` sent** lets mlx stop at 512 tokens. **No temperature
  sent** lets Ollama sample at 0.8. → both set explicitly.
- **Qwen's recommended `presence_penalty` 1.5** pushes the model away from
  tokens it has already written. In a list of formulations the anion, polymer
  and units correctly repeat. → set to 0.
- **Ollama's silent truncation.** → the client compares the server's
  `prompt_tokens` with the size of what was sent, and fails if it is under
  1 token per 6 characters. Measured ratio for these papers: ~3.1.
- **Prompt caching.** With it on, a repeated prompt skipped 6,901 of its 6,905
  tokens (0.13 s instead of 24 s). → off for benchmarking, so timings are cold
  reads.
- **Thinking mode.** llama.cpp doesn't enforce a JSON schema while a model is
  thinking ([issue #20345](https://github.com/ggml-org/llama.cpp/issues/20345)).
  → `--reasoning off` plus `enable_thinking: false`.

## 6. In a browser

| Runtime | Vision models | Structured output | Notes |
|---|---|---|---|
| **wllama** (llama.cpp → WASM/WebGPU) | Yes (v3) | Same `json_schema` handling as native llama.cpp | Reads the same GGUF files; 2 GB per file, so split models |
| transformers.js v4.3 | Widest: Qwen3.5, Gemma 4, Qwen3-VL, OCR models | JSON Schema, experimental (v4.3, Sep 2026) | ONNX models |
| WebLLM | Only Phi-3.5-vision prebuilt | XGrammar, own format | 4K default context |
| Chrome Prompt API (Gemini Nano) | Yes | `responseConstraint` | **Downloads its model from Google: not viable air-gapped** |

- **Verdict:** at 8 GB a browser tab can use only ~4–5.3 GB of GPU memory,
  not enough for a 4B vision model with a long context. 16 GB is prototype
  quality: text-first, 4B. 32 GB is workable.
- **Other blockers:**
  - WebGPU is missing on Linux and on Firefox ESR 140.
  - **MinerU has no browser equivalent.** Candidates are PDF.js (text only,
    born-digital PDFs), Granite-Docling-258M on WebGPU, and LightOnOCR.
- **Best route if it's ever built:** wllama. It uses the same model files and
  request shape as the native pipeline.
- **What a browser version would actually buy** at a locked-down lab is *no
  install*. It isn't privacy: the native version is just as local.

## 7. Deploying at an air-gapped lab

- **Ship:**
  - the runtime: the Ollama installer, or the `llama-server` zip for the
    lab's OS;
  - the GGUF model file, plus its `mmproj` file if figures are used.

  Both copy across on a USB stick.
- **Ollama settings:** `ollama create` from a Modelfile with
  `PARAMETER num_ctx 49152` and `PARAMETER temperature 0.2`. Set
  `OLLAMA_CONTEXT_LENGTH`, `OLLAMA_KV_CACHE_TYPE=q8_0` and
  `OLLAMA_NO_CLOUD=1`.
- **Verify on the target machine** that `prompt_tokens` for a long paper is
  what you'd expect. **This is the one check that catches Ollama's silent
  truncation.**
- **MinerU must also run offline**, since it's the other half of the
  pipeline. Not yet verified.

## 8. Provenance and licenses

- **Chinese-origin models:** the FY2026 NDAA and intelligence-community rules
  restrict **DeepSeek** specifically. No federal order names Qwen as of
  2026-07-21 (overviews:
  [Vibranium Labs](https://vibraniumlabs.ai/blog/chinese-ai-models-sanctioned-whats-actually-happening),
  [Sheppard Mullin](https://www.sheppard.com/insights/blogs/us-vs-chinese-ai-models-export-control-risks)).
  Individual labs may still restrict them, so ask.
- **All picks are Apache-2.0.**
- **Licenses to watch:**
  - Liquid AI's LFM models: revenue cap, with a research carve-out that needs
    legal review for a lab.
  - NuExtract-2.0-4B: non-commercial, unlike NuExtract3.
  - Datalab lift: modified OpenRAIL-M.
  - EXAONE: non-commercial.

## 9. What is not verified

- **Benchmark scores are mostly vendor-reported, and evaluators disagree.**
  Qwen3.5-9B's ChartQA is 70.7 in one evaluation and 84.2 in another.
  Qwen3.6-27B's OmniDocBench is 89.4 per Qwen and 77.8 per Meta. Each
  company's extraction benchmark favours its own model.
- **Speeds other than those measured on this machine are estimates.**
- **One unconfirmed report (llama.cpp #29251, 2026-09-21)** says llama.cpp's
  Qwen3-VL image path scores worse than the reference implementation. Worth
  cross-checking if figures turn out to matter.

## Sources

Model cards (read 2026-09-22):
- [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- [NuExtract3](https://huggingface.co/numind/NuExtract3), with its
  [GGUF](https://huggingface.co/numind/NuExtract3-GGUF) and
  [Ollama build](https://ollama.com/numind/nuextract3)
- [Gemma 4 12B](https://huggingface.co/google/gemma-4-12B-it) and the
  [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4)
- [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B)
- [Nemotron 3 Nano 4B](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16)
- [Granite Vision 4.1](https://huggingface.co/ibm-granite/granite-vision-4.1-4b)
- [Muse Glimmer 30B](https://huggingface.co/meta-models/Muse-Glimmer-30B)
- [Datalab lift](https://huggingface.co/datalab-to/lift)
- [LFM license](https://www.liquid.ai/lfm-license)

GGUF files, with exact sizes checked against the Hugging Face file API:
- [unsloth/Qwen3.5-4B-GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), [unsloth/Qwen3.5-9B-GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF)
- [google/gemma-4-12B-it-qat-q4_0-gguf](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf), [google/gemma-4-E2B-it-qat-q4_0-gguf](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf)

Leaderboards and comparisons:
- [ExtractBench leaderboard](https://raw.githubusercontent.com/run-llama/ExtractBench/main/leaderboard.csv) (2026-09-11)
- [AA-LCR long-context scores](https://benchlm.ai/benchmarks/lcr)
- [Artificial Analysis: Gemma 4 12B vs Qwen3.5-9B](https://artificialanalysis.ai/models/releases/comparisons/gemma-4-12b-vs-qwen3-5-9b)

Runtimes:
- llama.cpp: [server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [grammars](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)
- Ollama: [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [context length](https://docs.ollama.com/context-length), [FAQ](https://docs.ollama.com/faq), [truncation code](https://github.com/ollama/ollama/blob/v0.34.3/llm/llama_server.go)
- LM Studio: [structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output)
- mlx-lm: [SERVER.md](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md)
- macOS GPU memory limit: [llama.cpp discussion #2182](https://github.com/ggml-org/llama.cpp/discussions/2182)

Browser runtimes:
- [wllama v3](https://github.com/ngxson/wllama/blob/master/guides/intro-v3.md)
- [transformers.js 4.3](https://github.com/huggingface/transformers.js/releases/tag/4.3.0)
- [WebLLM](https://github.com/mlc-ai/web-llm)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) and its [enterprise policy](https://chromeenterprise.google/policies/#GenAILocalFoundationalModelSettings)
- [WebGPU implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- [Granite-Docling on WebGPU](https://huggingface.co/spaces/ibm-granite/granite-docling-258M-WebGPU)
