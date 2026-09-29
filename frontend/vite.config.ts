import path from "path"
import fs from "fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
// - server.port di baca dari frontend/.env (VITE_PORT)
// - proxy /api target di-resolve dari parent dir .env (APP_PORT) atau VITE_API_URL
// - strictPort: true → fail fast kalau port sudah dipakai app lain (multi-run detection)
export default defineConfig(({ mode }) => {
  // Local frontend env (for VITE_PORT, VITE_API_URL)
  const feEnv = loadEnv(mode, process.cwd(), "")

  // Source of truth untuk APP_PORT: parent dir (APP/.env).
  // Fallback ke backend/.env kalau APP/.env belum ada (legacy apps / template lama).
  const appRoot = path.resolve(__dirname, "..")
  const rootEnvDir = fs.existsSync(path.join(appRoot, ".env"))
    ? appRoot
    : path.join(appRoot, "backend")
  const rootEnv = loadEnv(mode, rootEnvDir, "")

  const port = parseInt(feEnv.VITE_PORT || "5173", 10)
  const backendPort = rootEnv.APP_PORT || "8080"
  // BASE_DOMAIN dari environment compose (VITE_BASE_DOMAIN) ATAU root .env.
  // Di dalam Docker container, root .env tidak terbaca (hanya frontend/ yang
  // di-mount) → VITE_BASE_DOMAIN dari compose environment adalah sumber utama.
  const baseDomain = process.env.VITE_BASE_DOMAIN || rootEnv.BASE_DOMAIN || ""
  // FE production jalan sebagai Vite dev server di Docker (bind-mount source,
  // lihat docker-compose.prod.yml). Saat diakses lewat domain publik
  // (browser → Cloudflare TLS → Traefik → container), websocket HMR default
  // (ws://host:VITE_PORT) tidak bisa menembus — arahkan client ke
  // wss://domain:443. Env VITE_HMR_PUBLIC=1 di-set oleh compose, jadi local
  // dev di host TIDAK terpengaruh.
  const hmrPublic = process.env.VITE_HMR_PUBLIC === "1" && baseDomain
  const allowedHosts = ["localhost", "127.0.0.1"]
  if (baseDomain) {
    allowedHosts.push(baseDomain, `.${baseDomain}`)
  }
  // Proxy /api target:
  //   1. VITE_PROXY_TARGET — dipakai saat FE jalan di dalam Docker container
  //      (production dev-server mode). Container tidak bisa pakai localhost
  //      (itu container sendiri) → harus target ke service name `backend`.
  //      Di-set oleh docker-compose.prod.yml via environment:
  //        VITE_PROXY_TARGET=http://backend:${APP_PORT}
  //   2. VITE_API_URL — override eksplisit dari .env
  //   3. default localhost:APP_PORT — local dev mode (FE+BE di host yang sama)
  const proxyTarget =
    process.env.VITE_PROXY_TARGET ||
    feEnv.VITE_PROXY_TARGET ||
    feEnv.VITE_API_URL ||
    `http://localhost:${backendPort}`

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port,
      strictPort: true,
      ...(hmrPublic
        ? { hmr: { protocol: "wss" as const, host: baseDomain, clientPort: 443 } }
        : {}),
      // allowedHosts: izinkan akses via Traefik (Host header = domain publik).
      // Vite 8 blokir Host non-localhost secara default ("Blocked request").
      allowedHosts,
      // NOTE: bind host 0.0.0.0 dipakai saat FE jalan di dalam Docker
      // container (production dev-server mode). Flag `--host 0.0.0.0` sudah
      // di-pass via compose command (`npm run dev -- --host 0.0.0.0`) — jadi
      // di sini TIDAK set `host: true` agar local dev tetap bind localhost
      // saja (tidak expose ke LAN tanpa disengaja).
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        // Serve uploaded files (sparepart images, etc.) through the same
        // backend in local dev, mirroring production app.Static("/uploads").
        "/uploads": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
