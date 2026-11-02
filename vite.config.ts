import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'
import { offlineAssets } from './scripts/offlineAssets'

export default defineConfig({
  base: '/foldkid/',
  plugins: [foldkit(), offlineAssets()],
  optimizeDeps: {
    entries: ['src/**/*.ts'],
  },
})
