import { PluginRegistry } from '../registry';
import { PluginInstaller } from '../installer';
import { PluginSandboxManager } from '../sandbox';
import { PluginPackage } from '../types';
import { Plugin } from '@autoqa/core';
import * as fs from 'fs';
import * as path from 'path';

describe('Plugin Marketplace Edge Cases', () => {
  describe('Registry edge cases', () => {
    let registry: PluginRegistry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    afterEach(() => {
      registry.clear();
    });

    it('should reject duplicate plugin versions', () => {
      const plugin: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 0,
        rating: 0,
        verified: false,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      registry.register(plugin);

      expect(() => registry.register(plugin)).toThrow('already registered');
    });

    it('should reject invalid version formats', () => {
      const plugin: PluginPackage = {
        name: 'test-plugin',
        version: 'invalid-version',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 0,
        rating: 0,
        verified: false,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => registry.register(plugin)).toThrow('Invalid version format');
    });

    it('should return undefined for non-existent plugin', () => {
      const result = registry.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should handle empty search results', () => {
      const results = registry.search({ query: 'non-existent-query' });
      expect(results.plugins).toEqual([]);
      expect(results.total).toBe(0);
    });

    it('should handle pagination beyond available results', () => {
      const plugin: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 100,
        rating: 4.5,
        verified: true,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      registry.register(plugin);

      const results = registry.search({ offset: 100, limit: 10 });
      expect(results.plugins).toEqual([]);
      expect(results.total).toBe(1);
    });

    it('should handle version range queries', () => {
      const plugin1: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 100,
        rating: 4.5,
        verified: true,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const plugin2: PluginPackage = {
        ...plugin1,
        version: '2.0.0',
      };

      registry.register(plugin1);
      registry.register(plugin2);

      const result = registry.get('test-plugin', '^1.0.0');
      expect(result?.version).toBe('1.0.0');
    });

    it('should return latest version when version not specified', () => {
      const plugin1: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 100,
        rating: 4.5,
        verified: true,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const plugin2: PluginPackage = {
        ...plugin1,
        version: '2.0.0',
      };

      registry.register(plugin1);
      registry.register(plugin2);

      const result = registry.get('test-plugin');
      expect(result?.version).toBe('2.0.0');
    });
  });

  describe('Installer edge cases', () => {
    let registry: PluginRegistry;
    let installer: PluginInstaller;
    const testPluginDir = './test-plugins-edge-cases';

    beforeEach(() => {
      registry = new PluginRegistry();
      installer = new PluginInstaller(registry, testPluginDir);
    });

    afterEach(() => {
      registry.clear();
      if (fs.existsSync(testPluginDir)) {
        fs.rmSync(testPluginDir, { recursive: true, force: true });
      }
    });

    it('should throw error when installing non-existent plugin', async () => {
      await expect(installer.install('non-existent')).rejects.toThrow('not found in registry');
    });

    it('should throw error when installing already installed plugin without force', async () => {
      const plugin: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 100,
        rating: 4.5,
        verified: true,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      registry.register(plugin);
      await installer.install('test-plugin');

      await expect(installer.install('test-plugin')).rejects.toThrow('already installed');
    });

    it('should reinstall when using force flag', async () => {
      const plugin: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 100,
        rating: 4.5,
        verified: true,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      registry.register(plugin);
      await installer.install('test-plugin');
      await installer.install('test-plugin', { force: true });

      expect(installer.isInstalled('test-plugin')).toBe(true);
    });

    it('should handle uninstalling non-existent plugin', async () => {
      await expect(installer.uninstall('non-existent')).rejects.toThrow('not found');
    });

    it('should handle uninstalling not-installed plugin', async () => {
      const plugin: PluginPackage = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        downloads: 100,
        rating: 4.5,
        verified: true,
        featured: false,
        tarballUrl: 'https://example.com/test.tgz',
        checksum: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      registry.register(plugin);

      await expect(installer.uninstall('test-plugin')).rejects.toThrow('not installed');
    });

    it('should return empty list when no plugins installed', () => {
      const installed = installer.list();
      expect(installed).toEqual([]);
    });

    it('should handle plugin directory not existing', () => {
      const newInstaller = new PluginInstaller(registry, './non-existent-dir');
      const installed = newInstaller.list();
      expect(installed).toEqual([]);
    });
  });

  describe('Sandbox edge cases', () => {
    let sandbox: PluginSandboxManager;

    beforeEach(() => {
      sandbox = new PluginSandboxManager();
    });

    it('should reject plugin without name', () => {
      const plugin = {
        version: '1.0.0',
      } as Plugin;

      expect(() => sandbox.validate(plugin)).toThrow('must have name and version');
    });

    it('should reject plugin without version', () => {
      const plugin = {
        name: 'test-plugin',
      } as Plugin;

      expect(() => sandbox.validate(plugin)).toThrow('must have name and version');
    });

    it('should reject plugin with invalid name format', () => {
      const plugin: Plugin = {
        name: '123-invalid', // Cannot start with number
        version: '1.0.0',
      };

      expect(() => sandbox.validate(plugin)).toThrow('Invalid plugin name');
    });

    it('should reject plugin with special characters in name', () => {
      const plugin: Plugin = {
        name: 'test@plugin',
        version: '1.0.0',
      };

      expect(() => sandbox.validate(plugin)).toThrow('Invalid plugin name');
    });

    it('should reject plugin with eval', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          eval('console.log("test")');
        },
      };

      expect(() => sandbox.validate(plugin)).toThrow('dangerous code');
    });

    it('should reject plugin with Function constructor', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          new Function('return 1')();
        },
      };

      expect(() => sandbox.validate(plugin)).toThrow('dangerous code');
    });

    it('should reject plugin with child_process require', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          require('child_process');
        },
      };

      expect(() => sandbox.validate(plugin)).toThrow('dangerous code');
    });

    it('should reject plugin with fs require', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          require('fs');
        },
      };

      expect(() => sandbox.validate(plugin)).toThrow('dangerous code');
    });

    it('should reject plugin with process.exit', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          process.exit(0);
        },
      };

      expect(() => sandbox.validate(plugin)).toThrow('dangerous code');
    });

    it('should allow safe plugin with console.log', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          console.log('Safe operation');
        },
      };

      expect(() => sandbox.validate(plugin)).not.toThrow();
    });

    it('should create custom sandbox with overrides', () => {
      const customSandbox = sandbox.createSandbox({
        maxMemory: 200 * 1024 * 1024,
        networkAccess: true,
      });

      expect(customSandbox.maxMemory).toBe(200 * 1024 * 1024);
      expect(customSandbox.networkAccess).toBe(true);
    });

    it('should handle plugin timeout', async () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
        },
      };

      const wrappedPlugin = sandbox.wrap(plugin);

      if (wrappedPlugin.beforeAll) {
        await expect(wrappedPlugin.beforeAll()).rejects.toThrow('timeout');
      }
    });

    it('should wrap all hook types', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        beforeAll: async () => {},
        beforeEach: async () => {},
        afterEach: async () => {},
        afterAll: async () => {},
      };

      const wrapped = sandbox.wrap(plugin);

      expect(wrapped.beforeAll).toBeDefined();
      expect(wrapped.beforeEach).toBeDefined();
      expect(wrapped.afterEach).toBeDefined();
      expect(wrapped.afterAll).toBeDefined();
    });

    it('should handle plugin with no hooks', () => {
      const plugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
      };

      const wrapped = sandbox.wrap(plugin);

      expect(wrapped.beforeAll).toBeUndefined();
      expect(wrapped.beforeEach).toBeUndefined();
      expect(wrapped.afterEach).toBeUndefined();
      expect(wrapped.afterAll).toBeUndefined();
    });
  });
});
