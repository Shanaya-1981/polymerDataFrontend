# Session 3 (cont'd) — Milestone 3: Swappable LLM Client

## Summary

Built the `LLMClient` abstraction (`pipeline/extraction/llm_client/`) with
two implementations — `ClaudeClient` (real, Anthropic API) and
`OpenAICompatibleClient` (written against the same interface, for future
self-hosted models on a compute cluster) — plus a config file
(`pipeline/config/settings.yaml`) and factory function that picks between
them. Verified the wiring end-to-end for both providers (client
construction, not live API calls yet — that's Milestone 4).

## Teaching Points

### What "swappable" actually means in code, not just in a diagram

It's easy to say "make it swappable" and mean "put an if-statement
somewhere." The actual test used here: `base.py` (`ExtractionRequest`,
`ExtractionResponse`, the `LLMClient` Protocol) contains **zero** references
to Anthropic or OpenAI — no `anthropic.Message`, no `ChatCompletion`, just a
paper id, a system prompt string, plain text, and a list of `(path,
media_type, label)` tuples for images. Both `claude_client.py` and
`openai_compatible_client.py` translate that plain data into their own
provider's request shape internally, and translate the response back into
the same plain `ExtractionResponse`. Nothing upstream (the prompt builder,
the batch runner) will ever import `anthropic` or `openai` directly — only
`factory.py` does, and only to decide *which* class to instantiate.

**A concrete way to check whether an abstraction like this is real**: could
you delete one implementation file entirely and have the other one keep
working with zero edits anywhere else? Here, yes — `claude_client.py` and
`openai_compatible_client.py` don't know about each other, and
`factory.py` is the only file that imports both.

### Why write the untestable client anyway

`OpenAICompatibleClient` can't be exercised against a real server in this
session — there's no self-hosted vLLM/TGI/Ollama endpoint running. It got
written anyway, for a specific reason: a single implementation behind an
interface tells you nothing about whether the interface itself is well
shaped. It's easy to accidentally design an interface around the one
provider you're actually using (e.g., a method parameter that's secretly
Anthropic-shaped). Writing a *second*, structurally different
implementation against the same `base.py` is what actually forces the
abstraction to be honest — and it did: building `OpenAICompatibleClient`
confirmed `ExtractionRequest`'s plain-data image list (path + media_type +
label) was sufficient to build both Anthropic's `image` content blocks
*and* OpenAI's `image_url` data-URI blocks without changing `base.py` at
all.

### Don't trust training-data memory of fast-moving SDKs

The installed `openai` package is version 3.16.2 — a much newer major
version than what's typically remembered from training. Rather than writing
`response_format={"type": "json_object", ...}` (an older, less precise
pattern) from memory, the actual installed package was introspected
directly:

```python
from openai.types.chat import completion_create_params as p
# ... inspect.getsource() on the real TypedDict definitions
```

This confirmed the exact current shape (`{"type": "json_schema",
"json_schema": {"name", "schema", "strict"}}`) and the image content-part
shape (`{"type": "image_url", "image_url": {"url": "data:..."}}`) straight
from the library actually installed on this machine, rather than guessing
and finding out it was wrong later, potentially, silently (a wrong key name
in a TypedDict doesn't always error immediately — it can just get ignored).
**Lesson**: for any library where you're not 100% certain the exact
call shape is current, a two-second `inspect.getsource()` on the real
installed version is cheap insurance against confidently-wrong code — the
same instinct as running MinerU once and reading its actual JSON in the
previous milestone, applied to a Python package instead of a CLI tool.

### The model choice is a config value, not a hardcoded string

`claude_client.py` defaults to `claude-sonnet-5`, but that default only
lives in one place (`pipeline/config/settings.yaml`), with a comment
explaining *why* (cost/quality tradeoff for a 63-paper, vision-heavy batch,
not a blanket "cheaper is better" choice) and how to override it (bump to
`claude-opus-5` for specific hard cases once the evaluation harness — not
yet built — identifies where Sonnet underperforms). Config values that
encode a *reasoned* choice, with the reasoning written down next to the
value, age much better than the same choice buried as a magic string deep
in a function.

## What's Next

- Milestone 4: the pydantic `FormulationRecord` schema (built from
  `pipeline/schema_columns.py`'s 76 `REPORTED_COLUMNS`), prompt assembly,
  and a live extraction test against the Milestone 2 sample papers.
- **Needed from you before Milestone 4's live test can run**: an
  `ANTHROPIC_API_KEY`. Copy `.env.example` to `.env` and fill it in (the
  `.env` file is gitignored, so the key never gets committed). Everything
  else in this milestone was verified structurally (client construction,
  config wiring, factory dispatch for both providers) without needing one.
