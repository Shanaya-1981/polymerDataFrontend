"""Provider-agnostic interface for structured extraction calls.

The whole point of this module: nothing here mentions Anthropic, OpenAI,
vLLM, or any other provider. `ExtractionRequest`/`ExtractionResponse` are
plain data. `claude_client.py` and `openai_compatible_client.py` both
implement `LLMClient` against this same shape -- swapping providers is a
config change (see pipeline/config/settings.yaml), never a pipeline-logic
change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel


@dataclass
class ImageInput:
    path: Path
    media_type: str  # e.g. "image/png"
    label: str  # citation-friendly label shown to the model right before the image


@dataclass
class ExtractionRequest:
    paper_id: str
    system_prompt: str
    text_content: str
    images: list[ImageInput] = field(default_factory=list)


@dataclass
class ExtractionResponse:
    parsed: BaseModel | None
    raw_text: str
    validation_errors: list[str]
    usage: dict[str, Any]
    model_name: str
    stop_reason: str | None


class LLMClient(Protocol):
    def extract_structured(
        self, request: ExtractionRequest, output_model: type[BaseModel]
    ) -> ExtractionResponse: ...
