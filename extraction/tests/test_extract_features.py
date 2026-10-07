import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import extract_features as ef
from job_progress import ASKING, COLLECTING, PARSING

FEATURES = ["Temperature (°C)", "Conductivity (S/cm)"]
REPLY = json.dumps(
    {
        "samples": [
            {"sample": "PEO", "points": [{"Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7}]},
            {"sample": "PEO", "points": [{"Temperature (°C)": 25}]},
        ]
    }
)


def write_parse(paper_dir: Path) -> Path:
    """A folder like the parse step's: a manifest and the paper's text, no figures."""
    paper_dir.mkdir(parents=True)
    (paper_dir / "content.md").write_text("PEO conducts 1e-7 S/cm at 20 °C.", encoding="utf-8")
    manifest = {
        "paper_id": paper_dir.name,
        "source_pdf": "paper.pdf",
        "mineru_doc_id": "doc",
        "tier": "standard",
        "page_range": "1-1",
        "figures": [],
        "content_md_path": "content.md",
        "parsed_at": "2026-10-06T00:00:00Z",
        "duration_seconds": 1.0,
        "wait_retries": 0,
        "num_tables": 0,
    }
    (paper_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return paper_dir


class ExtractFeaturesTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        patcher = mock.patch.object(ef, "ask_llm", return_value=REPLY)
        self.ask_llm = patcher.start()
        self.addCleanup(patcher.stop)

    def test_reports_each_step_and_logs_the_model_call(self):
        steps = []
        with self.assertLogs("extraction.pipeline", "INFO") as logs:
            samples = ef.extract_features(write_parse(self.root / "abcd1234"), FEATURES, on_step=steps.append)

        self.assertEqual(steps, [ASKING, COLLECTING])  # a parsed folder needs no parse step
        self.assertEqual(
            samples,
            {
                "PEO": [
                    {"Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7},
                    {"Temperature (°C)": 25, "Conductivity (S/cm)": None},
                ]
            },
        )
        messages = [record.getMessage() for record in logs.records]
        self.assertRegex(messages[0], r"^LLM call: model \(Claude Code's default\), prompt \d+ chars, 0 image\(s\), 0 PDF\(s\)$")
        self.assertRegex(messages[1], rf"^LLM reply after \d+\.\d s: {len(REPLY)} chars$")
        self.assertEqual(messages[2], "Extracted 1 sample(s), 2 data point(s)")

    def test_a_failed_model_call_is_logged_and_raised(self):
        self.ask_llm.side_effect = RuntimeError("claude -p failed: usage limit reached")
        steps = []
        with self.assertLogs("extraction.pipeline", "INFO") as logs, self.assertRaises(RuntimeError):
            ef.extract_features(write_parse(self.root / "abcd1234"), FEATURES, on_step=steps.append)

        self.assertEqual(steps, [ASKING])
        failure = logs.records[-1]
        self.assertEqual(failure.levelname, "ERROR")
        self.assertRegex(failure.getMessage(), r"^LLM call failed after \d+\.\d s: claude -p failed: usage limit reached$")

    def test_sending_the_pdf_skips_the_parse(self):
        pdf = self.root / "paper.pdf"
        pdf.write_bytes(b"%PDF-1.7 fake")
        steps = []
        with self.assertLogs("extraction.pipeline", "INFO") as logs:
            ef.extract_features(pdf, FEATURES, send_pdf=True, on_step=steps.append)

        self.assertEqual(steps, [ASKING, COLLECTING])
        self.assertEqual(self.ask_llm.call_args.kwargs["documents"], [pdf])
        self.assertIn("1 PDF(s)", logs.records[0].getMessage())

    def test_reporting_steps_is_optional(self):
        with self.assertLogs("extraction.pipeline", "INFO"):
            samples = ef.extract_features(write_parse(self.root / "abcd1234"), FEATURES)
        self.assertIn("PEO", samples)


class ParseTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.pdf = self.root / "paper.pdf"  # no "<id>-" prefix, so its id comes from its contents
        self.pdf.write_bytes(b"%PDF-1.7 a paper")
        self.paper_id = hashlib.sha256(self.pdf.read_bytes()).hexdigest()[:8]
        patcher = mock.patch.object(ef, "OUTPUT_ROOT", self.root / "parsed")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_a_saved_parse_is_reused_without_a_parsing_step(self):
        saved = write_parse(self.root / "parsed" / self.paper_id)
        steps = []
        with mock.patch.object(ef, "parse_paper_auto") as mineru, self.assertLogs("extraction.pipeline", "INFO") as logs:
            self.assertEqual(ef.parse(self.pdf, on_step=steps.append), saved)

        mineru.assert_not_called()
        self.assertEqual(steps, [])
        self.assertEqual(logs.records[0].getMessage(), f"Reusing the saved parse in {saved}")

    def test_a_new_paper_reports_the_parsing_step_and_its_time(self):
        manifest = SimpleNamespace(figures=["fig1", "fig2"], num_tables=3)
        steps = []
        with mock.patch.object(ef, "parse_paper_auto", return_value=manifest) as mineru, self.assertLogs(
            "extraction.pipeline", "INFO"
        ) as logs:
            paper_dir = ef.parse(self.pdf, on_step=steps.append)

        self.assertEqual(steps, [PARSING])
        self.assertEqual(paper_dir, self.root / "parsed" / self.paper_id)
        self.assertEqual(mineru.call_args.kwargs["dest_dir"], paper_dir)
        messages = [record.getMessage() for record in logs.records]
        self.assertEqual(messages[0], f"Parsing with MinerU into {paper_dir}")
        self.assertRegex(messages[1], r"^MinerU parse done in \d+\.\d s: 2 figure\(s\), 3 table\(s\)$")


if __name__ == "__main__":
    unittest.main()
