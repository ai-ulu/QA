import { detect } from 'detect-package-manager'
import { execa } from 'execa'
import { logger } from './logger'

export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export class PackageManagerUtils {
  async detect(): Promise<PackageManager> {
    try {
      const pm = await detect()
      return pm as PackageManager
    } catch {
      return 'npm' // Default fallback
    }
  }

  async install(packageManager: PackageManager, cwd: string) {
    logger.step(`Installing dependencies with ${packageManager}...`)
    
    const commands = {
      npm: ['install'],
      yarn: ['install'],
      pnpm: ['install']
    }

    await execa(packageManager, commands[packageManager], {
      cwd,
      stdio: 'inherit'
    })
  }

  async addDependency(packageManager: PackageManager, packages: string[], cwd: string, dev = false) {
    const commands = {
      npm: dev ? ['install', '--save-dev', ...packages] : ['install', '--save', ...packages],
      yarn: dev ? ['add', '--dev', ...packages] : ['add', ...packages],
      pnpm: dev ? ['add', '--save-dev', ...packages] : ['add', ...packages]
    }

    await execa(packageManager, commands[packageManager], {
      cwd,
      stdio: 'inherit'
    })
  }

  async runScript(packageManager: PackageManager, script: string, cwd: string) {
    const commands = {
      npm: ['run', script],
      yarn: [script],
      pnpm: ['run', script]
    }

    await execa(packageManager, commands[packageManager], {
      cwd,
      stdio: 'inherit'
    })
  }
}

export const packageManager = new PackageManagerUtils()