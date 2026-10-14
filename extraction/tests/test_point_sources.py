import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import api
import extract_features as ef
import point_sources as ps
import store

# A parse's text: three pages, Table IV mentioned on page 1 but printed on
# page 2, Fig. 4 and its caption on page 3.
CONTENT = """<!-- page 1 of 3 -->

The conversions are listed in Table IV and plotted in Fig. 4.

<!-- page 2 of 3 -->

**TABLE IV.** Conversion of methyl methacrylate at 70 °C

| Time (min) | Conversion |
| --- | --- |
| 30 | 0.12 |

The polymer reached a conversion
of 0.85 after   ten hours.

<!-- page 3 of 3 -->

![Fig. 4](figures/standard/page3-block2.png)

Fig. 4. Arrhenius plots for amorphous PEO.
"""
FIGURES = [SimpleNamespace(caption="Fig. 4. Arrhenius plots for amorphous PEO.", page=3)]


def source(kind, label=None, page=None, quote=None):
    return {"kind": kind, "label": label, "page": page, "quote": quote}


class PagesTest(unittest.TestCase):
    def setUp(self):
        self.pages = ps.Pages(CONTENT, FIGURES)

    def test_a_position_is_on_the_page_of_the_marker_before_it(self):
        self.assertEqual(self.pages.count, 3)
        self.assertEqual(self.pages.page_at(CONTENT.index("Time (min)")), 2)
        self.assertEqual(self.pages.page_at(0), 1)

    def test_a_table_is_on_its_captions_page_not_where_its_mentioned(self):
        self.assertEqual(self.pages.caption_page("table", "IV"), 2)
        self.assertIsNone(self.pages.caption_page("table", "V"))
        self.assertIsNone(self.pages.caption_page("table", "I"))  # "IV" doesn't count as "I"

    def test_a_figure_is_on_the_page_mineru_recorded(self):
        self.assertEqual(self.pages.figure_page("4"), 3)
        self.assertIsNone(self.pages.figure_page("14"))

    def test_a_quote_is_found_whatever_its_spacing_and_case(self):
        self.assertEqual(self.pages.quote_page("the polymer reached a conversion of 0.85 after ten hours"), 2)
        # Spelt differently past its first words, it's found by those.
        self.assertEqual(self.pages.quote_page("The polymer reached a conversion of 85% after 10 h"), 2)
        self.assertIsNone(self.pages.quote_page("nothing like this is in the paper"))


class ResolveTest(unittest.TestCase):
    def setUp(self):
        self.pages = ps.Pages(CONTENT, FIGURES)

    def test_the_parse_decides_the_page_over_the_model(self):
        self.assertEqual(ps.resolve(source("table", "Table IV", 1), self.pages)["page"], 2)
        self.assertEqual(ps.resolve(source("figure", "Figure 4", 2), self.pages)["page"], 3)
        quoted = ps.resolve(source("text", None, 3, "reached a conversion of 0.85 after ten"), self.pages)
        self.assertEqual(quoted["page"], 2)

    def test_the_label_decides_where_to_look_whatever_the_kind(self):
        # MinerU writes a chart it read as a table, which the model may call a table.
        self.assertEqual(ps.resolve(source("table", "Fig. 4", None), self.pages)["page"], 3)

    def test_the_models_page_is_kept_only_when_the_parse_cant_say_and_its_a_real_page(self):
        self.assertEqual(ps.resolve(source("table", "Table IX", 2), self.pages)["page"], 2)
        self.assertIsNone(ps.resolve(source("table", "Table IX", 9), self.pages)["page"])
        self.assertIsNone(ps.resolve(source("table", "Table IX", True), self.pages)["page"])

    def test_with_the_pdf_sent_itself_the_models_page_is_all_there_is(self):
        self.assertEqual(ps.resolve(source("figure", "Figure 2", 7), None)["page"], 7)

    def test_no_source_or_a_malformed_one_is_none(self):
        for raw in (None, "Table IV", {"kind": "chart"}, {}):
            self.assertIsNone(ps.resolve(raw, self.pages))

    def test_blank_labels_and_quotes_are_none_and_the_rest_is_trimmed(self):
        found = ps.resolve(source("text", "  ", None, "  of 0.85 after ten hours  "), self.pages)
        self.assertEqual((found["label"], found["quote"]), (None, "of 0.85 after ten hours"))

    def test_described_in_one_line(self):
        self.assertEqual(ps.describe(source("table", "Table IV", 12)), "Table IV, page 12")
        self.assertEqual(ps.describe(source("figure", "Figure 3")), "Figure 3")
        self.assertEqual(ps.describe(source("text", None, 3, "1e-7 S/cm at 20 °C")), 'Text, page 3: "1e-7 S/cm at 20 °C"')
        self.assertEqual(ps.describe(None), "")


