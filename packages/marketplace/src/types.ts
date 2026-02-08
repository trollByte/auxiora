import type { PluginPermission } from '@auxiora/plugins';

export interface PluginListing {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  permissions: PluginPermission[];
  keywords: string[];
  downloads: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
  homepage?: string;
  repository?: string;
}

export interface MarketplaceConfig {
  registryUrl: string;
  autoUpdate: boolean;
  installDir: string;
}

export interface SearchOptions {
  query?: string;
  keywords?: string[];
  author?: string;
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  plugins: PluginListing[];
  total: number;
  offset: number;
  limit: number;
}

export interface InstallResult {
  success: boolean;
  name: string;
  version: string;
  installedAt: string;
  dependencies: string[];
  error?: string;
}

export interface PublishResult {
  success: boolean;
  name: string;
  version: string;
  publishedAt: string;
  error?: string;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  installedAt: string;
  updatedAt: string;
  autoUpdate: boolean;
  permissions: PluginPermission[];
}

export interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export interface PersonalityListing {
  name: string;
  version: string;
  description: string;
  author: string;
  preview: string;
  tone: {
    warmth: number;
    humor: number;
    formality: number;
  };
  keywords: string[];
  downloads: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalitySearchResult {
  personalities: PersonalityListing[];
  total: number;
  offset: number;
  limit: number;
}

export interface PersonalityInstallResult {
  success: boolean;
  name: string;
  version: string;
  installedAt: string;
  error?: string;
}

export interface PersonalityPublishResult {
  success: boolean;
  name: string;
  version: string;
  publishedAt: string;
  error?: string;
}
