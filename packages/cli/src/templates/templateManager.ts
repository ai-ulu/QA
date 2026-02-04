import path from 'path'
import { fileSystem } from '../utils/fileSystem'
import { logger } from '../utils/logger'

export interface Template {
  id: string
  name: string
  description: string
  framework?: string
  industry?: string
  dependencies: string[]
  devDependencies: string[]
  scripts: Record<string, string>
  files: TemplateFile[]
}

export interface TemplateFile {
  path: string
  content: string
  isTemplate?: boolean
}

export interface TemplateVariables {
  projectName: string
  targetUrl: string
  [key: string]: any
}

export class TemplateManager {
  private templatesDir = path.join(__dirname, '../../templates')

  async getAvailableTemplates(): Promise<Template[]> {
    return [
      {
        id: 'basic',
        name: 'Basic',
        description: 'Simple Playwright setup with essential tests',
        dependencies: ['@playwright/test'],
        devDependencies: ['typescript', '@types/node'],
        scripts: {
          'test': 'playwright test',
          'test:headed': 'playwright test --headed',
          'test:debug': 'playwright test --debug',
          'report': 'playwright show-report'
        },
        files: []
      },
      {
        id: 'react',
        name: 'React',
        description: 'React application testing setup',
        framework: 'react',
        dependencies: ['@playwright/test', '@testing-library/react'],
        devDependencies: ['typescript', '@types/node', '@types/react'],
        scripts: {
          'test': 'playwright test',
          'test:component': 'playwright test --config=playwright-ct.config.ts',
          'test:e2e': 'playwright test tests/e2e',
          'report': 'playwright show-report'
        },
        files: []
      },
      {
        id: 'nextjs',
        name: 'Next.js',
        description: 'Next.js application testing with SSR support',
        framework: 'nextjs',
        dependencies: ['@playwright/test', 'next'],
        devDependencies: ['typescript', '@types/node', '@types/react'],
        scripts: {
          'test': 'playwright test',
          'test:e2e': 'playwright test tests/e2e',
          'dev': 'next dev',
          'build': 'next build',
          'start': 'next start'
        },
        files: []
      },
      {
        id: 'vue',
        name: 'Vue.js',
        description: 'Vue.js application testing setup',
        framework: 'vue',
        dependencies: ['@playwright/test', 'vue'],
        devDependencies: ['typescript', '@types/node', '@vitejs/plugin-vue'],
        scripts: {
          'test': 'playwright test',
          'test:component': 'playwright test --config=playwright-ct.config.ts',
          'dev': 'vite',
          'build': 'vite build'
        },
        files: []
      },
      {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'E-commerce testing patterns (checkout, cart, products)',
        industry: 'ecommerce',
        dependencies: ['@playwright/test', '@faker-js/faker'],
        devDependencies: ['typescript', '@types/node'],
        scripts: {
          'test': 'playwright test',
          'test:checkout': 'playwright test tests/checkout',
          'test:products': 'playwright test tests/products',
          'test:auth': 'playwright test tests/auth'
        },
        files: []
      },
      {
        id: 'saas',
        name: 'SaaS',
        description: 'SaaS application testing (auth, billing, features)',
        industry: 'saas',
        dependencies: ['@playwright/test', '@faker-js/faker'],
        devDependencies: ['typescript', '@types/node'],
        scripts: {
          'test': 'playwright test',
          'test:auth': 'playwright test tests/auth',
          'test:billing': 'playwright test tests/billing',
          'test:features': 'playwright test tests/features'
        },
        files: []
      }
    ]
  }

