"""Load pipeline/config/settings.yaml and .env into a small Config object."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

load_dotenv()  # populates ANTHROPIC_API_KEY etc. from a project-root .env, if present

DEFAULT_CONFIG_PATH = Path("pipeline/config/settings.yaml")


@dataclass
class Config:
    raw: dict[str, Any]

    @property
    def llm_provider(self) -> str:
        return self.raw["llm"]["provider"]

    @property
    def llm_settings(self) -> dict[str, Any]:
        return self.raw["llm"][self.llm_provider]

    @property
    def mineru_tier(self) -> str:
        return self.raw["mineru"]["tier"]

    @property
    def papers_dir(self) -> Path:
        return Path(self.raw["paths"]["papers_dir"])

    @property
    def output_dir(self) -> Path:
        return Path(self.raw["paths"]["output_dir"])


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> Config:
    with open(path) as f:
        return Config(raw=yaml.safe_load(f))
