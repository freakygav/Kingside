/**
 * Development-only end-to-end check (never runs in packaged builds).
 *   npm run build
 *   KINGSIDE_SELFTEST=<out dir> KINGSIDE_USERDATA=<fresh dir> npx electron .
 * Drives the real window with native mouse/keyboard events and writes results.json + screenshots.
 */
import { app, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Check = { name: string; ok: boolean; detail?: string }

export async function runSelfTest(win: BrowserWindow, outDir: string, quit: () => void): Promise<void> {
  mkdirSync(outDir, { recursive: true })
  const checks: Check[] = []
  const wc = win.webContents
  const js = <T = unknown>(code: string): Promise<T> => wc.executeJavaScript(code, true)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const check = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
  }
  const waitFor = async (code: string, timeoutMs = 15_000): Promise<boolean> => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if (await js<boolean>(code).catch(() => false)) return true
      await sleep(100)
    }
    return false
  }
  const shot = async (name: string) => {
    // CDP screenshots render a fresh frame even if the OS stopped compositing the window.
    await sleep(250)
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    const r = (await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })) as { data: string }
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.data, 'base64'))
  }
  /** Centre of a square in window coordinates (respects board orientation). */
  const sq = async (square: string): Promise<{ x: number; y: number }> =>
    js(`(() => {
      const b = document.querySelector('[data-testid=board]').getBoundingClientRect();
      const flipped = document.querySelector('.coord.file')?.textContent === 'h';
      const f = '${square}'.charCodeAt(0) - 97, r = Number('${square}'[1]) - 1;
      const col = flipped ? 7 - f : f, row = flipped ? r : 7 - r;
      return { x: Math.round(b.left + (col + 0.5) * b.width / 8), y: Math.round(b.top + (row + 0.5) * b.height / 8) };
    })()`)
  const mouse = (type: 'mouseDown' | 'mouseUp' | 'mouseMove', p: { x: number; y: number }, button: 'left' | 'right' = 'left', held = false) =>
    wc.sendInputEvent({
      type,
      x: p.x,
      y: p.y,
      button,
      clickCount: 1,
      modifiers: held ? [button === 'left' ? 'leftbuttondown' : 'rightbuttondown'] : []
    } as Electron.MouseInputEvent)
  const drag = async (from: string, to: string, button: 'left' | 'right' = 'left') => {
    const a = await sq(from)
    const b = await sq(to)
    mouse('mouseMove', a)
    mouse('mouseDown', a, button)
    await sleep(30)
    for (let i = 1; i <= 8; i++) {
      mouse('mouseMove', { x: Math.round(a.x + ((b.x - a.x) * i) / 8), y: Math.round(a.y + ((b.y - a.y) * i) / 8) }, button, true)
      await sleep(12)
    }
    mouse('mouseUp', b, button)
    await sleep(60)
  }
  const click = async (square: string, button: 'left' | 'right' = 'left') => {
    const p = await sq(square)
    mouse('mouseMove', p)
    mouse('mouseDown', p, button)
    await sleep(25)
    mouse('mouseUp', p, button)
    await sleep(60)
  }
  const key = async (keyCode: string) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await sleep(80)
  }
  const plies = () => js<number>(`document.querySelectorAll('.move-list .mv[data-ply]').length`)
  const sans = () => js<string[]>(`[...document.querySelectorAll('.move-list .mv[data-ply]')].map(e => e.textContent)`)
  const clickText = (sel: string, text: string) =>
    js(`(() => { const el = [...document.querySelectorAll('${sel}')].find(e => e.textContent.includes(${JSON.stringify(text)})); if (el) el.click(); return !!el })()`)

  const nav = async (name: string) => {
    await js(`document.querySelector('[data-nav=${name}]').click()`)
    await sleep(250)
  }
  const clickNext = async () => {
    await js(`document.querySelector('[data-testid=lesson-next]').click()`)
    await sleep(180)
  }
  /** Set a React-controlled <select>/<textarea>/<input> value. */
  const selectValue = (testid: string, value: string) =>
    js(`(() => { const el = document.querySelector('[data-testid=${testid}]'); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const typeInto = (testid: string, value: string, event = 'input') =>
    js(`(() => { const el = document.querySelector('[data-testid=${testid}]'); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('${event}', { bubbles: true })); return true })()`)

  const runImportChecks = async () => {
    const PGN = `[Event "Club Ch."]\n[Site "Somewhere"]\n[Date "2024.03.09"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n[WhiteElo "1850"]\n[BlackElo "1790"]\n[TimeControl "600+5"]\n\n1. e4 {comment} e5 2. Nf3 Nc6 (2... d6) 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. h3 Ke8 10. Nc3 h5 11. Bf4 Be7 12. Rad1 Be6 13. Ng5 Rh6 14. g3 Bxg5 15. Bxg5 Rg6 16. h4 f6 17. exf6 gxf6 18. Bf4 Nxh4 19. f3 Rd8 20. Kf2 Rxd1 21. Rxd1 Nf5 22. Rh1 Bxa2 23. Rxh5 Be6 24. g4 Nd6 25. Rh7 Nf7 26. Ne4 Kf8 27. Nc5 Bc8 28. Rh8+ Kg7 29. Rxc8 1-0\n\n[White "Carol"]\n[Black "Dave"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n\n[White "Eve"]\n[Black "Mallory"]\n\n1. e4 e5 2. Nf9 Nc6 *\n`
    await nav('import')
    check('game import page', await waitFor(`!!document.querySelector('[data-testid=import-page]')`))
    await shot('30-import-center')
    await js(`document.querySelector('[data-testid=method-pgn]').click()`)
    await typeInto('pgn-text', PGN, 'input')
    await js(`document.querySelector('[data-testid=pgn-parse]').click()`)
    check('PGN text: 3 games read, invalid one reported', await waitFor(`document.querySelectorAll('[data-testid=candidate-table] tbody tr').length === 3 && /Nf9/.test(document.querySelector('.problems')?.textContent ?? '')`, 3000))
    await js(`document.querySelector('[data-testid=import-selected]').click()`)
    check('PGN text: 2 valid games imported, invalid one listed', await waitFor(`/Imported 2 games/.test(document.querySelector('[data-testid=import-report]')?.textContent ?? '') && /could not be imported/.test(document.querySelector('[data-testid=import-report]')?.textContent ?? '')`, 5000))
    const pgnFile = join(outDir, 'games.pgn')
    writeFileSync(pgnFile, PGN)
    process.env.KINGSIDE_SELFTEST_PGN = pgnFile
    await js(`document.querySelector('[data-testid=pgn-browse]').click()`)
    await waitFor(`document.querySelectorAll('[data-testid=candidate-table] tbody tr').length === 3`, 3000)
    check('PGN file: same games recognised as already in library', await js<boolean>(`[...document.querySelectorAll('[data-testid=candidate-table] tbody tr')].filter(r => /In library/.test(r.textContent)).length === 2`))
    await shot('31-pgn-import')

    // Chess.com (live public API).
    await js(`document.querySelector('[data-testid=method-chesscom]').click()`)
    await typeInto('chesscom-username', 'no-such-user-xq9z', 'input')
    await js(`document.querySelector('.user-row').requestSubmit()`)
    check('Chess.com: unknown username reported', await waitFor(`/No Chess.com account/.test(document.querySelector('[data-testid=import-error]')?.textContent ?? '')`, 20_000))
    await typeInto('chesscom-username', 'erik', 'input')
    await js(`document.querySelector('.user-row').requestSubmit()`)
    const gotArchives = await waitFor(`document.querySelectorAll('[data-testid=month-grid] .chip').length > 0`, 30_000)
    check('Chess.com: username validated and archives listed', gotArchives)
    if (gotArchives) {
      await js(`[...document.querySelectorAll('[data-testid=month-grid] .chip')].pop().click()`)
      check('Chess.com: games of the selected month listed', await waitFor(`document.querySelectorAll('[data-testid=candidate-table] tbody tr').length > 0`, 30_000))
      await shot('32-chesscom')
      await js(`document.querySelector('[data-testid=import-selected]').click()`)
      check('Chess.com: games imported', await waitFor(`/Imported [1-9]\\d* game/.test(document.querySelector('[data-testid=import-report]')?.textContent ?? '')`, 20_000))
    }
    // Lichess (live public API).
    await js(`document.querySelector('[data-testid=method-lichess]').click()`)
    await typeInto('lichess-username', 'thibault', 'input')
    await js(`document.querySelector('.user-row').requestSubmit()`)
    const gotLi = await waitFor(`document.querySelectorAll('[data-testid=candidate-table] tbody tr').length > 0`, 60_000)
    check('Lichess: public games retrieved', gotLi)
    if (gotLi) {
      await js(`document.querySelector('[data-testid=import-selected]').click()`)
      check('Lichess: games imported', await waitFor(`/Imported [1-9]\\d* game/.test(document.querySelector('[data-testid=import-report]')?.textContent ?? '')`, 20_000))
    }

    // Library: search, analyse with cancel + restart, graph navigation, explore, coach, cache, export, delete.
    await js(`document.querySelector('[data-testid=import-tab-library]').click()`)
    check('library lists imported games', await waitFor(`document.querySelectorAll('[data-testid=library-table] tbody tr').length >= 2`, 5000))
    await typeInto('library-search', 'Alice', 'input')
    await sleep(100)
    check('library search', await js<boolean>(`document.querySelectorAll('[data-testid=library-table] tbody tr').length === 1`))
    await shot('33-library')
    await js(`document.querySelector('[data-testid=analyze-game]').click()`)
    check('analysis starts for the imported game', await waitFor(`!!document.querySelector('[data-testid=review-progress]')`, 8000))
    await js(`document.querySelector('[data-testid=cancel-analysis]').click()`)
    check('analysis can be cancelled', await waitFor(`/cancelled/.test(document.querySelector('[data-testid=analyze-box]')?.textContent ?? '')`, 3000))
    await selectValue('analysis-depth', '200')
    await js(`document.querySelector('[data-testid=start-analysis]').click()`)
    check('full Stockfish analysis of imported game', await waitFor(`!!document.querySelector('.summary') && document.querySelectorAll('.move-list .cls-icon').length === 57`, 120_000))
    check('real player names and ratings shown', await js<boolean>(`/Alice/.test(document.querySelector('.board-col').textContent) && /1850/.test(document.querySelector('.board-col').textContent)`))
    await js(`(() => { const g = document.querySelector('.eval-graph'); const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * 0.5, clientY: r.top + 10, bubbles: true })) })()`)
    await sleep(150)
    check('eval graph click jumps to that position', await js<boolean>(`!!document.querySelector('.move-list .mv.current') && Math.abs(Number(document.querySelector('.move-list .mv.current').dataset.ply) - 29) <= 2`))
    await shot('34-import-analysis')
    const before = await js<number>(`document.querySelectorAll('.move-list .mv[data-ply]').length`)
    await js(`document.querySelector('[data-testid=explore]').click()`)
    check('explore mode opens view-only variation', await waitFor(`!!document.querySelector('[data-testid=explore-panel]') && !!document.querySelector('[data-testid=back-to-game]')`, 3000))
    check('explore shows engine lines', await waitFor(`document.querySelectorAll('[data-testid=explore-panel] .line').length >= 1`, 15_000))
    await js(`document.querySelector('[data-testid=back-to-game]').click()`)
    check('game record unchanged after exploring', (await js<number>(`document.querySelectorAll('.move-list .mv[data-ply]').length`)) === before)
    await js(`document.querySelector('[data-testid=coach-review-tab]').click()`)
    check('coach reviews the imported game', await waitFor(`document.querySelectorAll('[data-testid=plan-item]').length >= 1 && document.querySelectorAll('.phase-card').length === 3`, 15_000))
    await shot('35-import-coach')
    await clickText('.panel-head .ghost-btn', 'Back')
    await waitFor(`!!document.querySelector('[data-testid=library-table]')`, 3000)
    check('library search kept after returning from a game', (await js<string>(`document.querySelector('[data-testid=library-search]').value`)) === 'Alice')
    check('analysis cached in library', await waitFor(`/✓/.test(document.querySelector('[data-testid=library-table] tbody tr td:nth-child(9)')?.textContent ?? '')`, 5000))
    await js(`document.querySelector('[data-testid=analyze-game]').click()`)
    check('cached analysis reused (no re-run)', await waitFor(`/Loaded saved analysis/.test(document.querySelector('.cache-note')?.textContent ?? '') && !document.querySelector('[data-testid=review-progress]')`, 5000))
    await clickText('.panel-head .ghost-btn', 'Back')
    await waitFor(`!!document.querySelector('[data-testid=library-table]')`, 3000)
    const exportFile = join(outDir, 'export.pgn')
    process.env.KINGSIDE_SELFTEST_EXPORT = exportFile
    await js(`document.querySelector('[data-testid=library-table] tbody tr input[type=checkbox]').click()`)
    await js(`document.querySelector('[data-testid=export-selected]').click()`)
    await sleep(500)
    check('export analysed game as annotated PGN', existsSync(exportFile) && /%eval/.test(readFileSync(exportFile, 'utf8')) && /Alice/.test(readFileSync(exportFile, 'utf8')))

    await typeInto('library-search', 'Carol', 'input')
    await sleep(100)
    await js(`document.querySelector('[data-testid=delete-one]').click()`)
    await js(`document.querySelector('[data-testid=confirm-delete-one]').click()`)
    check('game deleted', await waitFor(`document.querySelectorAll('[data-testid=library-table] tbody tr').length === 0`, 3000))
    await typeInto('library-search', '', 'input')

    // Statistics + comparison.
    await js(`document.querySelector('[data-testid=import-tab-stats]').click()`)
    await typeInto('my-names', 'alice', 'input')
    await js(`document.querySelector('.names-row').requestSubmit()`)
    check('statistics from imported games', await waitFor(`/Games imported/.test(document.querySelector('[data-testid=import-stats]')?.textContent ?? '') && /accuracy [0-9]/.test(document.querySelector('[data-testid=import-stats]').textContent)`, 5000))
    await js(`document.querySelector('[data-testid=period-7]').click()`)
    await sleep(100)
    check('statistics period filter', await js<boolean>(`!!document.querySelector('[data-testid=import-stats]')`))
    await shot('36-import-stats')
    await js(`document.querySelector('[data-testid=import-tab-compare]').click()`)
    await js(`document.querySelector('[data-testid=compare-colors]').click()`)
    check('comparison (White vs Black)', await waitFor(`document.querySelectorAll('[data-testid=group-summary]').length === 2`, 3000))

    // Persistence across restart.
    const idx = JSON.parse(readFileSync(join(app.getPath('userData'), 'library', 'index.json'), 'utf8'))
    check('library persisted (index + analysis)', idx.games.length >= 1 && idx.games.some((g: { white: string; analysis: unknown }) => g.white === 'Alice' && g.analysis))
    wc.reload()
    await waitFor(`!!document.querySelector('[data-nav=import]')`, 15_000)
    await nav('import')
    await js(`document.querySelector('[data-testid=import-tab-library]').click()`)
    check('library available after restart (offline review data)', await waitFor(`[...document.querySelectorAll('[data-testid=library-table] tbody tr')].some(r => /Alice/.test(r.textContent) && /✓/.test(r.textContent))`, 5000))
  }

  const runAppearanceChecks = async () => {
    await nav('appearance')
    check('appearance page', await waitFor(`!!document.querySelector('[data-testid=appearance-page]')`))
    // Every built-in background renders something in the preview.
    const ids = await js<string[]>(`[...document.querySelectorAll('.bg-thumb[data-bg]')].map(e => e.dataset.bg)`)
    let rendered = 0
    for (const id of ids) {
      await js(`document.querySelector('.bg-thumb[data-bg="${id}"]').click()`)
      await sleep(40)
      const ok = await js<boolean>(`(() => { const s = getComputedStyle(document.querySelector('.preview-bg .bg-paint')); return s.backgroundImage !== 'none' || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== '') })()`)
      if (ok) rendered++
      if (['carbon-fiber', 'dark-marble', 'wood', 'hexagons'].includes(id)) await shot(`20-bg-${id}`)
    }
    check('all 24 built-in backgrounds render', ids.length === 24 && rendered === 24, `${rendered}/${ids.length}`)
    await typeInto('bg-search', 'gradient', 'input')
    await sleep(80)
    check('background search filters the gallery', (await js<number>(`document.querySelectorAll('.bg-thumb[data-bg]').length`)) === 7)
    await typeInto('bg-search', '', 'input')
    await typeInto('bg-opacity', '0.6', 'input')
    await typeInto('bg-blur', '6', 'input')
    await typeInto('bg-brightness', '0.8', 'input')
    await sleep(80)
    const paint = await js<{ o: string; f: string }>(`(() => { const s = getComputedStyle(document.querySelector('.preview-bg .bg-paint')); return { o: s.opacity, f: s.filter } })()`)
    check('opacity, blur and brightness apply live', paint.o === '0.6' && /blur\(6px\)/.test(paint.f) && /brightness\(0\.8\)/.test(paint.f), JSON.stringify(paint))

    // Custom image: a generated 3200x1800 PNG (gets downscaled) and an invalid file.
    const dataUrl = await js<string>(`(() => { const c = document.createElement('canvas'); c.width = 3200; c.height = 1800; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 3200, 1800); gr.addColorStop(0, '#203a43'); gr.addColorStop(1, '#5a3f2b'); g.fillStyle = gr; g.fillRect(0, 0, 3200, 1800); g.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 40; i++) g.fillRect(i * 80, 0, 30, 1800); return c.toDataURL('image/png') })()`)
    const tmpPng = join(outDir, 'upload-test.png')
    writeFileSync(tmpPng, Buffer.from(dataUrl.split(',')[1], 'base64'))
    const badFile = join(outDir, 'not-an-image.png')
    writeFileSync(badFile, 'this is not a png')
    process.env.KINGSIDE_SELFTEST_IMAGE = badFile
    await js(`document.querySelector('[data-testid=bg-upload]').click()`)
    check('invalid image rejected with a reason', await waitFor(`/not a valid/.test(document.querySelector('[data-testid=bg-upload-error]')?.textContent ?? '')`, 5000))
    process.env.KINGSIDE_SELFTEST_IMAGE = tmpPng
    await js(`document.querySelector('[data-testid=bg-upload]').click()`)
    check('upload preview (resized to 2560px)', await waitFor(`/resized to 2560/.test(document.querySelector('[data-testid=bg-pending]')?.textContent ?? '')`, 10_000))
    check('preview shows the uploaded image', await js<boolean>(`/blob:/.test(getComputedStyle(document.querySelector('.preview-bg .bg-paint')).backgroundImage)`))
    await shot('21-upload-preview')
    await js(`document.querySelector('[data-testid=bg-keep]').click()`)
    check('image stored in the app library', await waitFor(`document.querySelectorAll('[data-testid=custom-image]').length === 1`, 5000))
    await selectValue('bg-fit', 'contain')
    await selectValue('bg-position', 'top')
    await sleep(80)
    const fit = await js<{ size: string; pos: string }>(`(() => { const s = getComputedStyle(document.querySelector('.preview-bg .bg-paint')); return { size: s.backgroundSize, pos: s.backgroundPosition } })()`)
    check('image fit and position apply', fit.size === 'contain' && /0%|top/.test(fit.pos), JSON.stringify(fit))

    // Square colours and pieces (separate from the background).
    await js(`document.querySelector('[data-testid=ap-cat-colors]').click()`)
    await js(`document.querySelector('[data-testid=combo-ocean]').click()`)
    await sleep(60)
    const sq = await js<string>(`getComputedStyle(document.querySelector('.ap-board .sq.light')).backgroundColor`)
    check('square colours change in the preview', sq === 'rgb(211, 225, 238)', sq)
    const bgStill = await js<boolean>(`/kingside-bg:/.test(getComputedStyle(document.querySelector('.preview-bg .bg-paint')).backgroundImage)`)
    check('changing colours keeps the background', bgStill)
    await js(`document.querySelector('[data-testid=ap-cat-pieces]').click()`)
    const before = await js<string>(`document.querySelector('.ap-pieces-row img').src`)
    await js(`document.querySelector('[data-testid=pieces-merida]').click()`)
    await sleep(60)
    const merida = await js<string>(`document.querySelector('.ap-pieces-row img').src`)
    check('piece set preview changes (all 12 pieces shown)', merida !== before && (await js<number>(`document.querySelectorAll('.ap-pieces-row img').length`)) === 12)
    await drag('f3', 'g5')
    check('preview board still plays moves', await js<boolean>(`!!document.querySelector('.ap-board .hl-last[data-square="g5"]')`))
    await shot('22-appearance')
    await js(`document.querySelector('[data-testid=ap-apply]').click()`)
    await sleep(300)
    const appBg = await js<boolean>(`/kingside-bg:/.test(getComputedStyle(document.querySelector('.app-bg .bg-paint')).backgroundImage)`)
    check('applied background shows app-wide', appBg)

    // Presets: create, rename, apply, delete.
    await js(`document.querySelector('[data-testid=ap-cat-presets]').click()`)
    await typeInto('preset-name', 'E2E Preset', 'input')
    await js(`document.querySelector('[data-testid=preset-save]').click()`)
    check('preset created', await waitFor(`document.querySelectorAll('[data-testid=custom-preset]').length === 1`, 3000))
    await js(`document.querySelector('[data-testid=preset-rename]').click()`)
    await typeInto('preset-rename-input', 'Renamed Preset', 'input')
    await js(`document.querySelector('.preset-rename').requestSubmit()`)
    check('preset renamed', await waitFor(`/Renamed Preset/.test(document.querySelector('[data-testid=custom-preset]')?.textContent ?? '')`, 3000))
    await js(`document.querySelector('[data-testid=builtin-preset-carbon-pro]').click()`)
    await sleep(250)
    check('built-in preset applied', await js<boolean>(`getComputedStyle(document.querySelector('.app-bg .bg-paint')).backgroundImage.includes('linear-gradient')`))
    await js(`document.querySelector('[data-testid=preset-apply]').click()`)
    await sleep(250)
    check('custom preset applied (restores image + colours)', await js<boolean>(`/kingside-bg:/.test(getComputedStyle(document.querySelector('.app-bg .bg-paint')).backgroundImage)`))
    await js(`document.querySelector('[data-testid=builtin-preset-carbon-pro]').click()`)
    await sleep(150)
    await js(`document.querySelector('[data-testid=preset-delete]').click()`)
    await js(`document.querySelector('[data-testid=preset-delete-confirm]').click()`)
    check('preset deleted', await waitFor(`document.querySelectorAll('[data-testid=custom-preset]').length === 0`, 3000))
    // Re-apply the custom image look for the persistence checks.
    await js(`document.querySelector('[data-testid=ap-cat-backgrounds]').click()`)
    await js(`document.querySelector('[data-testid=custom-image] .bg-swatch').click()`)
    await js(`document.querySelector('[data-testid=ap-cat-colors]').click()`)
    await js(`document.querySelector('[data-testid=combo-ocean]').click()`)
    await js(`document.querySelector('[data-testid=ap-cat-pieces]').click()`)
    await js(`document.querySelector('[data-testid=pieces-merida]').click()`)
    await js(`document.querySelector('[data-testid=ap-apply]').click()`)
    await sleep(300)

    // Persistence: settings.json + image copied into the app folder; survives a renderer restart.
    const s = JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8'))
    const file = String(s.appearance?.background ?? '').replace('custom:', '')
    check('appearance saved to settings.json', s.appearance?.pieces === 'merida' && s.appearance?.light === '#d3e1ee' && existsSync(join(app.getPath('userData'), 'backgrounds', file)), JSON.stringify(s.appearance))
    wc.reload()
    await waitFor(`!!document.querySelector('.app-bg .bg-paint')`, 15_000)
    await sleep(500)
    check('appearance restored after restart', await js<boolean>(`/kingside-bg:/.test(getComputedStyle(document.querySelector('.app-bg .bg-paint')).backgroundImage) && getComputedStyle(document.documentElement).getPropertyValue('--sq-light').trim() === '#d3e1ee'`))

    // Board interactions intact with the new look: start a game and move.
    await nav('play')
    await js(`document.querySelector('[data-testid=start-game]')?.click()`)
    await waitFor(`document.querySelector('.game-panel') !== null`, 5000)
    if (await js<boolean>(`!!document.querySelector('[data-testid=clock-w].running') && document.querySelector('.coord.file')?.textContent === 'a'`)) {
      await drag('e2', 'e4')
      check('game moves still work with custom appearance', (await sans())[0] === 'e4')
      await click('g8', 'right')
      check('right-click marks still work', await js<boolean>(`document.querySelectorAll('.hl-mark').length === 1`))
    }
    const sqPlay = await js<string>(`getComputedStyle(document.querySelector('[data-testid=board] .sq.light')).backgroundColor`)
    check('game board uses the applied square colours', sqPlay === 'rgb(211, 225, 238)', sqPlay)
    await shot('23-play-custom-appearance')

    // Missing image handled gracefully: delete the file behind the app's back and restart.
    unlinkSync(join(app.getPath('userData'), 'backgrounds', file))
    wc.reload()
    await waitFor(`!!document.querySelector('.app-bg .bg-paint')`, 15_000)
    check('missing custom image falls back to the default', await waitFor(`!/kingside-bg:/.test(getComputedStyle(document.querySelector('.app-bg .bg-paint')).backgroundImage) && /could not be loaded/.test(document.querySelector('.toasts')?.textContent ?? '')`, 8000))
  }

  try {
    win.focus()
    check('engine detected', await waitFor(`document.querySelector('.engine-chip.ok') !== null`, 20_000))
    await shot('01-new-game')

    // Lowest level for a quick game; White.
    await clickText('.level-card', '~400')
    await clickText('.color-btn', 'White')
    await js(`document.querySelector('[data-testid=start-game]').click()`)
    check('game started', await waitFor(`document.querySelector('.game-panel') !== null`))
    const runningW = await js<boolean>(`!!document.querySelector('[data-testid=clock-w].running')`)
    check('white clock running at start', runningW)
    // Turn on "coach watching" with feedback on every move.
    await js(`document.querySelector('[data-testid=coach-watch-toggle]').click()`)
    check('coach watching enabled', await waitFor(`!!document.querySelector('[data-testid=coach-feedback]')`, 5000))
    await selectValue('coach-feedback', 'every')

    // 1. Drag and drop e2-e4.
    await drag('e2', 'e4')
    check('drag-and-drop move', (await sans())[0] === 'e4', (await sans()).join(' '))
    check('clock switched to bot', await js<boolean>(`!!document.querySelector('[data-testid=clock-b].running')`))

    // 2. Premove during the bot's turn (click-click), executed when the turn arrives.
    await click('d2')
    await click('d4')
    const queued = await js<boolean>(`!!document.querySelector('.premove-chip')`)
    check('premove queued', queued)
    check('bot replied and premove executed', await waitFor(`document.querySelectorAll('.move-list .mv[data-ply]').length >= 3`, 15_000), (await sans()).join(' '))
    check('premove was d4', (await sans())[2] === 'd4', (await sans()).join(' '))
    await waitFor(`document.querySelectorAll('.move-list .mv[data-ply]').length >= 4`, 15_000)

    // 3. Annotations: right-click mark, right-drag arrow, left-click clears; no move made.
    const before = await plies()
    await click('e5', 'right')
    check('right-click marks square red', await js<boolean>(`document.querySelectorAll('.hl-mark').length === 1`))
    await drag('g1', 'f3', 'right')
    check('right-drag draws arrow', await js<boolean>(`document.querySelectorAll('.arrow-user').length === 1`))
    check('annotations did not move pieces', (await plies()) === before)
    await shot('02-annotations')
    await click('a6')
    check('left-click clears annotations', await js<boolean>(`document.querySelectorAll('.hl-mark, .arrow-user').length === 0`))

    // 4. Click-to-move (select then destination).
    await click('g1')
    check('legal-move dots shown', await js<boolean>(`document.querySelectorAll('.hint').length >= 2`))
    await click('f3')
    check('click-click move', (await sans())[before] === 'Nf3', (await sans()).join(' '))
    await waitFor(`document.querySelectorAll('.move-list .mv[data-ply]').length >= ${before + 2}`, 15_000)

    // 5. History navigation is view-only.
    const live = await plies()
    await key('Left')
    await key('Left')
    check('history banner shown', await js<boolean>(`!!document.querySelector('[data-testid=back-to-live]')`))
    await drag('b1', 'c3')
    await sleep(200)
    check('no move from a historical position', (await plies()) === live)
    await shot('03-history')
    await js(`document.querySelector('[data-testid=back-to-live]').click()`)
    await sleep(100)
    check('returned to live', await js<boolean>(`!document.querySelector('[data-testid=back-to-live]')`))
    await drag('b1', 'c3')
    check('move from live position works', (await plies()) === live + 1, (await sans()).join(' '))
    await waitFor(`document.querySelectorAll('.move-list .mv[data-ply]').length >= ${live + 2}`, 15_000)
    check('coach commented on moves during the game', await waitFor(`document.querySelectorAll('.cw-item').length >= 2`, 30_000),
      await js<string>(`document.querySelector('.cw-list')?.textContent?.slice(0, 160) ?? ''`))
    await shot('04-game')

    // 6. Promotion picker appears for a pawn reaching the last rank is covered by unit tests;
    //    here: resign (two clicks) and open the review.
    await clickText('.actions .ghost-btn', 'Resign')
    await clickText('.actions .ghost-btn', 'Confirm')
    check('result overlay', await waitFor(`!!document.querySelector('[data-testid=result-overlay]')`))
    await shot('05-result')
    await js(`document.querySelector('[data-testid=open-review]').click()`)
    check('review progress shown', await waitFor(`!!document.querySelector('[data-testid=review-progress]')`, 5000))
    check('review finished', await waitFor(`!!document.querySelector('.summary')`, 120_000))
    const summary = await js<{ icons: number; card: boolean; graph: boolean }>(`({
      icons: document.querySelectorAll('.move-list .cls-icon').length,
      card: !!document.querySelector('[data-testid=move-card]'),
      graph: !!document.querySelector('.eval-graph')
    })`)
    const total = await plies()
    check('every move classified', summary.icons === total, `${summary.icons}/${total}`)
    check('move card + eval graph', summary.card && summary.graph)
    const opening = await js<string>(`document.querySelector('.opening-box')?.textContent ?? ''`)
    check('opening named', /^[A-E][0-9]{2} [A-Za-z]/.test(opening), opening)
    await shot('06-review')
    // Jump to the first move and check its card.
    await js(`document.querySelector('.move-list .mv[data-ply="1"]').click()`)
    await sleep(150)
    await shot('07-review-move1')

    // 7. Coach-based review of the same game.
    await js(`document.querySelector('[data-testid=coach-review-tab]').click()`)
    check('coach review: improvement plan', await waitFor(`document.querySelectorAll('[data-testid=plan-item]').length >= 1`, 20_000))
    check('coach review: phases + summary', await js<boolean>(`document.querySelectorAll('.phase-card').length === 3 && document.querySelector('.cr-section p') !== null`))
    await shot('08-coach-review')

    // 8. Lessons: open the recommended lesson and complete it with real board moves.
    await nav('lessons')
    check('lessons page', await waitFor(`!!document.querySelector('[data-testid=lessons-page]')`))
    check('34 lessons listed', await js<boolean>(`document.querySelectorAll('.lesson-card').length === 34`))
    await shot('09-lessons')
    await js(`document.querySelector('[data-testid=lesson-recommended]').click()`)
    check('lesson player opened', await waitFor(`!!document.querySelector('[data-testid=lesson-player]')`))
    for (let i = 0; i < 3; i++) await clickNext() // two explanations + demo
    await drag('c3', 'd5') // a legal but wrong knight move
    check('lesson: wrong move explained', await waitFor(`document.querySelector('[data-testid=lesson-feedback]')?.className.includes('bad')`, 3000))
    await drag('c3', 'b5')
    check('lesson: correct move accepted', await waitFor(`document.querySelector('[data-testid=lesson-feedback]')?.className.includes('ok')`, 3000))
    await shot('10-lesson-exercise')
    await clickNext()
    await drag('c2', 'e4')
    check('lesson: second exercise solved', await waitFor(`document.querySelector('[data-testid=lesson-feedback]')?.className.includes('ok')`, 3000))
    await clickNext()
    for (let q = 0; q < 2; q++) {
      await js(`document.querySelectorAll('.quiz-opt')[1].click()`)
      await sleep(100)
      await clickNext()
    }
    check('lesson completed', await waitFor(`!!document.querySelector('[data-testid=lesson-complete]')`, 5000))
    await shot('11-lesson-complete')

    // 9. Puzzles: mate-in-1 at 400-600, solved using all three hints.
    await nav('puzzles')
    check('puzzles page', await waitFor(`!!document.querySelector('[data-testid=puzzles-page]')`))
    await selectValue('puzzle-category', 'mateIn1')
    await selectValue('puzzle-band', '400')
    await js(`document.querySelector('[data-testid=puzzle-start]').click()`)
    check('puzzle loaded (opponent move played)', await waitFor(`!!document.querySelector('[data-testid=puzzle-hint]') && !document.querySelector('[data-testid=puzzle-hint]').disabled`, 5000))
    for (let h = 0; h < 3; h++) {
      await js(`document.querySelector('[data-testid=puzzle-hint]').click()`)
      await sleep(80)
    }
    const hintSq = await js<{ from: string; to: string }>(`({ from: document.querySelector('.hl-hint')?.dataset.square, to: document.querySelector('.hl-focus')?.dataset.square })`)
    check('hints: idea, piece and destination', !!hintSq.from && !!hintSq.to && (await js<number>(`document.querySelectorAll('.hint-list li').length`)) === 3, JSON.stringify(hintSq))
    await shot('12-puzzle-hints')
    await drag(hintSq.from, hintSq.to)
    check('puzzle solved', await waitFor(`!!document.querySelector('[data-testid=puzzle-solved]')`, 5000))
    check('rating change shown', await js<boolean>(`/[+-]\\d+/.test(document.querySelector('.rating-delta')?.textContent ?? '')`))
    await shot('13-puzzle-solved')
    await js(`document.querySelector('[data-testid=puzzle-stats-tab]').click()`)
    check('puzzle statistics', await waitFor(`!!document.querySelector('[data-testid=puzzle-stats]') && document.querySelectorAll('.chart-card').length >= 4`))

    // 10. Coaches: six coaches, FEN import with validation, real analysis, level-dependent answers.
    await nav('coaches')
    check('six coaches', await waitFor(`document.querySelectorAll('.coach-card').length === 6`))
    await shot('14-coaches')
    const answers: Record<string, string> = {}
    for (const id of ['expert', 'beginner']) {
      await js(`document.querySelector('[data-testid=select-coach-${id}]').click()`)
      check(`${id} coach workspace`, await waitFor(`!!document.querySelector('[data-testid=coach-workspace]')`))
      await js(`document.querySelector('[data-testid=load-fen]').click()`)
      await typeInto('fen-text', 'k7/8/1K6/8/8/8/8/7Q w - - 0 1')
      await js(`document.querySelector('[data-testid=fen-load]').click()`)
      if (id === 'expert') check('illegal FEN rejected with a reason', await waitFor(`/check/.test(document.querySelector('[data-testid=fen-error]')?.textContent ?? '')`, 2000))
      await typeInto('fen-text', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4')
      await js(`document.querySelector('[data-testid=fen-load]').click()`)
      check(`${id}: engine lines for imported position`, await waitFor(`document.querySelectorAll('.engine-line').length >= 1`, 15_000))
      const bubbles = await js<number>(`document.querySelectorAll('.chat-msg.coach').length`)
      await js(`document.querySelector('[data-testid=ask-tactics]').click()`)
      check(`${id}: coach explains the tactic (Qxf7#)`, await waitFor(`document.querySelectorAll('.chat-msg.coach').length > ${bubbles} && /Qxf7#/.test([...document.querySelectorAll('.chat-msg.coach')].pop().textContent)`, 15_000))
      const b2 = await js<number>(`document.querySelectorAll('.chat-msg.coach').length`)
      await js(`document.querySelector('[data-testid=ask-safety]').click()`)
      await waitFor(`document.querySelectorAll('.chat-msg.coach').length > ${b2}`, 15_000)
      answers[id] = await js<string>(`[...document.querySelectorAll('.chat-msg.coach')].pop().textContent`)
      await typeInto('coach-input', 'Is Bxf7+ a good move here?', 'input')
      const b3 = await js<number>(`document.querySelectorAll('.chat-msg.coach').length`)
      await js(`document.querySelector('.ask-row').requestSubmit()`)
      check(`${id}: free-text question about a specific move`, await waitFor(`document.querySelectorAll('.chat-msg.coach').length > ${b3}`, 15_000),
        await js<string>(`[...document.querySelectorAll('.chat-msg.coach')].pop().textContent.slice(0, 140)`))
      await shot(`15-coach-${id}`)
      await clickText('.panel-head .ghost-btn', 'Coaches')
      await sleep(150)
    }
    check('beginner and expert coaches explain differently', answers.expert !== answers.beginner && answers.expert.length > 0, `${answers.beginner.slice(0, 80)} | ${answers.expert.slice(0, 80)}`)

    // 11. Profile and persistence.
    await nav('profile')
    check('profile page', await waitFor(`!!document.querySelector('[data-testid=profile-page]')`))
    const prof = await js<string>(`document.querySelector('[data-testid=profile-page]').textContent`)
    check('profile shows earned achievements', /First Lesson/.test(prof) && /First Puzzle/.test(prof))
    await shot('16-profile')
    const saved = JSON.parse(readFileSync(join(app.getPath('userData'), 'profile.json'), 'utf8'))
    check('progress persisted to disk',
      saved.lessons['piece-movement']?.status === 'completed' && saved.puzzles.solved >= 1 && saved.games.length >= 1 && saved.games[0].reviewed === true && saved.xp > 0,
      `xp=${saved.xp} games=${saved.games.length} puzzles=${saved.puzzles.solved}`)

    // 12. Back to play: the original game screen still works.
    await nav('play')
    check('play screen restored', await waitFor(`!!document.querySelector('[data-testid=board]')`))

    // 13. Board appearance.
    await runAppearanceChecks()

    // 14. Game import & external analysis.
    await runImportChecks()
  } catch (e) {
    check('self-test crashed', false, String(e))
  }

  writeFileSync(join(outDir, 'results.json'), JSON.stringify(checks, null, 2))
  const failed = checks.filter((c) => !c.ok).length
  console.log(`SELFTEST ${failed === 0 ? 'PASSED' : 'FAILED'}: ${checks.length - failed}/${checks.length}`)
  quit()
}
