"""Orchestrate one paper's LLM extraction call, from a Milestone-2 parsed
manifest to output/extracted/{paper_id}/extraction.json."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.config_loader import Config, load_config
from pipeline.extraction.llm_client.factory import get_llm_client
from pipeline.extraction.prompt import build_extraction_request
from pipeline.extraction.schema import PaperExtractionResult
from pipeline.parsing.manifest_schema import ParseManifest

PARSED_ROOT = Path("output/parsed")
EXTRACTED_ROOT = Path("output/extracted")


def extract_paper(paper_id: str, config: Config | None = None) -> PaperExtractionResult:
    config = config or load_config()
    paper_dir = PARSED_ROOT / paper_id
    manifest = ParseManifest.model_validate_json((paper_dir / "manifest.json").read_text())

    request = build_extraction_request(manifest, paper_dir)
    client = get_llm_client(config)
    response = client.extract_structured(request, PaperExtractionResult)

    out_dir = EXTRACTED_ROOT / paper_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "raw_llm_response.json").write_text(
        json.dumps(
            {
                "model_name": response.model_name,
                "stop_reason": response.stop_reason,
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

    (out_dir / "extraction.json").write_text(
        response.parsed.model_dump_json(by_alias=True, exclude_none=True, indent=2),
        encoding="utf-8",
    )
    return response.parsed
