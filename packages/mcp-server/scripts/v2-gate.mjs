#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const invocationCwd = process.cwd();

function getOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  return process.argv[index + 1];
}

function getFlag(name) {
  return process.argv.includes(name);
}

async function runStep(label, command, args, cwd) {
  process.stdout.write(`\n[autoqa:v2-gate] ${label}\n`);
  const { stdout, stderr } = await execFileAsync(command, args, { cwd });
  if (stdout?.trim()) {
    process.stdout.write(`${stdout.trim()}\n`);
  }
  if (stderr?.trim()) {
    process.stdout.write(`${stderr.trim()}\n`);
  }
}

async function main() {
  const repoPath = resolve(invocationCwd, getOption('--repo', '.'));
  const skipBuild = getFlag('--skip-build');
  const skipTest = getFlag('--skip-test');
  const tscEntry = resolve(repoPath, 'node_modules', 'typescript', 'bin', 'tsc');

  if (!skipBuild) {
    await runStep('build', process.execPath, [tscEntry], repoPath);
  }

  if (!skipTest) {
    await runStep('smoke', process.execPath, ['scripts/smoke-test.mjs'], repoPath);
  }

  await runStep(
    'ci-summary (artifact-aware, auto-base fallback)',
    process.execPath,
    ['scripts/ci-impact.mjs', '--repo', '.', '--auto-base', '--format', 'github'],
    repoPath
  );

  await runStep(
    'pr-comment dry-run',
    process.execPath,
    ['scripts/pr-bot.mjs', '--repo', '.', '--dry-run'],
    repoPath
  );

  process.stdout.write('\n[autoqa:v2-gate] all checks passed\n');
}

main().catch((error) => {
  process.stderr.write(`[autoqa:v2-gate] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
