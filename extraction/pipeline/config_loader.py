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
    def llm_include_figures(self) -> bool:
        """Whether extraction requests attach figure crops.

        Defaults to True when absent, which is how every request was built
        before the option existed.
        """
        return bool(self.raw["llm"].get("include_figures", True))

    @property
    def mineru_tier(self) -> str:
        return self.raw["mineru"]["tier"]

    @property
    def recover_degree_as_zero(self) -> bool:
        """Whether to read a superscript zero before C/F/K as a degree ring.

        Defaults to True. This is the one markdown fix that infers what the
        page meant rather than just respelling it, so it is exposed as a
        switch for corpora where the assumption may not hold.
        """
        return bool(self.raw["mineru"].get("recover_degree_as_zero", True))

    @property
    def mineru_figure_tier(self) -> str | None:
        """Second tier used only for figure crops, or None for single-tier.

        `.get` rather than `[...]`: a settings.yaml written before this
        option existed must keep working, defaulting to single-tier.
        """
        return self.raw["mineru"].get("figure_tier")

    @property
    def papers_dir(self) -> Path:
        return Path(self.raw["paths"]["papers_dir"])

    @property
    def output_dir(self) -> Path:
        return Path(self.raw["paths"]["output_dir"])


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> Config:
    with open(path) as f:
        return Config(raw=yaml.safe_load(f))
