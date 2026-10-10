// Runtime adapter. In Electron the preload exposes `window.atlas`; in a plain browser
// (vite dev:web) there is no bridge and ATLAS runs on sample data only.

export interface RepoInfo {
  path: string;
  name: string;
  isGit: boolean;
  branch?: string;
  head?: string;
  dirty?: number;
  ahead?: number;
  behind?: number;
}

export interface AtlasBridge {
  platform: string;
  info(): Promise<{ platform: string; versions: Record<string, string> }>;
  openWorkspace(): Promise<RepoInfo | null>;
  refreshWorkspace(dir: string): Promise<RepoInfo>;
}

declare global {
  interface Window { atlas?: AtlasBridge }
}

export const bridge: AtlasBridge | undefined = typeof window !== 'undefined' ? window.atlas : undefined;
export const isDesktop = !!bridge;
export const platform = bridge?.platform ?? 'web';
