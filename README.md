<p align="center">
  <img src="banner.svg" alt="503BeGone" width="800">
</p>

A Bun-based HTTP server that serves maintenance pages (503) based on incoming request Host header and path. Files are organized in a mounted directory where filenames and folder structures define the domain/path routing.

## Quick Start

### With Docker Compose (Recommended)

```bash
docker compose up -d
```

### Local Development

```bash
bun install
bun dev
```

## How It Works

All incoming requests are matched against HTML/JSON files in the `pages/` directory. The filename determines which domain/path the file serves.

### File Naming Patterns

| Filename | Matches |
|----------|---------|
| `site.com.html` | All requests to `site.com` |
| `test.site.com.html` | All requests to `test.site.com` |
| `*.site.com.html` | Any subdomain of `site.com` |
| `*.api.site.com.html` | Any subdomain of `api.site.com` |

### Folder Structure for Paths

Folders represent domains, nested folders represent URL paths:

```
pages/
  default.html                   # Fallback for unmatched requests
  site.com.html                  # site.com/*
  example.com/
    index.html                   # example.com/
    about.html                   # example.com/about
    api/
      index.json                 # example.com/api/
      users.json                 # example.com/api/users
      health.json                # example.com/api/health
```

### Static Site Support (Next.js, Vite, etc.)

You can serve full static site builds (Next.js export, Vite, Create React App, etc.) as maintenance pages. Any folder containing an `index.html` at its root is treated as a static site:

```
pages/
  myapp.com/                     # Full static site for myapp.com
    index.html                   # Home page
    about/
      index.html                 # About page
    _next/                       # Next.js assets
      static/
        chunks/
          *.js
    styles.css
```

Static sites support:
- All file types (JS, CSS, images, fonts, etc.)
- File-based routing (`/about` -> `/about/index.html` or `/about.html`)
- SPA fallback (unknown routes return `index.html` for client-side routing)
- Proper MIME types for all assets

**Example: Using a Next.js static export**

```bash
# Build your Next.js app with static export
cd my-nextjs-app
npm run build    # with output: 'export' in next.config.js

# Copy the output to pages directory
cp -r out ../503begone/pages/mysite.com
```

### Matching Priority

Routes are matched from most specific to least specific:

1. Exact domain + exact path (`mysite.com/api/users.json`)
2. Exact domain + index file (`mysite.com/index.html`)
3. Exact domain root file (`mysite.com.html`)
4. Wildcard subdomain match (`*.site.com.html`)
5. Default page (`default.html`)
6. Built-in 503 JSON response

### Supported File Types

Single-file routes support:
- `.html` - Served as `text/html`
- `.json` - Served as `application/json`

Static sites support all common web file types:
- HTML, CSS, JavaScript
- Images (PNG, JPG, GIF, SVG, WebP, AVIF, ICO)
- Fonts (WOFF, WOFF2, TTF, OTF, EOT)
- Media (MP4, WebM, MP3, WAV, OGG)
- Other (PDF, WASM, source maps)

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `PAGES_DIR` | `./pages` | Directory containing maintenance pages |
| `WATCH` | `true` | Watch for file changes (hot reload) |

## Docker

### Build

```bash
docker build -t 503begone .
```

### Run

```bash
docker run -p 3000:3000 -v ./pages:/app/pages:ro 503begone
```

## Health Check

The server exposes a health endpoint at `/health` or `/_health` that returns:

```json
{
  "status": "ok",
  "routes": 5,
  "uptime": 123.456
}
```

## Response Headers

All maintenance responses include:

- `Content-Type`: Based on file extension
- `Retry-After: 3600` (1 hour)
- `Cache-Control: no-store, no-cache, must-revalidate`
- `X-503BeGone-Match`: Pattern that matched the request

## Example Usage

1. Create your maintenance pages in `pages/`:

```bash
mkdir -p pages
echo '<h1>Maintenance</h1>' > pages/mysite.com.html
```

2. Point your DNS/load balancer to 503BeGone when in maintenance mode

3. All requests to `mysite.com` will receive the maintenance page with 503 status
