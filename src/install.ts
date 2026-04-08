#!/usr/bin/env node

/**
 * Idempotent installer for cmd-log hooks.
 *
 * Registers the unified logging script in the global hook configs for
 * Claude Code, ChatGPT/Codex, and Cursor. Safe to run multiple times —
 * existing hook entries are updated in place rather than duplicated.
 *
 * Usage: node dist/install.js
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ── Paths ──────────────────────────────────────────────────────────────

const HOME = process.env.HOME ?? "";
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const DIST_INDEX = path.join(PROJECT_ROOT, "dist", "index.js");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const NODE_BIN = "/usr/local/bin/node";

const CLAUDE_SETTINGS = path.join(HOME, ".claude", "settings.json");
const CODEX_HOOKS = path.join(HOME, ".codex", "hooks.json");
const CODEX_CONFIG = path.join(HOME, ".codex", "config.toml");
const CURSOR_HOOKS = path.join(HOME, ".cursor", "hooks.json");

const HOOK_COMMAND = `${NODE_BIN} ${DIST_INDEX} ${LOG_DIR}`;

// ── JSON helpers ───────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (!content) return {};
  return JSON.parse(content) as Record<string, unknown>;
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Claude Code ────────────────────────────────────────────────────────

interface ClaudeHookEntry {
  type: string;
  command: string;
}

interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeHookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    SessionStart?: ClaudeHookGroup[];
    PostToolUse?: ClaudeHookGroup[];
  };
  [key: string]: unknown;
}

function installClaude(): void {
  const settings = readJson(CLAUDE_SETTINGS) as ClaudeSettings;
  settings.hooks ??= {};

  const hookEntry: ClaudeHookEntry = { type: "command", command: HOOK_COMMAND };

  // SessionStart — no matcher, single hook group
  const sessionGroups = settings.hooks.SessionStart ?? [];
  const sessionGroup = sessionGroups.find((g) => !g.matcher);
  if (sessionGroup) {
    const idx = sessionGroup.hooks.findIndex((h) => h.command.includes("cmd-log"));
    if (idx >= 0) {
      sessionGroup.hooks[idx] = hookEntry;
    } else {
      sessionGroup.hooks.push(hookEntry);
    }
  } else {
    sessionGroups.push({ hooks: [hookEntry] });
  }
  settings.hooks.SessionStart = sessionGroups;

  // PostToolUse — matcher: "Bash"
  const postGroups = settings.hooks.PostToolUse ?? [];
  const bashGroup = postGroups.find((g) => g.matcher === "Bash");
  if (bashGroup) {
    const idx = bashGroup.hooks.findIndex((h) => h.command.includes("cmd-log"));
    if (idx >= 0) {
      bashGroup.hooks[idx] = hookEntry;
    } else {
      bashGroup.hooks.push(hookEntry);
    }
  } else {
    postGroups.push({ matcher: "Bash", hooks: [hookEntry] });
  }
  settings.hooks.PostToolUse = postGroups;

  writeJson(CLAUDE_SETTINGS, settings);
  console.log(`  claude: ${CLAUDE_SETTINGS}`);
}

// ── ChatGPT / Codex ───────────────────────────────────────────────────

interface CodexHookEntry {
  type: string;
  command: string;
  statusMessage?: string;
}

interface CodexHookGroup {
  matcher?: string;
  hooks: CodexHookEntry[];
}

interface CodexHooksFile {
  hooks?: {
    PostToolUse?: CodexHookGroup[];
  };
  [key: string]: unknown;
}

function installCodex(): void {
  // hooks.json
  const hooksFile = readJson(CODEX_HOOKS) as CodexHooksFile;
  hooksFile.hooks ??= {};

  const hookEntry: CodexHookEntry = {
    type: "command",
    command: HOOK_COMMAND,
    statusMessage: "Logging terminal command",
  };

  const groups = hooksFile.hooks.PostToolUse ?? [];
  const bashGroup = groups.find((g) => g.matcher === "Bash");
  if (bashGroup) {
    const idx = bashGroup.hooks.findIndex((h) => h.command.includes("cmd-log"));
    if (idx >= 0) {
      bashGroup.hooks[idx] = hookEntry;
    } else {
      bashGroup.hooks.push(hookEntry);
    }
  } else {
    groups.push({ matcher: "Bash", hooks: [hookEntry] });
  }
  hooksFile.hooks.PostToolUse = groups;

  writeJson(CODEX_HOOKS, hooksFile);
  console.log(`  codex:  ${CODEX_HOOKS}`);

  // config.toml — ensure codex_hooks feature and writable root
  ensureCodexConfig();
}

function ensureCodexConfig(): void {
  fs.mkdirSync(path.dirname(CODEX_CONFIG), { recursive: true });
  const content = fs.existsSync(CODEX_CONFIG)
    ? fs.readFileSync(CODEX_CONFIG, "utf-8")
    : "";

  let updated = content;

  // Ensure [features] codex_hooks = true
  if (!updated.includes("codex_hooks")) {
    if (updated.includes("[features]")) {
      updated = updated.replace("[features]", "[features]\ncodex_hooks = true");
    } else {
      updated += "\n[features]\ncodex_hooks = true\n";
    }
  }

  // Ensure [sandbox_workspace_write] writable_roots includes log dir
  if (!updated.includes(LOG_DIR)) {
    if (updated.includes("writable_roots")) {
      // Add to existing array
      updated = updated.replace(
        /writable_roots\s*=\s*\[/,
        `writable_roots = [\n  "${LOG_DIR}",`,
      );
    } else if (updated.includes("[sandbox_workspace_write]")) {
      updated = updated.replace(
        "[sandbox_workspace_write]",
        `[sandbox_workspace_write]\nwritable_roots = [\n  "${LOG_DIR}"\n]`,
      );
    } else {
      updated += `\n[sandbox_workspace_write]\nwritable_roots = [\n  "${LOG_DIR}"\n]\n`;
    }
  }

  if (updated !== content) {
    fs.writeFileSync(CODEX_CONFIG, updated, "utf-8");
    console.log(`  codex:  ${CODEX_CONFIG}`);
  }
}

// ── Cursor ─────────────────────────────────────────────────────────────

interface CursorHookEntry {
  command: string;
}

interface CursorHooksFile {
  version?: number;
  hooks?: {
    afterShellExecution?: CursorHookEntry[];
  };
  [key: string]: unknown;
}

function installCursor(): void {
  const hooksFile = readJson(CURSOR_HOOKS) as CursorHooksFile;
  hooksFile.version ??= 1;
  hooksFile.hooks ??= {};

  const entries = hooksFile.hooks.afterShellExecution ?? [];
  const idx = entries.findIndex((e) => e.command.includes("cmd-log"));
  const hookEntry: CursorHookEntry = { command: HOOK_COMMAND };

  if (idx >= 0) {
    entries[idx] = hookEntry;
  } else {
    entries.push(hookEntry);
  }
  hooksFile.hooks.afterShellExecution = entries;

  writeJson(CURSOR_HOOKS, hooksFile);
  console.log(`  cursor: ${CURSOR_HOOKS}`);
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log("Installing cmd-log hooks...\n");
  console.log(`  hook command: ${HOOK_COMMAND}\n`);

  installClaude();
  installCodex();
  installCursor();

  console.log("\nDone. Restart each tool for hooks to take effect.");
}

main();
