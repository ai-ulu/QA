import { PluginMetadata, PluginPackage, PluginSearchOptions, PluginSearchResult } from './types';
import * as semver from 'semver';

/**
 * Plugin Registry - manages plugin discovery and metadata
 */
export class PluginRegistry {
  private plugins: Map<string, PluginPackage[]> = new Map();

  /**
   * Register a plugin in the registry
   */
  register(plugin: PluginPackage): void {
    const existing = this.plugins.get(plugin.name) || [];
    
    // Check if version already exists
    if (existing.some(p => p.version === plugin.version)) {
      throw new Error(`Plugin ${plugin.name}@${plugin.version} already registered`);
    }

    // Validate version format
    if (!semver.valid(plugin.version)) {
      throw new Error(`Invalid version format: ${plugin.version}`);
    }

    existing.push(plugin);
    existing.sort((a, b) => semver.rcompare(a.version, b.version));
    this.plugins.set(plugin.name, existing);
  }

  /**
   * Get plugin by name and version
   */
  get(name: string, version?: string): PluginPackage | undefined {
    const versions = this.plugins.get(name);
    if (!versions || versions.length === 0) {
      return undefined;
    }

    if (!version || version === 'latest') {
      return versions[0]; // Latest version
    }

    // Find matching version
    return versions.find(p => semver.satisfies(p.version, version));
  }

  /**
   * Search plugins
   */
  search(options: PluginSearchOptions = {}): PluginSearchResult {
    const {
      query,
      category,
      verified,
      featured,
      limit = 20,
      offset = 0,
      sortBy = 'downloads',
    } = options;

    // Get all plugins (latest version only)
    let results: PluginMetadata[] = Array.from(this.plugins.values())
      .map(versions => versions[0]);

    // Filter by query
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery) ||
        p.keywords.some(k => k.toLowerCase().includes(lowerQuery))
      );
    }

    // Filter by category
    if (category) {
      results = results.filter(p => p.keywords.includes(category));
    }

    // Filter by verified
    if (verified !== undefined) {
      results = results.filter(p => p.verified === verified);
    }

    // Filter by featured
    if (featured !== undefined) {
      results = results.filter(p => p.featured === featured);
    }

    // Sort
    results.sort((a, b) => {
      switch (sortBy) {
        case 'downloads':
          return b.downloads - a.downloads;
        case 'rating':
          return b.rating - a.rating;
        case 'updated':
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        case 'created':
          return b.createdAt.getTime() - a.createdAt.getTime();
        default:
          return 0;
      }
    });

    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    return {
      plugins: paginated,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get featured plugins
   */
  getFeatured(limit: number = 10): PluginMetadata[] {
    return this.search({ featured: true, limit }).plugins;
  }

  /**
   * Get verified plugins
   */
  getVerified(limit: number = 20): PluginMetadata[] {
    return this.search({ verified: true, limit }).plugins;
  }

  /**
   * Get all versions of a plugin
   */
  getVersions(name: string): string[] {
    const versions = this.plugins.get(name);
    return versions ? versions.map(p => p.version) : [];
  }

  /**
   * Check if plugin exists
   */
  exists(name: string, version?: string): boolean {
    return this.get(name, version) !== undefined;
  }

  /**
   * Get total plugin count
   */
  count(): number {
    return this.plugins.size;
  }

  /**
   * Clear all plugins (for testing)
   */
  clear(): void {
    this.plugins.clear();
  }
}
