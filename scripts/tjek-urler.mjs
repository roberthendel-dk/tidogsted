// Tjekker de ekstra URL'er og skriver resultatet til data/urler.json.
// URL'erne kommer fra to steder, som lægges sammen:
//   1. Excel-arket opgave/ekstra-urler.xlsx
//   2. Listen, du retter i appen (gemt i Cloudflare, hentes fra <site>/api/data/urler).
//      Den kan også slå rækker fra arket fra eller slette dem.
//   3. De faste steder i opgave/kommuner.json, der har en URL (med dine rettelser fra appen).
// Læser desuden opgave/faste-arrangementer.xlsx (byrådsmøder og andre faste arrangementer) → data/faste.json.
// Kører gratis via GitHub Actions (se .github/workflows/tjek-urler.yml) uden Claude og uden afhængigheder.
//
// Kør lokalt:  node scripts/tjek-urler.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { tjekUrl, iDag as idag, plus, urlId, fastId, afkod, udenforKommune, kultunautUrl, kultunautEvents } from '../lib/tjek.js';

const ROD = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const XLSX = path.join(ROD, 'opgave/ekstra-urler.xlsx');
const KOMMUNER = path.join(ROD, 'opgave/kommuner.json');
const UD = path.join(ROD, 'data/urler.json');
const FASTE_XLSX = path.join(ROD, 'opgave/faste-arrangementer.xlsx');
const FASTE_UD = path.join(ROD, 'data/faste.json');
const DAGE_FREM = 10;