  async installTemplate(templateId: string, projectPath: string, variables: TemplateVariables) {
    const template = await this.getTemplate(templateId)
    
    if (!template) {
      throw new Error(`Template ${templateId} not found`)
    }

    logger.step(`Installing ${template.name} template...`)

    // Load template configuration if exists
    const templateConfig = await this.loadTemplateConfig(templateId)

    // Create package.json
    await this.createPackageJson(projectPath, template, templateConfig, variables)

    // Create TypeScript config
    await this.createTsConfig(projectPath)

    // Create Playwright config
    await this.createPlaywrightConfig(projectPath, template, templateConfig)

    // Create test directory structure
    await this.createTestStructure(projectPath, template, variables)

    // Copy template files
    await this.copyTemplateFiles(templateId, projectPath, variables)

    // Create example tests based on template
    await this.createExampleTests(projectPath, template, variables)

    // Create additional config files
    await this.createConfigFiles(projectPath, template)

    logger.success(`${template.name} template installed successfully`)
  }

  private async loadTemplateConfig(templateId: string): Promise<any> {
    const configPath = path.join(this.templatesDir, templateId, 'template.json')
    
    try {
      if (await fileSystem.exists(configPath)) {
        const configContent = await fileSystem.readFile(configPath)
        return JSON.parse(configContent)
      }
    } catch (error) {
      logger.warn(`Could not load template config for ${templateId}`)
    }
    
    return null
  }

  private async copyTemplateFiles(templateId: string, projectPath: string, variables: TemplateVariables) {
    const templateDir = path.join(this.templatesDir, templateId)
    
    if (!(await fileSystem.exists(templateDir))) {
      return // No template files to copy
    }

    // Find all template files
    const templateFiles = await fileSystem.findFiles('**/*.template', templateDir)
    
    for (const file of templateFiles) {
      const sourcePath = path.join(templateDir, file)
      const relativePath = file.replace('.template', '')
      const targetPath = path.join(projectPath, relativePath)
      
      // Read template content
      let content = await fileSystem.readFile(sourcePath)
      
      // Process template variables
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
        content = content.replace(regex, String(value))
      })
      
