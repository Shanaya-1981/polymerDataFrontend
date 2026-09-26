"""LLMClient implementation for self-hosted OpenAI-compatible chat-completions
servers (llama.cpp's llama-server, vLLM, Ollama, LM Studio, ...).

Written alongside claude_client.py to prove the `LLMClient` interface
(base.py) is genuinely provider-agnostic; first exercised for real against
llama-server when the pipeline moved to on-device models.

API shapes below (response_format json_schema, image_url content parts)
were confirmed by introspecting the installed `openai` package
(TypedDicts in openai.types.chat.*) rather than assumed from training
data, since openai==3.16.2 is a much newer major version than typical
training-data knowledge of this SDK.

Defaults that matter for a local server, each of which silently broke or
would have broken a real run:

- The SDK waits 600 s for a response and then *retries twice*, re-sending
  the whole request each time. A 4B model on a laptop can take longer than
  10 minutes on a long paper, so the SDK default would give up, resend, and
  burn ~30 minutes to fail. Hence a long timeout and no retries -- the same
  lesson as MinerU's `--wait` timeout (agentSessions/session01.md bug #3).
- Servers pick their own `max_tokens` and `temperature` when none is sent
  (mlx-lm stops at 512 tokens -- cut-off JSON; Ollama samples at 0.8).
- Qwen's recommended `presence_penalty` of 1.5 penalises every token that
  has already appeared, which is exactly wrong for extraction: the 10th
  formulation's anion is *supposed* to repeat the first one's "TFSI".
- Ollama silently truncates an over-long prompt to about half its context
  window (4,096 tokens by default on every 8-32 GB Mac), so a 20K-token paper
  arrives as ~2K tokens with no error. `usage.prompt_tokens` is the only
  trace, so it is checked against the size of what was sent.
"""

from __future__ import annotations

import base64
import time
from typing import Any

import openai
from pydantic import BaseModel, ValidationError

from pipeline.extraction.llm_client.base import ExtractionRequest, ExtractionResponse

DEFAULT_TIMEOUT_S = 3600.0
DEFAULT_MAX_TOKENS = 24576

# No tokenizer in use produces fewer than one token per this many characters
# of our papers' text. Measured: Qwen3.5 tokenised bdf71b01's full prompt
# (21,080 characters) as 6,905 tokens, i.e. ~3.1 characters per token --
# numbers, units and chemical names tokenise densely. A reported prompt below
# chars / 6 is therefore not an efficiently tokenised prompt; it is one the
# server cut (Ollama's truncation keeps only about half its context window).
MAX_CHARS_PER_TOKEN = 6.0


