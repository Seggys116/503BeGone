import { join, normalize } from "path";
import { stat } from "fs/promises";
import type { Route, RouteMatch } from "./types";
import { getContentType } from "./mimeTypes";

function normalizeHost(host: string): string {
  const colonIndex = host.lastIndexOf(":");
  if (colonIndex !== -1) {
    const afterColon = host.slice(colonIndex + 1);
    if (/^\d+$/.test(afterColon)) {
      return host.slice(0, colonIndex).toLowerCase();
    }
  }
  return host.toLowerCase();
}

function normalizePath(path: string): string {
  let normalized = path;
  const queryIndex = normalized.indexOf("?");
  if (queryIndex !== -1) {
    normalized = normalized.slice(0, queryIndex);
  }
  // Don't lowercase for static sites - file names are case-sensitive
  return normalized;
}

function normalizePathForMatching(path: string): string {
  let normalized = path.toLowerCase();
  if (normalized !== "/" && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  const queryIndex = normalized.indexOf("?");
  if (queryIndex !== -1) {
    normalized = normalized.slice(0, queryIndex);
  }
  return normalized;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function isPathSafe(baseDir: string, filePath: string): boolean {
  const normalizedBase = normalize(baseDir);
  const normalizedPath = normalize(filePath);
  return normalizedPath.startsWith(normalizedBase);
}

async function resolveStaticSiteFile(
  baseDir: string,
  requestPath: string
): Promise<{ filePath: string; contentType: string } | null> {
  // Remove leading slash and normalize
  const cleanPath = requestPath.replace(/^\/+/, "");

  // Build the target path
  const targetPath = cleanPath ? join(baseDir, cleanPath) : baseDir;

  // Security check: ensure we're not escaping the base directory
  if (!isPathSafe(baseDir, targetPath)) {
    return null;
  }

  // Try exact file match first
  if (cleanPath && await fileExists(targetPath)) {
    return { filePath: targetPath, contentType: getContentType(targetPath) };
  }

  // Try with .html extension
  const htmlPath = targetPath + ".html";
  if (cleanPath && await fileExists(htmlPath)) {
    return { filePath: htmlPath, contentType: "text/html" };
  }

  // Try as directory with index.html
  const indexPath = join(targetPath, "index.html");
  if (await fileExists(indexPath)) {
    return { filePath: indexPath, contentType: "text/html" };
  }

  // SPA fallback: return root index.html for HTML requests
  // (don't fallback for asset requests like .js, .css, etc.)
  const ext = requestPath.match(/\.[^./]+$/)?.[0]?.toLowerCase();
  const isAssetRequest = ext && ![".html", ".htm"].includes(ext);

  if (!isAssetRequest) {
    const rootIndex = join(baseDir, "index.html");
    if (await fileExists(rootIndex)) {
      return { filePath: rootIndex, contentType: "text/html" };
    }
  }

  return null;
}

export async function findMatch(
  routes: Route[],
  host: string,
  path: string
): Promise<RouteMatch | null> {
  const normalizedHost = normalizeHost(host);
  const originalPath = normalizePath(path);
  const normalizedPath = normalizePathForMatching(path);

  for (const route of routes) {
    if (!route.regex.test(normalizedHost)) {
      continue;
    }

    // Handle static site routes
    if (route.isStaticSite && route.baseDir) {
      const resolved = await resolveStaticSiteFile(route.baseDir, originalPath);
      if (resolved) {
        return {
          route,
          filePath: resolved.filePath,
          contentType: resolved.contentType,
        };
      }
      continue;
    }

    // Handle regular single-file routes
    const routePath = route.path.toLowerCase();

    if (routePath === "/") {
      return { route, filePath: route.filePath, contentType: route.contentType };
    }

    if (normalizedPath === routePath) {
      return { route, filePath: route.filePath, contentType: route.contentType };
    }

    if (normalizedPath.startsWith(routePath + "/")) {
      return { route, filePath: route.filePath, contentType: route.contentType };
    }
  }

  return null;
}

export function findDefaultPage(routes: Route[]): Route | null {
  for (const route of routes) {
    if (route.domain === "default" && route.path === "/") {
      return route;
    }
  }
  return null;
}