/* ---------- lille xlsx-læser (zip + XML) ---------- */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Ikke en gyldig xlsx-fil');
  const antal = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const filer = {};
  for (let i = 0; i < antal; i++) {
    const metode = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), klen = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const navn = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const data = buf.subarray(start, start + csize);
    filer[navn] = metode === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nlen + xlen + klen;
  }
  return filer;
}
const tekstAf = (xml) => afkod([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function laesArk(fil, arknavn) {
  const z = unzip(fs.readFileSync(fil));
  const s = (n) => (z[n] ? z[n].toString('utf8') : '');
  const delte = [...s('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => tekstAf(m[1]));
  const wb = s('xl/workbook.xml'), rels = s('xl/_rels/workbook.xml.rels');
  const ark = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ navn: afkod((m[0].match(/name="([^"]*)"/) || [])[1] || ''), rid: (m[0].match(/r:id="([^"]*)"/) || [])[1] }));
  const valgt = ark.find((a) => a.navn === arknavn) || ark[0];
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${valgt.rid}"`));
  let maal = (rel.match(/Target="([^"]*)"/) || [])[1] || 'worksheets/sheet1.xml';
  maal = maal.startsWith('/') ? maal.slice(1) : 'xl/' + maal;
  const rækker = [];
  for (const r of s(maal).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const række = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = c[1], ind = c[2] || '';
      const kol = (attr.match(/r="([A-Z]+)\d+"/) || [])[1];
      const idx = kol ? [...kol].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : række.length;
      const t = (attr.match(/t="([^"]*)"/) || [])[1];
      const v = (ind.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      række[idx] = t === 's' ? delte[+v] ?? '' : t === 'inlineStr' ? tekstAf(ind) : v != null ? afkod(v) : '';
    }
    rækker.push(række.map((x) => String(x ?? '').trim()));
  }
  return rækker;
}

/* ---------- hovedprogram ---------- */
const iDag = idag(), SLUT = plus(iDag, DAGE_FREM);
const cfg = JSON.parse(fs.readFileSync(KOMMUNER, 'utf8'));
const kommuneId = (navn) => { const n = String(navn).trim().toLowerCase(); const k = cfg.kommuner.find((x) => x.navn.toLowerCase() === n || x.id === n); return k ? k.id : ''; };
const før = fs.existsSync(UD) ? JSON.parse(fs.readFileSync(UD, 'utf8')) : { urler: [] };
const førMap = new Map((før.urler || []).map((u) => [u.id || urlId(u.kommune, u.url), u]));


// 0. Faste arrangementer (byrådsmøder m.m.) fra opgave/faste-arrangementer.xlsx → data/faste.json
{
  const TYPER = { 'byrådsmøde': 'raad', 'byraadsmoede': 'raad', 'raad': 'raad', 'borgermøde': 'borger', 'borger': 'borger', 'høringsmøde': 'hoering', 'hoering': 'hoering', 'åbent udvalgsmøde': 'udvalg', 'udvalgsmøde': 'udvalg', 'udvalg': 'udvalg', 'arrangement': 'arr', 'arr': 'arr' };
  const p2 = (n) => String(n).padStart(2, '0');
  const dato = (v) => {
    v = String(v || '').trim(); if (!v) return '';
    if (/^\d+(\.\d+)?$/.test(v)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 864e5); return d.toISOString().slice(0, 10); }
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
    m = v.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${p2(m[2])}-${p2(m[1])}`;
    return '';
  };
  const tid = (v) => {
    v = String(v || '').trim(); if (!v) return '';
    if (/^0?\.\d+$|^0$/.test(v)) { const min = Math.round(+v * 1440); return `${p2(Math.floor(min / 60))}:${p2(min % 60)}`; }
    const m = v.match(/^(\d{1,2})[.:](\d{2})/) || v.match(/^(\d{1,2})$/); return m ? `${p2(m[1])}:${m[2] || '00'}` : '';
  };
  const rk = fs.existsSync(FASTE_XLSX) ? laesArk(FASTE_XLSX, 'Faste') : [];
  const h = (rk[0] || []).map((x) => x.toLowerCase());
  const col = (...navne) => h.findIndex((x) => navne.some((n) => x.startsWith(n)));
  const C = { kom: col('kommune'), type: col('type'), titel: col('titel'), dato: col('dato'), start: col('start'), slut: col('slut'), sted: col('sted'), gentag: col('gentag'), til: col('til'), aktiv: col('aktiv'), note: col('note') };
  const rows = [], brugt = new Set();
  for (const r of rk.slice(1)) {
    const g = (k) => (C[k] >= 0 ? r[C[k]] || '' : '');
    const kid = kommuneId(g('kom')), d = dato(g('dato'));
    if (!kid || !d) { if (r.some(Boolean)) console.log('Springer række over i faste-arrangementer.xlsx (mangler kommune eller dato):', r.join(' | ')); continue; }
    const k = cfg.kommuner.find((x) => x.id === kid), type = TYPER[g('type').toLowerCase()] || 'arr';
    const gt = g('gentag').toLowerCase(), gentag = /2|14/.test(gt) ? '14dage' : /uge|week/.test(gt) ? 'ugentlig' : '';
    const titel = g('titel') || (type === 'raad' ? k.raad || 'Byrådsmøde' : '');
    if (!titel) continue;
    let id = `${kid}_${d}_xl_${type}_${titel.toLowerCase().replace(/[^a-zæøå0-9]+/g, '').slice(0, 24)}`;
    while (brugt.has(id)) id += 'x'; brugt.add(id);
    rows.push({ id, kommune: kid, type, titel, dato: d, start: tid(g('start')) || (type === 'raad' ? k.tid || '' : ''), slut: tid(g('slut')), sted: g('sted') || (type === 'raad' ? k.sted || '' : ''), gentag, til: gentag ? dato(g('til')) : '', aktiv: !/^n/i.test(g('aktiv')), note: g('note'), kilde: 'Excel: faste-arrangementer.xlsx', krydstjekket: true });
  }
  fs.mkdirSync(path.dirname(FASTE_UD), { recursive: true });
  fs.writeFileSync(FASTE_UD, JSON.stringify({ opdateret: new Date().toISOString(), rows }, null, 1) + '\n');
  console.log(`${rows.length} faste arrangementer → data/faste.json`);
}
// 1. Excel-arket
const samlet = new Map();
const rækker = fs.existsSync(XLSX) ? laesArk(XLSX, 'URLer') : [];
const hoved = (rækker[0] || []).map((h) => h.toLowerCase());
const ki = Object.fromEntries(['kommune', 'sted', 'url', 'type', 'aktiv', 'note'].map((k) => [k, hoved.indexOf(k)]));
for (const r of rækker.slice(1)) {
  const kommune = kommuneId(r[ki.kommune] || ''), url = (r[ki.url] || '').trim();
  if (!kommune || !/^https?:\/\//i.test(url)) continue;
  const id = urlId(kommune, url);
  if (!samlet.has(id)) samlet.set(id, { id, kommune, sted: r[ki.sted] || '', url, type: r[ki.type] || '', note: r[ki.note] || '', aktiv: !/^nej$/i.test(r[ki.aktiv] || ''), kilde: 'ark' });
}
console.log(`${samlet.size} URL'er i Excel-arket`);

// 2. Listen fra appen (Cloudflare)
let appListe = null;
if (cfg.site) {
  try {
    const r = await fetch(cfg.site.replace(/\/$/, '') + '/api/data/urler', { signal: AbortSignal.timeout(20000) });
    if (r.ok) appListe = await r.json();
    else console.log(`Appens liste kunne ikke hentes (HTTP ${r.status}) – bruger kun arket`);
  } catch (e) { console.log(`Appens liste kunne ikke hentes (${e.message}) – bruger kun arket`); }
}
for (const [id, a] of Object.entries(appListe || {})) {
  if (!a || !a.kommune) continue;
  if (a.slettet) { samlet.delete(id); continue; }
  const gl = samlet.get(id);
  if (!a.url && !gl) continue;
  samlet.set(id, { id, kommune: a.kommune, sted: a.sted ?? gl?.sted ?? '', url: a.url || gl.url, type: a.type ?? gl?.type ?? '', note: a.note ?? gl?.note ?? '', aktiv: a.aktiv !== false, kilde: gl ? 'ark' : 'app', rettet: !!gl });
}
if (appListe) console.log(`${Object.keys(appListe).length} poster fra appen`);

// 3. De faste steder fra kommuner.json (med rettelser fra appen) – kun dem med en URL
let rettelser = {};
if (cfg.site) {
  try { const r = await fetch(cfg.site.replace(/\/$/, '') + '/api/data/steder', { signal: AbortSignal.timeout(20000) }); if (r.ok) rettelser = await r.json(); } catch {}
}
let faste = 0;
for (const k of cfg.kommuner) {
  for (const [type, liste] of [['sted', k.steder || []], ['moede', k.moedekilder || []]]) {
    for (const s of liste) {
      const ret = rettelser[fastId(k.id, type, s.navn)];
      if (ret && ret.slettet) continue;
      const navn = (ret && ret.navn) || s.navn, url = ((ret && 'url' in ret) ? ret.url : s.url) || '';
      if (!/^https?:\/\//i.test(url)) continue;
      const id = urlId(k.id, url);
      if (samlet.has(id)) continue;
      samlet.set(id, { id, kommune: k.id, sted: navn, url, type: type === 'moede' ? 'mødekilde' : 'fast sted', note: '', aktiv: true, kilde: 'fast' });
      faste++;
    }
  }
}
console.log(`${faste} faste steder med URL`);

// 4. Tjek
const liste = [...samlet.values()];
const urler = [], arrangementer = [];
const aktive = liste.filter((r) => r.aktiv);
for (let i = 0; i < aktive.length; i += 4) {
  const svar = await Promise.all(aktive.slice(i, i + 4).map((r) => tjekUrl(r.url, { fra: iDag, til: SLUT })));
  svar.forEach((res, j) => {
    const r = aktive[i + j], gl = førMap.get(r.id);
    const aendret = !!(gl && gl.hash && res.hash && gl.hash !== res.hash);
    urler.push({ ...r, status: res.status, ok: res.ok, fejl: res.fejl, hash: res.hash || (gl && gl.hash) || '',
      aendret, sidstAendret: aendret ? new Date().toISOString() : (gl && gl.sidstAendret) || '', antal: res.events.length, tjekket: new Date().toISOString() });
    for (const e of res.events) if (!udenforKommune(e.sted, r.kommune, cfg.kommuner)) arrangementer.push({ kommune: r.kommune, dato: e.dato, start: e.start, slut: e.slut, titel: e.titel, sted: e.sted || r.sted, kilde: e.url || r.url, udsolgt: e.udsolgt, krydstjekket: false, fra: r.sted, urlId: r.id });
    console.log(`${res.ok ? 'OK ' : 'FEJL'} ${r.kommune} · ${r.sted} · ${res.events.length} fund${aendret ? ' · ændret' : ''}${res.fejl ? ' · ' + res.fejl : ''}`);
  });
}
for (const r of liste.filter((x) => !x.aktiv)) urler.push(r);

// KultuNaut for hver kommune (samlekalender – alt markeres [TJEK])
const kultunaut = [];
for (const k of cfg.kommuner) {
  let antal = 0, sider = 0, fejl = '';
  for (const n of [1, 21, 41, 61, 81, 101]) {
    try {
      const r = await fetch(kultunautUrl(k.navn, n), { headers: { 'user-agent': 'TidOgSted/1.0 (+https://github.com/roberthendel-dk/tidogsted)', 'accept-language': 'da' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { fejl = 'HTTP ' + r.status; break; }
      sider++;
      const ev = kultunautEvents(await r.text(), { ref: iDag, fra: iDag });
      if (!ev.length) break;
      for (const e of ev) {
        if (e.dato < iDag || e.dato > SLUT || udenforKommune(e.sted, k.id, cfg.kommuner)) continue;
        arrangementer.push({ kommune: k.id, dato: e.dato, start: e.start, slut: e.slut, titel: e.titel, sted: e.sted, kilde: kultunautUrl(k.navn, n), udsolgt: e.udsolgt, krydstjekket: false, fra: 'KultuNaut' });
        antal++;
      }
      if (ev.every((e) => e.dato > SLUT)) break;
    } catch (e) { fejl = e.message; break; }
  }
  kultunaut.push({ kommune: k.id, ok: sider > 0, sider, antal, fejl, tjekket: new Date().toISOString() });
  console.log(`KultuNaut ${k.navn}: ${sider} sider, ${antal} fund${fejl ? ' · ' + fejl : ''}`);
}

fs.mkdirSync(path.dirname(UD), { recursive: true });
fs.writeFileSync(UD, JSON.stringify({ opdateret: new Date().toISOString(), fra: iDag, til: SLUT, urler, kultunaut, arrangementer }, null, 1) + '\n');
console.log(`${urler.length} URL'er, ${arrangementer.length} arrangementer → data/urler.json`);
