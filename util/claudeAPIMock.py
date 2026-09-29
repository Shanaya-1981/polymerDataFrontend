"""Ask an LLM a question, answered by Claude Code instead of a paid API.

`ask_llm()` runs Claude Code's non-interactive mode (`claude -p`) on your
Claude Code login (issue #4). Calls count against your Claude Code plan's
usage limits; nothing is billed to an API key. It needs a working `claude`
command on PATH.

Swapping in a real API later -- the Claude API, OpenAI, or a local model
server -- means rewriting the body of `ask_llm()`. All of them take the same
inputs (a prompt, a system prompt, a model name, and optionally images, PDFs
and a JSON schema), so code that calls it doesn't change. For `images`, a local
model has to be one that reads images; few local models read PDFs, so for
those, turn the PDF into text and images first (MinerU does that here).

Each call still carries a few lines of Claude Code's own context that a real
API call wouldn't: today's date, your platform, and your account's email.
Your CLAUDE.md files and the folder you call it from are kept out. Even a
one-word reply takes 3-5 seconds.

Import it with `from util.claudeAPIMock import ask_llm`. Code run from the
repo root finds it as is; `extraction/` runs from inside `extraction/`, so
start that with `PYTHONPATH=..`.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import subprocess
import tempfile
from collections.abc import Sequence
from pathlib import Path

DEFAULT_SYSTEM = "You are a helpful assistant."

# Added to every system prompt. Claude Code tells the model it is in a session
# with a working folder, and it offers to look at files or suggests shell
# commands; this keeps it to the material the caller sent. A real API call
# has no such framing, so a real-API ask_llm() can drop this line.
_DATA_ONLY = (
    "Use only the data in the user's message as your source material. You have no "
    "files, folders, tools or internet access, so don't look for or mention any."
)

# With either of these in the environment, `claude` bills that key instead of
# using your Claude Code login. extraction/ loads ANTHROPIC_API_KEY from .env
# (pipeline/config_loader.py), so it is usually set.
_API_KEY_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")

# The image formats Claude reads.
_IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")


def ask_llm(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    json_schema: dict | None = None,
    images: Sequence[str | Path | tuple[str | Path, str]] = (),
    documents: Sequence[str | Path] = (),
    timeout: float = 1800,
) -> str:
    """Send one prompt and return the reply as text.

    system: instructions for the whole reply. They replace Claude Code's own
        coding-assistant instructions; None uses DEFAULT_SYSTEM. The
        _DATA_ONLY line is always added after them.
    model: e.g. "claude-sonnet-5", or an alias like "opus". None uses your
        Claude Code default model.
    json_schema: a JSON Schema, i.e. a dict describing the shape the reply must
        have. The reply is then JSON of that shape, returned as a string:
        json.loads() it, as you would a real API's reply.
    images: image files shown to the model after the prompt, in this order.
        Each is a path, or a (path, label) pair whose label is text placed just
        before that image, such as its caption. PNG, JPEG, GIF or WebP; any
        other file type raises ValueError before anything is sent.
    documents: PDF files shown to the model before the prompt. Claude reads
        each page's text and images itself. Any other file type raises
        ValueError before anything is sent.
    timeout: seconds to wait for the reply.

    Raises RuntimeError carrying Claude Code's own message when the call
    fails: `claude` missing, usage limit reached, unknown model, timeout.
    """
    content: list[dict] = []
    for document in documents:
        if mimetypes.guess_type(str(document))[0] != "application/pdf":
            raise ValueError(f"{document}: documents must be PDF files")
        content.append({"type": "document", "source": _base64_source(document, "application/pdf")})
    content.append({"type": "text", "text": prompt})
    for image in images:
        path, label = image if isinstance(image, tuple) else (image, None)
        if label:
            content.append({"type": "text", "text": label})
        content.append({"type": "image", "source": _base64_source(path, _media_type(path))})
    # One user message in Claude Code's stream-json format, which Anthropic's
    # Agent SDK also uses to drive `claude`. Unlike plain text, it can carry images and PDFs.
    message = {
        "type": "user",
        "session_id": "",
        "parent_tool_use_id": None,
        "message": {"role": "user", "content": content},
    }

    command = [
        "claude",
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",  # claude -p refuses stream-json output without it
        "--no-session-persistence",  # keep these calls out of your session history
        "--system-prompt", f"{system or DEFAULT_SYSTEM}\n\n{_DATA_ONLY}",
    ]
    if model:
        command += ["--model", model]
    if json_schema is not None:
        command += ["--json-schema", json.dumps(json_schema)]
    # No tools (reading files, running commands): one question in, one answer
    # out, like an API call. Must come last: --tools takes several values and
    # would swallow anything after it.
    command += ["--tools", ""]

    env = {k: v for k, v in os.environ.items() if k not in _API_KEY_VARS}
    # Keep your CLAUDE.md files out of the prompt; a real API call wouldn't see them.
    env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"] = "1"
    try:
        # The message goes on stdin rather than the command line: a paper's
        # text runs past 80K characters, and its figures or PDF to megabytes.
        done = subprocess.run(
            command,
            input=json.dumps(message) + "\n",
            capture_output=True,
            text=True,
            env=env,
            # Outside the repo, so the reply isn't shaped by whichever project
            # folder or git branch the caller happened to be in.
            cwd=tempfile.gettempdir(),
            timeout=timeout,
        )
    except OSError as e:  # not installed, or not executable
        raise RuntimeError(
            f"could not run `claude` ({e}). Install or reinstall Claude Code: "
            "npm install -g @anthropic-ai/claude-code"
        ) from None
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"claude -p gave no reply within {timeout:.0f} s") from None

    # The output is one JSON event per line; the reply, or what went wrong, is
    # in the "result" event at the end.
    result = None
    for line in done.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict) and event.get("type") == "result":
            result = event
    if result is None:
        # Rejected before it started (bad flag, invalid schema): the reason is on stderr.
        raise RuntimeError(
            f"claude -p failed (exit {done.returncode}): {(done.stderr or done.stdout).strip()[-2000:]}"
        )
    if done.returncode != 0 or result.get("is_error"):
        reason = result.get("result") or result.get("errors") or result.get("subtype")
        raise RuntimeError(f"claude -p failed: {reason}")

    if json_schema is None:
        return result["result"]
    if "structured_output" not in result:
        raise RuntimeError("claude -p finished without a reply matching json_schema")
    return json.dumps(result["structured_output"], ensure_ascii=False)


def _base64_source(path: str | Path, media_type: str) -> dict:
    data = base64.standard_b64encode(Path(path).read_bytes()).decode("ascii")
    return {"type": "base64", "media_type": media_type, "data": data}


def _media_type(path: str | Path) -> str:
    media_type = mimetypes.guess_type(str(path))[0]
    if media_type not in _IMAGE_TYPES:
        raise ValueError(f"{path}: Claude reads PNG, JPEG, GIF or WebP images, not {media_type or 'this file type'}")
    return media_type
