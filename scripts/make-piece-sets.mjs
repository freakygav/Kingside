// Generates two Kingside piece sets:
//   minimal - original geometric pieces drawn for Kingside (MIT, same as the app)
//   wooden  - the Cburnett set (GPLv2+) recoloured with wood-grain gradients (derivative, GPLv2+)
// Run: node scripts/make-piece-sets.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src', 'assets', 'pieces')
const TYPES = ['K', 'Q', 'R', 'B', 'N', 'P']

// ---- Minimal (original) ----------------------------------------------------------------
const base = 'M11 39h23v-3.5a2 2 0 0 0-2-2H13a2 2 0 0 0-2 2z'
const shapes = {
  P: `<circle cx="22.5" cy="14" r="5"/><path d="M17 33.5c0-6 2.5-10.5 5.5-12 3 1.5 5.5 6 5.5 12z"/><path d="${base}"/>`,
  R: `<path d="M14 10h4v3h2.5v-3h4v3H27v-3h4v7l-2.5 2.5v14h-12v-14L14 17z"/><path d="${base}"/>`,
  B: `<circle cx="22.5" cy="8.5" r="2.5"/><path d="M22.5 12c5 3.5 7.5 8 7.5 12.5 0 4-2 7-2.5 9h-10c-.5-2-2.5-5-2.5-9 0-4.5 2.5-9 7.5-12.5z"/><path d="M20 23.5l6-6" class="cut"/><path d="${base}"/>`,
  N: `<path d="M15 33.5c0-6 2-9 5.5-12.5-3 .5-5.5 2-7 4l-2.5-3 3-6c1.5-3 4.5-5.5 8-6l1.5-3 2 3c5 1.5 8 6.5 8 13.5v10z"/><circle cx="19.5" cy="15.5" r="1.3" class="eye"/><path d="${base}"/>`,
  Q: `<circle cx="9" cy="12" r="2.3"/><circle cx="16" cy="9" r="2.3"/><circle cx="22.5" cy="8" r="2.3"/><circle cx="29" cy="9" r="2.3"/><circle cx="36" cy="12" r="2.3"/><path d="M10 14l4 19.5h17l4-19.5-6 8-2.5-11-4 10-4-10-2.5 11z"/><path d="${base}"/>`,
  K: `<path d="M21 5h3v3h3v3h-3v3.5h-3V11h-3V8h3z"/><path d="M22.5 15c6.5 0 10 3.5 10 8 0 4-2.5 7.5-3.5 10.5h-13c-1-3-3.5-6.5-3.5-10.5 0-4.5 3.5-8 10-8z"/><path d="${base}"/>`
}
const minimalStyle = (white) => `<style>path,circle{fill:${white ? '#f4f1ea' : '#2b2d31'};stroke:${white ? '#26282c' : '#0f1012'};stroke-width:1.4;stroke-linejoin:round}.cut{fill:none;stroke:${white ? '#26282c' : '#cfd2d6'};stroke-width:1.6;stroke-linecap:round}.eye{fill:${white ? '#26282c' : '#cfd2d6'};stroke:none}</style>`
mkdirSync(join(root, 'minimal'), { recursive: true })
for (const c of ['w', 'b']) {
  for (const t of TYPES) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${minimalStyle(c === 'w')}${shapes[t]}</svg>`
    writeFileSync(join(root, 'minimal', `${c}${t}.svg`), svg)
  }
}

// ---- Wooden (recoloured Cburnett) -----------------------------------------------------------
const defs = `<defs>
<linearGradient id="wl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2d9ae"/><stop offset=".45" stop-color="#ddb47c"/><stop offset=".7" stop-color="#e8c792"/><stop offset="1" stop-color="#c99860"/></linearGradient>
<linearGradient id="wd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a4b2a"/><stop offset=".5" stop-color="#4f2d16"/><stop offset=".75" stop-color="#673d20"/><stop offset="1" stop-color="#3a200e"/></linearGradient>
</defs>`
mkdirSync(join(root, 'wooden'), { recursive: true })
for (const c of ['w', 'b']) {
  for (const t of TYPES) {
    let svg = readFileSync(join(root, 'cburnett', `${c}${t}.svg`), 'utf8')
    if (c === 'w') {
      svg = svg.replace(/fill="#fff"/g, 'fill="url(#wl)"').replace(/stroke="#000"/g, 'stroke="#3b2412"').replace(/fill="#000"/g, 'fill="#3b2412"')
    } else {
      svg = svg.replace(/fill="#000"/g, 'fill="url(#wd)"').replace(/stroke="#000"/g, 'stroke="#1c1009"').replace(/stroke="#fff"/g, 'stroke="#e2bf8c"').replace(/stroke="#ececec"/g, 'stroke="#e2bf8c"').replace(/fill="#fff"/g, 'fill="#e2bf8c"')
    }
    svg = svg.replace(/(<svg[^>]*>)/, `$1${defs}`)
    writeFileSync(join(root, 'wooden', `${c}${t}.svg`), svg)
  }
}
console.log('Wrote minimal/ and wooden/ piece sets')
