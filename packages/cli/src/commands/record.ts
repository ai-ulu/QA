import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright'
import ora from 'ora'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { logger } from '../utils/logger'
import { fileSystem } from '../utils/fileSystem'
import path from 'path'

export interface RecordOptions {
  output?: string
  browser?: 'chromium' | 'firefox' | 'webkit'
  device?: string
}

export class RecordCommand {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page
  private actions: RecordedAction[] = []

  async execute(url: string, options: RecordOptions = {}) {
    const browserType = options.browser || 'chromium'
    const outputFile = options.output || 'recorded-test.spec.ts'

    logger.info(`🎬 Starting test recording for ${chalk.cyan(url)}`)

    const spinner = ora('Launching browser...').start()

    try {
      // Launch browser
      this.browser = await this.launchBrowser(browserType)
      this.context = await this.browser.newContext()
      this.page = await this.context.newPage()

      // Setup recording
      await this.setupRecording()

      spinner.succeed('Browser launched successfully')

      console.log(chalk.green(`
🎬 Recording Mode Active

${chalk.cyan('Instructions:')}
  ${chalk.gray('•')} Interact with the page normally
  ${chalk.gray('•')} All clicks, typing, and navigation will be recorded
  ${chalk.gray('•')} Press ${chalk.yellow('Ctrl+C')} when finished recording

${chalk.cyan('Target URL:')} ${url}
${chalk.cyan('Output File:')} ${outputFile}
      `))

      // Navigate to URL
      await this.page.goto(url)

      // Setup cleanup on exit
      this.setupExitHandler(outputFile)

      // Keep process alive
      await this.waitForExit()

    } catch (error) {
      spinner.fail('Failed to start recording')
      throw error
    }
  }

  private async launchBrowser(browserType: string): Promise<Browser> {
    const browsers = { chromium, firefox, webkit }
    const browser = browsers[browserType as keyof typeof browsers]

    return browser.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    })
  }

  private async setupRecording() {
    if (!this.page) return

    // Record clicks
    await this.page.exposeFunction('recordClick', (selector: string, text: string) => {
      this.actions.push({
        type: 'click',
        selector,
        text: text?.slice(0, 50),
        timestamp: Date.now()
      })
      logger.step(`Recorded click: ${chalk.cyan(selector)} ${text ? `"${text}"` : ''}`)
    })

    // Record typing
    await this.page.exposeFunction('recordType', (selector: string, text: string) => {
      this.actions.push({
        type: 'fill',
        selector,
        text,
        timestamp: Date.now()
      })
      logger.step(`Recorded typing: ${chalk.cyan(selector)} "${text}"`)
    })

    // Record navigation
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page?.mainFrame()) {
        this.actions.push({
          type: 'goto',
          url: frame.url(),
          timestamp: Date.now()
        })
        logger.step(`Recorded navigation: ${chalk.cyan(frame.url())}`)
      }
    })

    // Inject recording script
    await this.page.addInitScript(() => {
      // Record clicks
      document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement
        const selector = generateSelector(target)
        const text = target.textContent?.trim() || ''
        
        // @ts-ignore
        window.recordClick(selector, text)
      })

      // Record input changes
      document.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          const selector = generateSelector(target)
          // @ts-ignore
          window.recordType(selector, target.value)
        }
      })

      function generateSelector(element: HTMLElement): string {
        // Try data-testid first
        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`
        }

        // Try id
        if (element.id) {
          return `#${element.id}`
        }

        // Try unique class
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.length > 0)
          if (classes.length > 0) {
            return `.${classes[0]}`
          }
        }

        // Try text content for buttons/links
        if (element.tagName === 'BUTTON' || element.tagName === 'A') {
          const text = element.textContent?.trim()
          if (text && text.length < 30) {
            return `${element.tagName.toLowerCase()}:has-text("${text}")`
          }
        }

        // Fallback to tag name
        return element.tagName.toLowerCase()
      }
    })
  }

  private setupExitHandler(outputFile: string) {
    const cleanup = async () => {
      console.log(chalk.yellow('\n🛑 Stopping recording...'))
      
      await this.generateTestFile(outputFile)
      
      if (this.browser) {
        await this.browser.close()
      }
      
      console.log(chalk.green(`\n✅ Test recorded successfully to ${chalk.cyan(outputFile)}`))
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  }

  private async waitForExit(): Promise<void> {
    return new Promise((resolve) => {
      // Keep process alive until user exits
      const keepAlive = setInterval(() => {}, 1000)
      
      process.on('exit', () => {
        clearInterval(keepAlive)
        resolve()
      })
    })
  }

  private async generateTestFile(outputFile: string) {
    if (this.actions.length === 0) {
      logger.warn('No actions recorded')
      return
    }

    const testContent = this.generatePlaywrightTest()
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile)
    if (outputDir !== '.') {
      await fileSystem.ensureDir(outputDir)
    }

    await fileSystem.writeFile(outputFile, testContent)
    
    logger.success(`Generated test with ${this.actions.length} actions`)
  }

  private generatePlaywrightTest(): string {
    const testName = `recorded test ${new Date().toISOString().split('T')[0]}`
    
    let testContent = `import { test, expect } from '@playwright/test'

test('${testName}', async ({ page }) => {
`

    for (const action of this.actions) {
      switch (action.type) {
        case 'goto':
          testContent += `  await page.goto('${action.url}')\n`
          break
        
        case 'click':
          testContent += `  await page.click('${action.selector}')\n`
          break
        
        case 'fill':
          testContent += `  await page.fill('${action.selector}', '${action.text}')\n`
          break
      }
    }

    // Add some basic assertions
    testContent += `
  // Add your assertions here
  // await expect(page).toHaveURL(/expected-url/)
  // await expect(page.locator('selector')).toBeVisible()
})
`

    return testContent
  }
}

interface RecordedAction {
  type: 'click' | 'fill' | 'goto' | 'select' | 'check'
  selector?: string
  text?: string
  url?: string
  timestamp: number
}