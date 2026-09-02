import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android wrapper. The bundle is copied into the app and served from a
 * real https origin inside the WebView, so localStorage behaves exactly as it
 * does in a browser — and nothing is fetched over the network at any point.
 */
const config: CapacitorConfig = {
  appId: 'com.cyberhirsch.spaceport99',
  appName: 'Spaceport-99',
  webDir: 'dist',
  android: {
    backgroundColor: '#05080d',
    // Nothing here is a debuggable web page in a shipped build.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#05080d',
      launchAutoHide: true,
      launchShowDuration: 600,
    },
  },
}

export default config
