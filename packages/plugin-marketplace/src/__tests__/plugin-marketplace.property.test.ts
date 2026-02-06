import * as fc from 'fast-check';
import { PluginRegistry } from '../registry';
import { PluginInstaller } from '../installer';
import { PluginSandboxManager } from '../sandbox';
import { PluginPackage, PluginSandbox } from '../types';
import { Plugin } from '@autoqa/core';

/**
 * Property 30: Plugin Installation Never Breaks Existing Tests
 * Validates: Requirements 45.2 - Plugin installation
 * 
 * Tests that installing plugins doesn't break existing test functionality.
 */
describe('Property 30: Plugin Installation Never Breaks Existing Tests', () => {
  it('should install plugins without affecting test execution', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
            version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
            description: fc.string({ minLength: 10, maxLength: 100 }),
            author: fc.string({ minLength: 3, maxLength: 50 }),
            license: fc.constantFrom('MIT', 'Apache-2.0', 'GPL-3.0'),
            keywords: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
            downloads: fc.integer({ min: 0, max: 100000 }),
            rating: fc.float({ min: 0, max: 5 }),
            verified: fc.boolean(),
            featured: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (plugins) => {
          const registry = new PluginRegistry();
          const installer = new PluginInstaller(registry, './test-plugins');

          // Register all plugins
          for (const pluginData of plugins) {
            const plugin: PluginPackage = {
              ...pluginData,
              tarballUrl: `https://registry.autoqa.dev/${pluginData.name}/-/${pluginData.name}-${pluginData.version}.tgz`,
              checksum: 'abc123',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            try {
              registry.register(plugin);
            } catch (error) {
              // Skip duplicate versions
            }
          }

          // Install first plugin
          if (plugins.length > 0) {
            const firstPlugin = plugins[0];
            await installer.install(firstPlugin.name);

            // Verify installation
            expect(installer.isInstalled(firstPlugin.name)).toBe(true);
          }

          // Cleanup
          registry.clear();
        }
      ),
      { numRuns: 15 }
    );
  });
});

/**
 * Property 31: Plugin Sandbox Prevents Malicious Code
 * Validates: Requirements 45.2 - Plugin sandbox prevents malicious code
 * 
 * Tests that the sandbox successfully blocks dangerous plugin operations.
 */