FEATURES = ["Temperature (°C)", "Conductivity (S/cm)"]
REPLY = json.dumps(
    {
        "samples": [
            {
                "sample": "PEO",
                "points": [
                    {"Temperature (°C)": 30, "Conductivity (S/cm)": 0.12, "source": source("table", "Table IV", 1)},
                    {"Temperature (°C)": 25, "Conductivity (S/cm)": 1e-6, "source": source("figure", "Fig. 4", None)},
                ],
            },
            {"sample": "PEO", "points": [{"Temperature (°C)": 40, "source": None}]},
        ]
    }
)


def write_parse(paper_dir: Path) -> Path:
    paper_dir.mkdir(parents=True)
    (paper_dir / "content.md").write_text(CONTENT, encoding="utf-8")
    figure = {"locator": "doc:x/tier:standard/page:3/block:2", "page": 3, "block": 2,
              "image_path": "figures/standard/page3-block2.png", "caption": FIGURES[0].caption}
    manifest = {
        "paper_id": paper_dir.name, "source_pdf": "paper.pdf", "mineru_doc_id": "doc", "tier": "standard",
        "page_range": "1-3", "figures": [figure], "content_md_path": "content.md",
        "parsed_at": "2026-10-14T00:00:00Z", "duration_seconds": 1.0, "wait_retries": 0, "num_tables": 1,
    }
    (paper_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return paper_dir


class ExtractFeaturesSourcesTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        patcher = mock.patch.object(ef, "ask_llm", return_value=REPLY)
        self.ask_llm = patcher.start()
        self.addCleanup(patcher.stop)

    def extract(self):
        with self.assertLogs("extraction.pipeline", "INFO"):
            return ef.extract_features(write_parse(self.root / "abcd1234"), FEATURES)

    def test_each_point_gets_its_source_with_the_page_from_the_parse(self):
        samples = self.extract()
        self.assertEqual(samples["PEO"][0], {"Temperature (°C)": 30, "Conductivity (S/cm)": 0.12})  # no source in it
        self.assertEqual(
            samples.sources,
            {"PEO": [source("table", "Table IV", 2), source("figure", "Fig. 4", 3), None]},
        )

    def test_the_model_is_asked_for_a_source_for_every_point(self):
        self.extract()
        kwargs = self.ask_llm.call_args.kwargs
        point = kwargs["json_schema"]["properties"]["samples"]["items"]["properties"]["points"]["items"]
        self.assertEqual(point["required"], ["source"])
        self.assertEqual(point["properties"]["source"], ps.schema())
        self.assertIn("<!-- page 5 of 7 -->", kwargs["system"])

    def test_a_feature_called_source_keeps_its_name(self):
        self.assertEqual(ef.source_key(["Source", "source"]), "source of this data point")
        self.assertEqual(ef.source_key(FEATURES), "source")

    def test_the_csv_ends_with_where_each_point_was_read(self):
        out = io.StringIO()
        ef.write_csv(self.extract(), FEATURES, out)
        lines = out.getvalue().splitlines()
        self.assertEqual(lines[0], "sample,Temperature (°C),Conductivity (S/cm),source")
        self.assertEqual(lines[1], "PEO,30,0.12,\"Table IV, page 2\"")
        self.assertEqual(lines[3], "PEO,40,,")
        # Plain samples, as before: no source column.
        out = io.StringIO()
        ef.write_csv({"PEO": [{"Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7}]}, FEATURES, out)
        self.assertEqual(out.getvalue().splitlines()[0], "sample,Temperature (°C),Conductivity (S/cm)")


SOURCES = {"PEO": [source("table", "Table IV", 2), None]}
DONE = {
    "status": "done",
    "file": "balke1973.pdf",
    "features": FEATURES,
    "started": 1.0,
    "samples": {"PEO": [{"Temperature (°C)": 30, "Conductivity (S/cm)": 0.12}, {"Temperature (°C)": 40, "Conductivity (S/cm)": None}]},
    "sources": SOURCES,
}


class StoredSourcesTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.db = self.tmp / "polymerdata.db"

    def test_sources_read_back_as_they_were_given(self):
        store.save_extraction(self.db, "a" * 32, DONE)
        self.assertEqual(store.load_extraction(self.db, "a" * 32), DONE)

    def test_a_job_without_sources_reads_back_without_them(self):
        plain = {key: value for key, value in DONE.items() if key != "sources"}
        store.save_extraction(self.db, "a" * 32, plain)
        self.assertEqual(store.load_extraction(self.db, "a" * 32), plain)

    def test_a_database_from_before_sources_gets_the_column_and_keeps_its_jobs(self):
        before = store.SCHEMA.replace(",\n    source TEXT\n", "\n")  # the #31 schema
        self.assertNotIn("source TEXT", before)
        with sqlite3.connect(self.db) as old:  # with one job in it
            old.executescript(before)
            old.execute("INSERT INTO extractions VALUES (?, NULL, 'x.pdf', ?, 1.0, 'done', NULL)", ("b" * 32, json.dumps(FEATURES)))
            old.execute("INSERT INTO samples (id, extraction_id, name, position) VALUES (1, ?, 'PEO', 0)", ("b" * 32,))
            old.execute("INSERT INTO points (id, sample_id, position) VALUES (1, 1, 0)")
            old.execute("INSERT INTO point_values VALUES (1, 'Temperature (°C)', 20)")
        self.assertNotIn("sources", store.load_extraction(self.db, "b" * 32))
        store.save_extraction(self.db, "a" * 32, DONE)
        self.assertEqual(store.load_extraction(self.db, "a" * 32)["sources"], SOURCES)


class ApiSourcesTest(unittest.TestCase):
    def setUp(self):
        api.jobs.clear()
        self.addCleanup(api.jobs.clear)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        for patcher in (
            mock.patch.object(api, "DB", self.tmp / "polymerdata.db"),
            mock.patch.object(api, "PAPERS", self.tmp / "papers"),
            mock.patch.object(api, "RESULTS", self.tmp / "extractions"),
            mock.patch.object(api.worker, "submit"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_job(self, found) -> str:
        from fastapi import UploadFile

        with self.assertLogs("extraction.api", "INFO"):
            job = api.start(pdf=UploadFile(file=io.BytesIO(b"%PDF-1.7 x"), filename="balke1973.pdf"), features=", ".join(FEATURES))["job"]
            with mock.patch.object(api, "extract_features", return_value=found):
                api.run(job, b"%PDF-1.7 x", FEATURES)
        return job

    def test_a_done_job_answers_with_its_sources_and_still_does_after_a_restart(self):
        job = self.run_job(ef.Extracted(DONE["samples"], SOURCES))
        answer = api.status(job)
        self.assertEqual((answer["samples"], answer["sources"]), (DONE["samples"], SOURCES))
        self.assertIs(type(answer["samples"]), dict)
        api.jobs.clear()  # the server restarts
        self.assertEqual(api.status(job)["sources"], SOURCES)

    def test_without_any_source_the_answer_is_as_before(self):
        for found in (DONE["samples"], ef.Extracted(DONE["samples"], {"PEO": [None, None]})):
            self.assertNotIn("sources", api.status(self.run_job(found)))


if __name__ == "__main__":
    unittest.main()
