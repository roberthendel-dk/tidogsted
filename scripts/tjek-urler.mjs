// Tjekker URL'erne i public/opgave/ekstra-urler.xlsx og skriver resultatet til public/data/urler.json.
// Kører gratis via GitHub Actions (se .github/workflows/tjek-urler.yml) uden Claude og uden afhængigheder.
//
// For hver aktiv række: svarer siden, er indholdet ændret siden sidst, og – hvis siden har
// arrangementer som schema.org-data (JSON-LD) eller iCal – hvilke arrangementer de næste 10 dage.
// Alle fund markeres som ikke krydstjekket ([TJEK]).
//
// Kør lokalt:  node scripts/tjek-urler.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const ROD = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const XLSX = path.join(ROD, 'public/opgave/ekstra-urler.xlsx');
const KOMMUNER = path.join(ROD, 'public/opgave/kommuner.json');
const UD = path.join(ROD, 'public/data/urler.json');
const TZ = 'Europe/Copenhagen';
const DAGE_FREM = 10;
const UA = 'TidOgSted/1.0 (+https://github.com/roberthendel-dk/tidogsted)';

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
const afkod = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
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

/* ---------- datoer ---------- */
const lokal = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dato: `${p.year}-${p.month}-${p.day}`, tid: `${p.hour}:${p.minute}` };
};
const iDag = lokal(new Date()).dato;
const plus = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SLUT = plus(iDag, DAGE_FREM);
function tidspunkt(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { dato: s, tid: '' };
  // Uden tidszone: tolkes som dansk lokal tid
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (m) return { dato: m[1], tid: `${m[2]}:${m[3]}` };
  const d = new Date(s);
  return isNaN(d) ? null : lokal(d);
}

/* ---------- schema.org (JSON-LD) ---------- */
function* knuder(x) {
  if (Array.isArray(x)) { for (const y of x) yield* knuder(y); return; }
  if (!x || typeof x !== 'object') return;
  yield x;
  if (x['@graph']) yield* knuder(x['@graph']);
  for (const k of ['itemListElement', 'item', 'subEvent', 'event', 'events']) if (x[k]) yield* knuder(x[k]);
}
const typer = (n) => [].concat(n['@type'] || []).map(String);
const navnAf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? navnAf(v[0]) : v && typeof v === 'object' ? v.name || '' : '');
function jsonLdEvents(html) {
  const ud = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const n of knuder(data)) {
      if (!typer(n).some((t) => /Event$/.test(t))) continue;
      if (/Cancelled|Postponed/i.test(n.eventStatus || '')) continue;
      const s = tidspunkt(n.startDate), e = tidspunkt(n.endDate);
      if (!s) continue;
      const tilbud = [].concat(n.offers || []);
      ud.push({
        dato: s.dato, start: s.tid, slut: e && e.dato === s.dato ? e.tid : '',
        titel: afkod(String(n.name || '').replace(/<[^>]+>/g, '')).trim(),
        sted: afkod(navnAf(n.location)).trim(),
        url: typeof n.url === 'string' ? n.url : '',
        udsolgt: tilbud.some((o) => /SoldOut/i.test((o && o.availability) || '')),
      });
    }
  }
  return ud;
}

