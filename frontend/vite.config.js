import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:3000'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    // manualChunks conflicts with the SSR build's inlineDynamicImports,
    // so vendor chunking applies to the client bundle only.
    ...(isSsrBuild
      ? {}
      : {
          rollupOptions: {
            output: {
              manualChunks: {
                'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                'vendor-charts': ['recharts'],
                'vendor-icons': ['lucide-react'],
              },
            },
          },
        }),
  },
  ssr: {
    noExternal: ['react-router-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
}))
