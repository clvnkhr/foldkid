import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'
import { offlineAssets } from './scripts/offlineAssets'

export default defineConfig(({ mode }) => {
  const iosBundle = mode === 'ios'
  return {
    base: iosBundle ? '/' : '/foldkid/',
    plugins: [foldkit(), ...(iosBundle ? [] : [offlineAssets()])],
    build: { outDir: iosBundle ? 'dist-ios' : 'dist' },
    optimizeDeps: { entries: ['src/**/*.ts'] },
  }
})
