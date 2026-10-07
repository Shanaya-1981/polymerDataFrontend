"""The steps an extraction job goes through, as GET /extract/<id> reports
them while it runs (issue #13).

Each step has a name and a description for the page to show, and the percent
complete a job has reached when the step starts. The percents follow where the
time goes: MinerU's parse of a new paper takes about 4 minutes and the model
call about 1, so parsing spans most of the bar. Nothing finer is known inside a
step -- MinerU and `claude -p` each run as one blocking call -- so the bar
moves at step boundaries only, and a step a job doesn't need is skipped: a
paper parsed before goes straight from waiting to asking the model.
"""

from __future__ import annotations

from dataclasses import dataclass

QUEUED = "queued"
PARSING = "parsing"
ASKING = "asking"
COLLECTING = "collecting"


@dataclass(frozen=True)
class Step:
    name: str
    description: str
    percent: int  # complete when the step starts


# In the order a job goes through them.
STEPS: dict[str, Step] = {
    QUEUED: Step("Waiting to start", "The server runs one extraction at a time.", 0),
    PARSING: Step(
        "Parsing the PDF",
        "MinerU is turning the paper into text, tables and figure images. "
        "A paper the server hasn't seen before takes about 4 minutes.",
        5,
    ),
    ASKING: Step(
        "Asking the model",
        "The model is reading the paper and pulling out each feature. "
        "This takes about 30 seconds to 2 minutes.",
        60,
    ),
    COLLECTING: Step("Collecting the results", "Grouping the data points by sample.", 95),
}


def progress(step: str, ahead: int = 0) -> dict:
    """The `progress` object of a running job's status answer. `ahead` is the
    number of jobs the worker finishes before a queued one starts."""
    info = STEPS[step]
    description = info.description
    if step == QUEUED and ahead > 0:
        earlier = "1 earlier extraction" if ahead == 1 else f"{ahead} earlier extractions"
        description = f"Waiting for {earlier} to finish. {info.description}"
    return {"step": step, "name": info.name, "description": description, "percent": info.percent}
