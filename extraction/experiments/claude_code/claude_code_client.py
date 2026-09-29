"""An LLMClient (pipeline/extraction/llm_client/base.py) answered by Claude
through util/claudeAPIMock.py's ask_llm(), so pipeline code written against
that interface -- here the multistage calls -- can run on Claude via Claude
Code with no change to the pipeline.

It lives with the experiment because the pipeline isn't wired to the mock yet.
Like the other clients it returns failures as validation_errors instead of
raising. Its usage has only wall_seconds: ask_llm() returns the reply text and
no token counts.
"""

from __future__ import annotations

import time

from pydantic import BaseModel, ValidationError

from pipeline.extraction.llm_client.base import ExtractionRequest, ExtractionResponse
from util.claudeAPIMock import ask_llm


class ClaudeCodeClient:
    def __init__(self, model: str):
        self.model = model

    def extract_structured(self, request: ExtractionRequest, output_model: type[BaseModel]) -> ExtractionResponse:
        started = time.monotonic()
        reply, parsed, errors = "", None, []
        try:
            reply = ask_llm(
                request.text_content,
                system=request.system_prompt,
                model=self.model,
                json_schema=output_model.model_json_schema(),
                images=[(image.path, image.label) for image in request.images],
            )
            parsed = output_model.model_validate_json(reply)
        except (RuntimeError, ValueError, ValidationError) as e:
            errors.append(str(e))
        return ExtractionResponse(
            parsed=parsed,
            raw_text=reply,
            validation_errors=errors,
            usage={"wall_seconds": round(time.monotonic() - started, 2)},
            model_name=self.model,
            stop_reason=None,
        )
