import { readdir, stat } from "fs/promises";
import { join, relative, basename, extname } from "path";
import type { Route, RouteType } from "./types";

const VALID_EXTENSIONS = [".html", ".json"];

function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json";
    case ".html":
    default:
      return "text/html";
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFilename(filename: string): { domain: string; isWildcard: boolean } | null {
  const ext = extname(filename);
  if (!VALID_EXTENSIONS.includes(ext.toLowerCase())) {
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
  isIndex: boolean
): number {
  let priority = isWildcard ? 0 : 1000;
  priority += pathDepth * 100;
  if (!isIndex) {
    priority += 50;
  }
  return priority;
}

async function scanDirectory(
  dir: string,
  baseDir: string,
  routes: Route[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, baseDir, routes);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!VALID_EXTENSIONS.includes(ext)) {
        continue;
      }

      const relativePath = relative(baseDir, fullPath);
      const parts = relativePath.split("/");

      if (parts.length === 1) {
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
      } else {
        const domainPart = parts[0];
        const pathParts = parts.slice(1);

        const isWildcard = domainPart.startsWith("*.");
        const domain = isWildcard ? domainPart.slice(2) : domainPart;

        const fileName = basename(pathParts[pathParts.length - 1], ext);
        const isIndex = fileName.toLowerCase() === "index";

        let urlPath: string;
        if (isIndex) {
          urlPath = "/" + pathParts.slice(0, -1).join("/");
          if (urlPath !== "/" && !urlPath.endsWith("/")) {
            urlPath += "/";
          }
          if (urlPath === "/") {
            urlPath = "/";
          } else if (pathParts.length === 1) {
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
          type: isWildcard ? "wildcard" : "exact",
          pattern: `${domainPart}${urlPath}`,
          regex: buildDomainRegex(domain, isWildcard),
          filePath: fullPath,
          domain: domain,
          path: urlPath,
          priority: calculatePriority(isWildcard, pathParts.length, isIndex),
          contentType: getContentType(fullPath),
        };

        routes.push(route);
      }
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

  await scanDirectory(pagesDir, pagesDir, routes);
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
