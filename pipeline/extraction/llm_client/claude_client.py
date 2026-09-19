"""Claude (Anthropic API) implementation of LLMClient.

Model choice: Claude Sonnet 5 (`claude-sonnet-5`) is the configured default
for this pipeline -- a deliberate, documented cost/quality tradeoff (see the
plan doc and study_session/session05.md), not a silent downgrade: Sonnet 5
is vision-capable with a 1M context window at roughly 1/8th Opus 5's price,
which matters for a 63-paper (and growing) batch. Opus 5 is one config
change away (pipeline/config/settings.yaml) for papers/columns later
flagged as hard by the evaluation harness -- that's the entire point of the
LLMClient abstraction.

Uses `client.messages.parse(..., output_format=SomeBaseModel)`, the SDK's
own structured-outputs helper -- it validates the response against the
pydantic model and hands back a real instance on `.parsed_output`, so this
client never hand-rolls JSON-Schema construction or manual json.loads.
"""

from __future__ import annotations

import base64

import anthropic
from pydantic import BaseModel

from pipeline.extraction.llm_client.base import ExtractionRequest, ExtractionResponse

DEFAULT_MODEL = "claude-sonnet-5"
MAX_TOKENS = 16000


class ClaudeClient:
    def __init__(self, model: str = DEFAULT_MODEL):
        self.client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        self.model = model

    def extract_structured(
        self, request: ExtractionRequest, output_model: type[BaseModel]
    ) -> ExtractionResponse:
        content: list[dict] = [{"type": "text", "text": request.text_content}]
        for image in request.images:
            data = base64.standard_b64encode(image.path.read_bytes()).decode("utf-8")
            content.append({"type": "text", "text": image.label})
            content.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": image.media_type, "data": data},
                }
            )

        try:
            response = self.client.messages.parse(
                model=self.model,
                max_tokens=MAX_TOKENS,
                system=[
                    {
                        "type": "text",
                        "text": request.system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": content}],
                output_format=output_model,
            )
        except anthropic.RateLimitError as e:
            return _error_response(self.model, f"rate_limit: {e}")
        except anthropic.APIConnectionError as e:
            return _error_response(self.model, f"connection_error: {e}")
        except anthropic.APIStatusError as e:
            return _error_response(self.model, f"api_status_error ({e.status_code}): {e.message}")

        text = next((b.text for b in response.content if b.type == "text"), "")
        parsed = None
        validation_errors: list[str] = []
        if response.stop_reason == "refusal":
            validation_errors.append(f"refusal: {getattr(response.stop_details, 'category', None)}")
        else:
            try:
                parsed = response.parsed_output
            except Exception as e:  # pydantic validation failure surfaced by the SDK helper
                validation_errors.append(str(e))

        return ExtractionResponse(
            parsed=parsed,
            raw_text=text,
            validation_errors=validation_errors,
            usage=response.usage.model_dump() if response.usage else {},
            model_name=response.model,
            stop_reason=response.stop_reason,
        )


def _error_response(model: str, message: str) -> ExtractionResponse:
    return ExtractionResponse(
        parsed=None,
        raw_text="",
        validation_errors=[message],
        usage={},
        model_name=model,
        stop_reason=None,
    )
