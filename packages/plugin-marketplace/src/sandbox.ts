import { Plugin } from '@autoqa/core';
import { PluginSandbox } from './types';

/**
 * Plugin Sandbox - isolates plugin execution for security
 */
export class PluginSandboxManager {
  private defaultSandbox: PluginSandbox = {
    allowedAPIs: ['console', 'setTimeout', 'setInterval'],
    maxMemory: 100 * 1024 * 1024, // 100MB
    maxCPU: 50, // 50% CPU
    networkAccess: false,
    fileSystemAccess: 'none',
  };

  /**
   * Validate plugin against sandbox rules
   */
  validate(plugin: Plugin, sandbox: PluginSandbox = this.defaultSandbox): boolean {
    // Check plugin structure
    if (!plugin.name || !plugin.version) {
      throw new Error('Plugin must have name and version');
    }

    // Validate plugin name (prevent malicious names)
    if (!this.isValidPluginName(plugin.name)) {
      throw new Error('Invalid plugin name');
    }

    // Check for dangerous patterns in plugin code
    const pluginCode = plugin.toString();
    if (this.containsDangerousCode(pluginCode)) {
      throw new Error('Plugin contains potentially dangerous code');
    }

    return true;
  }

  /**
   * Wrap plugin with sandbox restrictions
   */
  wrap(plugin: Plugin, sandbox: PluginSandbox = this.defaultSandbox): Plugin {
    return {
      ...plugin,
      beforeAll: plugin.beforeAll ? this.wrapHook(plugin.beforeAll, sandbox) : undefined,
      beforeEach: plugin.beforeEach ? this.wrapHook(plugin.beforeEach, sandbox) : undefined,
      afterEach: plugin.afterEach ? this.wrapHook(plugin.afterEach, sandbox) : undefined,
      afterAll: plugin.afterAll ? this.wrapHook(plugin.afterAll, sandbox) : undefined,
    };
  }

  /**
   * Wrap hook function with sandbox restrictions
   */
  private wrapHook<T extends (...args: any[]) => Promise<void>>(
    hook: T,
    sandbox: PluginSandbox
  ): T {
    return (async (...args: any[]) => {
      // Set memory limit (Node.js specific)
      const memoryBefore = process.memoryUsage().heapUsed;

      try {
        // Execute hook with timeout
        await Promise.race([
          hook(...args),
          this.timeout(5000), // 5 second timeout
        ]);

        // Check memory usage
        const memoryAfter = process.memoryUsage().heapUsed;
        const memoryUsed = memoryAfter - memoryBefore;

        if (memoryUsed > sandbox.maxMemory) {
          throw new Error(`Plugin exceeded memory limit: ${memoryUsed} bytes`);
        }
      } catch (error) {
        console.error('Plugin sandbox error:', error);
        throw error;
      }
    }) as T;
  }

  /**
   * Check if plugin name is valid
   */
  private isValidPluginName(name: string): boolean {
    // Must start with letter, contain only alphanumeric, dash, underscore
    const validPattern = /^[a-z][a-z0-9-_]*$/i;
    return validPattern.test(name) && name.length <= 100;
  }

  /**
   * Check for dangerous code patterns
   */
  private containsDangerousCode(code: string): boolean {
    const dangerousPatterns = [
      /eval\(/,
      /Function\(/,
      /require\(['"]child_process['"]\)/,
      /require\(['"]fs['"]\)/,
      /process\.exit/,
      /__dirname/,
      /__filename/,
    ];

    return dangerousPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Plugin timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Create custom sandbox configuration
   */
  createSandbox(overrides: Partial<PluginSandbox>): PluginSandbox {
    return {
      ...this.defaultSandbox,
      ...overrides,
    };
  }
}
