import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Cloudflare Pages injects `VITE_*` on `process.env` during `npm run build`.
 * In some setups those values do not get inlined into `import.meta.env` the same way as `.env` files.
 * Explicit `define` ensures CI/Pages builds match local `.env` behavior.
 */
function importMetaEnvDefineFromProcess(): Record<string, string> {
  const d: Record<string, string> = {}
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('VITE_')) {
      continue
    }
    const val = process.env[key]
    if (val === undefined) {
      continue
    }
    d[`import.meta.env.${key}`] = JSON.stringify(val)
  }
  return d
}

// https://vite.dev/config/
export default defineConfig({
  define: importMetaEnvDefineFromProcess(),
  plugins: [react()],
  build: {
    // The learner player route bundles Mux's web component runtime (~1MB minified)
    // in a route-level chunk. Keep warnings meaningful for unexpected regressions.
    chunkSizeWarningLimit: 1100,
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
