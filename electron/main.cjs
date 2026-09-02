/**
 * The desktop shell. It does one thing: serve the built bundle to a window.
 *
 * The bundle is served over a custom `app://` scheme rather than `file://`,
 * because a file:// page is an opaque origin — localStorage there is either
 * refused or thrown away between runs, and localStorage is where the whole
 * station lives.
 */
const { app, BrowserWindow, Menu, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'dist')
const HOME = 'app://station/'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

// Must be declared before the app is ready, or the scheme is not a real origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

const serve = async (request) => {
  const { pathname } = new URL(request.url)
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  const file = path.join(ROOT, rel)
  // Nothing outside the bundle, whatever the URL claims.
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    return new Response('', { status: 403 })
  }
  try {
    const body = await fs.promises.readFile(file)
    return new Response(body, {
      headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

const openWindow = () => {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#05080d',
    title: 'Spaceport-99',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.once('ready-to-show', () => win.show())
  // The game never links out, but if it ever does, it goes to a real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.loadURL(HOME)
  return win
}

// One station per machine: a second launch raises the window that is already up.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    protocol.handle('app', serve)
    // macOS expects a menu bar for Cmd+Q and copy/paste; elsewhere a game with
    // a File menu just looks wrong.
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    openWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
