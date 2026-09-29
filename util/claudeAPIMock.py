"""Ask an LLM a question, answered by Claude Code instead of a paid API.

`ask_llm()` runs Claude Code's non-interactive mode (`claude -p`) on your
Claude Code login (issue #4). Calls count against your Claude Code plan's
usage limits; nothing is billed to an API key. It needs a working `claude`
command on PATH.

Swapping in a real API later -- the Claude API, OpenAI, or a local model
server -- means rewriting the body of `ask_llm()`. All of them take the same
inputs (a prompt, a system prompt, a model name, optionally a JSON schema), so
code that calls it doesn't change.

Each call still carries a few lines of Claude Code's own context that a real
API call wouldn't: today's date, your platform, and your account's email.
Your CLAUDE.md files and the folder you call it from are kept out. Even a
one-word reply takes about 5 seconds.

Import it with `from util.claudeAPIMock import ask_llm`. Code run from the
repo root finds it as is; `extraction/` runs from inside `extraction/`, so
start that with `PYTHONPATH=..`.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile

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


def ask_llm(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    json_schema: dict | None = None,
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
    timeout: seconds to wait for the reply.

    Raises RuntimeError carrying Claude Code's own message when the call
    fails: `claude` missing, usage limit reached, unknown model, timeout.
    """
    command = [
        "claude",
        "-p",
        "--output-format", "json",
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
        # The prompt goes on stdin rather than the command line: a paper's
        # text runs past 80K characters.
        done = subprocess.run(
            command,
            input=prompt,
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

    try:
        result = json.loads(done.stdout)
    except json.JSONDecodeError:
        # Rejected before it started (bad flag, invalid schema): the reason is on stderr.
        raise RuntimeError(
            f"claude -p failed (exit {done.returncode}): {(done.stderr or done.stdout).strip()}"
        ) from None
    if done.returncode != 0 or result.get("is_error"):
        reason = result.get("result") or result.get("errors") or result.get("subtype")
        raise RuntimeError(f"claude -p failed: {reason}")

    if json_schema is None:
        return result["result"]
    if "structured_output" not in result:
        raise RuntimeError("claude -p finished without a reply matching json_schema")
    return json.dumps(result["structured_output"], ensure_ascii=False)
