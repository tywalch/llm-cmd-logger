#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

export interface CursorCommand {
  kind: "cursor-command";
  command: string;
  cwd: string;
  model: string;
}

export interface CodexCommand {
  kind: "codex-command";
  command: string;
  cwd: string;
  model: string;
}

export interface ClaudeCommand {
  kind: "claude-command";
  command: string;
  cwd: string;
  model: string;
}

export interface ClaudeSession {
  kind: "claude-session";
  model: string;
}

export type HookEvent = CursorCommand | CodexCommand | ClaudeCommand | ClaudeSession;

/** Any event that carries a shell command worth logging. */
export type CommandEvent = CursorCommand | CodexCommand | ClaudeCommand;

// ── Constants ──────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<CommandEvent["kind"], string> = {
  "cursor-command": "cursor",
  "codex-command": "chatgpt",
  "claude-command": "claude",
};

// ── Type guards ────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns `value` when it is a non-empty string, otherwise `undefined`. */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// ── Classification ─────────────────────────────────────────────────────

/**
 * Classifies a raw JSON value into a typed {@link HookEvent}.
 *
 * Detection relies on each source's unique payload fingerprint:
 *
 * | Source  | Fingerprint                                           |
 * |---------|-------------------------------------------------------|
 * | Cursor  | top-level `command` + `workspace_roots` array         |
 * | Codex   | `tool_input.command` + top-level `model`              |
 * | Claude  | `event: "SessionStart"` or bare `tool_input.command`  |
 *
 * Returns `null` for payloads that don't match any known shape.
 */
export function classify(raw: unknown): HookEvent | null {
  if (!isRecord(raw)) return null;

  // Cursor: top-level `command` + `workspace_roots` array
  if (str(raw["command"]) && Array.isArray(raw["workspace_roots"])) {
    const roots = raw["workspace_roots"] as unknown[];
    return {
      kind: "cursor-command",
      command: raw["command"] as string,
      cwd: str(raw["cwd"]) ?? str(roots[0]) ?? "",
      model:
        str(raw["modelId"]) ??
        str(raw["model_name"]) ??
        str(raw["model"]) ??
        "unknown",
    };
  }

  // Codex/ChatGPT: nested `tool_input.command` + top-level `model`
  const toolInput = raw["tool_input"];
  if (isRecord(toolInput) && str(toolInput["command"])) {
    if (str(raw["model"])) {
      return {
        kind: "codex-command",
        command: toolInput["command"] as string,
        cwd: str(raw["cwd"]) ?? "",
        model: raw["model"] as string,
      };
    }

    // Claude SessionStart won't have tool_input, but guard anyway
    if (raw["event"] !== "SessionStart") {
      return {
        kind: "claude-command",
        command: toolInput["command"] as string,
        cwd: str(raw["cwd"]) ?? "",
        model: "unknown",
      };
    }
  }

  // Claude SessionStart
  if (raw["event"] === "SessionStart") {
    return {
      kind: "claude-session",
      model: str(raw["model"]) ?? "unknown",
    };
  }

  return null;
}

// ── Formatting ─────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTimestamp(now: Date): string {
  return (
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ` +
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  );
}

export function monthSlug(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function escapeNewlines(s: string): string {
  return s.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

export function formatLogLine(event: CommandEvent, now: Date = new Date()): string {
  const source = SOURCE_LABEL[event.kind];
  return `${formatTimestamp(now)} | ${source}:${event.model} | ${event.cwd} | ${escapeNewlines(event.command)}`;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
  });
}

function appendToLog(logDir: string, line: string, now: Date = new Date()): void {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, `${monthSlug(now)}.log`);
  fs.appendFileSync(logFile, line + "\n", "utf-8");
}

function writeLogEntry(logDir: string, event: CommandEvent): void {
  const now = new Date();
  appendToLog(logDir, formatLogLine(event, now), now);
}

function logError(logDir: string, context: string, error: unknown, stdin?: string): void {
  try {
    const now = new Date();
    const message = escapeNewlines(error instanceof Error ? error.message : String(error));
    const truncatedStdin = stdin !== undefined ? escapeNewlines(stdin).slice(0, 200) : "";
    appendToLog(logDir, `${formatTimestamp(now)} | ERROR | ${context} | ${message} | stdin: ${truncatedStdin}`, now);
  } catch {
    // Nothing left to do — can't write to the log file itself.
  }
}

function isCommandEvent(event: HookEvent): event is CommandEvent {
  return event.kind !== "claude-session";
}

async function main(): Promise<void> {
  const logDir = process.argv[2];
  if (!logDir) {
    process.stderr.write("Usage: cmd-log <log-directory>\n");
    process.exitCode = 1;
    return;
  }

  const input = await readStdin();

  let raw: unknown;
  try {
    raw = input.trim() ? JSON.parse(input) : null;
  } catch (error) {
    raw = null;
    logError(logDir, "parse", error, input);
  }

  try {
    const event = classify(raw);
    if (event !== null && isCommandEvent(event)) {
      writeLogEntry(logDir, event);
    }
  } catch (error) {
    logError(logDir, "write", error, input);
  }
}

main().catch((error: unknown) => {
  // logDir may not be available if main() failed before reading argv,
  // but try to log to stderr as a last resort.
  process.stderr.write(`[cmd-log] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
});
