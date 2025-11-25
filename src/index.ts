import { join } from "path";
import { scanPages, watchPages } from "./fileScanner";
import { findMatch, findDefaultPage } from "./router";
import type { Route } from "./types";

const PORT = parseInt(process.env.PORT || "3000", 10);
const PAGES_DIR = process.env.PAGES_DIR || join(import.meta.dir, "..", "pages");
const WATCH_MODE = process.env.WATCH !== "false";

let routes: Route[] = [];
let defaultPage: Route | null = null;

async function loadRoutes(): Promise<void> {
  console.log(`Scanning pages directory: ${PAGES_DIR}`);
  routes = await scanPages(PAGES_DIR);
  defaultPage = findDefaultPage(routes);

  console.log(`Loaded ${routes.length} routes:`);
  for (const route of routes) {
    console.log(`  ${route.pattern}${route.path === "/" ? "" : route.path} -> ${route.filePath}`);
  }

  if (defaultPage) {
    console.log(`Default page: ${defaultPage.filePath}`);
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const host = req.headers.get("host") || "localhost";
  const path = url.pathname;

  if (path === "/health" || path === "/_health") {
    return new Response(
      JSON.stringify({
        status: "ok",
        routes: routes.length,
        uptime: process.uptime(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  console.log(`${req.method} ${host}${path}`);

  const match = findMatch(routes, host, path);

  if (match) {
    try {
      const file = Bun.file(match.filePath);
      const content = await file.text();

      return new Response(content, {
        status: 503,
        headers: {
          "Content-Type": match.route.contentType,
          "Retry-After": "3600",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-503BeGone-Match": match.route.pattern,
        },
      });
    } catch (error) {
      console.error(`Error reading file ${match.filePath}:`, error);
    }
  }

  if (defaultPage) {
    try {
      const file = Bun.file(defaultPage.filePath);
      const content = await file.text();

      return new Response(content, {
        status: 503,
        headers: {
          "Content-Type": defaultPage.contentType,
          "Retry-After": "3600",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-503BeGone-Match": "default",
        },
      });
    } catch (error) {
      console.error(`Error reading default page:`, error);
    }
  }

  return new Response(
    JSON.stringify({
      error: "Service Unavailable",
      message: "No maintenance page configured for this domain",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "3600",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

async function main(): Promise<void> {
  await loadRoutes();

  if (WATCH_MODE) {
    watchPages(PAGES_DIR, (newRoutes) => {
      routes = newRoutes;
      defaultPage = findDefaultPage(routes);
      console.log(`Reloaded ${routes.length} routes`);
    });
    console.log("Watching for file changes...");
  }

  const server = Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });

  console.log(`503BeGone server running on http://localhost:${server.port}`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
