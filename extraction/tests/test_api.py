import asyncio
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import HTTPException, UploadFile

import api
import log_setup
from job_progress import ASKING, COLLECTING, PARSING, QUEUED, progress

PDF = b"%PDF-1.7 fake paper"
FEATURES = "Temperature (°C), Conductivity (S/cm)"
NAMES = ["Temperature (°C)", "Conductivity (S/cm)"]
SAMPLES = {"PEO": [{"Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7}]}


def upload(data: bytes = PDF, name: str = "linden1988.pdf") -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name)


class ApiTest(unittest.TestCase):
    def setUp(self):
        api.jobs.clear()
        self.addCleanup(api.jobs.clear)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        for patcher in (
            mock.patch.object(api, "RESULTS", self.tmp / "extractions"),
            # Jobs are run by the test itself, never by the server's worker thread.
            mock.patch.object(api.worker, "submit"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def submit(self, data: bytes = PDF, name: str = "linden1988.pdf") -> str:
        with self.assertLogs("extraction.api", "INFO"):
            return api.start(pdf=upload(data, name), features=FEATURES)["job"]

    def test_a_new_job_starts_queued(self):
        job = self.submit()
        answer = api.status(job)
        self.assertEqual(answer["status"], "running")
        self.assertEqual(answer["progress"], progress(QUEUED))
        self.assertEqual(answer["progress"]["percent"], 0)
        api.worker.submit.assert_called_once_with(api.run, job, PDF, NAMES)

    def test_submitting_is_logged_with_the_job(self):
        with self.assertLogs("extraction.api", "INFO") as logs:
            job = api.start(pdf=upload(), features=FEATURES)["job"]
        record = logs.records[-1]
        self.assertEqual(
            record.getMessage(),
            f"Submitted 'linden1988.pdf' ({len(PDF)} bytes) for 2 feature(s) {NAMES!r}, 0 job(s) ahead",
        )
        self.assertEqual((record.job, record.step), (job, QUEUED))

    def test_refused_uploads_are_logged(self):
        with self.assertLogs("extraction.api", "WARNING") as logs:
            with self.assertRaises(HTTPException) as not_pdf:
                api.start(pdf=upload(b"hello", "notes.txt"), features=FEATURES)
            with self.assertRaises(HTTPException) as no_features:
                api.start(pdf=upload(), features=" , ")
        self.assertEqual((not_pdf.exception.status_code, no_features.exception.status_code), (400, 400))
        self.assertEqual(
            [record.getMessage() for record in logs.records],
            ["Refused 'notes.txt': not a PDF", "Refused 'linden1988.pdf': no feature names"],
        )
        self.assertEqual(api.jobs, {})

    def test_a_queued_job_says_how_many_are_ahead(self):
        first, second = self.submit(), self.submit()
        api.jobs[first]["started"], api.jobs[second]["started"] = 100.0, 101.0

        self.assertIn("Waiting for 1 earlier extraction to finish.", api.status(second)["progress"]["description"])
        self.assertNotIn("Waiting for", api.status(first)["progress"]["description"])

        api.jobs[first] = {**api.jobs[first], "status": "done", "samples": {}}
        self.assertNotIn("Waiting for", api.status(second)["progress"]["description"])

    def test_a_job_reports_each_step_then_drops_its_progress(self):
        job = self.submit()
        seen = []

        def fake_extract_features(path, features, on_step):
            self.assertEqual(Path(path).read_bytes(), PDF)
            for step in (PARSING, ASKING, COLLECTING):
                on_step(step)
                seen.append(api.status(job)["progress"])
                # Everything logged from here on, the pipeline's lines too, is tagged with it.
                self.assertEqual((log_setup._job.get(), log_setup._step.get()), (job, step))
            return SAMPLES

        with mock.patch.object(api, "extract_features", fake_extract_features), self.assertLogs(
            "extraction.api", "INFO"
        ) as logs:
            api.run(job, PDF, NAMES)

        self.assertEqual([p["step"] for p in seen], [PARSING, ASKING, COLLECTING])
        self.assertEqual([p["percent"] for p in seen], [5, 60, 95])
        self.assertEqual([p["name"] for p in seen], ["Parsing the PDF", "Asking the model", "Collecting the results"])

        answer = api.status(job)
        self.assertEqual((answer["status"], answer["samples"]), ("done", SAMPLES))
        self.assertNotIn("progress", answer)
        saved = json.loads((self.tmp / "extractions" / f"{job}.json").read_text(encoding="utf-8"))
        self.assertEqual(saved, answer)

        messages = [record.getMessage() for record in logs.records]
        self.assertRegex(messages[0], r"^Started after \d+\.\d s in the queue$")
        self.assertEqual(messages[1], "Step started: Parsing the PDF")
        self.assertRegex(messages[2], r"^Step parsing done in \d+\.\d s$")
        self.assertEqual(messages[3], "Step started: Asking the model")
        self.assertRegex(messages[-2], r"^Step collecting done in \d+\.\d s$")
        self.assertRegex(messages[-1], r"^Done in \d+\.\d s$")
        self.assertEqual(log_setup._job.get(), "-")  # the job's tag ends with the job

    def test_a_failed_job_is_logged_with_its_traceback(self):
        job = self.submit()

        def fake_extract_features(path, features, on_step):
            on_step(ASKING)
            raise RuntimeError("claude -p failed: usage limit reached")

        with mock.patch.object(api, "extract_features", fake_extract_features), self.assertLogs(
            "extraction.api", "INFO"
        ) as logs:
            api.run(job, PDF, NAMES)

        answer = api.status(job)
        self.assertEqual(
            (answer["status"], answer["error"]), ("failed", "claude -p failed: usage limit reached")
        )
        self.assertNotIn("progress", answer)
        failure = logs.records[-1]
        self.assertEqual(failure.levelname, "ERROR")
        self.assertRegex(failure.getMessage(), r"^Failed after \d+\.\d s: claude -p failed: usage limit reached$")
        self.assertIsNotNone(failure.exc_info)
        self.assertTrue((self.tmp / "extractions" / f"{job}.json").exists())

    def test_a_result_that_cant_be_saved_is_logged_and_still_answers(self):
        job = self.submit()
        (self.tmp / "a-file").write_text("not a folder")
        with mock.patch.object(api, "RESULTS", self.tmp / "a-file" / "extractions"), mock.patch.object(
            api, "extract_features", return_value=SAMPLES
        ), self.assertLogs("extraction.api", "INFO") as logs:
            api.run(job, PDF, NAMES)

        self.assertEqual(api.status(job)["status"], "done")
        self.assertTrue(any(record.getMessage().startswith("Couldn't save the result") for record in logs.records))

    def test_an_unknown_job_is_a_logged_404(self):
        for job in ("f" * 32, "../../etc/passwd"):
            with self.assertLogs("extraction.api", "INFO") as logs, self.assertRaises(HTTPException) as missing:
                api.status(job)
            self.assertEqual(missing.exception.status_code, 404)
            self.assertEqual(logs.records[-1].getMessage(), f"No such job: {job!r}")

    def test_a_saved_job_still_answers_after_a_restart(self):
        job = "0" * 32
        (self.tmp / "extractions").mkdir()
        saved = {"status": "done", "samples": SAMPLES, "file": "linden1988.pdf", "features": NAMES, "started": 1.0}
        (self.tmp / "extractions" / f"{job}.json").write_text(json.dumps(saved), encoding="utf-8")
        self.assertEqual(api.status(job), saved)

    def test_starting_the_server_sets_up_logging(self):
        async def start_and_stop():
            async with api.lifespan(api.app):
                pass

        with mock.patch.object(api, "configure_logging") as configure, self.assertLogs("extraction.api", "INFO"):
            asyncio.run(start_and_stop())
        configure.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
