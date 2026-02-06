/**
 * VS Code Extension Wrapper for AutoQA MCP Server
 * 
 * This example shows how to create a VS Code extension that integrates
 * the AutoQA MCP server for AI-powered testing directly in VS Code.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

let mcpServer: ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('AutoQA extension is now active');

  // Start MCP server
  const startServer = vscode.commands.registerCommand('autoqa.startServer', () => {
    if (mcpServer) {
      vscode.window.showInformationMessage('AutoQA server is already running');
      return;
    }

    mcpServer = spawn('autoqa-mcp', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    mcpServer.stdout?.on('data', (data) => {
      console.log(`AutoQA: ${data}`);
    });

    mcpServer.stderr?.on('data', (data) => {
      console.error(`AutoQA Error: ${data}`);
    });

    vscode.window.showInformationMessage('AutoQA server started');
  });

  // Stop MCP server
  const stopServer = vscode.commands.registerCommand('autoqa.stopServer', () => {
    if (mcpServer) {
      mcpServer.kill();
      mcpServer = null;
      vscode.window.showInformationMessage('AutoQA server stopped');
    }
  });

  // Create test from selection
  const createTest = vscode.commands.registerCommand('autoqa.createTest', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection);

    if (!text) {
      vscode.window.showErrorMessage('No text selected');
      return;
    }

    // Call MCP server to create test
    const description = await vscode.window.showInputBox({
      prompt: 'Enter test description',
      value: text,
    });

    if (description) {
      // Send request to MCP server
      vscode.window.showInformationMessage(`Creating test: ${description}`);
      // Implementation would send JSON-RPC request to MCP server
    }
  });

  context.subscriptions.push(startServer, stopServer, createTest);
}

export function deactivate() {
  if (mcpServer) {
    mcpServer.kill();
  }
}
