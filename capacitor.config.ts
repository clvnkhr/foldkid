import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.calvinkhor.foldkid',
  appName: 'FoldKid',
  webDir: 'dist-ios',
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
}

export default config
