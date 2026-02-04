#!/usr/bin/env node

import { program } from 'commander'
import chalk from 'chalk'
import { InitCommand } from './commands/init'
import { DevCommand } from './commands/dev'
import { RecordCommand } from './commands/record'
import { DebugCommand } from './commands/debug'
import { GenerateCommand } from './commands/generate'
import { logger } from './utils/logger'

const pkg = require('../package.json')

// Configure program
program
  .name('autoqa')
  .description('AutoQA CLI - Automated testing made simple')
  .version(pkg.version)

// Init command
program
  .command('init')
  .description('Create a new AutoQA project')
  .argument('[project-name]', 'Project name')
  .option('-t, --template <template>', 'Project template (react, nextjs, vue, angular, ecommerce, saas, blog)')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('--url <url>', 'Target URL for initial test generation')
  .option('--deploy <target>', 'Setup deployment (vercel, netlify)')
  .action(async (projectName, options) => {
    try {
      const initCommand = new InitCommand()
      await initCommand.execute(projectName, options)
    } catch (error) {
      logger.error('Failed to initialize project:', error)
      process.exit(1)
    }
  })

// Dev command
program
  .command('dev')
  .description('Start development mode with watch and test runner')
  .option('-p, --port <port>', 'Test runner port', '3333')
  .option('--headless', 'Run tests in headless mode')
  .option('--watch <pattern>', 'Watch pattern for test files', '**/*.{test,spec}.{ts,js}')
  .action(async (options) => {
    try {
      const devCommand = new DevCommand()
      await devCommand.execute(options)
    } catch (error) {
      logger.error('Failed to start dev mode:', error)
      process.exit(1)
    }
  })

// Record command
program
  .command('record')
  .description('Record user interactions to generate tests')
  .argument('<url>', 'URL to record')
  .option('-o, --output <file>', 'Output test file', 'recorded-test.spec.ts')
  .option('--browser <browser>', 'Browser to use (chromium, firefox, webkit)', 'chromium')
  .option('--device <device>', 'Device to emulate')
  .action(async (url, options) => {
    try {
      const recordCommand = new RecordCommand()
      await recordCommand.execute(url, options)
    } catch (error) {
      logger.error('Failed to record test:', error)
      process.exit(1)
    }
  })

// Debug command
program
  .command('debug')
  .description('Debug a specific test with headed browser')
  .argument('<test-name>', 'Test name or file to debug')
  .option('--browser <browser>', 'Browser to use', 'chromium')
  .option('--device <device>', 'Device to emulate')
  .option('--slow-mo <ms>', 'Slow down operations by ms', '1000')
  .action(async (testName, options) => {
    try {
      const debugCommand = new DebugCommand()
      await debugCommand.execute(testName, options)
    } catch (error) {
      logger.error('Failed to debug test:', error)
      process.exit(1)
    }
  })

// Generate command
program
  .command('generate')
  .description('Generate tests using AI from URL or description')
  .argument('<input>', 'URL to analyze or test description')
  .option('-o, --output <file>', 'Output test file')
  .option('--type <type>', 'Test type (e2e, api, visual)', 'e2e')
  .option('--framework <framework>', 'Test framework (playwright, cypress)', 'playwright')
  .action(async (input, options) => {
    try {
      const generateCommand = new GenerateCommand()
      await generateCommand.execute(input, options)
    } catch (error) {
      logger.error('Failed to generate test:', error)
      process.exit(1)
    }
  })

// Global error handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason)
  process.exit(1)
})

// Show help if no command provided
if (process.argv.length <= 2) {
  console.log(chalk.cyan(`
  ╔═══════════════════════════════════════╗
  ║            AutoQA CLI v${pkg.version}            ║
  ║     Automated testing made simple     ║
  ╚═══════════════════════════════════════╝
  `))
  program.help()
}

// Parse arguments
program.parse()