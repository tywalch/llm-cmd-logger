#!/usr/bin/env python3
import datetime
import json
import os
from pathlib import Path
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return 0

    command = tool_input.get("command")
    if not isinstance(command, str) or command == "":
        return 0

    model = payload.get("model")
    if not isinstance(model, str) or model == "":
        model = "unknown"

    cwd = payload.get("cwd")
    if not isinstance(cwd, str) or cwd == "":
        cwd = os.getcwd()

    now = datetime.datetime.now().astimezone()
    timestamp = now.strftime("%Y-%m-%dT%H:%M:%S%z")
    month = now.strftime("%Y-%m")

    log_dir = Path.home() / "media" / "ai" / "cmd-log"
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        return 0

    log_file = log_dir / f"{month}.log"
    command_one_line = command.replace("\n", "\\n")
    line = f"{timestamp} (chatgpt) {model} [{cwd}] $ {command_one_line}\n"

    try:
        with log_file.open("a", encoding="utf-8") as handle:
            handle.write(line)
    except Exception:
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
