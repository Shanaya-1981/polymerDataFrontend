# Session 2 Handoff

## Summary

This session picked up right after `.venv` was created and activated in
Session 1, finished installing pandas, and then worked through two real
debugging detours that came up naturally from the actual project data: (1)
system-wide vs. virtual-environment package management (`pip` vs `pip3`,
`PEP 668`/"externally managed environment", `pip` vs `brew` ownership), and
(2) a `UnicodeDecodeError` while loading the project's real CSV
(`_Cleaned_Final_Data_6_2_2020.csv`), which turned into a deep dive on text
encodings. We closed by covering core pandas operations (selecting columns,
filtering, handling missing data) and the user wrote their own first working
script, ending with a real `doiList` extracted from the data.

## What We Learned

- **`pip` vs `pip3` are independent `PATH` lookups** — inside an activated
  venv both happened to resolve to the same file (`.venv/bin/pip`), but
  that's a property of the current `PATH` state, not a guarantee. `python3 -m
  pip` avoids a second, independent lookup entirely by using the pip module
  belonging to the already-resolved interpreter.
- **Dependencies** — `pip install pandas` also installed `numpy`,
  `python-dateutil`, and `six` because pandas declares them as required.
  Verified with `pip show pandas` → `Requires:` field.
- **PEP 668 / "externally managed environment"** — Homebrew's Python
  actively refuses `pip install`/`pip uninstall` against its own
  `site-packages`, because Homebrew (and other formulae) may depend on that
  directory's contents. This is enforced as a blanket rule regardless of
  whether a specific operation is actually risky. `--break-system-packages`
  overrides it; reasonable to use when *removing* pip-installed packages that
  Homebrew never tracked in the first place.
- **`pip`-installed vs. `brew`-installed packages are tracked separately** —
  `brew uninstall` can't see something `pip` installed, and vice versa; only
  packages with an actual Homebrew formula can be brew-managed at all.
- **Why global installs happened before** — found `rdkit`, `mordred`,
  `networkx`, `pillow` sitting in system Python from earlier (pre-venv)
  project work; recognized this as exactly the isolation failure venvs
  prevent, and removed them since nothing is permanently lost (reinstallable
  from PyPI any time).
- **`UnicodeDecodeError: invalid start byte`** — UTF-8 has strict rules about
  which bytes can start a multi-byte sequence; byte `0xA0` violates that
  rule, meaning the file isn't actually UTF-8.
- **Single-byte encodings (`latin1`, `cp1252`, `cp437`) can never raise a
  decode error** — they're total mappings (every byte 0–255 means *some*
  character), so "it didn't crash" is not evidence "it decoded correctly."
  Confirmed concretely: `cp437` decoded the file without error but turned a
  citation's non-breaking spaces into wrong accented characters, while
  `cp1252`/`latin1` correctly interpreted the same byte (`0xA0`) as a
  non-breaking space.
- **pandas' C parser reads/decodes in internal chunks** — the byte offset in
  its `UnicodeDecodeError` is relative to the current internal buffer, not
  an absolute file offset. To find the *true* offending byte, decode the
  raw file bytes yourself in one pass (`data.decode("utf-8")`) and read
  `e.start`/`e.end` off the caught exception.
- **Editors can silently rewrite files you didn't think you touched** —
  saving the CSV in the editor transcoded it to real UTF-8 (confirmed via a
  78-byte file size increase — each transcoded non-breaking space grew from
  1 byte to 2 bytes), which is why removing the `encoding=` argument later
  "mysteriously" worked. Lesson: when a fix seems inconsistent, check
  whether the underlying file/data itself changed before assuming the tool's
  behavior changed.
- **No git in this project** — flagged as a gap: without version control,
  there's no diff to catch silent file mutations like the one above, and no
  easy way to revert them.
- **Core pandas operations:**
  - `DataFrame` (2D table) vs. `Series` (1D column/row)
  - Column selection: `df["ColName"]` (bracket notation required here —
    several real column names contain spaces, so dot access wouldn't even
    work)
  - Multi-column selection: `df[["A", "B"]]` (double brackets)
  - Inspection: `df.shape`, `df.head()`, `df.info()`
  - Missing-data handling: `.isna()`, `.notna()`, `.dropna()`
  - `Series.tolist()` to hand values to non-pandas code
- **`bool` is a subclass of `int` in Python** — `True`/`False` behave as
  `1`/`0` in arithmetic, which is why `.isna().sum()` on a boolean `Series`
  correctly counts the number of missing values.

## What's Next

- `doiList` is now successfully extracted from the real project data
  (`df["DOI"].dropna().tolist()`) inside `downloadPipeline.py`.
- Natural next step: connect `doiList` to the paper-download workflow
  referenced in `paperDownloadPipeline/downloadPaper.txt` — actually
  downloading papers by DOI.
- Open question, not yet decided: whether to `git init` this project for
  version-history/safety-net purposes.
- Continue mentor mode: explain concepts, let the user run/write code
  themselves, check understanding with questions before confirming.
