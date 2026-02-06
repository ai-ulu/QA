# @autoqa/plugin-marketplace

Plugin marketplace and registry for the AutoQA ecosystem. Discover, install, and manage plugins with built-in security sandbox.

## Features

- 🔍 **Plugin Discovery**: Search and browse plugins by category, rating, and popularity
- 📦 **Easy Installation**: Install plugins with a single command
- 🔒 **Security Sandbox**: Isolate plugin execution to prevent malicious code
- ⭐ **Verified Plugins**: Curated collection of verified and featured plugins
- 💰 **Revenue Sharing**: 70/30 split for paid plugins
- 🎯 **Version Management**: Support for semantic versioning and version ranges

## Installation

```bash
npm install @autoqa/plugin-marketplace
```

## Usage

### Plugin Registry

```typescript
import { PluginRegistry } from '@autoqa/plugin-marketplace';

const registry = new PluginRegistry();

// Search for plugins
const results = registry.search({
  query: 'authentication',
  verified: true,
  limit: 10,
});

// Get specific plugin
const plugin = registry.get('auth-plugin', '^1.0.0');

// Get featured plugins
const featured = registry.getFeatured();
```

### Plugin Installer

```typescript
import { PluginInstaller, PluginRegistry } from '@autoqa/plugin-marketplace';

const registry = new PluginRegistry();
const installer = new PluginInstaller(registry);

// Install plugin
await installer.install('auth-plugin');

// Install specific version
await installer.install('auth-plugin', { version: '1.2.0' });

// Reinstall with force
await installer.install('auth-plugin', { force: true });

// Uninstall plugin
await installer.uninstall('auth-plugin');

// List installed plugins
const installed = installer.list();
```

### Plugin Sandbox

```typescript
import { PluginSandboxManager } from '@autoqa/plugin-marketplace';
import { Plugin } from '@autoqa/core';

const sandbox = new PluginSandboxManager();

// Validate plugin
const plugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  beforeAll: async () => {
    console.log('Safe operation');
  },
};

sandbox.validate(plugin); // Throws if plugin contains dangerous code

// Wrap plugin with sandbox restrictions
const wrappedPlugin = sandbox.wrap(plugin);

// Create custom sandbox
const customSandbox = sandbox.createSandbox({
  maxMemory: 200 * 1024 * 1024, // 200MB
  networkAccess: true,
});
```

## Plugin Development

### Creating a Plugin

```typescript
import { Plugin } from '@autoqa/core';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',

  async beforeAll(config) {
    console.log('Plugin initialized');
  },

  async beforeEach(test) {
    console.log(`Running test: ${test.name}`);
  },

  async afterEach(test, result) {
    if (result.status === 'failed') {
      console.log(`Test failed: ${result.error?.message}`);
    }
  },

  async afterAll(results) {
    console.log(`Tests completed: ${results.passed}/${results.total}`);
  },
};
```

### Publishing a Plugin

1. Create your plugin following the structure above
2. Add metadata in `package.json`:

```json
{
  "name": "@autoqa/plugin-my-plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "keywords": ["autoqa", "plugin", "testing"],
  "autoqa": {
    "verified": false,
    "category": "reporting"
  }
}
```

3. Publish to npm:

```bash
npm publish
```

4. Submit for verification (optional):

```bash
autoqa plugin submit @autoqa/plugin-my-plugin
```

## Security

The plugin sandbox prevents:

- ❌ `eval()` and `Function()` constructor
- ❌ File system access (`fs` module)
- ❌ Child process execution (`child_process`)
- ❌ Process manipulation (`process.exit`)
- ❌ Excessive memory usage (configurable limit)
- ❌ Long-running operations (5 second timeout)

Allowed operations:

- ✅ Console logging
- ✅ Timers (`setTimeout`, `setInterval`)
- ✅ Test context access
- ✅ Safe npm packages

## Revenue Sharing

For paid plugins:

- **Developer**: 70% of revenue
- **Platform**: 30% of revenue

Example:

- Plugin price: $10/month
- Developer receives: $7/month per user
- Platform receives: $3/month per user

## API Reference

See [API Documentation](./docs/api.md) for detailed API reference.

## Examples

- [Custom Reporter Plugin](./examples/reporter-plugin.ts)
- [Authentication Plugin](./examples/auth-plugin.ts)
- [Screenshot Plugin](./examples/screenshot-plugin.ts)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
