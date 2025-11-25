import type { Route, RouteMatch } from "./types";

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

export function findMatch(
  routes: Route[],
  host: string,
  path: string
): RouteMatch | null {
  const normalizedHost = normalizeHost(host);
  const normalizedPath = normalizePath(path);

  for (const route of routes) {
    if (!route.regex.test(normalizedHost)) {
      continue;
    }

    const routePath = route.path.toLowerCase();

    if (routePath === "/") {
      return { route, filePath: route.filePath };
    }

    if (normalizedPath === routePath) {
      return { route, filePath: route.filePath };
    }

    if (normalizedPath.startsWith(routePath + "/")) {
      return { route, filePath: route.filePath };
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
