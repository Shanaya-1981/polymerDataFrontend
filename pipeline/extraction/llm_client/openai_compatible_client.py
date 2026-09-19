"""LLMClient implementation for self-hosted OpenAI-compatible chat-completions
servers (vLLM, TGI, Ollama, ...).

Written now, alongside claude_client.py, specifically to prove the
`LLMClient` interface (base.py) is genuinely provider-agnostic rather than
just designed to look that way -- untestable without a live endpoint, but
the interface is the thing being validated, not this implementation's
runtime behavior. Swapping to a self-hosted cluster model later is a
one-line config change (pipeline/config/settings.yaml), not a pipeline
rewrite.

API shapes below (response_format json_schema, image_url content parts)
were confirmed by introspecting the installed `openai` package
(TypedDicts in openai.types.chat.*) rather than assumed from training
data, since openai==3.16.2 is a much newer major version than typical
training-data knowledge of this SDK.
"""

from __future__ import annotations

import base64

import openai
from pydantic import BaseModel, ValidationError

from pipeline.extraction.llm_client.base import ExtractionRequest, ExtractionResponse


class OpenAICompatibleClient:
    def __init__(self, base_url: str, model: str, api_key: str | None = None):
        # Self-hosted servers usually don't check the key, but the SDK requires
        # a non-empty string.
        self.client = openai.OpenAI(base_url=base_url, api_key=api_key or "not-needed")
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
                    "type": "image_url",
                    "image_url": {"url": f"data:{image.media_type};base64,{data}"},
                }
            )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": request.system_prompt},
                    {"role": "user", "content": content},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": output_model.__name__,
                        "schema": output_model.model_json_schema(),
                        "strict": True,
                    },
                },
            )
        except openai.RateLimitError as e:
            return _error_response(self.model, f"rate_limit: {e}")
        except openai.APIConnectionError as e:
            return _error_response(self.model, f"connection_error: {e}")
        except openai.APIStatusError as e:
            return _error_response(self.model, f"api_status_error ({e.status_code}): {e.message}")

        choice = response.choices[0]
        text = choice.message.content or ""
        parsed = None
        validation_errors: list[str] = []
        try:
            parsed = output_model.model_validate_json(text)
        except ValidationError as e:
            validation_errors.append(str(e))

        return ExtractionResponse(
            parsed=parsed,
            raw_text=text,
            validation_errors=validation_errors,
            usage=response.usage.model_dump() if response.usage else {},
            model_name=response.model,
            stop_reason=choice.finish_reason,
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
