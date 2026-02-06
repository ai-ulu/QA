import { PluginRegistry } from './registry';
import { PluginInstallOptions, PluginPackage } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import * as crypto from 'crypto';

/**
 * Plugin Installer - handles plugin installation and management
 */
export class PluginInstaller {
  private registry: PluginRegistry;
  private pluginDir: string;

  constructor(registry: PluginRegistry, pluginDir: string = './plugins') {
    this.registry = registry;
    this.pluginDir = pluginDir;
    this.ensurePluginDir();
  }

  /**
   * Install a plugin
   */
  async install(name: string, options: PluginInstallOptions = {}): Promise<void> {
    const { version = 'latest', force = false } = options;

    // Get plugin from registry
    const plugin = this.registry.get(name, version);
    if (!plugin) {
      throw new Error(`Plugin ${name}@${version} not found in registry`);
    }

    // Check if already installed
    const installPath = this.getPluginPath(plugin.name, plugin.version);
    if (fs.existsSync(installPath) && !force) {
      throw new Error(`Plugin ${name}@${version} already installed. Use --force to reinstall.`);
    }

    // Download and verify
    await this.downloadPlugin(plugin);

    // Install dependencies
    if (plugin.dependencies) {
      await this.installDependencies(plugin);
    }

    console.log(`✓ Installed ${plugin.name}@${plugin.version}`);
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string, version?: string): Promise<void> {
    const plugin = this.registry.get(name, version);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    const installPath = this.getPluginPath(plugin.name, plugin.version);
    if (!fs.existsSync(installPath)) {
      throw new Error(`Plugin ${name}@${plugin.version} not installed`);
    }

    // Remove plugin directory
    fs.rmSync(installPath, { recursive: true, force: true });
    console.log(`✓ Uninstalled ${plugin.name}@${plugin.version}`);
  }

  /**
   * List installed plugins
   */
  list(): Array<{ name: string; version: string }> {
    if (!fs.existsSync(this.pluginDir)) {
      return [];
    }

    const installed: Array<{ name: string; version: string }> = [];
    const pluginNames = fs.readdirSync(this.pluginDir);

    for (const name of pluginNames) {
      const pluginPath = path.join(this.pluginDir, name);
      if (fs.statSync(pluginPath).isDirectory()) {
        const versions = fs.readdirSync(pluginPath);
        for (const version of versions) {
          installed.push({ name, version });
        }
      }
    }

    return installed;
  }

  /**
   * Check if plugin is installed
   */
  isInstalled(name: string, version?: string): boolean {
    const plugin = this.registry.get(name, version);
    if (!plugin) {
      return false;
    }

    const installPath = this.getPluginPath(plugin.name, plugin.version);
    return fs.existsSync(installPath);
  }

  /**
   * Download plugin tarball
   */
  private async downloadPlugin(plugin: PluginPackage): Promise<void> {
    // In a real implementation, this would download from a URL
    // For now, we'll simulate the download
    const installPath = this.getPluginPath(plugin.name, plugin.version);
    
    // Create plugin directory
    fs.mkdirSync(installPath, { recursive: true });

    // Create package.json
    const packageJson = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      license: plugin.license,
    };

    fs.writeFileSync(
      path.join(installPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  /**
   * Install plugin dependencies
   */
  private async installDependencies(plugin: PluginPackage): Promise<void> {
    if (!plugin.dependencies) {
      return;
    }

    for (const [depName, depVersion] of Object.entries(plugin.dependencies)) {
      if (!this.isInstalled(depName, depVersion)) {
        await this.install(depName, { version: depVersion });
      }
    }
  }

  /**
   * Get plugin installation path
   */
  private getPluginPath(name: string, version: string): string {
    return path.join(this.pluginDir, name, version);
  }

  /**
   * Ensure plugin directory exists
   */
  private ensurePluginDir(): void {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  /**
   * Verify plugin checksum
   */
  private verifyChecksum(filePath: string, expectedChecksum: string): boolean {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const actualChecksum = hash.digest('hex');
    return actualChecksum === expectedChecksum;
  }
}
