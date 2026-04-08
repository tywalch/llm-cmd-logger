#!/bin/bash
INPUT=$(cat)
MODEL=$(echo "$INPUT" | jq -r '.model // empty')
if [ -n "$MODEL" ]; then
  echo "$MODEL" > "$HOME/media/ai/cmd-log/.current-model"
fi
