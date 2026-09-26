"""LLMClient for NuMind's NuExtract3, an extraction-tuned Qwen3.5-4B.

NuExtract3 is not told what to extract through a JSON Schema. It was trained
on its own *template*: the output's shape with each leaf replaced by a type
name,

    {"formulations": [{"Polymer": "string", "Tg": "number", ...}]}

plus optional plain-language `instructions`. Both are chat-template
variables, so on llama-server they travel in `chat_template_kwargs` (on
Ollama's official `numind/nuextract3` build they go in a
`{"role": "template"}` message instead). The model card recommends
non-thinking mode at temperature 0.2.

To keep the NuExtract3-vs-Qwen3.5-4B comparison about the model rather than
the plumbing:

- the template is generated from the same pydantic model the other clients
  get as a JSON Schema, so both arms are asked for identical fields;
- `instructions` is the same system-prompt text the other arms receive;
- the JSON Schema is *also* sent as `response_format`. llama.cpp compiles it
  into the output grammar, so this arm gets the same guarantees as the
  others: valid JSON, and the length bounds that stop a runaway string
  (schema.py's `_MAX_CHARS`). The grammar lists fields in template order,
  the order NuExtract3 was trained to emit them.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

from pipeline.extraction.llm_client.base import ExtractionRequest, ExtractionResponse
from pipeline.extraction.llm_client.openai_compatible_client import OpenAICompatibleClient
from pipeline.extraction.schema import _FLOAT_COLUMNS

_SKIPPED_COLUMNS = {"Anion Smiles"}  # filled from a lookup table, as in prompt.py


def nuextract_template(output_model: type[BaseModel]) -> dict[str, Any]:
    """NuExtract template for a model shaped `{"formulations": [record, ...]}`."""
    list_field = output_model.model_fields["formulations"]
    record_model = list_field.annotation.__args__[0]
    record = {
        field.alias: ("number" if field.alias in _FLOAT_COLUMNS else "string")
        for field in record_model.model_fields.values()
        if field.alias not in _SKIPPED_COLUMNS
    }
    return {"formulations": [record]}


class NuExtractClient(OpenAICompatibleClient):
    def extract_structured(
        self, request: ExtractionRequest, output_model: type[BaseModel]
    ) -> ExtractionResponse:
        kwargs = dict(self.extra_body.get("chat_template_kwargs", {}))
        template = json.dumps(nuextract_template(output_model), indent=4)
        kwargs["template"] = template
        kwargs["instructions"] = request.system_prompt
        kwargs.setdefault("enable_thinking", False)
        extra_body = {**self.extra_body, "chat_template_kwargs": kwargs}
        return self._complete(
            request,
            output_model,
            system_prompt=None,  # the instructions travel in the chat template instead
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": output_model.__name__,
                    "schema": output_model.model_json_schema(),
                    "strict": True,
                },
            },
            extra_body=extra_body,
            extra_prompt_chars=len(request.system_prompt) + len(template),
        )
