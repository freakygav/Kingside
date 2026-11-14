import { contextBridge, ipcRenderer } from 'electron'
import type { KingsideApi } from './api'

const api: KingsideApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  engineStatus: () => ipcRenderer.invoke('engine:status'),
  detectEngine: () => ipcRenderer.invoke('engine:detect'),
  chooseEngine: () => ipcRenderer.invoke('engine:choose'),
  clearEnginePath: () => ipcRenderer.invoke('engine:clear-path'),
  newGame: () => ipcRenderer.invoke('engine:new-game'),
  play: (req) => ipcRenderer.invoke('engine:play', req),
  analyze: (req) => ipcRenderer.invoke('engine:analyze', req),
  stop: (role) => ipcRenderer.invoke('engine:stop', role),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  profileEvent: (e) => ipcRenderer.invoke('profile:event', e),
  resetProfile: () => ipcRenderer.invoke('profile:reset'),
  pickBackgroundImage: () => ipcRenderer.invoke('appearance:pick-image'),
  saveBackgroundImage: (bytes) => ipcRenderer.invoke('appearance:save-image', bytes),
  listBackgroundImages: () => ipcRenderer.invoke('appearance:list-images'),
  deleteBackgroundImage: (file) => ipcRenderer.invoke('appearance:delete-image', file),
  chesscomProfile: (u) => ipcRenderer.invoke('import:chesscom-profile', u),
  chesscomArchives: (u) => ipcRenderer.invoke('import:chesscom-archives', u),
  chesscomMonth: (u, y, m) => ipcRenderer.invoke('import:chesscom-month', u, y, m),
  lichessUser: (u) => ipcRenderer.invoke('import:lichess-user', u),
  lichessGames: (u, q) => ipcRenderer.invoke('import:lichess-games', u, q),
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryGet: (id) => ipcRenderer.invoke('library:get', id),
  libraryAdd: (games) => ipcRenderer.invoke('library:add', games),
  libraryDelete: (ids) => ipcRenderer.invoke('library:delete', ids),
  librarySaveAnalysis: (id, positions, bookPlies, summary) => ipcRenderer.invoke('library:save-analysis', id, positions, bookPlies, summary),
  librarySetNames: (names) => ipcRenderer.invoke('library:set-names', names),
  libraryOpenPgn: () => ipcRenderer.invoke('library:open-pgn'),
  libraryExport: (ids) => ipcRenderer.invoke('library:export', ids)
}

contextBridge.exposeInMainWorld('kingside', api)
