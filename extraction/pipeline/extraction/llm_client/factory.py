"""Config-driven LLMClient factory -- the one place that knows about
concrete provider classes. Everything else in the pipeline depends only on
the LLMClient Protocol (base.py).
"""

from __future__ import annotations

from typing import Any

from pipeline.config_loader import Config
from pipeline.extraction.llm_client.base import LLMClient
from pipeline.extraction.llm_client.claude_client import ClaudeClient
from pipeline.extraction.llm_client.nuextract_client import NuExtractClient
from pipeline.extraction.llm_client.openai_compatible_client import OpenAICompatibleClient

# Optional settings passed straight through to OpenAICompatibleClient when
# present (and not null) in a provider block; anything absent keeps the
# client's own default. See the openai_compatible block in settings.yaml.
_LOCAL_SERVER_OPTIONS = (
    "timeout",
    "max_retries",
    "max_tokens",
    "temperature",
    "top_p",
    "presence_penalty",
    "seed",
    "extra_body",
)


def get_llm_client(config: Config) -> LLMClient:
    return build_llm_client(config.llm_provider, config.llm_settings)


def build_llm_client(provider: str, settings: dict[str, Any]) -> LLMClient:
    """Build a client from a provider name and its settings block.

    Split out of get_llm_client so the benchmark runner can build clients
    from its own per-arm settings without writing them into settings.yaml.
    """
    if provider == "anthropic":
        return ClaudeClient(model=settings["model"])
    if provider in ("openai_compatible", "nuextract"):
        if not settings.get("model"):
            raise ValueError(f"llm.{provider}.model is not set in pipeline/config/settings.yaml")
        options = {k: settings[k] for k in _LOCAL_SERVER_OPTIONS if settings.get(k) is not None}
        # NuExtract3 is served the same way but prompted with its own
        # template (nuextract_client.py).
        client_class = NuExtractClient if provider == "nuextract" else OpenAICompatibleClient
        return client_class(
            base_url=settings["base_url"],
            model=settings["model"],
            api_key=settings.get("api_key"),
            **options,
        )
    raise ValueError(f"Unknown llm.provider in config: {provider!r}")
