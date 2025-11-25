FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile --production || bun install --production

COPY src ./src

RUN mkdir -p /app/pages

ENV PORT=3000
ENV PAGES_DIR=/app/pages
ENV WATCH=false

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
