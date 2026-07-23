// Copies the self-contained website into www/ so Capacitor has a webDir to bundle.
// index.html embeds all engine/UI/assets logic already (see README), so this is a
// straight copy, not a build step.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'index.html');
const outDir = path.join(root, 'www');
const out = path.join(outDir, 'index.html');

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, out);
console.log(`Copied ${src} -> ${out}`);
