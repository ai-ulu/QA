import fs from 'fs-extra'
import path from 'path'
import { glob } from 'glob'

export class FileSystemUtils {
  async ensureDir(dirPath: string) {
    await fs.ensureDir(dirPath)
  }

  async copy(src: string, dest: string) {
    await fs.copy(src, dest)
  }

  async writeFile(filePath: string, content: string) {
    await fs.ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }

  async exists(filePath: string): Promise<boolean> {
    return fs.pathExists(filePath)
  }

  async remove(filePath: string) {
    await fs.remove(filePath)
  }

  async findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
    return glob(pattern, { cwd })
  }

  async processTemplateFile(filePath: string, variables: Record<string, any>) {
    let content = await this.readFile(filePath)
    
    // Replace template variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
      content = content.replace(regex, String(value))
    })
    
    await this.writeFile(filePath, content)
  }

  async processTemplateDirectory(dirPath: string, variables: Record<string, any>) {
    const templateFiles = await this.findFiles('**/*.template', dirPath)
    
    for (const file of templateFiles) {
      const fullPath = path.join(dirPath, file)
      await this.processTemplateFile(fullPath, variables)
      
      // Rename file (remove .template extension)
      const newPath = fullPath.replace('.template', '')
      await fs.move(fullPath, newPath)
    }
  }

  getProjectName(projectPath: string): string {
    return path.basename(path.resolve(projectPath))
  }

  isValidProjectName(name: string): boolean {
    return /^[a-z0-9-_]+$/i.test(name) && name.length > 0 && name.length <= 50
  }
}

export const fileSystem = new FileSystemUtils()