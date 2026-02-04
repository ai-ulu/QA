import inquirer from 'inquirer'
import ora from 'ora'
import chalk from 'chalk'
import boxen from 'boxen'
import path from 'path'
import { logger } from '../utils/logger'
import { packageManager } from '../utils/packageManager'
import { fileSystem } from '../utils/fileSystem'
import { TemplateManager } from '../templates/templateManager'

export interface InitOptions {
  template?: string
  yes?: boolean
  url?: string
  deploy?: string
}

export class InitCommand {
  private templateManager = new TemplateManager()

  async execute(projectName?: string, options: InitOptions = {}) {
    // Get project name
    if (!projectName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'What is your project name?',
          default: 'my-autoqa-project',
          validate: (input: string) => {
            if (!fileSystem.isValidProjectName(input)) {
              return 'Project name must contain only letters, numbers, hyphens, and underscores'
            }
            return true
          }
        }
      ])
      projectName = answers.projectName
    }

    const projectPath = path.resolve(process.cwd(), projectName!)

    // Check if directory already exists
    if (await fileSystem.exists(projectPath)) {
      logger.error(`Directory ${projectName} already exists`)
      process.exit(1)
    }

    // Get template if not provided
    let template = options.template
    if (!template && !options.yes) {
      const templates = await this.templateManager.getAvailableTemplates()
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'template',
          message: 'Which template would you like to use?',
          choices: templates.map(t => ({
            name: `${t.name} - ${t.description}`,
            value: t.id
          })),
          default: 'basic'
        }
      ])
      template = answers.template
    }

    template = template || 'basic'

    // Get target URL if not provided
    let targetUrl = options.url
    if (!targetUrl && !options.yes) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'What is your target URL? (optional)',
          default: 'https://example.com'
        }
      ])
      targetUrl = answers.url
    }

    const spinner = ora('Creating AutoQA project...').start()

    try {
      // Create project directory
      await fileSystem.ensureDir(projectPath)
      spinner.text = 'Setting up project structure...'

      // Install template
      await this.templateManager.installTemplate(template, projectPath, {
        projectName: projectName!,
        targetUrl: targetUrl || 'https://example.com'
      })

      // Detect and install dependencies
      spinner.text = 'Installing dependencies...'
      const pm = await packageManager.detect()
      await packageManager.install(pm, projectPath)

      // Generate first test if URL provided
      if (targetUrl && targetUrl !== 'https://example.com') {
        spinner.text = 'Generating your first test...'
        await this.generateFirstTest(projectPath, targetUrl)
      }

      // Setup deployment if requested
      if (options.deploy) {
        spinner.text = `Setting up ${options.deploy} deployment...`
        await this.setupDeployment(projectPath, options.deploy)
      }

      spinner.succeed('🎉 AutoQA project created successfully!')

      // Show next steps
      this.showNextSteps(projectName!, pm, targetUrl)

    } catch (error) {
      spinner.fail('Failed to create project')
      throw error
    }
  }

  private async generateFirstTest(projectPath: string, url: string) {
    const testContent = `import { test, expect } from '@playwright/test'

test('basic navigation test', async ({ page }) => {
  // Navigate to the target URL
  await page.goto('${url}')
  
  // Wait for page to load
  await page.waitForLoadState('networkidle')
  
  // Basic assertions
  await expect(page).toHaveTitle(/.+/)
  
  // Take a screenshot
  await page.screenshot({ path: 'test-results/homepage.png' })
})

test('responsive design test', async ({ page }) => {
  // Test mobile viewport
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('${url}')
  await page.screenshot({ path: 'test-results/mobile.png' })
  
  // Test desktop viewport
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('${url}')
  await page.screenshot({ path: 'test-results/desktop.png' })
})
`

    await fileSystem.writeFile(
      path.join(projectPath, 'tests', 'generated.spec.ts'),
      testContent
    )
  }

  private async setupDeployment(projectPath: string, target: string) {
    switch (target) {
      case 'vercel':
        await this.setupVercelDeployment(projectPath)
        break
      case 'netlify':
        await this.setupNetlifyDeployment(projectPath)
        break
      default:
        logger.warn(`Deployment target ${target} not supported yet`)
    }
  }

  private async setupVercelDeployment(projectPath: string) {
    const vercelConfig = {
      name: fileSystem.getProjectName(projectPath),
      buildCommand: 'npm run build',
      outputDirectory: 'test-results',
      installCommand: 'npm install'
    }

    await fileSystem.writeFile(
      path.join(projectPath, 'vercel.json'),
      JSON.stringify(vercelConfig, null, 2)
    )
  }

  private async setupNetlifyDeployment(projectPath: string) {
    const netlifyConfig = `[build]
  command = "npm run build"
  publish = "test-results"

[build.environment]
  NODE_VERSION = "18"
`

    await fileSystem.writeFile(
      path.join(projectPath, 'netlify.toml'),
      netlifyConfig
    )
  }

  private showNextSteps(projectName: string, pm: string, targetUrl?: string) {
    const commands = {
      npm: 'npm run',
      yarn: 'yarn',
      pnpm: 'pnpm run'
    }

    const runCommand = commands[pm as keyof typeof commands] || 'npm run'

    console.log(boxen(`
🎉 ${chalk.green('AutoQA project created successfully!')}

${chalk.cyan('Next steps:')}

  ${chalk.gray('1.')} Navigate to your project:
     ${chalk.yellow(`cd ${projectName}`)}

  ${chalk.gray('2.')} Run your first test:
     ${chalk.yellow(`${runCommand} test`)}

  ${chalk.gray('3.')} Start development mode:
     ${chalk.yellow('npx autoqa dev')}

  ${chalk.gray('4.')} Record new tests:
     ${chalk.yellow(`npx autoqa record ${targetUrl || 'https://your-app.com'}`)}

${chalk.cyan('Documentation:')} https://docs.autoqa.dev
${chalk.cyan('Community:')} https://github.com/autoqa/autoqa

${chalk.green('Happy testing! 🚀')}
    `, {
      padding: 1,
      borderColor: 'green',
      borderStyle: 'round',
      margin: 1
    }))
  }
}