export type RouteType = "exact" | "wildcard";

export interface Route {
  type: RouteType;
  pattern: string; // Original pattern (e.g., "*.site.com" or "site.com")
  regex: RegExp; // Compiled regex for matching
  filePath: string; // Absolute path to the file
  domain: string; // Domain part (e.g., "site.com")
  path: string; // Path part (e.g., "/api/users" or "/")
  priority: number; // Higher = more specific = checked first
  contentType: string; // "text/html" or "application/json"
}

export interface RouteMatch {
  route: Route;
  filePath: string;
}

export interface Config {
  port: number;
  pagesDir: string;
  defaultPage: string | null;
}
