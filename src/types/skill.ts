/**
 * Skill Type Definitions
 * Types for skills/plugins
 */

/**
 * Skill data structure
 */
export interface Skill {
  id: string;
  slug?: string;
  name: string;
  description: string;
  enabled: boolean;
  icon?: string;
  version?: string;
  author?: string;
  configurable?: boolean;
  config?: Record<string, unknown>;
  isCore?: boolean;
  isBundled?: boolean;
  installSource?: 'clawhub' | 'jurismindhub' | 'unknown';
  dependencies?: string[];
}

/**
 * Skill bundle (preset skill collection)
 */
export interface SkillBundle {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  icon: string;
  skills: string[];
  recommended?: boolean;
}


/**
 * Marketplace skill data
 */
export interface MarketplaceSkill {
  slug: string;
  name: string;
  description: string;
  version: string;
  market?: 'clawhub' | 'jurismindhub';
  author?: string;
  downloads?: number;
  stars?: number;
  createdAt?: number;
  updatedAt?: number;
  isFeatured?: boolean;
  isOfficial?: boolean;
}

/**
 * Skill configuration schema
 */
export interface SkillConfigSchema {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array';
    title?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
  }>;
  required?: string[];
}
