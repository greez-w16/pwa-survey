import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const QIMS_HOST = 'https://moh-qimsuat.gov.bw'
const ASSETS_DIR = path.resolve(process.cwd(), 'src', 'assets')
const FACILITY_CONFIG_FILES = {
  hospital_full_configuration: 'hospital/hospital_config.json',
  clinics_full_configuration: 'clinics/clinics_config.json',
  ems_full_configuration: 'ems/ems_config.json',
  mortuary_full_configuration: 'mortuary/mortuary_config.json',
}

const readRequestBody = (req) => new Promise((resolve, reject) => {
  let body = ''
  req.on('data', chunk => {
    body += chunk
    if (body.length > 100 * 1024 * 1024) {
      reject(new Error('Request body is too large'))
      req.destroy()
    }
  })
  req.on('end', () => resolve(body))
  req.on('error', reject)
})

const attachAssetConfigExportEndpoint = (server) => {
  server.middlewares.use('/__qims/export-facility-config-assets', async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    try {
      const raw = await readRequestBody(req)
      const payload = JSON.parse(raw || '{}')
      const configurations = payload?.configurations || {}
      const written = []

      for (const [configKey, fileName] of Object.entries(FACILITY_CONFIG_FILES)) {
        if (configurations[configKey] === undefined) continue
        const targetPath = path.resolve(ASSETS_DIR, fileName)

        if (!targetPath.startsWith(ASSETS_DIR + path.sep)) {
          throw new Error('Resolved export path is outside src/assets')
        }

        if (fs.existsSync(targetPath)) {
          const backupPath = targetPath.replace(/\.json$/, `_backup_${Date.now()}.json`)
          fs.copyFileSync(targetPath, backupPath)
        }
        fs.writeFileSync(targetPath, JSON.stringify({ [configKey]: configurations[configKey] }, null, 2), 'utf8')
        written.push(path.join('src', 'assets', fileName).replace(/\\/g, '/'))
      }

      if (written.length === 0) {
        throw new Error('No facility configuration payloads were provided')
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        ok: true,
        written,
      }))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: err?.message || 'Export failed' }))
    }
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'qims-facility-config-asset-export',
      configureServer: attachAssetConfigExportEndpoint,
      configurePreviewServer: attachAssetConfigExportEndpoint,
    },
  ],
  base: '/pwa-survey/',
  server: {
    host: '0.0.0.0', // Expose to network
    port: 6001,
    strictPort: true, // Fail if port is busy
    allowedHosts: true,
    hmr: true,

    proxy: {
      '/qims': {
        target: QIMS_HOST,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            console.log('Proxy error:', err.message, req.url)
          })
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Proxying request:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('Proxy response:', proxyRes.statusCode, req.url)
          })
        }
      },
      '/api': {
        target: `${QIMS_HOST}/qims`,
        changeOrigin: true,
        secure: false,
      },
      '/email2': {
        target: QIMS_HOST,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/qims': {
        target: QIMS_HOST,
        changeOrigin: true,
        secure: false,
      },
      '/pwa-survey/api': {
        target: `${QIMS_HOST}/qims/api`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/pwa-survey\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Proxy error:', err)
          })
        }
      },
      '/api': {
        target: `${QIMS_HOST}/qims`,
        changeOrigin: true,
        secure: false,
      },
      '/email2': {
        target: QIMS_HOST,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})