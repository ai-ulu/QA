#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const serverEntry = resolve(packageDir, 'dist/index.js');
const homeDir = os.homedir();
const appData = process.env.APPDATA ?? resolve(homeDir, 'AppData', 'Roaming');

const codexConfigPath = resolve(homeDir, '.codex', 'config.toml');
const vscodeMcpPath = resolve(appData, 'Code', 'User', 'mcp.json');
const cursorMcpPath = resolve(appData, 'Cursor', 'User', 'mcp.json');
const claudeConfigPath = resolve(appData, 'Claude', 'claude_desktop_config.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetArgIndex = args.indexOf('--target');
const targetValue =
  targetArgIndex !== -1 && targetArgIndex < args.length - 1 ? args[targetArgIndex + 1] : 'all';
const targets = targetValue
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const selectedTargets = targets.includes('all')
  ? ['codex', 'vscode', 'cursor', 'claude']
  : targets;

function renderCodexBlock() {
  return [
    '[mcp_servers.autoqa]',
    'command = "node"',
    `args = ["${serverEntry.replace(/\\/g, '\\\\')}"]`,
    'startup_timeout_sec = 40',
    '',
  ].join('\n');
}

function upsertCodexConfig(original) {
  const block = renderCodexBlock();
  const sectionRegex = /\[mcp_servers\.autoqa\][\s\S]*?(?=\n\[|$)/m;
  if (sectionRegex.test(original)) {
    return original.replace(sectionRegex, block.trimEnd());
  }

  const suffix = original.endsWith('\n') || original.length === 0 ? '' : '\n';
  return `${original}${suffix}${block}`;
}

function parseJsonOrEmpty(value) {
  if (!value.trim()) {
    return {};
  }
  return JSON.parse(value);
}

function upsertMcpJson(original) {
  const parsed = parseJsonOrEmpty(original);
  const next = {
    ...parsed,
    mcpServers: {
      ...(parsed.mcpServers ?? {}),
      autoqa: {
        command: 'node',
        args: [serverEntry],
      },
    },
  };

  return `${JSON.stringify(next, null, 2)}\n`;
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  if (!dryRun) {
    await writeFile(path, content, 'utf8');
  }
}

async function applyCodex() {
  const previous = await readText(codexConfigPath);
  const next = upsertCodexConfig(previous);
  await writeText(codexConfigPath, next);
  return { target: 'codex', path: codexConfigPath, changed: next !== previous };
}

async function applyJsonTarget(target, path) {
  const previous = await readText(path);
  const next = upsertMcpJson(previous);
  await writeText(path, next);
  return { target, path, changed: next !== previous };
}

if (args.includes('--help')) {
  process.stdout.write(
    [
      'Usage: node packages/mcp-server/scripts/onboard-mcp.mjs [options]',
      '',
      'Options:',
      '  --target <name>   codex|vscode|cursor|claude|all (default: all)',
      '  --dry-run         Show intended changes without writing files',
      '',
      'Examples:',
      '  pnpm onboard:mcp',
      '  pnpm onboard:mcp -- --target codex,cursor',
      '  pnpm onboard:mcp -- --dry-run',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const results = [];
for (const target of selectedTargets) {
  if (target === 'codex') {
    results.push(await applyCodex());
    continue;
  }
  if (target === 'vscode') {
    results.push(await applyJsonTarget('vscode', vscodeMcpPath));
    continue;
  }
  if (target === 'cursor') {
    results.push(await applyJsonTarget('cursor', cursorMcpPath));
    continue;
  }
  if (target === 'claude') {
    results.push(await applyJsonTarget('claude', claudeConfigPath));
    continue;
  }

  throw new Error(`Unknown target: ${target}`);
}

for (const result of results) {
  process.stdout.write(
    `${dryRun ? '[dry-run] ' : ''}${result.target}: ${result.changed ? 'updated' : 'already up-to-date'} -> ${result.path}\n`
  );
}
