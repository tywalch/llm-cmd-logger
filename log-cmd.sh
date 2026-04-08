#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
MODEL=$(cat "$HOME/media/ai/cmd-log/.current-model" 2>/dev/null || echo "unknown")
if [ -n "$CMD" ]; then
  LOGFILE="$HOME/media/ai/cmd-log/$(date +%Y-%m).log"
  echo "$(date '+%Y-%m-%d %H:%M:%S') (claude) $MODEL [$CWD] $ $CMD" >> "$LOGFILE"
fi
