# Next steps

Feature ideas for after the rebuild, and how to test them with actual researchers.

Everything here is a proposal, not a commitment. The ranking is our best guess and the
usability testing below should be allowed to overturn it.

## What researchers are actually trying to do

The central problem in polymer electrolytes is that ion transport is coupled to segmental
motion. Lower the T<sub>g</sub> and conductivity goes up, but you lose the mechanical
properties that made a solid electrolyte worth having in the first place. Most use cases are
some version of "who has escaped that tradeoff, and how."

The data backs that framing up, but loosely:

```
log σ vs Tg    r = −0.35  (30 °C, n=218)
               r = −0.35  (60 °C, n=276)
               r = −0.58  (90 °C, n=188)
```

The trend is real and points the expected way, but most of the variance is unexplained. That
leftover scatter is where the interesting materials are, and it's what the features below try
to surface.

## Worth building, roughly in order

### 1. Fit overlays on the Temperature page

The dataset already carries `Arrhenius Ea (eV)`, `Arrhenius prefactor (S/cm)`, `VFT activation
energy (K)`, `VFT prefactor (S/cm*T^(1/2))` and `VFT T0 (degC)` for about 425 of the 655
samples. We ship all of it and use none of it. Right now the page plots raw σ(T) points and
never draws the published fit or shows an activation energy.

Draw the fitted curve through each sample's points, and put E<sub>a</sub>, σ<sub>0</sub> and
T<sub>0</sub> in the click inspector next to the polymer name.

This is the cheapest real win available. The data is already parsed, typed and tested.

### 2. Trend line and residual ranking on Explore

Fit log σ against T<sub>g</sub>, draw the line, then let someone rank or highlight the samples
sitting furthest above it. Those are the materials that beat the coupling, which is the whole
question. With r ≈ −0.35 there are plenty of them.

Needs a little care: the fit should use only the currently filtered set, and it should say how
many points it fitted, so nobody reads a trend line drawn through nine samples as meaningful.

### 3. "Add my sample"

Let someone type in their own T<sub>g</sub> and σ, or paste a few rows, and plot it on top of
the literature cloud. "Where does my material sit?" is the question a working researcher has
every time, and no version of this site has ever answered it.

Entirely client-side, no backend. Nothing typed in needs to leave the browser, which is worth
saying on screen because people will be pasting unpublished numbers.

### 4. Box-select to export and list DOIs

Plotly already supports lasso and box selection. We only wired up single-click. Let someone
select a cluster and get back the samples plus the papers behind them. That turns the plot into
a literature-review tool.

### 5. Small multiples

The same σ-vs-T<sub>g</sub> panel repeated once per polymer family or anion. Eight families
have 20 or more samples, which is enough for a useful grid. This is the honest answer to "how
does a third variable shift the relationship."

Note the imbalance: `ether` alone is 316 of the 655 samples, so panels will be very unequal in
density and the axes should stay shared so they're comparable.

### 6. Binned median heatmap

Median σ over T<sub>g</sub> × salt-concentration bins, with sparse bins greyed out rather than
interpolated. Shows the response surface without inventing data between samples.

## What we decided against

**3D plots.** A 3D scatter would be worse than what we already have. 655 points occlude each
other, you can't judge position along the depth axis, and it only reads while you're rotating
it, which makes it useless in an SI figure or on paper. We already encode a third variable as
colour and a fourth as marker shape. When people ask for 3D they usually want to see how a
third variable shifts a relationship, and small multiples or the binned heatmap above do that
better. A genuine response surface would be the one defensible 3D case, but fitting one to 655
irregularly scattered samples would mean inventing data between them.

**A transference-number tradeoff view.** t<sub>+</sub> decoupling is the field's other big
question, so this is tempting, but only **30 samples** have both t<sub>+</sub> and σ(60 °C), and
r = −0.175 across them. This dataset can't answer it. Better to say so than to plot 30 points
and imply a trend.

---

# Testing it with researchers

The ranking above is a guess. One or two sessions with real users will beat it. Notes below on
how to run those without wasting them.

## How to run a session

Give them a real task from their own work. Don't demo the site. "Show me what you were last
trying to find out about an electrolyte, and see if you can answer it here" gets you more in
five minutes than an hour of walking them through features.

Don't explain the UI first. Everything we learn comes from watching them fail to find
something. If we've already pointed at it, that information is gone.

Let silences run. The urge to rescue someone who is stuck is strong and it destroys the
observation. Wait.

Ask what they expect **before** they click, not after. "What do you think that will do?" is
useful. "Did that do what you expected?" invites them to be polite.

Watch what they do, not what they say. People will tell us a confusing interface is fine.

## Things to watch for

**Getting oriented**

- What do they plot first? If everyone immediately changes both axes off our defaults
  (`approxTg` vs `Conductivity at 60C`), the defaults are wrong.
- Do they find the filters at all? On a phone they're behind a "Controls" button, which is the
  most likely thing to go unnoticed.
- Do they ever reach the Data page, or does a plot-first layout hide it?

**Whether our vocabulary matches theirs**

- Do they use different names for things than our labels do? If someone says "salt
  concentration" and scans past `Li:functional group`, that's a labelling problem, not a user
  problem.
- **Watch the two Tg columns closely.** `Tg` and `approxTg` are genuinely different (368 vs 441
  samples, and `approxTg` falls back to the salt-free polymer value). Do they notice? Do they
  pick the one they meant? This is our most likely source of a silently wrong conclusion.
- Does the grey "Other" bucket confuse them? Do they know what's in it, and do they realise
  they can promote a category out of it?

**Whether they trust it**

- Do they ask where a number came from? Do they follow a DOI link to check?
- Is there anything they wouldn't use without opening the paper first? That's the credibility
  gap, and it's worth knowing exactly where it sits.
- Does anyone notice the correlation matrix differs from the original site's? If someone has
  the old numbers in a spreadsheet, we want to hear how they react.

**Sparse data**

This is the one we're most likely to get blamed for. Several properties are only recorded for a
handful of samples (transference number 80, D<sub>Li</sub> 29, storage modulus 4). When someone
plots one and gets a near-empty chart, **do they conclude the site is broken, or that the data
is thin?** If it's the former, the empty state isn't doing its job.

Same question for the log-axis notice. Switching a T<sub>g</sub> axis to log drops most of the
points. Do they read the notice, or stare at a sparse plot and lose confidence?

**Features we're considering**

These tell us whether the list above is right:

- Do they try to click a point? Do they discover the inspector unprompted?
- Do they try to **select several points at once**? If they reach for it, #4 is confirmed.
- Do they go looking for their own measurements, or try to compare something they made? That
  confirms #3.
- Do they ask about a fit, an activation energy, or why the temperature plot has no line through
  it? That confirms #1.
- Do they ask to see one family at a time, side by side? That confirms #5.

**Sharing**

- When they want to keep or send a view, do they copy the URL or reach for a screenshot? If
  it's a screenshot, our shareable-link feature isn't discoverable, no matter how well it works.
- Do they try to download a figure? Do they find the Plotly toolbar?

**Things that aren't there**

Keep a running list of anything they look for and don't find: a property we don't carry, a plot
type, a filter, a comparison. That list is more valuable than any of our own ideas.

## Questions worth asking

At the end, not during:

- What were you hoping to find that you couldn't?
- Was there a number here you didn't trust?
- If this replaced one thing in your current workflow, what would it be?
- What would need to be true before you'd cite something from this in a paper?
- What would stop you using it again?

## Questions not worth asking

"Do you like it?" "Is it easy to use?" "Would you use this?" People say yes to all three
regardless, and none of the answers change what we build.
