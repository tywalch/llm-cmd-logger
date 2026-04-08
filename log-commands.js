#!/usr/bin/env node

/**
 * Unified command logger for Claude Code, ChatGPT/Codex, and Cursor
 * Reads hook payloads from stdin, logs commands to ~/media/ai/cmd-log/YYYY-MM.log
 * Detects source by payload structure and formats consistently
 */

const fs = require("fs");
const path = require("path");

const Source = {
  Claude: "claude",
  ChatGPT: "chatgpt",
  Cursor: "cursor",
  Unknown: "unknown",
};

function getTimestamp() {
  const now = new Date();

  // Format: YYYY-MM-DD HH:MM:SS
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getMonthPath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function detectSource(payload) {
  // Cursor: has command + workspace_roots (not tool_input.command)
  if (payload.command && Array.isArray(payload.workspace_roots)) {
    return Source.Cursor;
  }

  // ChatGPT/Codex: has tool_input.command AND has model field
  if (payload.tool_input?.command && (payload.model || payload.model_name || payload.modelId)) {
    return Source.ChatGPT;
  }

  // Claude: has event field == SessionStart
  if (payload.event === "SessionStart") {
    return Source.Claude; // Special case: don't log, just return source
  }

  // Claude: has tool_input.command (without model field) or cwd
  if (payload.tool_input?.command || payload.cwd) {
    return Source.Claude;
  }

  return Source.Unknown;
}

function extractModel(payload) {
  // Try multiple field names in priority order
  if (payload.modelId && typeof payload.modelId === "string") {
    return payload.modelId;
  }
  if (payload.model_name && typeof payload.model_name === "string") {
    return payload.model_name;
  }
  if (payload.model && typeof payload.model === "string") {
    return payload.model;
  }
  return "unknown";
}

function extractCwd(payload, source) {
  // Try cwd first
  if (payload.cwd && typeof payload.cwd === "string") {
    return payload.cwd;
  }

  // For Cursor, try workspace_roots[0]
  if (
    source === Source.Cursor &&
    Array.isArray(payload.workspace_roots) &&
    payload.workspace_roots.length > 0
  ) {
    return payload.workspace_roots[0];
  }

  return "";
}

function extractCommand(payload, source) {
  let command = "";

  if (source === Source.ChatGPT) {
    command = payload.tool_input?.command || "";
  } else if (source === Source.Cursor) {
    command = payload.command || "";
  } else if (source === Source.Claude) {
    command = payload.tool_input?.command || "";
  }

  // Escape newlines to keep log entries on single lines
  command = command.replace(/\n/g, "\\n").replace(/\r/g, "\\r");

  return command;
}

function extractData(payload) {
  const source = detectSource(payload);

  // Skip logging for Claude SessionStart events (just return null)
  if (source === Source.Claude && payload.event === "SessionStart") {
    return null;
  }

  // Skip unknown or invalid sources
  if (source === Source.Unknown) {
    return null;
  }

  const model = extractModel(payload);
  const cwd = extractCwd(payload, source);
  const command = extractCommand(payload, source);

  // Skip if no command found
  if (!command) {
    return null;
  }

  return { source, model, cwd, command };
}

function formatLogLine(timestamp, data) {
  // Format: YYYY-MM-DD HH:MM:SS | source:model | cwd | command
  return `${timestamp} | ${data.source}:${data.model} | ${data.cwd} | ${data.command}`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
  });
}

function ensureLogDirectory() {
  const logDir = path.join(process.env.HOME || "", "media", "ai", "cmd-log");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function writeLogEntry(data) {
  try {
    ensureLogDirectory();

    const timestamp = getTimestamp();
    const monthPath = getMonthPath();
    const logDir = path.join(process.env.HOME || "", "media", "ai", "cmd-log");
    const logFile = path.join(logDir, `${monthPath}.log`);

    const logLine = formatLogLine(timestamp, data);

    fs.appendFileSync(logFile, logLine + "\n", { encoding: "utf-8" });
  } catch (error) {
    // Silently fail to not interrupt hook execution
    console.error(
      "[log-commands] Error writing log:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function sendCursorResponse() {
  // Cursor requires this response to allow execution to proceed
  const response = { permission: "allow" };
  process.stdout.write(JSON.stringify(response));
  process.stdout.write("\n");
}

async function main() {
  try {
    const input = await readStdin();
    let payload = {};

    // Parse JSON payload, handle invalid JSON gracefully
    if (input && input.trim()) {
      try {
        payload = JSON.parse(input);
      } catch {
        // Invalid JSON, proceed with empty payload
        payload = {};
      }
    }

    const data = extractData(payload);

    // Log the command if we have valid data
    if (data) {
      writeLogEntry(data);
    }

    // Cursor requires JSON response to stdout
    const source = detectSource(payload);
    if (source === Source.Cursor) {
      sendCursorResponse();
    }
  } catch (error) {
    // Ensure Cursor still gets a response even on errors
    const input = await readStdin().catch(() => "");
    const payload = input ? JSON.parse(input).catch(() => ({})) : {};
    const source = detectSource(payload);
    if (source === Source.Cursor) {
      sendCursorResponse();
    }
  }
}

main().catch(console.error);
