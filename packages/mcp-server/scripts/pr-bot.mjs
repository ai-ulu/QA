#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execFileAsync = promisify(execFile);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const serverEntry = resolve(packageDir, 'dist/index.js');
const invocationCwd = process.env.INIT_CWD ?? process.cwd();
const AUTOQA_MARKER = '<!-- autoqa:pr-comment:v1 -->';

function getFlag(name) {
  return process.argv.includes(name);
}

function getOption(name, fallback) {
  const index = process.argv.lastIndexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  return process.argv[index + 1];
}

function extractText(result) {
  return (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}

function parseJsonPayload(text, context) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context}: ${text || 'empty response'}`);
  }
}

function shouldFallbackToWorkingTree(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /No changed files|No diff context resolved/i.test(message);
}

function shouldReportOnlyOnGhError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /HTTP 401|HTTP 403/i.test(message) ||
    /authentication required/i.test(message) ||
    /Resource not accessible by integration/i.test(message) ||
    /insufficient scopes/i.test(message) ||
    /could not resolve host/i.test(message) ||
    /not found/i.test(message)
  );
}

async function runGh(args) {
  return execFileAsync('gh', args, { cwd: invocationCwd });
}

async function resolveRepoOwnerAndName() {
  const { stdout } = await runGh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  const nameWithOwner = stdout.trim();
  if (!nameWithOwner.includes('/')) {
    throw new Error(`Unable to resolve repository owner/name from gh output: ${nameWithOwner}`);
  }
  return nameWithOwner;
}

async function resolvePullRequestNumber(explicitPrNumber) {
  if (explicitPrNumber) {
    return explicitPrNumber;
  }

  const { stdout } = await runGh(['pr', 'view', '--json', 'number', '-q', '.number']);
  const prNumber = stdout.trim();
  if (!prNumber) {
    throw new Error('Unable to resolve PR number. Use --pr <number>.');
  }
  return prNumber;
}

async function fetchAutoQaSummary(argumentsPayload) {
  const client = new Client(
    {
      name: 'autoqa-pr-bot',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    stderr: 'inherit',
  });

  try {
    await client.connect(transport);
    let payload;
    try {
      const result = await client.callTool({
        name: 'autoqa_ci_summary',
        arguments: argumentsPayload,
      });
      payload = parseJsonPayload(extractText(result), 'AutoQA MCP returned a non-JSON summary payload');
    } catch (error) {
      if (
        argumentsPayload.autoBase &&
        !argumentsPayload.workingTree &&
        shouldFallbackToWorkingTree(error)
      ) {
        const fallbackResult = await client.callTool({
          name: 'autoqa_ci_summary',
          arguments: {
            ...argumentsPayload,
            autoBase: false,
            workingTree: true,
            staged: false,
          },
        });
        payload = parseJsonPayload(
          extractText(fallbackResult),
          'AutoQA MCP returned a non-JSON summary payload'
        );
      } else {
        throw error;
      }
    }

    if (typeof payload.summary !== 'string' || !payload.summary.includes(AUTOQA_MARKER)) {
      throw new Error('AutoQA summary did not include a valid PR marker.');
    }
    return payload.summary;
  } finally {
    await client.close().catch(() => {});
  }
}

async function findExistingAutoQaComment(ownerAndName, prNumber) {
  const { stdout } = await runGh([
    'api',
    `repos/${ownerAndName}/issues/${prNumber}/comments?per_page=100`,
  ]);

  const comments = JSON.parse(stdout);
  if (!Array.isArray(comments)) {
    return null;
  }

  const matched = comments
    .filter(
      (comment) =>
        comment &&
        typeof comment.id !== 'undefined' &&
        typeof comment.body === 'string' &&
        comment.body.includes(AUTOQA_MARKER)
    )
    .map((comment) => String(comment.id));

  return matched.length ? matched[matched.length - 1] : null;
}

async function upsertAutoQaComment(ownerAndName, prNumber, summaryBody) {
  const existingCommentId = await findExistingAutoQaComment(ownerAndName, prNumber);

  if (existingCommentId) {
    await runGh([
      'api',
      `repos/${ownerAndName}/issues/comments/${existingCommentId}`,
      '--method',
      'PATCH',
      '--field',
      `body=${summaryBody}`,
    ]);
    return { mode: 'updated', commentId: existingCommentId };
  }

  const { stdout } = await runGh([
    'api',
    `repos/${ownerAndName}/issues/${prNumber}/comments`,
    '--method',
    'POST',
    '--field',
    `body=${summaryBody}`,
    '--jq',
    '.id',
  ]);

  return { mode: 'created', commentId: stdout.trim() };
}

if (getFlag('--help')) {
  process.stdout.write(
    [
      'Usage: node packages/mcp-server/scripts/pr-bot.mjs [options]',
      '',
      'Options:',
      '  --repo <path>      Target repository path (default: current working directory)',
      '  --pr <number>      Pull request number (default: resolved from current branch)',
      '  --base-ref <ref>   Explicit base ref for diff mode',
      '  --head-ref <ref>   Explicit head ref for diff mode',
      '  --working-tree     Use working tree diff mode',
      '  --staged           With --working-tree, analyze staged changes',
      '  --report-only      Skip GitHub comment upsert and print summary only',
      '  --dry-run          Print summary instead of creating/updating a PR comment',
      '  --help             Show this help',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const repoPath = resolve(invocationCwd, getOption('--repo', '.'));
const prNumber = getOption('--pr', undefined);
const baseRef = getOption('--base-ref', undefined);
const headRef = getOption('--head-ref', undefined);
const workingTree = getFlag('--working-tree');
const staged = getFlag('--staged');
const reportOnly = getFlag('--report-only');
const dryRun = getFlag('--dry-run');

try {
  const summary = await fetchAutoQaSummary({
    repoPath,
    autoBase: !workingTree && !baseRef,
    workingTree,
    staged,
    format: 'github',
    ...(baseRef ? { baseRef } : {}),
    ...(headRef ? { headRef } : {}),
  });
  if (dryRun || reportOnly) {
    process.stdout.write(`${summary}\n`);
    process.stdout.write(
      dryRun
        ? 'AutoQA PR bot dry-run: summary generated, no comment upsert performed.\n'
        : 'AutoQA PR bot report-only mode: summary generated, no comment upsert performed.\n'
    );
    process.exit(0);
  }

  try {
    const ownerAndName = await resolveRepoOwnerAndName();
    const resolvedPrNumber = await resolvePullRequestNumber(prNumber);
    const result = await upsertAutoQaComment(ownerAndName, resolvedPrNumber, summary);
    process.stdout.write(
      `AutoQA PR comment ${result.mode} on ${ownerAndName}#${resolvedPrNumber} (comment id: ${result.commentId}).\n`
    );
  } catch (error) {
    if (!shouldReportOnlyOnGhError(error)) {
      throw error;
    }

    process.stdout.write(`${summary}\n`);
    process.stdout.write(
      `AutoQA PR bot fallback to report-only: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
} catch (error) {
  process.stderr.write(`AutoQA PR bot failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
