import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const serverEntry = resolve(packageDir, 'dist/index.js');
const invocationCwd = process.env.INIT_CWD ?? process.cwd();

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

async function fetchSummary(argumentsPayload) {
  const result = await client.callTool({
    name: 'autoqa_ci_summary',
    arguments: argumentsPayload,
  });

  return parseJsonPayload(extractText(result), 'AutoQA MCP returned a non-JSON summary payload');
}

if (getFlag('--help')) {
  process.stdout.write(
    [
      'Usage: node packages/mcp-server/scripts/ci-impact.mjs [options]',
      '',
      'Options:',
      '  --repo <path>        Target repository path (default: current working directory)',
      '  --format <mode>      markdown | github | plain (default: github)',
      '  --auto-base          Use merge-base against the current branch automatically',
      '  --working-tree       Analyze working tree instead of committed diff',
      '  --staged             When used with --working-tree, analyze staged changes only',
      '  --base-ref <ref>     Explicit base ref',
      '  --head-ref <ref>     Explicit head ref',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const repoPath = resolve(invocationCwd, getOption('--repo', '.'));
const format = getOption('--format', 'github');
const autoBase = getFlag('--auto-base');
const workingTree = getFlag('--working-tree');
const staged = getFlag('--staged');
const baseRef = getOption('--base-ref', undefined);
const headRef = getOption('--head-ref', undefined);

const client = new Client(
  {
    name: 'autoqa-ci-impact',
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
  const baseArguments = {
    repoPath,
    format,
    autoBase,
    workingTree,
    staged,
    ...(baseRef ? { baseRef } : {}),
    ...(headRef ? { headRef } : {}),
  };

  let payload;
  try {
    payload = await fetchSummary(baseArguments);
  } catch (error) {
    if (autoBase && !workingTree && shouldFallbackToWorkingTree(error)) {
      payload = await fetchSummary({
        ...baseArguments,
        autoBase: false,
        workingTree: true,
        staged: false,
      });
    } else {
      throw error;
    }
  }

  process.stdout.write(`${payload.summary}\n`);
} catch (error) {
  process.stderr.write(`AutoQA CI impact failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
