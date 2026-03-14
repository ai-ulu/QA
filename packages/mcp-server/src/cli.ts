#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const __dirname = dirname(fileURLToPath(import.meta.url));

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AutoQA MCP Server

Usage:
  autoqa-mcp [options]

Options:
  --help, -h     Show this help message
  --version, -v  Show version information

Examples:
  autoqa-mcp

  "mcp.servers": {
    "autoqa": {
      "command": "autoqa-mcp"
    }
  }
  `);
  process.exit(0);
}

async function main() {
  if (args.includes('--version') || args.includes('-v')) {
    const packageJson = JSON.parse(
      await readFile(resolve(__dirname, '../package.json'), 'utf8')
    ) as { version: string };

    console.log(`AutoQA MCP Server v${packageJson.version}`);
    process.exit(0);
  }

  const serverPath = resolve(__dirname, 'index.js');
  const server = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    env: process.env,
  });

  server.on('error', (error) => {
    console.error('Failed to start AutoQA MCP Server:', error);
    process.exit(1);
  });

  server.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    server.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    server.kill('SIGTERM');
  });
}

main().catch((error) => {
  console.error('Failed to start AutoQA MCP Server:', error);
  process.exit(1);
});
