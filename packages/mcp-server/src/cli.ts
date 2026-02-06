#!/usr/bin/env node

/**
 * AutoQA MCP Server CLI
 * 
 * Command-line interface for starting the AutoQA MCP server.
 * This allows the server to be run as a standalone process or integrated with IDEs.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

const args = process.argv.slice(2);

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AutoQA MCP Server - AI-Powered Testing for Any IDE

Usage:
  autoqa-mcp [options]

Options:
  --help, -h     Show this help message
  --version, -v  Show version information

Environment Variables:
  OPENAI_API_KEY       OpenAI API key for AI features
  ANTHROPIC_API_KEY    Anthropic API key for Claude
  AUTOQA_LOG_LEVEL     Log level (debug, info, warn, error)

Examples:
  # Start the MCP server
  autoqa-mcp

  # Use with VS Code (add to settings.json)
  "mcp.servers": {
    "autoqa": {
      "command": "autoqa-mcp"
    }
  }

  # Use with Claude Desktop (add to config)
  {
    "mcpServers": {
      "autoqa": {
        "command": "autoqa-mcp"
      }
    }
  }

For more information, visit: https://github.com/ai-ulu/QA
  `);
  process.exit(0);
}

// Check for version flag
if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('../package.json');
  console.log(`AutoQA MCP Server v${pkg.version}`);
  process.exit(0);
}

// Start the MCP server
const serverPath = resolve(__dirname, 'index.js');
const server = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: process.env,
});

server.on('error', (error) => {
  console.error('Failed to start AutoQA MCP Server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle process termination
process.on('SIGINT', () => {
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});
