import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/foldkid/',
  plugins: [foldkit()],
  optimizeDeps: {
    entries: ['src/**/*.ts'],
  },
})
