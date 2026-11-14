// Renders build/icon.svg into the PNG and ICO assets Kingside ships with.
// Run with: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

/** Pack PNG images into a Windows .ico container (PNG-compressed entries). */
function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 300, height: 300, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const render = async (size, source = svg) => {
    const dataUrl = await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = ${size}; c.height = ${size};
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, ${size}, ${size});
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(source).toString('base64'))};
      })`)
    return Buffer.from(dataUrl.split(',')[1], 'base64')
  }

  const pngs = []
  for (const size of ICO_SIZES) pngs.push({ size, data: await render(size) })
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), buildIco(pngs))
  const big = await render(512)
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), big)
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), await render(256))
  console.log('Icons written: build/icon.ico, build/icon.png, resources/icon.png')
  app.quit()
})
