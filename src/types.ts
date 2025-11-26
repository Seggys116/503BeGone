export type RouteType = "exact" | "wildcard" | "static-site";

export interface Route {
  type: RouteType;
  pattern: string; // Original pattern (e.g., "*.site.com" or "site.com")
  regex: RegExp; // Compiled regex for matching
  filePath: string; // Absolute path to the file or directory (for static sites)
  domain: string; // Domain part (e.g., "site.com")
  path: string; // Path part (e.g., "/api/users" or "/")
  priority: number; // Higher = more specific = checked first
  contentType: string; // "text/html" or "application/json" (default for static sites)
  isStaticSite?: boolean; // True if this is a static site directory
  baseDir?: string; // Base directory for static sites (for resolving relative paths)
}

export interface RouteMatch {
  route: Route;
  filePath: string;
  contentType: string; // Resolved content type for the matched file
}

export interface Config {
  port: number;
  pagesDir: string;
  defaultPage: string | null;
}
