import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pwa-survey/',
  server: {
    host: '0.0.0.0', // Expose to network
    port: 6001,
    strictPort: true, // Fail if port is busy
    allowedHosts: true,
    hmr: true,

    proxy: {
      '/qims': {
        target: 'https://moh-qimsuat.gov.bw',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('🚨 Proxy error:', err.message, req.url);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('📤 Proxying request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('📥 Proxy response:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/api': {
        target: 'https://moh-qimsuat.gov.bw/qims',
        changeOrigin: true,
        secure: false,
      },
      '/email2': {
        target: 'https://moh-qimsuat.gov.bw',
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
      '/pwa-survey/api': {
        target: 'https://moh-qimsuat.gov.bw/qims/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/pwa-survey\/api/, ''),
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('🚨 Proxy error:', err);
          });
        }
      },
      '/api': {
        target: 'https://moh-qimsuat.gov.bw/qims',
        changeOrigin: true,
        secure: false,
      },
      '/email2': {
        target: 'https://moh-qimsuat.gov.bw',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})