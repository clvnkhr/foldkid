# iOS bundle

The checked-in Capacitor project packages FoldKid for iPhone and iPad. Artwork, fonts, audio, and drawing models are included, so the installed app starts without a network connection. The native bundle does not use the web service worker.

Use macOS with Node.js 22 or newer and Xcode 26 or newer, as required by [Capacitor 8](https://capacitorjs.com/docs/getting-started/environment-setup). The project uses Swift Package Manager; CocoaPods is not needed.

## Build and open

From the repository root:

```sh
npm ci
npm run ios:sync
npm run ios:open
```

`ios:sync` builds the native web assets into `dist-ios`, then copies them and the Capacitor configuration into the Xcode project. Run it after changing the app.

In Xcode, choose the **App** scheme and an iOS simulator, then Run. To install on an iPhone, choose your development team under **Signing & Capabilities** and select the connected device. The default bundle identifier is `com.calvinkhor.foldkid`; change it in `capacitor.config.ts` and the Xcode target if needed for your signing setup.

To build and choose a run target from the command line:

```sh
npm run ios:run
```

If command-line tools point to the standalone tools instead of Xcode, select Xcode for this command without changing the system-wide selection:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios:run
```

## Web build

`npm run build` still creates the GitHub Pages build in `dist`, using `/foldkid/` and the web offline cache. `npm run build:ios` creates the separate root-based native build in `dist-ios`. Both output folders and the copied native web assets are generated and ignored by Git.
