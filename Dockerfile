# Multi-stage build for the adapter-node SvelteKit app. Icons are NOT part
# of this image - they're served straight from the osrs-grind-icons GCS
# bucket (see DESIGN.md "Roadmap - deployment"); static/icons/ is excluded
# via .dockerignore so it never reaches either stage.

FROM node:22-slim AS builder
WORKDIR /app

# Separate layer for deps so `docker build` skips reinstalling on a
# source-only change (package.json/lock unchanged -> layer cache hit).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# PUBLIC_FIREBASE_* are read via $env/static/public, which Vite bakes into
# the JS bundle at build time, not read at container runtime - so the build
# needs them present now. .env is excluded from the build context (see
# .dockerignore) to keep local config out of the image, but these values
# aren't secret (see .env.example's own comment / DESIGN.md), so reuse the
# real values already committed there instead of wiring up build args.
RUN cp .env.example .env

RUN npm run build

# adapter-node's output (build/) expects node_modules alongside it, not
# bundled in - strip devDependencies now so only production deps get
# copied into the runtime stage below.
RUN npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Cloud Run injects PORT at runtime (typically 8080) and expects the
# container to listen on it - adapter-node already reads process.env.PORT,
# so nothing to configure here. EXPOSE is documentation only, Cloud Run
# ignores it and uses PORT regardless.
EXPOSE 8080

CMD ["node", "build/index.js"]
