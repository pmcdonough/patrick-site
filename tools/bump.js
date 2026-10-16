// Sets a project's version and every ?v= stamp that carries it, so no stamp is missed.
//
//   node tools/bump.js sim 0.47       the sim's VERSION, its page's two stamps, every import in its src/, and
//                                     Play Review's imports from the sim's engine
//   node tools/bump.js review 1.0     Play Review's VERSION and its page's two stamps
//   node tools/bump.js keystone 0.2   Keystone's VERSION on both its pages (the 3D build and the arch lab), their
//                                     stamps and every import in their src/, the vendored Three.js included
//
// The changelog, the home page badges and the docs' version lines stay by hand (CLAUDE.md, Shipping a version).
// node tools/smoke.js checks the result.
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const [which, v] = process.argv.slice(2);
if (!['sim', 'review', 'keystone'].includes(which) || !/^\d+\.\d+$/.test(v || '')) { console.error('usage: node tools/bump.js sim|review|keystone 0.xx'); process.exit(2); }
const dir = { sim: 'bruins-vs-canadiens', review: 'play-review', keystone: 'keystone' }[which];
const own = path.join(PUB, dir);
const read = f => fs.readFileSync(f, 'utf8');
const old = read(path.join(own, 'src', 'main.js')).match(/const VERSION = '([0-9.]+)';/)[1];
// each page of the project: its index.html and its src/ (Keystone has a second page, the arch lab)
const pages = which === 'keystone' ? ['', 'arch-lab'] : [''];
const files = pages.flatMap(pg => ['index.html', ...fs.readdirSync(path.join(own, pg, 'src'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('src', f))].map(f => path.join(own, pg, f)));
let n = 0;
const sub = (file, re, to) => { const s = read(file), t = s.replace(re, (...m) => { n++; return to(...m); }); if (t !== s) fs.writeFileSync(file, t); };
for (const f of files) {
  // the project's own stamps; in Play Review, imports from the sim keep the sim's version
  sub(f, /(["'])([^"']*?)\?v=([0-9.]+)\1/g, (m, q, url, ver) => which === 'review' && url.includes('bruins-vs-canadiens/') ? m : `${q}${url}?v=${v}${q}`);
}
if (which === 'sim') for (const f of fs.readdirSync(path.join(PUB, 'play-review', 'src'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join(PUB, 'play-review', 'src', f)))
  sub(f, /(["'])([^"']*bruins-vs-canadiens\/[^"']*?)\?v=([0-9.]+)\1/g, (m, q, url) => `${q}${url}?v=${v}${q}`);
for (const pg of pages) sub(path.join(own, pg, 'src', 'main.js'), /const VERSION = '[0-9.]+';/, () => `const VERSION = '${v}';`);
console.log(`${which} ${old} -> ${v}: ${n} replacements. Now: the changelog, the home page badge and footer, CLAUDE.md, the roadmap's first line; then node tools/smoke.js.`);