/* ---------- iCal ---------- */
function icalEvents(txt) {
  const linjer = txt.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const ud = []; let e = null;
  const val = (l) => l.slice(l.indexOf(':') + 1).replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1').trim();
  const dt = (l) => {
    const v = val(l), tz = (l.match(/TZID=([^:;]+)/) || [])[1];
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;
    if (!m[4]) return { dato: `${m[1]}-${m[2]}-${m[3]}`, tid: '' };
    if (m[7]) return lokal(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`));
    if (tz && tz !== TZ && !/Copenhagen|Romance|Europe\/(Berlin|Oslo|Stockholm)/i.test(tz)) return null;
    return { dato: `${m[1]}-${m[2]}-${m[3]}`, tid: `${m[4]}:${m[5]}` };
  };
  for (const l of linjer) {
    if (l === 'BEGIN:VEVENT') e = {};
    else if (l === 'END:VEVENT') {
      if (e && e.s && !e.aflyst) ud.push({ dato: e.s.dato, start: e.s.tid, slut: e.e && e.e.dato === e.s.dato ? e.e.tid : '', titel: e.titel || '', sted: e.sted || '', url: e.url || '', udsolgt: false });
      e = null;
    } else if (e) {
      if (/^DTSTART[;:]/.test(l)) e.s = dt(l);
      else if (/^DTEND[;:]/.test(l)) e.e = dt(l);
      else if (/^SUMMARY[;:]/.test(l)) e.titel = val(l);
      else if (/^LOCATION[;:]/.test(l)) e.sted = val(l);
      else if (/^URL[;:]/.test(l)) e.url = val(l);
      else if (/^STATUS:CANCELLED/.test(l)) e.aflyst = true;
    }
  }
  return ud;
}

/* ---------- tjek én URL ---------- */
const synligTekst = (html) => afkod(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
async function tjek(r) {
  const res = { status: 0, ok: false, fejl: '', hash: '', events: [] };
  try {
    const svar = await fetch(r.url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,text/calendar,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(25000) });
    res.status = svar.status; res.ok = svar.ok;
    const txt = await svar.text();
    if (!svar.ok) { res.fejl = 'HTTP ' + svar.status; return res; }
    const ical = /text\/calendar/i.test(svar.headers.get('content-type') || '') || /^\s*BEGIN:VCALENDAR/.test(txt);
    res.events = ical ? icalEvents(txt) : jsonLdEvents(txt);
    res.hash = crypto.createHash('sha256').update(ical ? txt : synligTekst(txt)).digest('hex').slice(0, 16);
  } catch (e) {
    res.fejl = e.name === 'TimeoutError' ? 'Siden svarede ikke inden for 25 sekunder' : String(e.cause?.code || e.message || e);
  }
  return res;
}

/* ---------- hovedprogram ---------- */
const cfg = JSON.parse(fs.readFileSync(KOMMUNER, 'utf8'));
const kommuneId = (navn) => { const n = String(navn).trim().toLowerCase(); const k = cfg.kommuner.find((x) => x.navn.toLowerCase() === n || x.id === n); return k ? k.id : ''; };
const før = fs.existsSync(UD) ? JSON.parse(fs.readFileSync(UD, 'utf8')) : { urler: [] };
const førMap = new Map((før.urler || []).map((u) => [u.kommune + '|' + u.url, u]));

const rækker = laesArk(XLSX, 'URLer');
const hoved = (rækker[0] || []).map((h) => h.toLowerCase());
const kol = (navn) => hoved.indexOf(navn);
const ki = { kommune: kol('kommune'), sted: kol('sted'), url: kol('url'), type: kol('type'), aktiv: kol('aktiv'), note: kol('note') };
const set = new Set();
const liste = rækker.slice(1).map((r, i) => ({
  linje: i + 2, kommuneNavn: r[ki.kommune] || '', kommune: kommuneId(r[ki.kommune] || ''), sted: r[ki.sted] || '', url: (r[ki.url] || '').trim(),
  type: r[ki.type] || '', aktiv: !/^nej$/i.test(r[ki.aktiv] || ''), note: r[ki.note] || '',
})).filter((r) => r.url && /^https?:\/\//i.test(r.url) && r.kommune && !set.has(r.kommune + r.url) && set.add(r.kommune + r.url));

const urler = [], arrangementer = [];
const aktive = liste.filter((r) => r.aktiv);
for (let i = 0; i < aktive.length; i += 4) {
  const svar = await Promise.all(aktive.slice(i, i + 4).map(tjek));
  svar.forEach((res, j) => {
    const r = aktive[i + j], gl = førMap.get(r.kommune + '|' + r.url);
    const aendret = !!(gl && gl.hash && res.hash && gl.hash !== res.hash);
    const fund = res.events.filter((e) => e.titel && e.dato >= iDag && e.dato <= SLUT);
    urler.push({
      kommune: r.kommune, sted: r.sted, url: r.url, type: r.type, note: r.note, aktiv: true,
      status: res.status, ok: res.ok, fejl: res.fejl, hash: res.hash || (gl && gl.hash) || '',
      aendret, sidstAendret: aendret ? new Date().toISOString() : (gl && gl.sidstAendret) || '',
      antal: fund.length, tjekket: new Date().toISOString(),
    });
    for (const e of fund) arrangementer.push({ kommune: r.kommune, dato: e.dato, start: e.start, slut: e.slut, titel: e.titel, sted: e.sted || r.sted, kilde: e.url || r.url, udsolgt: e.udsolgt, krydstjekket: false, fra: r.sted });
    console.log(`${res.ok ? 'OK ' : 'FEJL'} ${r.kommuneNavn} · ${r.sted} · ${fund.length} fund${aendret ? ' · ændret' : ''}${res.fejl ? ' · ' + res.fejl : ''}`);
  });
}
for (const r of liste.filter((x) => !x.aktiv)) urler.push({ kommune: r.kommune, sted: r.sted, url: r.url, type: r.type, note: r.note, aktiv: false });

fs.mkdirSync(path.dirname(UD), { recursive: true });
fs.writeFileSync(UD, JSON.stringify({ opdateret: new Date().toISOString(), fra: iDag, til: SLUT, urler, arrangementer }, null, 1) + '\n');
console.log(`${urler.length} URL'er, ${arrangementer.length} arrangementer → public/data/urler.json`);
