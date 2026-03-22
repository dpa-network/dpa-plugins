#!/usr/bin/env node
/**
 * Context Monitor — statusline wrapper
 *
 * Intercepts the JSON stdin that Claude Code sends to the statusline command,
 * extracts context_window metrics, writes them to a plain-text file, then
 * optionally forwards the same stdin to another statusline command if
 * CTX_MONITOR_CMD is set.
 *
 * Output file format (single line):
 *   <percent>|<used_tokens>|<total_tokens>|<epoch_ms>
 *
 * Example:
 *   42|420000|1000000|1711100000000
 *
 * Environment variables:
 *   CTX_MONITOR_FILE   — where to write (default: ~/.claude/context_usage.txt)
 *   CTX_MONITOR_CMD    — optional downstream statusline command to forward to
 *
 * Security:
 *   - CTX_MONITOR_FILE is restricted to ~/.claude/ directory
 *   - CTX_MONITOR_CMD is executed with shell disabled to prevent injection
 */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, relative } from 'path';

const CLAUDE_DIR = join(homedir(), '.claude');

// Restrict file path to ~/.claude/ directory
const DEFAULT_FILE = join(CLAUDE_DIR, 'context_usage.txt');
function safePath(envPath) {
  if (!envPath) return DEFAULT_FILE;
  const resolved = resolve(envPath);
  // Normalize separators for cross-platform comparison
  const norm = p => p.replace(/\\/g, '/').toLowerCase();
  if (!norm(resolved).startsWith(norm(CLAUDE_DIR + '/'))) {
    return DEFAULT_FILE;
  }
  return resolved;
}

const CTX_FILE = safePath(process.env.CTX_MONITOR_FILE);
const DOWNSTREAM_CMD = process.env.CTX_MONITOR_CMD || '';

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  // Extract context_window data
  try {
    const data = JSON.parse(input);
    const cw = data?.context_window;
    if (cw) {
      const pct = Math.round(cw.used_percentage ?? 0);
      const total = cw.context_window_size ?? 1000000;
      // Prefer direct used_tokens if available, otherwise derive from percentage
      const used = cw.used_tokens ?? Math.round((pct / 100) * total);
      writeFileSync(CTX_FILE, `${pct}|${used}|${total}|${Date.now()}`);
    }
  } catch {
    // JSON parse errors are expected when statusline sends non-JSON data.
    // File write errors (disk full, permissions) are also caught here —
    // we intentionally don't break the statusline for monitoring failures.
  }

  // Forward to downstream statusline command if configured
  if (DOWNSTREAM_CMD) {
    try {
      const result = execFileSync(DOWNSTREAM_CMD, [], {
        input,
        encoding: 'utf-8',
        timeout: 3000,
      });
      process.stdout.write(result);
    } catch {
      process.stdout.write('');
    }
  }
});
