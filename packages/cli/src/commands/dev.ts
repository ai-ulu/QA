import chokidar from 'chokidar'
import ora from 'ora'
import chalk from 'chalk'
import { execa } from 'execa'
import { logger } from '../utils/logger'
import { fileSystem } from '../utils/fileSystem'

export interface DevOptions {
  port?: string
  headless?: boolean
  watch?: string
}

export class DevCommand {
  private testRunner?: any
  private watcher?: chokidar.FSWatcher

  async execute(options: DevOptions = {}) {
    const port = parseInt(options.port || '3333')
    const watchPattern = options.watch || '**/*.{test,spec}.{ts,js}'

    logger.info('Starting AutoQA development mode...')

    // Check if we're in a valid AutoQA project
    if (!(await this.isValidProject())) {
      logger.error('Not in a valid AutoQA project directory')
      logger.info('Run "npx autoqa init" to create a new project')
      process.exit(1)
    }

    const spinner = ora('Starting development server...').start()

    try {
      // Start test runner server
      await this.startTestRunner(port)
      spinner.text = 'Setting up file watcher...'

      // Start file watcher
      await this.startFileWatcher(watchPattern, options.headless)
      
      spinner.succeed(`AutoQA dev server running on ${chalk.cyan(`http://localhost:${port}`)}`)
      
      console.log(chalk.green(`
🚀 AutoQA Development Mode Active

${chalk.cyan('Test Runner:')} http://localhost:${port}
${chalk.cyan('Watching:')} ${watchPattern}
${chalk.cyan('Mode:')} ${options.headless ? 'Headless' : 'Headed'}

${chalk.yellow('Commands:')}
  ${chalk.gray('•')} Press ${chalk.cyan('r')} to run all tests
  ${chalk.gray('•')} Press ${chalk.cyan('c')} to clear console
  ${chalk.gray('•')} Press ${chalk.cyan('q')} to quit

${chalk.gray('File changes will automatically trigger test runs...')}
      `))

      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts()

    } catch (error) {
      spinner.fail('Failed to start development server')
      throw error
    }
  }

  private async isValidProject(): Promise<boolean> {
    const requiredFiles = [
      'package.json',
      'playwright.config.ts',
      'tests'
    ]

    for (const file of requiredFiles) {
      if (!(await fileSystem.exists(file))) {
        return false
      }
    }

    return true
  }

  private async startTestRunner(port: number) {
    // This would start the web-based test runner
    // For now, we'll just log that it would start
    logger.step(`Test runner would start on port ${port}`)
    
    // In a real implementation, this would:
    // 1. Start Express server
    // 2. Setup WebSocket for real-time updates
    // 3. Serve the React test runner UI
    // 4. Handle test execution requests
  }

  private async startFileWatcher(pattern: string, headless?: boolean) {
    this.watcher = chokidar.watch(pattern, {
      ignored: ['node_modules', 'test-results', 'playwright-report'],
      persistent: true
    })

    this.watcher.on('change', async (filePath) => {
      logger.info(`File changed: ${chalk.cyan(filePath)}`)
      await this.runTests(filePath, headless)
    })

    this.watcher.on('add', async (filePath) => {
      logger.info(`New test file: ${chalk.green(filePath)}`)
      await this.runTests(filePath, headless)
    })

    this.watcher.on('error', (error) => {
      logger.error('Watcher error:', error)
    })
  }

  private async runTests(filePath?: string, headless?: boolean) {
    const spinner = ora('Running tests...').start()

    try {
      const args = ['test']
      
      if (filePath) {
        args.push(filePath)
      }
      
      if (headless) {
        args.push('--headed')
      }

      const result = await execa('npx', ['playwright', ...args], {
        stdio: 'pipe'
      })

      if (result.exitCode === 0) {
        spinner.succeed('Tests passed ✅')
      } else {
        spinner.fail('Tests failed ❌')
      }

      // Show test output
      if (result.stdout) {
        console.log(result.stdout)
      }
      if (result.stderr) {
        console.error(chalk.red(result.stderr))
      }

    } catch (error: any) {
      spinner.fail('Test execution failed')
      
      if (error.stdout) {
        console.log(error.stdout)
      }
      if (error.stderr) {
        console.error(chalk.red(error.stderr))
      }
    }
  }

  private setupKeyboardShortcuts() {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', async (key) => {
      const keyStr = key.toString()

      switch (keyStr) {
        case 'r':
          console.log(chalk.cyan('\n🔄 Running all tests...\n'))
          await this.runTests()
          break
        
        case 'c':
          console.clear()
          logger.info('Console cleared')
          break
        
        case 'q':
        case '\u0003': // Ctrl+C
          console.log(chalk.yellow('\n👋 Stopping AutoQA dev server...'))
          await this.cleanup()
          process.exit(0)
          break
      }
    })
  }

  private async cleanup() {
    if (this.watcher) {
      await this.watcher.close()
    }
    
    if (this.testRunner) {
      // Stop test runner server
    }
  }
}