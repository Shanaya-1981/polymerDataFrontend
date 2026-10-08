import contextlib
import io
import json
import math
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from benchmarks import benchmark as bm

F = ["Temperature (°C)", "Conductivity (S/cm)"]


def golden(number, ratio, points, anion="ClO4", polymer="poly(ethyleneoxide-co-methyleneoxide)", wt=None):
    return bm.GoldenSample(number, polymer, anion, ratio, wt, sorted(points))


class NameParsingTest(unittest.TestCase):
    def test_concentration_from_the_ways_papers_write_it(self):
        cases = {
            "Amorphous PEO:LiClO4 - 64:1": 1 / 64,
            "PEO-LiClO4 1:8": 1 / 8,
            "O:Li = 16:1": 1 / 16,
            "PEO, EO/Li = 20": 1 / 20,
            "Li/O = 0.0625": 0.0625,
            "Amorphous PEO (undoped)": None,
        }
        for name, expected in cases.items():
            with self.subTest(name=name):
                found = bm.li_ratio_from_name(name)
                self.assertEqual(found is None, expected is None)
                if expected is not None:
                    self.assertAlmostEqual(found, expected)

    def test_salt_from_the_name_in_the_ucsb_spelling(self):
        self.assertEqual(bm.anion_from_name("Amorphous PEO:LiClO4 - 64:1"), "ClO4")
        self.assertEqual(bm.anion_from_name("PEO / LiTFSI"), "TFSI")
        self.assertEqual(bm.anion_from_name("PEO with lithium triflate"), "CF3SO3")
        self.assertIsNone(bm.anion_from_name("Amorphous PEO (undoped)"))

    def test_extracted_points_are_read_and_unusable_ones_counted(self):
        [sample] = bm.extracted_samples(
            {
                "PEO:LiClO4 8:1 (undoped?) 5 wt%": [
                    {F[0]: "25", F[1]: "1.2e-5"},
                    {F[0]: 20, F[1]: 3e-6},
                    {F[0]: None, F[1]: 1e-5},
                    {F[0]: 30, F[1]: 0},
                ]
            },
            F,
        )
        self.assertEqual(sample.points, [(20.0, 3e-6), (25.0, 1.2e-5)])
        self.assertEqual(sample.unusable, 2)
        self.assertEqual((sample.anion, sample.salt_wt), ("ClO4", 5.0))
        self.assertAlmostEqual(sample.li_ratio, 1 / 8)

    def test_undoped_names_are_recognised(self):
        for name in ("Amorphous PEO (undoped)", "PEO, salt-free", "neat PEO"):
            [sample] = bm.extracted_samples({name: []}, F)
            self.assertTrue(sample.undoped, name)

    def test_features_must_include_temperature_and_conductivity(self):
        with self.assertRaises(ValueError):
            bm.feature_keys(["Tg (°C)", "Polymer"])


