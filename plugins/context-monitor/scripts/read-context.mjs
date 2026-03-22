#!/usr/bin/env node
/**
 * Context Monitor — hook script
 *
 * Reads the context_usage.txt written by extract-context.mjs and outputs
 * a human-readable context status line that gets injected as additional
 * context via the UserPromptSubmit hook.
 *
 * Output format:
 *   [Ctx 42% | 420k/1000k]
 *
 * If the file is missing or stale (>5 min), outputs nothing.
 *
 * Security:
 *   - File path restricted to ~/.claude/ directory
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, relative } from 'path';

const CLAUDE_DIR = join(homedir(), '.claude');

const DEFAULT_FILE = join(CLAUDE_DIR, 'context_usage.txt');
function safePath(envPath) {
  if (!envPath) return DEFAULT_FILE;
  const resolved = resolve(envPath);
  const norm = p => p.replace(/\\/g, '/').toLowerCase();
  if (!norm(resolved).startsWith(norm(CLAUDE_DIR + '/'))) {
    return DEFAULT_FILE;
  }
  return resolved;
}

const CTX_FILE = safePath(process.env.CTX_MONITOR_FILE);

try {
  const raw = readFileSync(CTX_FILE, 'utf-8').trim();
  const [pct, used, total, ts] = raw.split('|').map(Number);

  // Staleness check — ignore data older than 5 minutes
  if (Date.now() - ts > 5 * 60 * 1000) {
    process.exit(0);
  }

  const fmt = n => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return `${n}`;
  };

  process.stdout.write(`[Ctx ${pct}% | ${fmt(used)}/${fmt(total)}]`);
} catch {
  // File doesn't exist yet — first run, no output
}
