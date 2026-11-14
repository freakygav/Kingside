import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AnalyzeRequest, AppInfo, EngineRole, IpcResult, PlayRequest, Settings } from '@shared/types'
import type { ProfileEvent } from '@shared/progress'
import { EngineManager } from './engine/manager'
import { BackgroundStore, registerBackgroundScheme } from './backgrounds'
import { ChesscomClient, LichessClient, type LichessQuery } from './importers'
import { LibraryStore } from './library'
import type { GameMeta, StoredGame } from '@shared/library'
import type { PositionAnalysis } from '@shared/review'
import { ProfileStore } from './profileStore'
import { SettingsStore } from './settingsStore'

if (process.env.KINGSIDE_USERDATA) app.setPath('userData', process.env.KINGSIDE_USERDATA)
// Self-test screenshots: keep painting even if another window covers this one.
if (!app.isPackaged && process.env.KINGSIDE_SELFTEST) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
}

registerBackgroundScheme()

const appRoot = app.isPackaged ? process.resourcesPath : join(__dirname, '..', '..')
const bundledEngineDir = app.isPackaged ? join(process.resourcesPath, 'engine') : join(appRoot, 'resources', 'engine')

let settings: SettingsStore
let profile: ProfileStore
let backgrounds: BackgroundStore
let library: LibraryStore
let chesscom: ChesscomClient
const lichess = new LichessClient()
let engines: EngineManager
let win: BrowserWindow | null = null

