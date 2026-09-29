# ──────────────────────────────────────────────────────────────────────────────
# Production build untuk frontend (React + Vite).
#   Stage 1: node — install deps & `npm run build` → dist/
#   Stage 2: nginx — serve static + proxy /api ke backend service
# ──────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS build
WORKDIR /app

# Install deps dulu (cached layer)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source + .env (VITE_* dibaca saat build; VITE_API_URL kosong → /api relatif
# yang di-proxy nginx ke backend).
COPY . .

# Build ke dist/
RUN npm run build

FROM nginx:alpine
# SPA fallback + proxy /api → backend:APP_PORT
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
