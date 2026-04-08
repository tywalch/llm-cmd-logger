# Cursor agent shell command logging

This document summarizes what was set up to log shell commands executed by the Cursor agent via the **Hooks** feature.

## What Cursor hooks do here

- **Event:** `beforeShellExecution` — runs immediately before the agent runs a terminal command.
- **Mechanism:** Cursor spawns the configured command and passes a **JSON payload on stdin**. The script must write a **JSON hook response to stdout** so the command is allowed to proceed.

Official reference: [Hooks | Cursor Docs](https://cursor.com/docs/agent/hooks).

## Files created or changed

### 1. Hook script

| Item | Detail |
|------|--------|
| **Path** | `~/media/ai/cmd-log/cursor-shell-cmd-log.py` |
| **Permissions** | Executable (`chmod +x`) |
| **Interpreter** | `#!/usr/bin/env python3` |

**Behavior:**

- Reads and parses JSON from stdin (invalid or empty JSON is tolerated; logging uses empty defaults where needed).
- Ensures the log directory exists: `~/media/ai/cmd-log`.
- Appends **one line** to a **month-partitioned** file: `~/media/ai/cmd-log/YYYY-MM.log` (example: `2026-04.log`).
- Writes **UTF-8** in **append** mode.

**Log line format** (single line per invocation, **tab-separated**):

1. **Datetime** — local timezone, ISO 8601 with offset, seconds precision (e.g. `2026-04-07T14:32:01-07:00`).
2. **Origin** — literal `cursor` (identifies the source application).
3. **Model** — first non-empty value among JSON keys `model`, `model_name`, `modelId`; otherwise `unknown`.
4. **Working directory** — `cwd` from the payload if non-empty; else the first entry in `workspace_roots`; else empty.
5. **Command** — the `command` string; carriage returns and newlines are escaped as `\r` and `\n` so each record stays on one line.

**Stdout response** (required by Cursor so execution continues):

```json
{"permission": "allow"}
```

The script writes this with `json.dumps` and flushes stdout.

### 2. Global Cursor hooks configuration

| Item | Detail |
|------|--------|
| **Path** | `~/.cursor/hooks.json` |

**Contents (structure):**

- `version`: `1`
- `hooks.beforeShellExecution`: array with one entry whose `command` is the **absolute path** to `cursor-shell-cmd-log.py`.

If you add more hooks later, append additional objects to the `beforeShellExecution` array (or other hook keys) without removing this entry unless you intend to disable logging.

## Verification performed

- Ran the script with a synthetic JSON payload piped on stdin; confirmed stdout was `{"permission": "allow"}` and a matching line appeared in the current month’s `.log` file.
- Suggested manual check in Cursor: **View → Output → channel “Hooks”**, then trigger a trivial agent command (e.g. `echo hook-test`) and inspect the log file.

## Scope and limitations

- Only **agent shell** invocations covered by `beforeShellExecution` are logged — not every editor action, MCP tool call, or file edit.
- The documented minimal payload may only include `command` and `cwd`; extra fields (like model) depend on the Cursor version and may sometimes be absent (`unknown` for model).

## Related paths (quick reference)

```text
~/media/ai/cmd-log/cursor-shell-cmd-log.py   # hook executable
~/media/ai/cmd-log/YYYY-MM.log                 # append-only monthly logs
~/.cursor/hooks.json                           # Cursor hook registration
```
