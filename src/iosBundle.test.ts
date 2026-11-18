// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import capacitor from '../capacitor.config'

describe('Capacitor iOS bundle mode', () => {
  it.each([
    { mode: 'production', base: '/foldkid/', output: 'dist', offline: true },
    { mode: 'ios', base: '/', output: 'dist-ios', offline: false },
  ])('keeps $mode assets and output separate', async ({ mode, base, output, offline }) => {
    const config = await resolveConfig({ mode, logLevel: 'silent' }, 'build')
    expect(config.base).toBe(base)
    expect(config.build.outDir).toBe(output)
    expect(config.plugins.some(plugin => plugin.name === 'foldkid-offline-assets')).toBe(offline)
    if (mode === 'ios') expect(capacitor.webDir).toBe(config.build.outDir)
  })

  it('loads the packaged application with native scrolling and CSS safe-area handling', () => {
    expect(capacitor.server?.url).toBeUndefined()
    expect(capacitor.server?.allowNavigation ?? []).toEqual([])
    expect(capacitor.appId).toBe('com.calvinkhor.foldkid')
    expect(capacitor.ios).toMatchObject({ contentInset: 'never', scrollEnabled: true, allowsLinkPreview: false })
  })

  it('pins the Swift package to the matching installed Capacitor version', async () => {
    const lock = JSON.parse(await readFile(join(process.cwd(), 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>
    }
    const version = lock.packages['node_modules/@capacitor/ios']?.version
    expect(version).toMatch(/^8\./)
    expect(lock.packages['node_modules/@capacitor/core']?.version).toBe(version)
    expect(lock.packages['node_modules/@capacitor/cli']?.version).toBe(version)
    const swiftPackage = await readFile(join(process.cwd(), 'ios/App/CapApp-SPM/Package.swift'), 'utf8')
    expect(swiftPackage).toContain(`exact: "${version}"`)
  })
})