      // Write processed file
      await fileSystem.writeFile(targetPath, content)
    }
  }
    const templates = await this.getAvailableTemplates()
    return templates.find(t => t.id === templateId) || null
  }

  private async createPackageJson(projectPath: string, template: Template, templateConfig: any, variables: TemplateVariables) {
    const config = templateConfig || template
    
    const packageJson = {
      name: variables.projectName,
      version: '1.0.0',
      description: `AutoQA tests for ${variables.projectName}`,
      scripts: config.scripts || template.scripts,
      dependencies: {
        ...template.dependencies.reduce((acc, dep) => {
          acc[dep] = 'latest'
          return acc
        }, {} as Record<string, string>),
        ...(config.dependencies || {})
      },
      devDependencies: {
        ...template.devDependencies.reduce((acc, dep) => {
          acc[dep] = 'latest'
          return acc
        }, {} as Record<string, string>),
        ...(config.devDependencies || {})
      }
    }

    await fileSystem.writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )
  }

  private async createTsConfig(projectPath: string) {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        outDir: './dist',
        rootDir: './tests'
      },
      include: ['tests/**/*'],
      exclude: ['node_modules', 'dist', 'test-results']
    }

    await fileSystem.writeFile(
      path.join(projectPath, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    )
  }

  private async createPlaywrightConfig(projectPath: string, template: Template, templateConfig?: any) {
    const config = `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: '${template.id === 'nextjs' ? 'http://localhost:3000' : 'http://localhost:3000'}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: ${template.framework ? `{
    command: '${template.scripts.dev || 'npm run dev'}',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  }` : 'undefined'}
})
`

    await fileSystem.writeFile(
      path.join(projectPath, 'playwright.config.ts'),
      config
    )
  }

  private async createTestStructure(projectPath: string, template: Template, variables: TemplateVariables) {
    const testDir = path.join(projectPath, 'tests')
    await fileSystem.ensureDir(testDir)

    // Create subdirectories based on template
    if (template.industry === 'ecommerce') {
      await fileSystem.ensureDir(path.join(testDir, 'auth'))
      await fileSystem.ensureDir(path.join(testDir, 'products'))
      await fileSystem.ensureDir(path.join(testDir, 'checkout'))
      await fileSystem.ensureDir(path.join(testDir, 'cart'))
    } else if (template.industry === 'saas') {
      await fileSystem.ensureDir(path.join(testDir, 'auth'))
      await fileSystem.ensureDir(path.join(testDir, 'billing'))
      await fileSystem.ensureDir(path.join(testDir, 'features'))
      await fileSystem.ensureDir(path.join(testDir, 'admin'))
    } else if (template.framework) {
      await fileSystem.ensureDir(path.join(testDir, 'e2e'))
      await fileSystem.ensureDir(path.join(testDir, 'components'))
    } else {
      await fileSystem.ensureDir(path.join(testDir, 'basic'))
    }

    // Create fixtures directory
    await fileSystem.ensureDir(path.join(testDir, 'fixtures'))
    
    // Create test-results directory
    await fileSystem.ensureDir(path.join(projectPath, 'test-results'))
  }

  private async createExampleTests(projectPath: string, template: Template, variables: TemplateVariables) {
    switch (template.id) {
      case 'basic':
        await this.createBasicTests(projectPath, variables)
        break
      case 'react':
        await this.createReactTests(projectPath, variables)
        break
      case 'nextjs':
        await this.createNextjsTests(projectPath, variables)
        break
      case 'vue':
        await this.createVueTests(projectPath, variables)
        break
      case 'ecommerce':
        await this.createEcommerceTests(projectPath, variables)
        break
      case 'saas':
        await this.createSaasTests(projectPath, variables)
        break
    }
  }

  private async createBasicTests(projectPath: string, variables: TemplateVariables) {
    const basicTest = `import { test, expect } from '@playwright/test'

test.describe('Basic Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('${variables.targetUrl}')
    await expect(page).toHaveTitle(/.+/)
  })

  test('navigation works', async ({ page }) => {
    await page.goto('${variables.targetUrl}')
    
    // Add your navigation tests here
    // Example: await page.click('nav a[href="/about"]')
    // Example: await expect(page).toHaveURL(/.*about/)
  })

  test('responsive design', async ({ page }) => {
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('${variables.targetUrl}')
    await page.screenshot({ path: 'test-results/mobile.png' })
    
    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('${variables.targetUrl}')
    await page.screenshot({ path: 'test-results/desktop.png' })
  })
})
`

    await fileSystem.writeFile(
      path.join(projectPath, 'tests', 'basic', 'homepage.spec.ts'),
      basicTest
    )
  }

  private async createEcommerceTests(projectPath: string, variables: TemplateVariables) {
    // Auth tests
    const authTest = `import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('user can register', async ({ page }) => {
    await page.goto('${variables.targetUrl}/register')
    
    // Fill registration form
    await page.fill('[data-testid="email"]', 'test@example.com')
    await page.fill('[data-testid="password"]', 'password123')
    await page.fill('[data-testid="confirm-password"]', 'password123')
    await page.click('[data-testid="register-button"]')
    
    // Verify registration success
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('user can login', async ({ page }) => {
    await page.goto('${variables.targetUrl}/login')
    
    await page.fill('[data-testid="email"]', 'test@example.com')
    await page.fill('[data-testid="password"]', 'password123')
    await page.click('[data-testid="login-button"]')
    
    await expect(page).toHaveURL(/.*dashboard/)
  })
})
`

    await fileSystem.writeFile(
      path.join(projectPath, 'tests', 'auth', 'authentication.spec.ts'),
      authTest
    )

    // Checkout tests
    const checkoutTest = `import { test, expect } from '@playwright/test'

test.describe('Checkout Flow', () => {
  test('complete checkout process', async ({ page }) => {
    // Add product to cart
    await page.goto('${variables.targetUrl}/products')
    await page.click('[data-testid="add-to-cart"]:first-child')
    
    // Go to cart
    await page.click('[data-testid="cart-icon"]')
    await expect(page.locator('[data-testid="cart-item"]')).toBeVisible()
    
    // Proceed to checkout
    await page.click('[data-testid="checkout-button"]')
    
    // Fill shipping information
    await page.fill('[data-testid="shipping-name"]', 'John Doe')
    await page.fill('[data-testid="shipping-address"]', '123 Main St')
    await page.fill('[data-testid="shipping-city"]', 'New York')
    await page.fill('[data-testid="shipping-zip"]', '10001')
    
    // Fill payment information
    await page.fill('[data-testid="card-number"]', '4242424242424242')
    await page.fill('[data-testid="card-expiry"]', '12/25')
    await page.fill('[data-testid="card-cvc"]', '123')
    
    // Complete order
    await page.click('[data-testid="place-order"]')
    
    // Verify order success
    await expect(page.locator('[data-testid="order-success"]')).toBeVisible()
  })
})
`

    await fileSystem.writeFile(
      path.join(projectPath, 'tests', 'checkout', 'checkout-flow.spec.ts'),
      checkoutTest
    )
  }

  private async createSaasTests(projectPath: string, variables: TemplateVariables) {
    // Similar pattern for SaaS tests...
    const saasTest = `import { test, expect } from '@playwright/test'

test.describe('SaaS Features', () => {
  test('user onboarding flow', async ({ page }) => {
    await page.goto('${variables.targetUrl}/signup')
    
    // Complete signup
    await page.fill('[data-testid="email"]', 'user@company.com')
    await page.fill('[data-testid="password"]', 'securepass123')
    await page.click('[data-testid="signup-button"]')
    
    // Onboarding steps
    await expect(page.locator('[data-testid="onboarding-step-1"]')).toBeVisible()
    await page.click('[data-testid="next-step"]')
    
    await expect(page.locator('[data-testid="onboarding-step-2"]')).toBeVisible()
    await page.click('[data-testid="complete-onboarding"]')
    
    // Verify dashboard access
    await expect(page).toHaveURL(/.*dashboard/)
  })
})
`

    await fileSystem.writeFile(
      path.join(projectPath, 'tests', 'features', 'onboarding.spec.ts'),
      saasTest
    )
  }

  private async createReactTests(projectPath: string, variables: TemplateVariables) {
    // React-specific tests would go here
  }

  private async createNextjsTests(projectPath: string, variables: TemplateVariables) {
    // Next.js-specific tests would go here
  }

  private async createVueTests(projectPath: string, variables: TemplateVariables) {
    // Vue-specific tests would go here
  }

  private async createConfigFiles(projectPath: string, template: Template) {
    // Create .gitignore
    const gitignore = `node_modules/
dist/
test-results/
playwright-report/
playwright/.cache/
.env
.env.local
*.log
`

    await fileSystem.writeFile(path.join(projectPath, '.gitignore'), gitignore)

    // Create README.md
    const readme = `# ${template.name} AutoQA Project

This project was created with AutoQA CLI.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run tests:
   \`\`\`bash
   npm run test
   \`\`\`

3. Run tests in headed mode:
   \`\`\`bash
   npm run test:headed
   \`\`\`

4. Debug tests:
   \`\`\`bash
   npm run test:debug
   \`\`\`

5. View test report:
   \`\`\`bash
   npm run report
   \`\`\`

## Development

Start development mode with file watching:
\`\`\`bash
npx autoqa dev
\`\`\`

Record new tests:
\`\`\`bash
npx autoqa record https://your-app.com
\`\`\`

## Documentation

- [AutoQA Documentation](https://docs.autoqa.dev)
- [Playwright Documentation](https://playwright.dev)

## Support

- [GitHub Issues](https://github.com/autoqa/autoqa/issues)
- [Community Discord](https://discord.gg/autoqa)
`

    await fileSystem.writeFile(path.join(projectPath, 'README.md'), readme)
  }
}