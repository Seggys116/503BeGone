import { readdir, stat, access } from "fs/promises";
import { join, relative, basename, extname } from "path";
import type { Route, RouteType } from "./types";
import { getContentType } from "./mimeTypes";

const SINGLE_FILE_EXTENSIONS = [".html", ".json"];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFilename(filename: string): { domain: string; isWildcard: boolean } | null {
  const ext = extname(filename);
  if (!SINGLE_FILE_EXTENSIONS.includes(ext.toLowerCase())) {
    return null;
  }

  const name = basename(filename, ext);
  const isWildcard = name.startsWith("*.");

  if (isWildcard) {
    return {
      domain: name.slice(2),
      isWildcard: true,
    };
  }

  return {
    domain: name,
    isWildcard: false,
  };
}

function buildDomainRegex(domain: string, isWildcard: boolean): RegExp {
  if (isWildcard) {
    const escapedDomain = escapeRegex(domain);
    return new RegExp(`^[^.]+\\.${escapedDomain}$`, "i");
  }
  return new RegExp(`^${escapeRegex(domain)}$`, "i");
}

function calculatePriority(
  isWildcard: boolean,
  pathDepth: number,
  isIndex: boolean,
  isStaticSite: boolean = false
): number {
  let priority = isWildcard ? 0 : 1000;
  priority += pathDepth * 100;
  if (!isIndex) {
    priority += 50;
  }
  // Static sites get slightly lower priority than exact file matches
  // so that specific file overrides still work
  if (isStaticSite) {
    priority -= 10;
  }
  return priority;
}

async function isStaticSiteDirectory(dirPath: string): Promise<boolean> {
  // A directory is considered a static site if it contains an index.html
  // at its root level
  try {
    await access(join(dirPath, "index.html"));
    return true;
  } catch {
    return false;
  }
}

function parseDomainFromDirName(dirName: string): { domain: string; isWildcard: boolean } {
  const isWildcard = dirName.startsWith("*.");
  if (isWildcard) {
    return {
      domain: dirName.slice(2),
      isWildcard: true,
    };
  }
  return {
    domain: dirName,
    isWildcard: false,
  };
}

async function scanSingleFileRoutes(
  dir: string,
  baseDir: string,
  routes: Route[],
  parentDomain?: { domain: string; isWildcard: boolean; dirName: string }
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip directories when scanning for single file routes within a domain folder
      // (these would be path-based subdirectories)
      if (parentDomain) {
        await scanSingleFileRoutes(fullPath, baseDir, routes, parentDomain);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!SINGLE_FILE_EXTENSIONS.includes(ext)) {
        continue;
      }

      const relativePath = relative(baseDir, fullPath);
      const parts = relativePath.split("/");

      if (parts.length === 1 && !parentDomain) {
        // Root level single file (e.g., pages/site.com.html)
        const parsed = parseFilename(entry.name);
        if (!parsed) continue;

        const route: Route = {
          type: parsed.isWildcard ? "wildcard" : "exact",
          pattern: parsed.isWildcard ? `*.${parsed.domain}` : parsed.domain,
          regex: buildDomainRegex(parsed.domain, parsed.isWildcard),
          filePath: fullPath,
          domain: parsed.domain,
          path: "/",
          priority: calculatePriority(parsed.isWildcard, 0, true),
          contentType: getContentType(fullPath),
        };

        routes.push(route);
      } else if (parentDomain) {
        // File within a domain folder that's NOT a static site
        // (e.g., pages/site.com/about.html where site.com doesn't have index.html)
        const pathParts = parts.slice(1);
        const fileName = basename(pathParts[pathParts.length - 1], ext);
        const isIndex = fileName.toLowerCase() === "index";

        let urlPath: string;
        if (isIndex) {
          urlPath = "/" + pathParts.slice(0, -1).join("/");
          if (pathParts.length === 1) {
            urlPath = "/";
          }
        } else {
          const pathWithoutFile = pathParts.slice(0, -1);
          urlPath = "/" + [...pathWithoutFile, fileName].join("/");
        }

        if (urlPath !== "/" && urlPath.endsWith("/")) {
          urlPath = urlPath.slice(0, -1);
        }
        if (!urlPath.startsWith("/")) {
          urlPath = "/" + urlPath;
        }

        const route: Route = {
          type: parentDomain.isWildcard ? "wildcard" : "exact",
          pattern: `${parentDomain.dirName}${urlPath}`,
          regex: buildDomainRegex(parentDomain.domain, parentDomain.isWildcard),
          filePath: fullPath,
          domain: parentDomain.domain,
          path: urlPath,
          priority: calculatePriority(parentDomain.isWildcard, pathParts.length, isIndex),
          contentType: getContentType(fullPath),
        };

        routes.push(route);
      }
    }
  }
}

