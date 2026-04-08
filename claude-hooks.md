# Claude Code Command Logging Hooks

## Overview

This setup logs every Bash command that Claude Code executes to monthly log files. Each log entry includes a timestamp, the Claude model in use, the working directory, and the command that was run.

## Files

### `~/.claude/settings.json`

The Claude Code user-level settings file. Defines two hooks:

- **`SessionStart`** — Fires when a new Claude Code session begins. Runs `cache-model.sh` to capture and cache the active model name.
- **`PostToolUse`** (matcher: `Bash`) — Fires after every Bash tool call. Runs `log-cmd.sh` to append the command to the monthly log file.

### `~/media/ai/cmd-log/cache-model.sh`

Reads the JSON payload provided on stdin by the `SessionStart` hook event. Extracts the `model` field (e.g., `claude-opus-4-6`) and writes it to `.current-model` so it can be referenced by `log-cmd.sh` during the session.

The `model` field is only available in the `SessionStart` event, not in `PostToolUse`, which is why this caching step is necessary.

### `~/media/ai/cmd-log/log-cmd.sh`

Reads the JSON payload provided on stdin by the `PostToolUse` hook event. Extracts the `tool_input.command` and `cwd` fields. Reads the cached model name from `.current-model`. Appends a formatted log line to the current month's log file.

### `~/media/ai/cmd-log/.current-model`

A transient file that stores the model name for the active session. Written by `cache-model.sh` on session start, read by `log-cmd.sh` on each Bash command. Falls back to `"unknown"` if this file is missing.

### `~/media/ai/cmd-log/YYYY-MM.log`

The monthly log files (e.g., `2026-04.log`). Each line follows the format:

```
2026-04-07 09:44:31 [claude-opus-4-6] [/Users/tylerwalch/.claude] echo "hook test"
```

## How It Works

1. A Claude Code session starts.
2. The `SessionStart` hook fires. `cache-model.sh` reads the model name from the hook's JSON stdin and writes it to `.current-model`.
3. Claude runs a Bash command during the session.
4. The `PostToolUse` hook fires. `log-cmd.sh` reads the command and cwd from the hook's JSON stdin, reads the cached model name from `.current-model`, and appends a timestamped log line to the current month's `.log` file.

## Why `~/media/ai/cmd-log/`?

The `~/.claude/` directory is managed by Claude Code and may be cleared or restructured across updates. `~/media/ai/cmd-log/` was chosen as a stable, user-controlled location for persistent log data.

## Dependencies

- `jq` — used by both scripts to parse JSON from stdin.
