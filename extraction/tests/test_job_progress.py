import unittest

from job_progress import ASKING, COLLECTING, PARSING, QUEUED, STEPS, progress


class JobProgressTest(unittest.TestCase):
    def test_steps_come_in_pipeline_order_with_rising_percents(self):
        self.assertEqual(list(STEPS), [QUEUED, PARSING, ASKING, COLLECTING])
        percents = [step.percent for step in STEPS.values()]
        self.assertEqual(percents, sorted(percents))
        self.assertTrue(all(0 <= percent < 100 for percent in percents))

    def test_every_step_has_words_to_show(self):
        for step in STEPS.values():
            self.assertTrue(step.name.strip())
            self.assertTrue(step.description.strip())

    def test_progress_is_the_step_with_its_words_and_percent(self):
        self.assertEqual(
            progress(PARSING),
            {
                "step": "parsing",
                "name": "Parsing the PDF",
                "description": STEPS[PARSING].description,
                "percent": 5,
            },
        )

    def test_a_queued_job_says_how_many_are_ahead(self):
        self.assertEqual(progress(QUEUED)["description"], STEPS[QUEUED].description)
        self.assertTrue(progress(QUEUED, ahead=1)["description"].startswith("Waiting for 1 earlier extraction to finish."))
        self.assertTrue(progress(QUEUED, ahead=3)["description"].startswith("Waiting for 3 earlier extractions to finish."))

    def test_only_the_queue_counts_jobs_ahead(self):
        self.assertEqual(progress(ASKING, ahead=2), progress(ASKING))


if __name__ == "__main__":
    unittest.main()
