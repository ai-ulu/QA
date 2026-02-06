import { TestConfig } from './types';

/**
 * Define test configuration
 */
export function defineConfig(config: TestConfig): TestConfig {
  return config;
}

/**
 * Load configuration from file
 */
export async function loadConfig(path: string = 'autoqa.config.ts'): Promise<TestConfig> {
  try {
    const configModule = await import(path);
    return configModule.default || {};
  } catch (error) {
    console.warn(`Could not load config from ${path}, using defaults`);
    return {};
  }
}

/**
 * Merge configurations
 */
export function mergeConfig(base: TestConfig, override: TestConfig): TestConfig {
  return {
    ...base,
    ...override,
    use: {
      ...base.use,
      ...override.use,
    },
  };
}
