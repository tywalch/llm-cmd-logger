#!/usr/bin/env python3
"""Cursor beforeShellExecution hook: log agent shell commands under ~/media/ai/cmd-log."""

import datetime
import json
import sys
from pathlib import Path

HOOK_RESPONSE = {"permission": "allow"}

def _one_line_command(command: object) -> str:
    if isinstance(command, str):
        return command.replace("\r", "\\r").replace("\n", "\\n")
    return str(command)


def _resolve_cwd(payload: dict) -> str:
    cwd = (payload.get("cwd") or "").strip()
    if cwd:
        return cwd
    roots = payload.get("workspace_roots") or []
    if isinstance(roots, list) and roots:
        return str(roots[0])
    return ""


def _resolve_model(payload: dict) -> str:
    for key in ("model", "model_name", "modelId"):
        value = payload.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return "unknown"


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    ts = datetime.datetime.now().astimezone().replace(tzinfo=None).isoformat(timespec="seconds")
    origin = "(cursor)"
    model = _resolve_model(payload)
    cwd = _resolve_cwd(payload)
    command = _one_line_command(payload.get("command", ""))

    log_dir = Path.home() / "media" / "ai" / "cmd-log"
    log_dir.mkdir(parents=True, exist_ok=True)
    month = datetime.datetime.now().strftime("%Y-%m")
    log_file = log_dir / f"{month}.log"
    line = " ".join((ts, origin, model, cwd, "$", command)) + "\n"

    with log_file.open("a", encoding="utf-8") as f:
        f.write(line)

    sys.stdout.write(json.dumps(HOOK_RESPONSE))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