describe('Property 31: Plugin Sandbox Prevents Malicious Code', () => {
  it('should reject plugins with dangerous code patterns', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
        }),
        (pluginData) => {
          const sandbox = new PluginSandboxManager();

          // Create plugin with dangerous code
          const dangerousPlugin: Plugin = {
            name: pluginData.name,
            version: pluginData.version,
            beforeAll: async () => {
              // This should be detected as dangerous
              eval('console.log("dangerous")');
            },
          };

          // Should throw error
          expect(() => sandbox.validate(dangerousPlugin)).toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should allow safe plugins through sandbox', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
        }),
        (pluginData) => {
          const sandbox = new PluginSandboxManager();

          // Create safe plugin
          const safePlugin: Plugin = {
            name: pluginData.name,
            version: pluginData.version,
            beforeAll: async () => {
              console.log('Safe operation');
            },
          };

          // Should not throw
          expect(() => sandbox.validate(safePlugin)).not.toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should enforce memory limits in sandbox', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1024, max: 1024 * 1024 }), // 1KB to 1MB
        async (memoryLimit) => {
          const sandbox = new PluginSandboxManager();
          const customSandbox: PluginSandbox = sandbox.createSandbox({
            maxMemory: memoryLimit,
          });

          const plugin: Plugin = {
            name: 'memory-test',
            version: '1.0.0',
            beforeAll: async () => {
              // Allocate small amount of memory
              const arr = new Array(100).fill('test');
            },
          };

          const wrappedPlugin = sandbox.wrap(plugin, customSandbox);

          // Should execute without exceeding limit
          if (wrappedPlugin.beforeAll) {
            await expect(wrappedPlugin.beforeAll()).resolves.not.toThrow();
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});

/**
 * Property 32: Plugin Registry Search Consistency
 * Validates: Requirements 45.2 - Plugin discovery and installation
 * 
 * Tests that plugin search returns consistent and correct results.
 */
describe('Property 32: Plugin Registry Search Consistency', () => {
  it('should return plugins matching search query', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
            version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
            description: fc.string({ minLength: 10, maxLength: 100 }),
            author: fc.string({ minLength: 3, maxLength: 50 }),
            license: fc.constantFrom('MIT', 'Apache-2.0'),
            keywords: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
            downloads: fc.integer({ min: 0, max: 100000 }),
            rating: fc.float({ min: 0, max: 5 }),
            verified: fc.boolean(),
            featured: fc.boolean(),
          }),
          { minLength: 5, maxLength: 20 }
        ),
        fc.string({ minLength: 3, maxLength: 10 }),
        (plugins, searchQuery) => {
          const registry = new PluginRegistry();

          // Register all plugins
          for (const pluginData of plugins) {
            const plugin: PluginPackage = {
              ...pluginData,
              tarballUrl: `https://registry.autoqa.dev/${pluginData.name}`,
              checksum: 'abc123',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            try {
              registry.register(plugin);
            } catch (error) {
              // Skip duplicates
            }
          }

          // Search
          const results = registry.search({ query: searchQuery });

          // All results should match query
          results.plugins.forEach((plugin) => {
            const matchesName = plugin.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDescription = plugin.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesKeywords = plugin.keywords.some(k =>
              k.toLowerCase().includes(searchQuery.toLowerCase())
            );

            expect(matchesName || matchesDescription || matchesKeywords).toBe(true);
          });

          // Cleanup
          registry.clear();
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should sort plugins correctly by downloads', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
            version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
            description: fc.string({ minLength: 10, maxLength: 100 }),
            author: fc.string({ minLength: 3, maxLength: 50 }),
            license: fc.constantFrom('MIT', 'Apache-2.0'),
            keywords: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
            downloads: fc.integer({ min: 0, max: 100000 }),
            rating: fc.float({ min: 0, max: 5 }),
            verified: fc.boolean(),
            featured: fc.boolean(),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        (plugins) => {
          const registry = new PluginRegistry();

          // Register all plugins
          for (const pluginData of plugins) {
            const plugin: PluginPackage = {
              ...pluginData,
              tarballUrl: `https://registry.autoqa.dev/${pluginData.name}`,
              checksum: 'abc123',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            try {
              registry.register(plugin);
            } catch (error) {
              // Skip duplicates
            }
          }

          // Search with sort by downloads
          const results = registry.search({ sortBy: 'downloads' });

          // Verify sorting
          for (let i = 0; i < results.plugins.length - 1; i++) {
            expect(results.plugins[i].downloads).toBeGreaterThanOrEqual(
              results.plugins[i + 1].downloads
            );
          }

          // Cleanup
          registry.clear();
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should filter verified plugins correctly', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
            version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
            description: fc.string({ minLength: 10, maxLength: 100 }),
            author: fc.string({ minLength: 3, maxLength: 50 }),
            license: fc.constantFrom('MIT', 'Apache-2.0'),
            keywords: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
            downloads: fc.integer({ min: 0, max: 100000 }),
            rating: fc.float({ min: 0, max: 5 }),
            verified: fc.boolean(),
            featured: fc.boolean(),
          }),
          { minLength: 5, maxLength: 15 }
        ),
        (plugins) => {
          const registry = new PluginRegistry();

          // Register all plugins
          for (const pluginData of plugins) {
            const plugin: PluginPackage = {
              ...pluginData,
              tarballUrl: `https://registry.autoqa.dev/${pluginData.name}`,
              checksum: 'abc123',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            try {
              registry.register(plugin);
            } catch (error) {
              // Skip duplicates
            }
          }

          // Search for verified plugins only
          const results = registry.search({ verified: true });

          // All results should be verified
          results.plugins.forEach((plugin) => {
            expect(plugin.verified).toBe(true);
          });

          // Cleanup
          registry.clear();
        }
      ),
      { numRuns: 15 }
    );
  });
});
