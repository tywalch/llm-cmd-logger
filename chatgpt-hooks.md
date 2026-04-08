# ChatGPT/Codex Command Logging Hook - Change Log

## Request
Create a Codex/ChatGPT hook that logs every command run by ChatGPT, partitioned by month, to:

- `~/media/ai/cmd-log`

Each log line should include:

- datetime
- model
- cwd
- command

## Actions Taken

1. Investigated local Codex setup and hook support
- Inspected workspace and `~/.codex` structure.
- Verified installed Codex binary and version (`codex-cli 0.108.0-alpha.12`).
- Confirmed official hook schema/events from Codex docs (`PostToolUse`, `matcher: "Bash"`, payload fields like `model`, `cwd`, `tool_input.command`).

2. Implemented logging script
- Created a Python hook script to:
  - read hook JSON payload from stdin
  - extract `tool_input.command`, `model`, `cwd`
  - create monthly file name as `YYYY-MM.log`
  - append one line per command in this format:
    - `YYYY-MM-DDTHH:MM:SS±ZZZZ model=<model> cwd=<cwd> cmd=<command>`
- Script path (final):
  - `/Users/tylerwalch/media/ai/cmd-log/log_command.py`

3. Hook wiring (project-local first)
- Added workspace-local hook config in:
  - `/Users/tylerwalch/media/projects/code/external/usage-extensions/.codex/hooks.json`
- Configured `PostToolUse` with matcher `Bash` to execute:
  - `/usr/bin/python3 /Users/tylerwalch/media/ai/cmd-log/log_command.py`

4. Moved script to requested directory
- Moved script from workspace-local `.codex/hooks/log_command.py` to:
  - `/Users/tylerwalch/media/ai/cmd-log/log_command.py`
- Set executable permissions.

5. Enabled hooks and write access (workspace-local)
- Added/updated workspace-local config:
  - `/Users/tylerwalch/media/projects/code/external/usage-extensions/.codex/config.toml`
- Enabled:
  - `[features] codex_hooks = true`
- Added sandbox workspace-write roots:
  - workspace path
  - `/Users/tylerwalch/media/ai/cmd-log`

6. Enabled global always-on behavior
- Wrote global hook config:
  - `/Users/tylerwalch/.codex/hooks.json`
- Wrote global Codex config updates:
  - `/Users/tylerwalch/.codex/config.toml`
- Enabled globally:
  - `[features] codex_hooks = true`
- Added global sandbox workspace-write root:
  - `/Users/tylerwalch/media/ai/cmd-log`

## Verification Performed

1. Hook config validity
- Validated JSON syntax for hook configuration.

2. Script execution
- Piped a synthetic PostToolUse-like payload into the script.
- Confirmed successful append to monthly log file.

3. Log output format
- Verified appended output includes datetime, model, cwd, and cmd.
- Verified monthly partition file path:
  - `/Users/tylerwalch/media/ai/cmd-log/2026-04.log`

## Files Created/Modified

### Global (active for all Codex sessions)
- `/Users/tylerwalch/.codex/hooks.json` (created/updated)
- `/Users/tylerwalch/.codex/config.toml` (updated)

### Logging destination
- `/Users/tylerwalch/media/ai/cmd-log/log_command.py` (created via move)
- `/Users/tylerwalch/media/ai/cmd-log/2026-04.log` (appended)

### Workspace-local (also present)
- `/Users/tylerwalch/media/projects/code/external/usage-extensions/.codex/hooks.json` (created)
- `/Users/tylerwalch/media/projects/code/external/usage-extensions/.codex/config.toml` (created)

## Notes

- A first attempt to modify `~/.codex` was denied once by approval; setup was completed afterward with approval.
- Attempted cleanup of workspace-local `.codex` files using patch deletion failed in-tool, so they were left in place.
- Current active global hook is configured and points to:
  - `/Users/tylerwalch/media/ai/cmd-log/log_command.py`