class OpenAICompatibleClient:
    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str | None = None,
        *,
        timeout: float = DEFAULT_TIMEOUT_S,
        max_retries: int = 0,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = 0.2,
        top_p: float | None = None,
        presence_penalty: float = 0.0,
        seed: int | None = None,
        extra_body: dict[str, Any] | None = None,
    ):
        # Self-hosted servers usually don't check the key, but the SDK requires
        # a non-empty string.
        self.client = openai.OpenAI(
            base_url=base_url,
            api_key=api_key or "not-needed",
            timeout=timeout,
            max_retries=max_retries,
        )
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.top_p = top_p
        self.presence_penalty = presence_penalty
        self.seed = seed
        self.extra_body = extra_body or {}

    def _sampling_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "presence_penalty": self.presence_penalty,
        }
        if self.top_p is not None:
            kwargs["top_p"] = self.top_p
        if self.seed is not None:
            kwargs["seed"] = self.seed
        return kwargs

    def extract_structured(
        self, request: ExtractionRequest, output_model: type[BaseModel]
    ) -> ExtractionResponse:
        return self._complete(
            request,
            output_model,
            system_prompt=request.system_prompt,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": output_model.__name__,
                    "schema": output_model.model_json_schema(),
                    "strict": True,
                },
            },
            extra_body=self.extra_body,
        )

    def _complete(
        self,
        request: ExtractionRequest,
        output_model: type[BaseModel],
        *,
        system_prompt: str | None,
        response_format: dict[str, Any] | None,
        extra_body: dict[str, Any],
        extra_prompt_chars: int = 0,
    ) -> ExtractionResponse:
        """Send one chat request and validate the reply.

        Shared with NuExtractClient, which sends its instructions and template
        through the chat template (`extra_body`) rather than as a system
        message; `extra_prompt_chars` counts that text for the truncation
        check.
        """
        content: list[dict] = [{"type": "text", "text": request.text_content}]
        for image in request.images:
            data = base64.standard_b64encode(image.path.read_bytes()).decode("utf-8")
            content.append({"type": "text", "text": image.label})
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{image.media_type};base64,{data}"},
                }
            )

        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": content})

        create_kwargs: dict[str, Any] = {"model": self.model, "messages": messages, **self._sampling_kwargs()}
        if response_format is not None:
            create_kwargs["response_format"] = response_format
        if extra_body:
            create_kwargs["extra_body"] = extra_body

        started = time.monotonic()
        try:
            response = self.client.chat.completions.create(**create_kwargs)
        # APITimeoutError is a subclass of APIConnectionError, so it must be
        # caught first to be reported as what it is.
        except openai.APITimeoutError as e:
            return _error_response(self.model, f"timeout after {time.monotonic() - started:.0f}s: {e}")
        except openai.RateLimitError as e:
            return _error_response(self.model, f"rate_limit: {e}")
        except openai.APIConnectionError as e:
            return _error_response(self.model, f"connection_error: {e}")
        except openai.APIStatusError as e:
            # llama-server reports an over-long prompt here as a 400
            # (`exceed_context_size_error`) rather than truncating it.
            return _error_response(self.model, f"api_status_error ({e.status_code}): {e.message}")
        wall_seconds = time.monotonic() - started

        choice = response.choices[0]
        text = choice.message.content or ""

        usage: dict[str, Any] = response.usage.model_dump() if response.usage else {}
        usage["wall_seconds"] = round(wall_seconds, 2)
        # llama-server adds prompt/decode speed as a non-OpenAI top-level
        # field; the SDK keeps unknown fields in `model_extra`.
        usage["timings"] = (response.model_extra or {}).get("timings")

        validation_errors: list[str] = []
        if choice.finish_reason == "length":
            validation_errors.append(
                f"output_truncated: generation stopped at the token limit "
                f"({usage.get('completion_tokens')} tokens), so the JSON is cut off"
            )
        sent_chars = len(system_prompt or "") + len(request.text_content) + extra_prompt_chars
        floor = prompt_tokens_floor(sent_chars)
        prompt_tokens = usage.get("prompt_tokens")
        if prompt_tokens is not None and prompt_tokens < floor:
            validation_errors.append(
                f"prompt_truncated: server reports {prompt_tokens} prompt tokens for "
                f"{sent_chars} characters sent (expected at least {floor}); the server "
                f"probably cut the paper to fit its context window"
            )

        parsed = None
        if not validation_errors:
            try:
                parsed = output_model.model_validate_json(text)
            except (ValidationError, ValueError) as e:
                validation_errors.append(str(e))

        return ExtractionResponse(
            parsed=parsed,
            raw_text=text,
            validation_errors=validation_errors,
            usage=usage,
            model_name=response.model,
            stop_reason=choice.finish_reason,
        )


def prompt_tokens_floor(chars: int) -> int:
    """Fewest prompt tokens a faithful server could report for `chars` of text."""
    return int(chars / MAX_CHARS_PER_TOKEN)


def _error_response(model: str, message: str) -> ExtractionResponse:
    return ExtractionResponse(
        parsed=None,
        raw_text="",
        validation_errors=[message],
        usage={},
        model_name=model,
        stop_reason=None,
    )
