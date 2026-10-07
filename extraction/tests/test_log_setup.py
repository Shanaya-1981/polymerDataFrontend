import io
import logging
import os
import re
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import log_setup
from log_setup import configure_logging, job_context, set_step
from tests import reset_logging

ISO_TIME = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}"


class LogSetupTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.addCleanup(reset_logging)
        self.log_file = Path(tmp.name) / "logs" / "extraction.log"
        self.stream = io.StringIO()
        self.log = logging.getLogger("extraction.api")

    def configure(self, level=None):
        return configure_logging(level, log_file=self.log_file, stream=self.stream)

    def lines(self):
        return self.stream.getvalue().splitlines()

    def test_each_line_has_timestamp_level_job_and_step(self):
        self.configure("INFO")
        with job_context("07561dd6"):
            set_step("parsing")
            self.log.info("Step started: %s", "Parsing the PDF")
        self.assertRegex(
            self.lines()[-1],
            rf"^{ISO_TIME} INFO    job=07561dd6 step=parsing extraction.api: Step started: Parsing the PDF$",
        )

    def test_lines_outside_a_job_say_so(self):
        self.configure("INFO")
        self.log.info("Ready")
        self.assertIn(" job=- step=- extraction.api: Ready", self.lines()[-1])

    def test_a_job_and_its_step_end_with_the_context(self):
        self.configure("INFO")
        with job_context("a1"):
            set_step("asking")
        self.log.info("after")
        self.assertIn("job=- step=-", self.lines()[-1])

    def test_extra_beats_the_context(self):
        self.configure("INFO")
        with job_context("a1"):
            self.log.info("Submitted", extra={"job": "b2", "step": "queued"})
        self.assertIn("job=b2 step=queued", self.lines()[-1])

    def test_each_thread_logs_its_own_job(self):
        self.configure("INFO")

        def work(job):
            with job_context(job):
                set_step("asking")
                self.log.info("working")

        threads = [threading.Thread(target=work, args=(job,)) for job in ("j1", "j2")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertCountEqual(
            [re.search(r"job=\S+ step=\S+", line).group(0) for line in self.lines()],
            ["job=j1 step=asking", "job=j2 step=asking"],
        )

    def test_lines_go_to_the_file_too(self):
        self.configure("INFO")
        self.log.warning("Refused %r: not a PDF", "notes.txt")
        self.assertEqual(self.log_file.read_text(encoding="utf-8").splitlines(), self.lines())
        self.assertIn("WARNING job=- step=- extraction.api: Refused 'notes.txt': not a PDF", self.lines()[-1])

    def test_log_level_comes_from_the_environment(self):
        with mock.patch.dict(os.environ, {"LOG_LEVEL": "warning"}):
            self.configure()
        self.log.info("hidden")
        self.log.warning("shown")
        self.assertEqual(len(self.lines()), 1)
        self.assertIn("shown", self.lines()[0])

    def test_debug_level_shows_debug_lines(self):
        with mock.patch.dict(os.environ, {"LOG_LEVEL": "DEBUG"}):
            self.configure()
        self.log.debug("Status: running")
        self.assertIn("DEBUG   job=- step=- extraction.api: Status: running", self.lines()[0])

    def test_an_argument_beats_the_environment(self):
        with mock.patch.dict(os.environ, {"LOG_LEVEL": "ERROR"}):
            self.configure("INFO")
        self.log.info("shown")
        self.assertEqual(len(self.lines()), 1)

    def test_an_unknown_level_falls_back_to_info_and_says_so(self):
        with mock.patch.dict(os.environ, {"LOG_LEVEL": "loud"}):
            logger = self.configure()
        self.assertEqual(logger.level, logging.INFO)
        self.assertIn("LOG_LEVEL='loud' isn't a logging level; using INFO", self.lines()[0])

    def test_configuring_again_does_not_repeat_lines(self):
        self.configure("INFO")
        self.configure("INFO")
        self.log.info("once")
        self.assertEqual(len(self.lines()), 1)
        self.assertEqual(len(self.log_file.read_text(encoding="utf-8").splitlines()), 1)

    def test_the_file_rotates(self):
        with mock.patch.object(log_setup, "MAX_BYTES", 300), mock.patch.object(log_setup, "BACKUP_COUNT", 2):
            self.configure("INFO")
        for i in range(40):
            self.log.info("line %d", i)
        names = sorted(path.name for path in self.log_file.parent.iterdir())
        self.assertEqual(names, ["extraction.log", "extraction.log.1", "extraction.log.2"])

    def test_the_log_file_lives_in_the_gitignored_logs_folder(self):
        self.assertEqual(log_setup.LOG_FILE, log_setup.HERE / "logs" / "extraction.log")
        gitignore = (log_setup.HERE / ".gitignore").read_text(encoding="utf-8").splitlines()
        self.assertIn("logs/", gitignore)


if __name__ == "__main__":
    unittest.main()
