Standalone builds of Spaceport-99. Everything is inside the download — no
runtime to install, and the game never touches the network. Your station saves
to the device you play it on.

| Download | For |
| --- | --- |
| `Spaceport-99-*-windows-setup.exe` | Windows 10/11, 64-bit |
| `Spaceport-99-*-mac-arm64.dmg` | Macs with Apple Silicon (M1 and later) |
| `Spaceport-99-*-mac-x64.dmg` | Intel Macs |
| `Spaceport-99-*-android.apk` | Android phones and tablets, sideloaded |

**These builds are not code-signed**, so each system will want convincing once:

- **Windows** — SmartScreen says "Windows protected your PC". Click **More
  info**, then **Run anyway**.
- **macOS** — the first launch is refused. **Right-click the app → Open**, then
  **Open** again in the dialog. Only needed once. If macOS calls it "damaged",
  run `xattr -dr com.apple.quarantine /Applications/Spaceport-99.app`.
- **Android** — allow installs from your browser or file manager when prompted.
  The APK is debug-signed, which is enough to sideload but means a new build
  may need the old one uninstalled first.

Signing these properly needs a paid Apple Developer ID and a Windows
code-signing certificate.

You can also just play it in a browser: https://cyberhirsch.github.io/Spaceport-99/
