import { Plugin } from '@autoqa/core';

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  keywords: string[];
  repository?: string;
  homepage?: string;
  downloads: number;
  rating: number;
  verified: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginPackage extends PluginMetadata {
  tarballUrl: string;
  checksum: string;
  dependencies?: Record<string, string>;
}

export interface PluginInstallOptions {
  version?: string;
  force?: boolean;
  global?: boolean;
}

export interface PluginSearchOptions {
  query?: string;
  category?: string;
  verified?: boolean;
  featured?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'downloads' | 'rating' | 'updated' | 'created';
}

export interface PluginSearchResult {
  plugins: PluginMetadata[];
  total: number;
  limit: number;
  offset: number;
}

export interface PluginRevenue {
  pluginName: string;
  totalRevenue: number;
  developerShare: number; // 70%
  platformShare: number; // 30%
  transactions: number;
}

export interface PluginSandbox {
  allowedAPIs: string[];
  maxMemory: number;
  maxCPU: number;
  networkAccess: boolean;
  fileSystemAccess: 'none' | 'read' | 'write';
}
