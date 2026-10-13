import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import store

FEATURES = ["Temperature (°C)", "Conductivity (S/cm)", "Polymer"]
JOB, OTHER = "a" * 32, "b" * 32
DONE = {
    "status": "done",
    "file": "linden1988.pdf",
    "features": FEATURES,
    "started": 1791868993.089932,
    "samples": {
        "PEO-LiTFSI": [
            {"Temperature (°C)": 20, "Conductivity (S/cm)": 1.5e-7, "Polymer": "PEO"},
            {"Temperature (°C)": 60, "Conductivity (S/cm)": None, "Polymer": "PEO"},
        ],
        "PPO": [{"Temperature (°C)": None, "Conductivity (S/cm)": "< 1e-9", "Polymer": None}],
    },
}


class StoreTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.db = self.tmp / "polymerdata.db"

    def test_a_finished_job_reads_back_as_it_was_given(self):
        store.save_extraction(self.db, JOB, DONE, "0a1b2c3d")
        saved = store.load_extraction(self.db, JOB)
        self.assertEqual(saved, DONE)
        # In the same order, and 20 still a whole number, not 20.0.
        self.assertEqual(json.dumps(saved), json.dumps(DONE))

    def test_a_failed_job_reads_back_with_its_reason(self):
        failed = {"status": "failed", "file": "x.pdf", "features": FEATURES, "started": 1.0, "error": "usage limit"}
        store.save_extraction(self.db, JOB, failed)
        self.assertEqual(store.load_extraction(self.db, JOB), failed)

    def test_an_unknown_job_is_none_and_looking_makes_no_file(self):
        self.assertIsNone(store.load_extraction(self.db, JOB))
        self.assertFalse(self.db.exists())
        store.save_extraction(self.db, JOB, DONE)
        self.assertIsNone(store.load_extraction(self.db, OTHER))

    def test_the_same_paper_is_one_row_under_the_name_it_first_came_under(self):
        store.save_extraction(self.db, JOB, DONE, "0a1b2c3d")
        store.save_extraction(self.db, OTHER, {**DONE, "file": "renamed.pdf"}, "0a1b2c3d")
        with store._connect(self.db) as connection:
            papers = connection.execute("SELECT id, file_name FROM papers").fetchall()
        self.assertEqual(papers, [("0a1b2c3d", "linden1988.pdf")])
        self.assertEqual(store.load_extraction(self.db, OTHER)["file"], "renamed.pdf")

    def test_a_sample_with_no_data_points_reads_back_too(self):
        given = {**DONE, "samples": {"PVDF": [], **DONE["samples"], "PAN": []}}
        store.save_extraction(self.db, JOB, given)
        self.assertEqual(json.dumps(store.load_extraction(self.db, JOB)), json.dumps(given))

    def test_a_row_cant_point_to_one_that_doesnt_exist(self):
        store.save_extraction(self.db, JOB, DONE)
        with store._connect(self.db) as connection, self.assertRaises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO samples (extraction_id, name, position) VALUES (?, 'PEO', 0)", (OTHER,))
        with store._connect(self.db) as connection, self.assertRaises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO points (sample_id, position) VALUES (12345, 0)")

    def test_deleting_an_extraction_deletes_its_samples_data_points_and_values(self):
        store.save_extraction(self.db, JOB, DONE)
        with store._connect(self.db) as connection:
            connection.execute("DELETE FROM extractions WHERE id = ?", (JOB,))
            tables = ("samples", "points", "point_values")
            left = [connection.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in tables]
        self.assertEqual(left, [0, 0, 0])

    def test_jobs_saved_as_json_are_copied_once_and_unreadable_ones_skipped(self):
        folder = self.tmp / "extractions"
        folder.mkdir()
        (folder / f"{JOB}.json").write_text(json.dumps(DONE), encoding="utf-8")
        (folder / f"{OTHER}.json").write_text("{not json", encoding="utf-8")
        (folder / "notes.json").write_text("{}", encoding="utf-8")  # not a job's id: never read

        with self.assertLogs("extraction.store", "WARNING") as logs:
            self.assertEqual(store.import_json(self.db, folder), 1)
        self.assertEqual(len(logs.records), 1)
        self.assertIn(f"{OTHER}.json", logs.records[0].getMessage())
        self.assertEqual(store.load_extraction(self.db, JOB), DONE)

        with self.assertLogs("extraction.store", "WARNING"):  # only the unreadable file is tried again
            self.assertEqual(store.import_json(self.db, folder), 0)

    def test_a_job_saved_before_start_times_were_noted_reads_back_without_one(self):
        old = {key: value for key, value in DONE.items() if key != "started"}
        store.save_extraction(self.db, JOB, old)
        self.assertEqual(json.dumps(store.load_extraction(self.db, JOB)), json.dumps(old))

    def test_json_of_the_wrong_shape_is_skipped_and_leaves_nothing_behind(self):
        folder = self.tmp / "extractions"
        folder.mkdir()
        wrong = [
            {**DONE, "samples": []},
            {**DONE, "samples": None},
            {**DONE, "samples": {"PEO": [5]}},  # a data point that isn't an object
            {**DONE, "samples": {"PEO": [{"Polymer": 2**70}]}},  # bigger than SQLite's whole numbers
        ]
        for i, record in enumerate(wrong):
            (folder / f"{i:032x}.json").write_text(json.dumps(record), encoding="utf-8")

        with self.assertLogs("extraction.store", "WARNING") as logs:
            self.assertEqual(store.import_json(self.db, folder), 0)
        self.assertEqual(len(logs.records), len(wrong))
        tables = ("extractions", "samples", "points", "point_values")
        with store._connect(self.db) as connection:
            left = [connection.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in tables]
        self.assertEqual(left, [0, 0, 0, 0])  # each failed copy was undone

    def test_no_folder_of_json_copies_nothing(self):
        self.assertEqual(store.import_json(self.db, self.tmp / "extractions"), 0)
        self.assertFalse(self.db.exists())


if __name__ == "__main__":
    unittest.main()
