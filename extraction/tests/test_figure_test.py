import math
import unittest

import numpy as np

from benchmarks import benchmark as bm
from benchmarks import figure_test as ft

# A synthetic scan: a plot frame whose corners are slightly sheared, and one
# curve, y = 0.2 + 0.6 x^2 for x from 0.2 to 0.8, on axes running 0-1 both ways.
CORNERS = {"top_left": (50, 30), "top_right": (550, 26), "bottom_left": (56, 370), "bottom_right": (556, 372)}


def curve_y(x):
    return 0.2 + 0.6 * x**2


def synthetic_scan() -> np.ndarray:
    from PIL import Image, ImageDraw

    to_px = ft.homography([(0, 0), (1, 0), (0, 1), (1, 1)], [CORNERS[k] for k in ("top_left", "top_right", "bottom_left", "bottom_right")])

    def px(x, y):
        p = to_px @ np.array([x, 1 - y, 1.0])
        return p[0] / p[2], p[1] / p[2]

    image = Image.new("L", (600, 400), 255)
    draw = ImageDraw.Draw(image)
    tl, tr, bl, br = (CORNERS[k] for k in ("top_left", "top_right", "bottom_left", "bottom_right"))
    for a, b in ((tl, tr), (bl, br), (tl, bl), (tr, br)):
        draw.line([a, b], fill=0, width=3)
    draw.line([px(x, curve_y(x)) for x in np.linspace(0.2, 0.8, 200)], fill=0, width=3)
    return np.asarray(image, float)


class AxesTest(unittest.TestCase):
    def test_temperatures_go_to_the_figures_x_and_back(self):
        for axis in ("1/T", "1000/T", "T"):
            self.assertAlmostEqual(ft.to_celsius(ft.to_x(25.0, axis), axis), 25.0)
        self.assertAlmostEqual(ft.to_x(25.0, "1/T"), 1 / 298.15)

    def test_finds_a_sheared_frame_and_straightens_it(self):
        gray = synthetic_scan()
        corners = ft.find_frame(gray)
        for name, (x, y) in CORNERS.items():
            self.assertAlmostEqual(corners[name][0], x, delta=1.5, msg=name)
            self.assertAlmostEqual(corners[name][1], y, delta=1.5, msg=name)
        plot = ft.straighten(gray, corners, (0, 1), (0, 1))
        x, y = plot.to_data(*plot.to_px(0.3, 0.7))
        self.assertAlmostEqual(x, 0.3)
        self.assertAlmostEqual(y, 0.7)

    def test_traces_the_drawn_curve_from_rough_seeds_to_its_ends(self):
        gray = synthetic_scan()
        plot = ft.straighten(gray, ft.find_frame(gray), (0, 1), (0, 1))
        # Seeds 0.02 off the line and short of its ends, as readings off a curve are.
        curve = ft.trace_curve(plot, [(x, curve_y(x) + 0.02) for x in (0.35, 0.45, 0.55, 0.65)])
        self.assertIsNotNone(curve)
        self.assertAlmostEqual(curve.x_min, 0.2, delta=0.01)
        self.assertAlmostEqual(curve.x_max, 0.8, delta=0.01)
        for x in (0.25, 0.5, 0.75):
            self.assertAlmostEqual(curve(x), curve_y(x), delta=0.006)
        self.assertIsNone(curve(0.9))  # past its end

    def test_no_frame_is_an_error(self):
        with self.assertRaises(ValueError):
            ft.find_frame(np.full((300, 400), 255.0))


class SourcesTest(unittest.TestCase):
    TABLE = [
        ["Reciprocal Temperature (1/K)", "24:1", "In:1"],
        ["~0.00310", "-3.65", "-5.95"],
        ["~0.00340", "-4.40", "—"],
    ]

    def test_mineru_table_becomes_samples_and_reads_its_infinity_label_as_no_salt(self):
        to24, inf = ft.mineru_samples(self.TABLE, "1/T")
        self.assertEqual(to24.li_ratio, 1 / 24)
        self.assertFalse(to24.undoped)
        self.assertTrue(inf.undoped)
        self.assertEqual(len(inf.points), 1)  # the "—" cell is skipped
        t, sigma = to24.points[0]
        self.assertAlmostEqual(t, 1 / 0.0034 - 273.15)
        self.assertAlmostEqual(math.log10(sigma), -4.40)

    def test_finds_the_figure_by_its_caption(self):
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            figures = [
                {"image_path": "a.png", "page": 5, "caption": "Fig. 14. Something else."},
                {"image_path": "b.png", "page": 5, "caption": "Fig. 4. Arrhenius plots."},
            ]
            (Path(tmp) / "manifest.json").write_text(json.dumps({"figures": figures}), encoding="utf-8")
            self.assertEqual(ft.find_figure(Path(tmp), "Fig. 4")["image"].name, "b.png")
            with self.assertRaises(SystemExit):
                ft.find_figure(Path(tmp), "Fig. 9")

    def test_the_reply_format_is_the_pipelines(self):
        schema = ft.reply_schema(["Temperature (°C)", "Conductivity (S/cm)"])
        point = schema["properties"]["samples"]["items"]["properties"]["points"]["items"]
        self.assertEqual(set(point["properties"]), {"Temperature (°C)", "Conductivity (S/cm)"})

    def test_points_are_measured_against_their_curve_and_past_its_ends_are_not(self):
        gray = synthetic_scan()
        plot = ft.straighten(gray, ft.find_frame(gray), (0, 1), (0, 1))
        curve = ft.trace_curve(plot, [(x, curve_y(x)) for x in (0.3, 0.5, 0.7)])
        # "T" axis: a sample's temperature is the x itself.
        sample = bm.ExtractedSample("A", [(0.5, 10 ** (curve_y(0.5) + 0.4)), (0.9, 10**0.5)])
        source = ft.Source("x", [sample], {"A": 1}, {}, [])
        along = ft.against_curves(source, {1: curve}, "T")
        self.assertEqual((along["points_on_curves"], along["beyond_curve_ends"]), (1, 1))
        self.assertAlmostEqual(along["mean_abs_error"], 0.4, delta=0.01)
        self.assertEqual(along["within_tolerance"], 0)


class BenchmarkHelpersTest(unittest.TestCase):
    def test_the_table_above_a_caption(self):
        content = "Text.\n\n| x | a |\n| --- | --- |\n| 1 | 2 |\n\nFig. 4. Plot.\n"
        self.assertEqual(bm.table_above(content, "Fig. 4. Plot."), [["x", "a"], ["1", "2"]])
        self.assertEqual(bm.table_above("Text.\n\nFig. 4. Plot.", "Fig. 4. Plot."), [])

    def test_an_infinite_ratio_is_undoped(self):
        for name in ("PEO ∞:1", "PEO-LiClO4 Inf:1", "infinite:1"):
            self.assertTrue(bm._UNDOPED.search(name), name)
        self.assertFalse(bm._UNDOPED.search("PEO-LiClO4 24:1"))


if __name__ == "__main__":
    unittest.main()