async function wrap<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function readLicense(title: string, ...candidates: string[]): { title: string; text: string } | null {
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return { title, text: readFileSync(p, 'utf8') }
      } catch {
        /* try next */
      }
    }
  }
  return null
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#1b1d1f',
    title: 'Kingside',
    show: false,
    icon: join(appRoot, app.isPackaged ? 'icon.png' : 'resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => {
    win = null
  })
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) =>
    wrap(async () => {
      const before = settings.get()
      const next = settings.update(patch ?? {})
      if (before.threads !== next.threads || before.hashMb !== next.hashMb) engines.resetAnalysis()
      return next
    })
  )

  ipcMain.handle('appearance:pick-image', () =>
    wrap(async () => {
      // Dev self-test only: skip the native dialog.
      if (!app.isPackaged && process.env.KINGSIDE_SELFTEST_IMAGE) return backgrounds.readCandidate(process.env.KINGSIDE_SELFTEST_IMAGE)
      const r = await dialog.showOpenDialog(win!, {
        title: 'Choose a background image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })
      if (r.canceled || !r.filePaths[0]) return null
      return backgrounds.readCandidate(r.filePaths[0])
    })
  )
  ipcMain.handle('appearance:save-image', (_e, bytes: Uint8Array) => wrap(() => backgrounds.save(new Uint8Array(bytes))))
  ipcMain.handle('appearance:list-images', () => wrap(() => backgrounds.list()))
  ipcMain.handle('appearance:delete-image', (_e, file: string) => wrap(() => backgrounds.remove(file)))

  // Game import & library
  ipcMain.handle('import:chesscom-profile', (_e, u: string) => wrap(() => chesscom.profile(u)))
  ipcMain.handle('import:chesscom-archives', (_e, u: string) => wrap(() => chesscom.archives(u)))
  ipcMain.handle('import:chesscom-month', (_e, u: string, y: number, m: number) => wrap(() => chesscom.month(u, y, m)))
  ipcMain.handle('import:lichess-user', (_e, u: string) => wrap(() => lichess.user(u)))
  ipcMain.handle('import:lichess-games', (_e, u: string, q: LichessQuery) => wrap(() => lichess.games(u, q ?? {})))
  ipcMain.handle('library:list', () => library.list())
  ipcMain.handle('library:get', (_e, id: string) => wrap(() => library.get(id)))
  ipcMain.handle('library:add', (_e, games: StoredGame[]) => wrap(() => library.add(games)))
  ipcMain.handle('library:delete', (_e, ids: string[]) => wrap(() => library.delete(ids)))
  ipcMain.handle('library:save-analysis', (_e, id: string, positions: PositionAnalysis[], bookPlies: number, summary: NonNullable<GameMeta['analysis']>) =>
    wrap(() => library.saveAnalysis(id, positions, bookPlies, summary)))
  ipcMain.handle('library:set-names', (_e, names: string[]) => wrap(() => library.setMyNames(names)))
  ipcMain.handle('library:open-pgn', () =>
    wrap(async () => {
      const pick = !app.isPackaged && process.env.KINGSIDE_SELFTEST_PGN
        ? process.env.KINGSIDE_SELFTEST_PGN
        : (await dialog.showOpenDialog(win!, { title: 'Open PGN file', properties: ['openFile'], filters: [{ name: 'PGN', extensions: ['pgn', 'txt'] }] })).filePaths[0]
      if (!pick) return null
      const size = statSync(pick).size
      if (size > 50 * 1024 * 1024) throw new Error('The PGN file is larger than 50 MB.')
      return { name: pick.split(/[\\/]/).pop() ?? 'games.pgn', text: readFileSync(pick, 'utf8') }
    })
  )
  ipcMain.handle('library:export', (_e, ids: string[]) =>
    wrap(async () => {
      const text = library.exportPgn(ids)
      if (!text) throw new Error('Nothing to export.')
      const target = !app.isPackaged && process.env.KINGSIDE_SELFTEST_EXPORT
        ? process.env.KINGSIDE_SELFTEST_EXPORT
        : (await dialog.showSaveDialog(win!, { title: 'Export PGN', defaultPath: ids.length === 1 ? `${ids[0]}.pgn` : `kingside-${ids.length}-games.pgn`, filters: [{ name: 'PGN', extensions: ['pgn'] }] })).filePath
      if (!target) return null
      writeFileSync(target, text, 'utf8')
      return target
    })
  )

  ipcMain.handle('profile:get', () => profile.get())
  ipcMain.handle('profile:event', (_e, ev: ProfileEvent) => wrap(() => profile.apply(ev)))
  ipcMain.handle('profile:reset', () => wrap(() => profile.reset()))

  ipcMain.handle('engine:status', () => engines.getStatus())
  ipcMain.handle('engine:detect', () => engines.detect())
  ipcMain.handle('engine:choose', () =>
    wrap(async () => {
      const r = await dialog.showOpenDialog(win!, {
        title: 'Select a Stockfish executable',
        properties: ['openFile'],
        filters: process.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe'] }] : []
      })
      if (r.canceled || !r.filePaths[0]) return null
      const path = r.filePaths[0]
      await engines.probe(path) // throws a readable error if it isn't a UCI engine
      settings.update({ enginePath: path })
      return engines.detect()
    })
  )
  ipcMain.handle('engine:clear-path', () =>
    wrap(async () => {
      settings.update({ enginePath: null })
      return engines.detect()
    })
  )
  ipcMain.handle('engine:new-game', () => wrap(() => engines.newGame()))
  ipcMain.handle('engine:play', (_e, req: PlayRequest) => wrap(() => engines.play(req)))
  ipcMain.handle('engine:analyze', (_e, req: AnalyzeRequest) => wrap(() => engines.analyze(req)))
  ipcMain.handle('engine:stop', (_e, role: EngineRole) => {
    if (role === 'play' || role === 'analysis') engines.stop(role)
  })

  ipcMain.handle('app:info', (): AppInfo => {
    const licenses = [
      readLicense('Kingside (MIT)', join(appRoot, 'LICENSE.txt'), join(appRoot, 'LICENSE')),
      readLicense('Third-party notices', join(appRoot, 'THIRD_PARTY_NOTICES.md')),
      readLicense('Stockfish (GPL-3.0)', join(bundledEngineDir, 'Copying.txt'))
    ].filter((x): x is { title: string; text: string } => x !== null)
    return { version: app.getVersion(), electron: process.versions.electron, licenses }
  })
  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url)
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    settings = new SettingsStore(app.getPath('userData'))
    profile = new ProfileStore(app.getPath('userData'))
    backgrounds = new BackgroundStore(app.getPath('userData'))
    backgrounds.registerProtocol()
    library = new LibraryStore(app.getPath('userData'))
    chesscom = new ChesscomClient(app.getPath('userData'))
    engines = new EngineManager(() => settings.get(), bundledEngineDir)
    registerIpc()
    createWindow()
    if (!app.isPackaged) {
      win?.webContents.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools()
      })
      const out = process.env.KINGSIDE_SELFTEST
      if (out && win) {
        const w = win
        w.webContents.once('did-finish-load', () => {
          void import('./selftest').then((m) => m.runSelfTest(w, out, () => app.quit()))
        })
      }
    }
  })
  app.on('window-all-closed', () => {
    engines?.shutdown()
    app.quit()
  })
  app.on('before-quit', () => engines?.shutdown())
}