class GoldenTest(unittest.TestCase):
    def test_rows_for_one_doi_become_samples_with_points(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "golden.csv"
            path.write_text(
                "DOI,Polymer,Anion,Li:functional group,salt wt%,Conductivity at 20C,Conductivity at 25C\n"
                "doi:a,PEO,ClO4,0.125,,1.00E-06,2.00E-06\n"
                "doi:b,PEO,TFSI,0.05,,1e-5,\n"
                "doi:a,PEO,ClO4,0.0625,,none,4e-6\n",
                encoding="utf-8",
            )
            samples = bm.golden_samples("doi:a", path)
        self.assertEqual([s.number for s in samples], [1, 2])
        self.assertEqual(samples[0].points, [(20.0, 1e-6), (25.0, 2e-6)])
        self.assertEqual(samples[1].points, [(25.0, 4e-6)])
        self.assertEqual((samples[0].anion, samples[0].li_ratio), ("ClO4", 0.125))

    def test_the_real_dataset_has_this_papers_five_samples(self):
        samples = bm.golden_samples("https://doi.org/10.1016/0167-2738(88)90318-9")
        self.assertEqual(len(samples), 5)
        self.assertEqual({s.anion for s in samples}, {"ClO4"})
        self.assertTrue(all(len(s.points) == 7 for s in samples))


class MatchTest(unittest.TestCase):
    def setUp(self):
        self.golden = [golden(1, 0.0158, []), golden(2, 0.0629, []), golden(3, 0.125, [])]

    def extracted(self, *names):
        return bm.extracted_samples({name: [] for name in names}, F)

    def test_matches_by_salt_and_concentration_and_leaves_the_rest(self):
        matches, extra, missed = bm.match_samples(
            self.extracted("PEO (undoped)", "PEO:LiClO4 - 64:1", "PEO:LiClO4 - 8:1", "PEO:LiClO4 - 4:1"),
            self.golden,
        )
        self.assertEqual([(m.extracted.name, m.golden.number) for m in matches], [("PEO:LiClO4 - 64:1", 1), ("PEO:LiClO4 - 8:1", 3)])
        self.assertEqual([e.name for e in extra], ["PEO (undoped)", "PEO:LiClO4 - 4:1"])
        self.assertEqual([g.number for g in missed], [2])
        self.assertIn("Li:FG 0.01562 vs 0.0158 (1.1% apart)", matches[0].reason)

    def test_a_different_salt_never_matches(self):
        matches, extra, _ = bm.match_samples(self.extracted("PEO:LiTFSI - 8:1"), self.golden)
        self.assertEqual(matches, [])
        self.assertEqual(len(extra), 1)

    def test_closest_concentration_wins(self):
        candidates = [golden(1, 0.10, []), golden(2, 0.11, [])]
        matches, _, _ = bm.match_samples(self.extracted("PEO:LiClO4 - 9:1"), candidates)
        self.assertEqual(matches[0].golden.number, 2)  # 1/9 = 0.111

    def test_a_pair_given_by_hand_decides(self):
        matches, _, _ = bm.match_samples(self.extracted("Sample B"), self.golden, {"Sample B": 2})
        self.assertEqual((matches[0].golden.number, matches[0].reason), (2, "paired by hand (--pair)"))
        with self.assertRaises(ValueError):
            bm.match_samples(self.extracted("Sample B"), self.golden, {"Sample C": 2})

    def test_a_name_without_concentration_takes_the_only_sample_left(self):
        matches, _, _ = bm.match_samples(self.extracted("PEO-LiClO4 electrolyte"), [golden(1, 0.125, [])])
        self.assertEqual(matches[0].reason, "the only UCSB sample left with this salt")

    def test_with_several_polymers_the_name_must_mention_one(self):
        golden_samples = [golden(1, 0.125, [], polymer="PEO"), golden(2, 0.125, [], polymer="poly(propylene oxide)")]
        matches, _, _ = bm.match_samples(self.extracted("propylene oxide + LiClO4, 8:1"), golden_samples)
        self.assertEqual(matches[0].golden.number, 2)


class PointsTest(unittest.TestCase):
    def test_pairs_within_two_degrees_and_matches_within_a_third_of_a_decade(self):
        golden_points = [(20.0, 1e-6), (25.0, 1e-5), (30.0, 1e-4)]
        extracted = [(21.5, 1.5e-6), (25.0, 3e-5), (60.0, 1e-3)]  # 60 °C: no UCSB point near it
        result = bm.compare_points(extracted, golden_points)
        self.assertEqual((result["extracted_points_compared"], result["golden_points_compared"]), (2, 2))
        self.assertEqual(result["matches"], 1)  # 25 °C is log10(3) = 0.48 decades off
        self.assertEqual((result["precision"], result["recall"]), (0.5, 0.5))
        self.assertEqual([p["match"] for p in result["pairs"]], [True, False])
        self.assertAlmostEqual(result["mean_abs_log_sigma_error"], (math.log10(1.5) + math.log10(3)) / 2, places=3)

    def test_the_nearest_temperature_pairs_first_and_each_point_only_once(self):
        result = bm.compare_points([(24.0, 1e-5), (25.5, 2e-5)], [(25.0, 2e-5)])
        self.assertEqual(len(result["pairs"]), 1)
        self.assertEqual(result["pairs"][0]["t_extracted"], 25.5)
        self.assertEqual(result["extracted_points_compared"], 2)  # both were near 25 °C
        self.assertEqual(result["precision"], 0.5)
        self.assertEqual(result["recall"], 1.0)

    def test_exactly_the_tolerance_still_matches(self):
        result = bm.compare_points([(25.0, 10 ** -4.7)], [(27.0, 10 ** -5.0)])
        self.assertTrue(result["pairs"][0]["match"])

    def test_nothing_to_compare_gives_no_rates(self):
        result = bm.compare_points([(80.0, 1e-4)], [(20.0, 1e-6)])
        self.assertIsNone(result["precision"])
        self.assertIsNone(result["mean_abs_log_sigma_error"])

    def test_overall_adds_up_the_samples(self):
        matches = [
            bm.SampleMatch(bm.ExtractedSample("a", [(20.0, 1e-6)]), golden(1, 0.1, [(20.0, 1e-6)]), "r"),
            bm.SampleMatch(bm.ExtractedSample("b", [(20.0, 1e-5)]), golden(2, 0.2, [(20.0, 1e-6)]), "r"),
        ]
        overall = bm.score(matches)["overall"]
        self.assertEqual((overall["matches"], overall["extracted_points_compared"]), (1, 2))
        self.assertAlmostEqual(overall["mean_log_sigma_bias"], 0.5)


class RunRecordTest(unittest.TestCase):
    JOB = "a" * 32
    LOG = "\n".join(
        [
            f"2026-10-07T10:00:00.000-07:00 INFO    job={JOB} step=queued extraction.api: Submitted 'x.pdf'",
            f"2026-10-07T10:00:01.000-07:00 INFO    job={JOB} step=- extraction.api: Started after 0.4 s in the queue",
            f"2026-10-07T10:00:01.000-07:00 INFO    job={JOB} step=parsing extraction.pipeline: Parsing with MinerU into output/parsed/9be25e50",
            f"2026-10-07T10:04:01.000-07:00 INFO    job={JOB} step=parsing extraction.pipeline: MinerU parse done in 240.2 s: 6 figure(s), 1 table(s)",
            f"2026-10-07T10:04:01.000-07:00 INFO    job={JOB} step=parsing extraction.api: Step parsing done in 240.3 s",
            f"2026-10-07T10:04:01.000-07:00 INFO    job={JOB} step=asking extraction.pipeline: LLM call: model (Claude Code's default), prompt 40000 chars, 6 image(s), 0 PDF(s)",
            f"2026-10-07T10:05:01.000-07:00 INFO    job={JOB} step=asking extraction.pipeline: LLM reply after 61.5 s: 2100 chars",
            f"2026-10-07T10:05:01.000-07:00 INFO    job={JOB} step=asking extraction.api: Step asking done in 61.6 s",
            f"2026-10-07T10:05:01.000-07:00 INFO    job={'b' * 32} step=- extraction.api: Done in 9.0 s",
            f"2026-10-07T10:05:01.000-07:00 INFO    job={JOB} step=collecting extraction.api: Done in 302.1 s",
        ]
    )

    def test_reads_one_jobs_timings_from_the_log(self):
        timing = bm.job_timings(self.LOG, self.JOB)
        self.assertEqual(timing["queue_s"], 0.4)
        self.assertEqual((timing["parse_cached"], timing["parse_dir"]), (False, "output/parsed/9be25e50"))
        self.assertEqual((timing["mineru_s"], timing["figures"], timing["tables"]), (240.2, 6, 1))
        self.assertEqual((timing["llm_s"], timing["images"]), (61.5, 6))
        self.assertEqual(timing["steps"], {"parsing": 240.3, "asking": 61.6})
        self.assertEqual(timing["total_s"], 302.1)  # not the other job's 9.0 s

    def test_a_reused_parse_is_recorded(self):
        log = f"x INFO job={self.JOB} step=- extraction.pipeline: Reusing the saved parse in output/parsed/9be25e50"
        self.assertTrue(bm.job_timings(log, self.JOB)["parse_cached"])

    def test_polling_turns_into_steps_seen(self):
        seen = [
            {"t": 0.0, "status": "running", "step": "queued", "name": "Waiting to start", "percent": 0},
            {"t": 5.0, "status": "running", "step": "parsing", "name": "Parsing the PDF", "percent": 5},
            {"t": 10.0, "status": "running", "step": "parsing", "name": "Parsing the PDF", "percent": 5},
            {"t": 250.0, "status": "done", "step": None, "name": None, "percent": None},
        ]
        steps = bm.observed_steps(seen)
        self.assertEqual([s["step"] for s in steps], ["queued", "parsing", "done"])
        self.assertEqual(steps[1]["seen_for_s"], 245.0)

    def test_the_model_is_named_only_as_far_as_it_is_known(self):
        self.assertEqual(bm.model_used("claude-sonnet-5"), "claude-sonnet-5")
        with tempfile.TemporaryDirectory() as home, mock.patch.object(Path, "home", return_value=Path(home)):
            # This shell's ANTHROPIC_MODEL says nothing about the server's.
            with mock.patch.dict(os.environ, {"ANTHROPIC_MODEL": "haiku"}):
                self.assertIn("not recorded", bm.model_used("(Claude Code's default)"))
            (Path(home) / ".claude").mkdir()
            (Path(home) / ".claude" / "settings.json").write_text(json.dumps({"model": "opus"}))
            self.assertIn("opus", bm.model_used("(Claude Code's default)"))
            # Your own setting beats your organisation's default, unless the organisation overrides it.
            org = {"name": "claude-opus-5-5", "override_user_selection": False}
            (Path(home) / ".claude.json").write_text(json.dumps({"orgModelDefaultCache": org}))
            self.assertTrue(bm.model_used(None).startswith("opus"))
            (Path(home) / ".claude" / "settings.json").unlink()
            self.assertTrue(bm.model_used(None).startswith("claude-opus-5-5"))


class FigureTest(unittest.TestCase):
    def test_the_conductivity_plot_is_the_best_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            parse_dir = Path(tmp)
            (parse_dir / "manifest.json").write_text(
                json.dumps(
                    {
                        "figures": [
                            {"image_path": "figures/a.png", "page": 2, "caption": "Fig. 1. DSC traces."},
                            {
                                "image_path": "figures/b.png",
                                "page": 4,
                                "caption": "Fig. 3. Arrhenius plots of the conductivity of amorphous PEO-LiClO4.",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            candidates = bm.figure_candidates(parse_dir)
        self.assertTrue(candidates[0]["image"].endswith("figures/b.png"))
        self.assertGreater(candidates[0]["score"], candidates[1]["score"])
        self.assertEqual(bm.figure_candidates(Path(tmp) / "missing"), [])

    def test_the_arrhenius_plot_beats_other_conductivity_plots(self):
        # linden1988's captions: Fig. 5 says "conductivity", Fig. 4 doesn't,
        # yet only Fig. 4 plots conductivity against temperature.
        captions = {
            "fig2": "Fig. 2. Dielectric constant and conductivity versus frequency for amorphous PEO: LiClO4 - 8:1.",
            "fig4": "Fig. 4. Arrhenius plots for amorphous PEO doped with LiClO4 at various concentrations.",
            "fig5": "Fig. 5. Log10 conductivity versus dopant level for LiClO4 doped amorphous PEO at various temperatures.",
            "fig6": "Fig. 6. Amorphous PEO: LiClO4 - 24:1 - complex impedance spectrum from thick cell.",
        }
        with tempfile.TemporaryDirectory() as tmp:
            manifest = {"figures": [{"image_path": f"{k}.png", "page": 1, "caption": c} for k, c in captions.items()]}
            (Path(tmp) / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            best = bm.figure_candidates(Path(tmp))[0]
        self.assertTrue(best["image"].endswith("fig4.png"))

    def test_the_axis_follows_the_label_mineru_read_then_the_caption(self):
        self.assertEqual(bm.axis_for("Arrhenius plots", "Reciprocal Temperature (1/K)"), "1/T")
        self.assertEqual(bm.axis_for("Arrhenius plots", "1000/T (K-1)"), "1000/T")
        self.assertEqual(bm.axis_for("", "Temperature (°C)"), "T")
        self.assertEqual(bm.axis_for("Arrhenius plots of conductivity"), "1000/T")
        self.assertEqual(bm.axis_for("Conductivity versus temperature (°C)"), "T")
        self.assertEqual(bm.axis_for(""), "1000/T")

    def test_the_axis_label_is_the_header_of_the_table_above_the_caption(self):
        content = "\n".join(
            [
                "Some text.",
                "",
                "| Reciprocal Temperature (1/K) | 24:1 | 8:1 |",
                "| --- | --- | --- |",
                "| ~0.00305 | -3.55 | -4.10 |",
                "",
                "Fig. 4. Arrhenius plots for amorphous PEO doped with LiClO4 at various concentrations.",
                "",
                "A paragraph.",
                "",
                "Fig. 6. Impedance spectrum.",
            ]
        )
        self.assertEqual(
            bm.axis_label_near(content, "Fig. 4. Arrhenius plots for amorphous PEO doped with LiClO4 at various concentrations."),
            "Reciprocal Temperature (1/K)",
        )
        self.assertEqual(bm.axis_label_near(content, "Fig. 6. Impedance spectrum."), "")
        self.assertEqual(bm.axis_label_near(content, "Fig. 9. Not in the text."), "")


class RescoreTest(unittest.TestCase):
    def test_rescoring_a_job_keeps_the_timing_from_when_it_ran(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(bm, "OUT_ROOT", Path(tmp)):
            for folder, job, wall in (("old", "j1", 210.0), ("other", "j2", 99.0), ("rescored", "j1", None)):
                (Path(tmp) / folder).mkdir()
                run = {"job": job, "wall_s": wall, "started_at": f"2026-10-07T16:{wall or 0:02.0f}:00", "poll_every_s": 5}
                (Path(tmp) / folder / "metrics.json").write_text(json.dumps({"run": run}), encoding="utf-8")
            self.assertEqual(bm.earlier_run("j1")["wall_s"], 210.0)
            self.assertIsNone(bm.earlier_run("j3"))

    def run_main_on_saved(self, saved: dict) -> tuple[dict, str]:
        """bm.main(--job) on a job the server saved, with no server to ask."""
        try:
            import matplotlib  # noqa: F401
        except ImportError:
            self.skipTest("matplotlib isn't installed (benchmarks/requirements.txt)")
        job = "c" * 32
        with tempfile.TemporaryDirectory() as tmp:
            results, out_root, pdf = Path(tmp) / "extractions", Path(tmp) / "benchmarks", Path(tmp) / "x.pdf"
            results.mkdir()
            out_root.mkdir()
            pdf.write_bytes(b"%PDF-1.4 not really")
            (results / f"{job}.json").write_text(json.dumps(saved), encoding="utf-8")
            with (
                mock.patch.multiple(bm, RESULTS=results, OUT_ROOT=out_root),
                mock.patch.object(bm, "poll", side_effect=AssertionError("asked the server")),
                mock.patch.object(bm, "read_logs", return_value=""),
                mock.patch.object(bm, "golden_samples", return_value=[golden(1, 0.125, [(25.0, 1.1e-6)])]),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                bm.main([str(pdf), "--job", job, "--doi", "doi:x"])
            (run_dir,) = out_root.iterdir()
            self.assertEqual(json.loads((run_dir / "extraction.json").read_text(encoding="utf-8")), saved)
            return (
                json.loads((run_dir / "metrics.json").read_text(encoding="utf-8")),
                (run_dir / "report.md").read_text(encoding="utf-8"),
            )

    def test_a_finished_job_is_scored_from_its_saved_result(self):
        samples = {"PEO:LiClO4 8:1": [{"Temperature (°C)": 25, "Conductivity (S/cm)": 1e-6}]}
        metrics, report = self.run_main_on_saved({"status": "done", "features": F, "samples": samples})
        self.assertEqual(metrics["points"]["overall"]["matches"], 1)
        self.assertIsNone(metrics["run"]["wall_s"])
        self.assertIn("not timed: scored later with `--job`", report)
        self.assertIn("Not polled", report)

    def test_a_failed_job_reports_its_error(self):
        metrics, report = self.run_main_on_saved({"status": "failed", "features": F, "error": "claude -p failed: usage limit"})
        self.assertEqual(metrics["samples"]["found"], 0)
        self.assertIn("- **Error:** claude -p failed: usage limit", report)


class ReportTest(unittest.TestCase):
    def test_writes_a_report_and_a_comparison_image(self):
        try:
            import matplotlib  # noqa: F401
        except ImportError:
            self.skipTest("matplotlib isn't installed (benchmarks/requirements.txt)")
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            figure_png = out / "figure.png"
            plt.imsave(figure_png, [[0.0, 1.0], [1.0, 0.0]])
            matches = [
                bm.SampleMatch(
                    bm.ExtractedSample("PEO:LiClO4 8:1", [(20.0, 1e-6), (25.0, 2e-6)]),
                    golden(5, 0.125, [(20.0, 1.1e-6), (25.0, 2.5e-6)]),
                    "ClO4 salt",
                )
            ]
            extra = [bm.ExtractedSample("PEO (undoped)", [(20.0, 1e-8)], undoped=True)]
            bm.plot_comparison(
                out / "comparison.png",
                {"image": str(figure_png), "caption": "Fig. 3", "page": 4},
                matches,
                extra,
                [],
                "1/T",
                "test",
            )
            metrics = {
                "paper": {"file": "x.pdf", "reference": "A. B., 1988", "doi": "doi:x"},
                "run": {
                    "job": "j",
                    "status": "done",
                    "features": ", ".join(F),
                    "model": "m",
                    "started_at": "now",
                    "wall_s": 300.0,
                    "poll_every_s": 5.0,
                    "observed_steps": [{"name": "Parsing the PDF", "first_seen_s": 5.0, "seen_for_s": 240.0}],
                },
                "timing": {"total_s": 299.0, "queue_s": 0.1, "mineru_s": 240.0, "llm_s": 55.0, "steps": {"parsing": 240.1}},
                "parse": {"cached": False, "dir": "output/parsed/x", "figures": 6, "tables": 1},
                "samples": {
                    "found": 2,
                    "expected": 1,
                    "matched": 1,
                    "unmatched_extracted": ["PEO (undoped)"],
                    "unmatched_golden": [],
                },
                "points": bm.score(matches),
                "figure": {"image": str(figure_png), "page": 4, "caption": "Fig. 3", "x_axis": "1000/T"},
                "files": {"comparison": "comparison.png"},
                "notes": ["Both sets come from Fig. 5."],
            }
            bm.write_report(out, metrics)
            report = (out / "report.md").read_text(encoding="utf-8")
            self.assertTrue((out / "comparison.png").stat().st_size > 10_000)
        for heading in ("## Time", "## Samples", "## Points", "## Against the paper", "## Verdict"):
            self.assertIn(heading, report)
        self.assertIn("ran fresh", report)
        self.assertIn("![Pipeline and UCSB points next to the paper's figure](comparison.png)", report)
        self.assertIn("fitted curves", report)
        self.assertIn("### Notes\n\n- Both sets come from Fig. 5.", report)


if __name__ == "__main__":
    unittest.main()
