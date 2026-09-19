"""Config-driven LLMClient factory -- the one place that knows about
concrete provider classes. Everything else in the pipeline depends only on
the LLMClient Protocol (base.py).
"""

from __future__ import annotations

from pipeline.config_loader import Config
from pipeline.extraction.llm_client.base import LLMClient
from pipeline.extraction.llm_client.claude_client import ClaudeClient
from pipeline.extraction.llm_client.openai_compatible_client import OpenAICompatibleClient


def get_llm_client(config: Config) -> LLMClient:
    provider = config.llm_provider
    settings = config.llm_settings

    if provider == "anthropic":
        return ClaudeClient(model=settings["model"])
    if provider == "openai_compatible":
        return OpenAICompatibleClient(
            base_url=settings["base_url"],
            model=settings["model"],
            api_key=settings.get("api_key"),
        )
    raise ValueError(f"Unknown llm.provider in config: {provider!r}")
