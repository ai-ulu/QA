import chalk from 'chalk'

export class Logger {
  info(message: string, ...args: any[]) {
    console.log(chalk.blue('ℹ'), message, ...args)
  }

  success(message: string, ...args: any[]) {
    console.log(chalk.green('✓'), message, ...args)
  }

  warn(message: string, ...args: any[]) {
    console.log(chalk.yellow('⚠'), message, ...args)
  }

  error(message: string, ...args: any[]) {
    console.error(chalk.red('✗'), message, ...args)
  }

  debug(message: string, ...args: any[]) {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛'), message, ...args)
    }
  }

  step(message: string, ...args: any[]) {
    console.log(chalk.cyan('→'), message, ...args)
  }
}

export const logger = new Logger()