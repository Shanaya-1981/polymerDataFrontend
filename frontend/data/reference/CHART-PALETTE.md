# Categorical chart palette — computed and validated

**This palette is not a taste call. It was derived by search against the dataviz skill's
`validate_palette.js` and it passes every hard gate under the strictest criterion
(`--pairs all`) in BOTH light and dark mode.** Do not substitute colors without re-running
the validator.

## The palette — 7 hues + a reserved "Other"

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | pink-red | `#e2276c` | `#de2269` |
| 2 | blue | `#0c3dc9` | `#1a4eda` |
| 3 | cyan | `#29b1c5` | `#24a0b2` |
| 4 | violet | `#8c59f3` | `#9870f7` |
| 5 | brown | `#8a5512` | `#c67c1f` |
| 6 | purple | `#82138c` | `#9618a2` |
| 7 | olive | `#8c941f` | `#606612` |
| — | **Other** (reserved, recessive) | `#9a9a94` | `#6b6b66` |

Assign slots **in fixed order, never cycled**. "Other" is deliberately desaturated so
folded-in categories recede; it is not slot 8.

## Validator results

```
LIGHT  --pairs all : CVD ΔE 8.2 (deutan/tritan) · normal ΔE 17.2 · ALL CHECKS PASS
DARK   --pairs all : CVD ΔE 9.9 (deutan)        · normal ΔE 18.6 · ALL CHECKS PASS
LIGHT  --pairs adjacent : CVD ΔE 17.6 · normal ΔE 24.4 · ALL CHECKS PASS
```

Re-verify with:
```bash
node <dataviz-skill>/scripts/validate_palette.js \
  "#e2276c,#0c3dc9,#29b1c5,#8c59f3,#8a5512,#82138c,#8c941f" --mode light --pairs all
```

## Why exactly 7

Our primary chart is a **scatter plot**, which is the all-pairs case (any two categories can
land adjacent on screen), not the easier adjacent-pairs case that lines and bars get. Searching
the OKLCH gamut for the largest set clearing CVD ΔE ≥ 8 and normal-vision ΔE ≥ 15 on **both**
surfaces:

| N | joint margin | verdict |
|---|---|---|
| 6 | 1.29 | passes comfortably |
| **7** | **1.03** | **passes — chosen** |
| 8 | 0.96 | fails |
| 9+ | worse | fails |

Dark mode is the binding constraint: its lightness band is `L ∈ [0.48, 0.67]` versus light's
`[0.43, 0.77]`, so colors must separate on hue and chroma alone.

For reference, the skill's own default palette caps scatter at **3** slots; this one more than
doubles that while passing the same gates.

## Overflow rule — the data exceeds 7 categories

Measured coverage by the top 7 categories:

| Column | distinct | top-7 coverage | verdict |
|---|---|---|---|
| `crystalline?` | 3 | 100 % | direct |
| `Anion` | 12 | **97.4 %** | top-7 + Other |
| `Solvent used` | 14 | 93.0 % | top-7 + Other |
| `Polymer family` | 24 | 82.0 % | top-7 + Other |
| `Polymer` | 78 | 55.6 % | **too many — see below** |
| `DOI` | 65 | 33.1 % | **too many — see below** |

**Rules:**
1. **≤ 7 distinct** → one hue per category, in frequency order.
2. **> 7 distinct** → the 7 most frequent get hues; everything else folds into gray **"Other"**.
   Never generate an 8th hue, and never cycle the palette.
3. **Let the user override which categories get the hues.** A researcher studying a rare anion
   must be able to promote it out of "Other". This pairs with the multi-select filter.
4. `Polymer` (78) and `DOI` (65) are near-useless as a color encoding — when one is selected,
   show an inline notice recommending the filter or the `/data` table instead. Still render it;
   just tell the truth about it.

## Mandatory secondary encoding

Light-mode CVD ΔE is 8.2 — just over the 8.0 target. The skill requires that identity never rest
on color alone, so on the scatter page **also vary the marker symbol** per category
(`circle, square, diamond, triangle-up, cross, triangle-down, x`, same fixed order as the hues;
"Other" uses `circle-open`). Cheap in Plotly, and it makes the chart readable in grayscale print
and for CVD users.

Additional relief for the contrast WARN (a few slots sit below 3:1 on their surface — this is
*not* dismissable):
- the hover tooltip always names the category in text;
- the legend is always present;
- the `/data` route is the required table view.

## Continuous color

When the color column is numeric, this palette does not apply. Use a **single-hue sequential
ramp** (light → dark) with a colorbar — never a rainbow, and never the categorical hues.
Viridis is acceptable and is perceptually uniform; the original's Plasma is also defensible.
Pick one and use it for both the scatter colorbar and the correlation heatmap's magnitude.

For the correlation heatmap specifically the data is **polarity** (−1 … +1), so it needs a
**diverging** scale: two hues with a neutral gray midpoint anchored at 0, symmetric domain
`[-1, 1]`. The original used Plasma (sequential) for diverging data — that is an anti-pattern
and we are not copying it.