async function scanDirectory(
  baseDir: string,
  routes: Route[]
): Promise<void> {
  const entries = await readdir(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(baseDir, entry.name);

    if (entry.isDirectory()) {
      // Check if this directory is a static site (contains index.html)
      const isStatic = await isStaticSiteDirectory(fullPath);
      const { domain, isWildcard } = parseDomainFromDirName(entry.name);

      if (isStatic) {
        // This is a static site directory - create a single route for it
        const route: Route = {
          type: "static-site",
          pattern: isWildcard ? `*.${domain}` : domain,
          regex: buildDomainRegex(domain, isWildcard),
          filePath: join(fullPath, "index.html"),
          domain: domain,
          path: "/",
          priority: calculatePriority(isWildcard, 0, true, true),
          contentType: "text/html",
          isStaticSite: true,
          baseDir: fullPath,
        };

        routes.push(route);
        console.log(`  [static-site] ${entry.name} -> ${fullPath}`);
      } else {
        // Not a static site - scan for individual file routes (old behavior)
        await scanSingleFileRoutes(fullPath, baseDir, routes, {
          domain,
          isWildcard,
          dirName: entry.name,
        });
      }
    } else if (entry.isFile()) {
      // Root level files (e.g., pages/default.html, pages/site.com.html)
      const ext = extname(entry.name).toLowerCase();
      if (!SINGLE_FILE_EXTENSIONS.includes(ext)) {
        continue;
      }

      const parsed = parseFilename(entry.name);
      if (!parsed) continue;

      const route: Route = {
        type: parsed.isWildcard ? "wildcard" : "exact",
        pattern: parsed.isWildcard ? `*.${parsed.domain}` : parsed.domain,
        regex: buildDomainRegex(parsed.domain, parsed.isWildcard),
        filePath: fullPath,
        domain: parsed.domain,
        path: "/",
        priority: calculatePriority(parsed.isWildcard, 0, true),
        contentType: getContentType(fullPath),
      };

      routes.push(route);
    }
  }
}

export async function scanPages(pagesDir: string): Promise<Route[]> {
  const routes: Route[] = [];

  try {
    await stat(pagesDir);
  } catch {
    console.warn(`Pages directory not found: ${pagesDir}`);
    return routes;
  }

  await scanDirectory(pagesDir, routes);
  routes.sort((a, b) => b.priority - a.priority);

  return routes;
}

export function watchPages(
  pagesDir: string,
  onChange: (routes: Route[]) => void
): void {
  const watcher = Bun.spawn(["bun", "-e", `
    const fs = require('fs');
    fs.watch('${pagesDir}', { recursive: true }, () => {
      console.log('change');
    });
  `], {
    stdout: "pipe",
  });

  const reader = watcher.stdout.getReader();
  const decoder = new TextDecoder();

  (async () => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      if (text.includes("change")) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(async () => {
          console.log("Pages changed, rescanning...");
          const routes = await scanPages(pagesDir);
          onChange(routes);
        }, 100);
      }
    }
  })();
}
