"""Orchestrate one paper's LLM extraction call, from a Milestone-2 parsed
manifest to output/extracted/{paper_id}/extraction.json."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.config_loader import Config, load_config
from pipeline.extraction.llm_client.base import LLMClient
from pipeline.extraction.llm_client.factory import get_llm_client
from pipeline.extraction.prompt import build_extraction_request
from pipeline.extraction.schema import ExtractedFormulations, PaperExtractionResult
from pipeline.parsing.manifest_schema import ParseManifest

PARSED_ROOT = Path("output/parsed")
EXTRACTED_ROOT = Path("output/extracted")


def extract_paper(
    paper_id: str,
    config: Config | None = None,
    *,
    client: LLMClient | None = None,
    out_root: Path = EXTRACTED_ROOT,
    include_figures: bool | None = None,
) -> PaperExtractionResult:
    """Extract one paper and write its outputs under `out_root/paper_id/`.

    The CLI calls this with defaults (client and figure setting from
    settings.yaml, output under output/extracted/). The local-LLM benchmark
    passes its own per-arm client, output root and figure setting, so a
    benchmarked arm goes through exactly the code path production uses.

    `raw_llm_response.json` is always written -- including usage, timings and
    validation errors -- before a failed extraction raises, so a failure can
    be diagnosed from disk.
    """
    config = config or load_config()
    if include_figures is None:
        include_figures = config.llm_include_figures
    paper_dir = PARSED_ROOT / paper_id
    manifest = ParseManifest.model_validate_json((paper_dir / "manifest.json").read_text())

    request = build_extraction_request(manifest, paper_dir, include_figures=include_figures)
    client = client or get_llm_client(config)
    response = client.extract_structured(request, ExtractedFormulations)

    out_dir = out_root / paper_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "raw_llm_response.json").write_text(
        json.dumps(
            {
                "model_name": response.model_name,
                "stop_reason": response.stop_reason,
                "include_figures": include_figures,
                "images_attached": len(request.images),
                "usage": response.usage,
                "validation_errors": response.validation_errors,
                "raw_text": response.raw_text,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    if response.parsed is None:
        raise RuntimeError(
            f"Extraction failed for {paper_id}: {response.validation_errors}"
        )

    result = PaperExtractionResult(paper_id=paper_id, formulations=response.parsed.formulations)
    (out_dir / "extraction.json").write_text(
        result.model_dump_json(by_alias=True, exclude_none=True, indent=2),
        encoding="utf-8",
    )
    return result
