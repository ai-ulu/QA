import { execa } from 'execa'
import chalk from 'chalk'
import { logger } from '../utils/logger'
import { fileSystem } from '../utils/fileSystem'

export interface DebugOptions {
  browser?: string
  device?: string
  slowMo?: string
}

export class DebugCommand {
  async execute(testName: string, options: DebugOptions = {}) {
    logger.info(`🐛 Starting debug mode for: ${chalk.cyan(testName)}`)

    // Check if we're in a valid project
    if (!(await this.isValidProject())) {
      logger.error('Not in a valid AutoQA project directory')
      logger.info('Run "npx autoqa init" to create a new project')
      process.exit(1)
    }

    // Find test file
    const testFile = await this.findTestFile(testName)
    if (!testFile) {
      logger.error(`Test file not found: ${testName}`)
      logger.info('Available test files:')
      await this.listTestFiles()
      process.exit(1)
    }

    console.log(chalk.green(`
🐛 Debug Mode Active

${chalk.cyan('Test File:')} ${testFile}
${chalk.cyan('Browser:')} ${options.browser || 'chromium'}
${chalk.cyan('Slow Motion:')} ${options.slowMo || '1000'}ms

${chalk.yellow('Debug Features:')}
  ${chalk.gray('•')} Headed browser (you can see what's happening)
  ${chalk.gray('•')} Slow motion execution
  ${chalk.gray('•')} Pause on failures
  ${chalk.gray('•')} Inspector tools available

${chalk.gray('The browser will open and run your test step by step...')}
    `))

    try {
      const args = [
        'playwright',
        'test',
        testFile,
        '--debug',
        '--headed'
      ]

      if (options.browser) {
        args.push('--project', options.browser)
      }

      if (options.slowMo) {
        args.push('--slow-mo', options.slowMo)
      }

      await execa('npx', args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          PWDEBUG: '1'
        }
      })

      logger.success('Debug session completed')

    } catch (error: any) {
      if (error.exitCode !== 0) {
        logger.error('Debug session failed')
        process.exit(error.exitCode)
      }
    }
  }

  private async isValidProject(): Promise<boolean> {
    return fileSystem.exists('playwright.config.ts') || fileSystem.exists('playwright.config.js')
  }

  private async findTestFile(testName: string): Promise<string | null> {
    // If it's already a file path, use it
    if (testName.includes('.') && await fileSystem.exists(testName)) {
      return testName
    }

    // Search for test files
    const patterns = [
      `**/*${testName}*.spec.ts`,
      `**/*${testName}*.test.ts`,
      `**/*${testName}*.spec.js`,
      `**/*${testName}*.test.js`
    ]

    for (const pattern of patterns) {
      const files = await fileSystem.findFiles(pattern)
      if (files.length > 0) {
        return files[0]
      }
    }

    return null
  }

  private async listTestFiles() {
    const testFiles = await fileSystem.findFiles('**/*.{spec,test}.{ts,js}')
    
    if (testFiles.length === 0) {
      logger.info('No test files found')
      return
    }

    testFiles.forEach(file => {
      console.log(`  ${chalk.gray('•')} ${file}`)
    })
  }
}