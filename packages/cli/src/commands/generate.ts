import ora from 'ora'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { logger } from '../utils/logger'
import { fileSystem } from '../utils/fileSystem'
import path from 'path'

export interface GenerateOptions {
  output?: string
  type?: 'e2e' | 'api' | 'visual'
  framework?: 'playwright' | 'cypress'
}

export class GenerateCommand {
  async execute(input: string, options: GenerateOptions = {}) {
    const isUrl = this.isValidUrl(input)
    const testType = options.type || 'e2e'
    const framework = options.framework || 'playwright'

    logger.info(`🤖 Generating ${testType} test using AI...`)

    if (isUrl) {
      logger.step(`Analyzing URL: ${chalk.cyan(input)}`)
    } else {
      logger.step(`Processing description: ${chalk.cyan(input)}`)
    }

    const spinner = ora('Analyzing and generating test...').start()

    try {
      let testContent: string

      if (isUrl) {
        testContent = await this.generateFromUrl(input, testType, framework)
      } else {
        testContent = await this.generateFromDescription(input, testType, framework)
      }

      // Get output file
      let outputFile = options.output
      if (!outputFile) {
        const defaultName = isUrl 
          ? `${this.getUrlDomain(input)}-test.spec.ts`
          : 'generated-test.spec.ts'
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'filename',
            message: 'Output filename:',
            default: defaultName
          }
        ])
        outputFile = answers.filename
      }

      // Write test file
      await fileSystem.writeFile(outputFile, testContent)

      spinner.succeed('Test generated successfully!')

      console.log(chalk.green(`
✅ AI Test Generation Complete

${chalk.cyan('Generated:')} ${outputFile}
${chalk.cyan('Type:')} ${testType}
${chalk.cyan('Framework:')} ${framework}

${chalk.yellow('Next steps:')}
  ${chalk.gray('1.')} Review the generated test
  ${chalk.gray('2.')} Customize selectors and assertions
  ${chalk.gray('3.')} Run the test: ${chalk.cyan(`npx playwright test ${outputFile}`)}
      `))

    } catch (error) {
      spinner.fail('Failed to generate test')
      throw error
    }
  }

  private isValidUrl(input: string): boolean {
    try {
      new URL(input)
      return true
    } catch {
      return false
    }
  }

  private getUrlDomain(url: string): string {
    try {
      const domain = new URL(url).hostname
      return domain.replace(/[^a-zA-Z0-9]/g, '-')
    } catch {
      return 'website'
    }
  }

  private async generateFromUrl(url: string, testType: string, framework: string): Promise<string> {
    // In a real implementation, this would:
    // 1. Crawl the URL to understand the page structure
    // 2. Identify interactive elements
    // 3. Use AI to generate appropriate test scenarios
    // 4. Generate framework-specific test code

    // For now, we'll generate a basic template
    return this.generateBasicUrlTest(url, testType, framework)
  }

  private async generateFromDescription(description: string, testType: string, framework: string): Promise<string> {
    // In a real implementation, this would:
    // 1. Parse the natural language description
    // 2. Extract test scenarios and steps
    // 3. Use AI to generate test code
    // 4. Generate framework-specific syntax

    // For now, we'll generate a basic template
    return this.generateBasicDescriptionTest(description, testType, framework)
  }

  private generateBasicUrlTest(url: string, testType: string, framework: string): string {
    const domain = this.getUrlDomain(url)
    
    if (framework === 'playwright') {
      return `import { test, expect } from '@playwright/test'

test.describe('${domain} Tests', () => {
  test('homepage loads and basic functionality works', async ({ page }) => {
    // Navigate to the page
    await page.goto('${url}')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Basic assertions
    await expect(page).toHaveTitle(/.+/)
    
    // Check for common elements
    // TODO: Customize these selectors based on your actual page
    const navigation = page.locator('nav, .nav, .navigation, header')
    if (await navigation.count() > 0) {
      await expect(navigation.first()).toBeVisible()
    }
    
    // Check for main content
    const main = page.locator('main, .main, .content, #content')
    if (await main.count() > 0) {
      await expect(main.first()).toBeVisible()
    }
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/${domain}-homepage.png' })
  })

  test('responsive design works', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('${url}')
    await page.screenshot({ path: 'test-results/${domain}-mobile.png' })
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('${url}')
    await page.screenshot({ path: 'test-results/${domain}-tablet.png' })
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('${url}')
    await page.screenshot({ path: 'test-results/${domain}-desktop.png' })
  })

  test('accessibility basics', async ({ page }) => {
    await page.goto('${url}')
    
    // Check for basic accessibility features
    const images = page.locator('img')
    const imageCount = await images.count()
    
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')
      const src = await img.getAttribute('src')
      
      if (src && !src.includes('data:') && !alt) {
        console.warn(\`Image missing alt text: \${src}\`)
      }
    }
    
    // Check for heading structure
    const h1Count = await page.locator('h1').count()
    expect(h1Count).toBeGreaterThanOrEqual(1)
    expect(h1Count).toBeLessThanOrEqual(1) // Should have exactly one h1
  })
})

// TODO: Add more specific tests based on your application:
// - Form submissions
// - User authentication
// - Search functionality
// - Shopping cart (for e-commerce)
// - API interactions
// - Error handling
`
    }

    // Add Cypress support later
    return this.generatePlaywrightTest(url, testType)
  }

  private generateBasicDescriptionTest(description: string, testType: string, framework: string): string {
    const testName = description.toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (framework === 'playwright') {
      return `import { test, expect } from '@playwright/test'

test.describe('Generated Test', () => {
  test('${testName}', async ({ page }) => {
    // TODO: Implement test based on description: "${description}"
    
    // Navigate to your application
    await page.goto('https://your-app.com')
    
    // Add your test steps here based on the description
    // Example steps:
    
    // 1. Find and interact with elements
    // await page.click('[data-testid="button"]')
    // await page.fill('[data-testid="input"]', 'test value')
    
    // 2. Add assertions
    // await expect(page.locator('[data-testid="result"]')).toBeVisible()
    // await expect(page).toHaveURL(/expected-url/)
    
    // 3. Take screenshots for verification
    await page.screenshot({ path: 'test-results/generated-test.png' })
  })
})

/*
AI Analysis of Description: "${description}"

Suggested test steps:
1. [Add specific steps based on the description]
2. [Include relevant assertions]
3. [Consider edge cases and error scenarios]

Please review and customize this generated test to match your specific requirements.
*/
`
    }

    return this.generatePlaywrightTest('https://your-app.com', testType)
  }

  private generatePlaywrightTest(url: string, testType: string): string {
    return `import { test, expect } from '@playwright/test'

test('generated test', async ({ page }) => {
  await page.goto('${url}')
  
  // Add your test logic here
  await expect(page).toHaveTitle(/.+/)
})
`
  }
}