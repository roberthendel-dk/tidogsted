// Fælles kode til at tjekke én URL. Bruges både af morgentjekket (scripts/tjek-urler.mjs, Node)
// og af "Tjek nu" i appen (functions/api, Cloudflare). Ingen afhængigheder.

export const TZ = 'Europe/Copenhagen';
const UA = 'TidOgSted/1.0 (+https://github.com/roberthendel-dk/tidogsted)';

export const afkod = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/* ---------- datoer ---------- */
export const lokal = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dato: `${p.year}-${p.month}-${p.day}`, tid: `${p.hour}:${p.minute}` };
};
export const iDag = () => lokal(new Date()).dato;
export const plus = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function tidspunkt(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { dato: s, tid: '' };
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/); // uden tidszone = dansk tid
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
export function jsonLdEvents(html) {
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
export function icalEvents(txt) {
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

/* ---------- dansk tekst: datoer, tider, kort ---------- */
const MDR = { januar: 1, jan: 1, februar: 2, feb: 2, marts: 3, mar: 3, april: 4, apr: 4, maj: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12 };
const UGEDAGE = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const p2 = (n) => String(n).padStart(2, '0');
const RE_MDR = new RegExp('\\b(\\d{1,2})\\.?\\s*(' + Object.keys(MDR).sort((a, b) => b.length - a.length).join('|') + ')\\.?(?:\\s+(\\d{4}))?(?![a-zæøå])', 'i');
const RE_NUM = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b|\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/;
const RE_UGEDAG = /\b(i dag|i morgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:en)?\b/i;
const RE_TID = /(?:\bkl\.?\s*)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?:\s*(?:-|–|—|til)\s*(?:kl\.?\s*)?([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b)?|\bkl\.?\s*([01]?\d|2[0-3])\b(?:\s*(?:-|–|—|til)\s*([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b)?/i;
const RE_STED = /(bibliotek|kirke|museum|kaserne|arena|hallen|hal\b|huset|hus\b|center|centret|slot|scene|teater|salen|skole|kulturhus|værk|park\b|torv|kro\b|hotel|gård|klub|stadion|musikhus|borgcenter|geocenter|akademi|forsamlingshus|sognegård|bio\b|biograf|rådhus)/i;
const RE_META = /^(gratis|udsolgt|aflyst|køb billet|billetter?|læs mere|se mere|tilmeld.*|book.*|fri entré|entré.*|pris.*|\d+[,.]?-?\s*(kr\.?|dkk)|(kr\.?|dkk)\s*\d+.*|for (alle|børn|voksne|unge).*)$/i;
const RE_UDELAD = /gudstjeneste|højmesse|aftensang|fitness|holdtræning|spinning|styrketræning|motionstilbud/i;

function datoFra(d, m, y, ref) {
  const nu = new Date(ref + 'T12:00:00Z');
  let aar = y ? +y : nu.getUTCFullYear();
  if (aar < 100) aar += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  let iso = `${aar}-${p2(m)}-${p2(d)}`;
  if (!y && iso < plus(ref, -60)) iso = `${aar + 1}-${p2(m)}-${p2(d)}`;
  return iso;
}
/** Finder en dato i en tekst. ref = dags dato (YYYY-MM-DD), fra = første mulige dato for ugedage. */
export function findDato(s, ref, fra) {
  let m = s.match(RE_MDR);
  if (m) return { dato: datoFra(+m[1], MDR[m[2].toLowerCase()], m[3], ref), match: m[0] };
  m = s.match(RE_NUM);
  if (m) {
    if (m[1]) return { dato: `${m[1]}-${m[2]}-${m[3]}`, match: m[0] };
    if (m[4]) return { dato: datoFra(+m[4], +m[5], m[6], ref), match: m[0] };
    return { dato: datoFra(+m[7], +m[8], m[9], ref), match: m[0] };
  }
  m = s.match(RE_UGEDAG);
  if (m) {
    const w = m[1].toLowerCase();
    if (w === 'i dag') return { dato: ref, match: m[0], ugedag: true };
    if (w === 'i morgen') return { dato: plus(ref, 1), match: m[0], ugedag: true };
    const start = fra || ref;
    for (let i = 0; i < 7; i++) { const d = plus(start, i); if (new Date(d + 'T12:00:00Z').getUTCDay() === UGEDAGE.indexOf(w)) return { dato: d, match: m[0], ugedag: true }; }
  }
  return null;
}
/** Finder et klokkeslæt (og evt. sluttid). */
export function findTid(s) {
  // datoer som 28.11.26 eller 13.12.2026 må ikke læses som klokkeslæt
  const m = String(s).replace(/\b\d{1,2}([./-])\d{1,2}\1\d{2,4}\b/g, (x) => ' '.repeat(x.length)).match(RE_TID);
  if (!m) return null;
  // "10-10.30" uden "kl.": hel time efterfulgt af sluttid
  const h = m[1] != null && m.index > 0 ? String(s).slice(0, m.index).match(/(?:\bkl\.?\s*)?\b([01]?\d|2[0-3])\s*[-–—]\s*$/i) : null;
  if (h) return { start: `${p2(h[1])}:00`, slut: `${p2(m[1])}:${m[2]}`, match: h[0] + m[0] };
  if (m[1] != null) return { start: `${p2(m[1])}:${m[2]}`, slut: m[3] != null ? `${p2(m[3])}:${m[4] || '00'}` : '', match: m[0] };
  return { start: `${p2(m[5])}:00`, slut: m[6] != null ? `${p2(m[6])}:${m[7] || '00'}` : '', match: m[0] };
}
const ren = (t) => t.replace(/\s+/g, ' ').replace(/^[\s\-–—:·•|,]+|[\s\-–—:·•|,]+$/g, '').trim();

/** Laver HTML om til tekstlinjer (en linje pr. blok-element). */
export function htmlTilLinjer(html) {
  return afkod(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div|h[1-6]|li|span|time|strong|em|a|article|section|header|footer|dd|dt|td|tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Arrangementskort i HTML (fx bibliotekernes lister): blokke med dato og titel. */
export function kortEvents(html, { ref = iDag(), fra = ref } = {}) {
  const ud = [], set = new Set();
  const blokke = [...html.matchAll(/<(article|li|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].filter((m) => m[3].length < 6000);
  for (const [, tag, attr, ind] of blokke) {
    const linjer = htmlTilLinjer(ind);
    if (linjer.length < 2 || linjer.length > 25) continue;
    const tekst = linjer.join(' \n ');
    if (/\baflyst\b/i.test(tekst)) continue;
    const d = findDato(tekst, ref, fra);
    if (!d || !d.dato || d.ugedag) continue;
    const t = findTid(tekst);
    const h = ind.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const fri = linjer.filter((l) => !RE_META.test(l) && !findDato(l, ref, fra) && !(findTid(l) && ren(l.replace(findTid(l).match, '')).length < 3));
    let titel = h ? ren(htmlTilLinjer(h[1]).join(' ')) : '';
    if (!titel) titel = fri.filter((l) => l.length <= 120).sort((a, b) => b.length - a.length)[0] || '';
    if (!titel || titel.length < 3) continue;
    const sted = fri.find((l) => l !== titel && l.length <= 45 && !/[.!?…]$/.test(l) && !/\bkr\.?(?=\s|$)|\bdkk\b|entré|\d+,-/i.test(l) && l.split(' ').length <= 6 && RE_STED.test(l)) || '';
    const href = tag.toLowerCase() === 'a' ? (attr.match(/href="([^"]+)"/i) || [])[1] || '' : (ind.match(/<a\b[^>]*href="([^"]+)"/i) || [])[1] || '';
    const e = { dato: d.dato, start: t ? t.start : '', slut: t ? t.slut : '', titel, sted: ren(sted), url: href, udsolgt: /\budsolgt\b/i.test(tekst) };
    if (RE_UDELAD.test(titel)) continue;
    const k = e.dato + '|' + e.start + '|' + e.titel.toLowerCase();
    if (!set.has(k)) { set.add(k); ud.push(e); }
  }
  return ud;
}

/** Arrangementer i fri tekst (kopieret fra KultuNaut eller skrevet i hånden). */
export function tekstEvents(txt, { ref = iDag(), fra = ref, standardDato = '' } = {}) {
  const ud = [];
  let dato = standardDato, e = null, buf = [];
  const luk = () => { if (e && e.titel && e.dato && !e.aflyst && !RE_UDELAD.test(e.titel + ' ' + (e.kat || ''))) ud.push({ dato: e.dato, start: e.start, slut: e.slut, titel: e.titel, sted: e.sted || '', url: '', udsolgt: !!e.udsolgt, usikker: true }); e = null; };
  const vask = (r) => ren(r.replace(/\budsolgt\b/gi, ' ').replace(new RegExp(RE_UGEDAG.source, 'gi'), ' ').replace(/\bkl\.?(?=\s|$)/gi, ' ').replace(/\b(den|d\.)\s/gi, ' '));
  for (let l of String(txt).split(/\r?\n/)) {
    l = l.replace(/\s+/g, ' ').trim();
    if (!l) { luk(); buf = []; continue; }
    if (/\baflyst\b/i.test(l)) { if (e) e.aflyst = true; else buf.push('AFLYST'); continue; }
    const uds = /\budsolgt\b/i.test(l);
    if (uds && e && ren(l.replace(/\budsolgt\b/gi, '')).length < 3) { e.udsolgt = true; continue; }
    let rest = l;
    const d = findDato(rest, ref, fra);
    if (d && d.dato) rest = rest.replace(d.match, ' ');
    const t = findTid(rest);
    if (t) rest = rest.replace(t.match, ' ');
    rest = vask(rest);
    if ((d && d.dato) || t) {
      luk();
      if (d && d.dato) dato = d.dato;
      if (!t && rest.length < 4) { buf = []; continue; } // datooverskrift
      e = { dato, start: t ? t.start : '', slut: t ? t.slut : '', udsolgt: uds };
      if (rest.length >= 3 && !RE_META.test(rest)) saetTitelSted(e, rest);
      else {
        const forrige = buf.filter((x) => !RE_META.test(x));
        if (buf.includes('AFLYST')) e.aflyst = true;
        if (forrige.length) { saetTitelSted(e, forrige[forrige.length - 1]); if (forrige.length > 1) e.kat = forrige[forrige.length - 2]; }
      }
      buf = [];
      continue;
    }
    if (RE_META.test(l)) continue;
    if (e && !e.titel) saetTitelSted(e, l);
    else if (e && !e.sted && l.length <= 70 && (RE_STED.test(l) || /,\s*[A-ZÆØÅ][a-zæøå]+$/.test(l))) e.sted = ren(l);
    else buf.push(l);
  }
  luk();
  return ud;
}
function saetTitelSted(e, s) {
  // "Titel, Sted" / "Titel – Sted" / "koncert med X i Y" / "X på Y"
  let titel = s, sted = '';
  const k = s.match(/^(.*\S)\s*(?:,|\s[–—-]\s)\s*([^,–—]{3,60})$/);
  if (k && RE_STED.test(k[2])) { titel = k[1]; sted = k[2]; }
  else {
    const i = s.match(/^(.*\S)\s+(?:i|på)\s+((?:[A-ZÆØÅ][\wæøåÆØÅ.'-]*\s?){1,6}.*)$/);
    if (i && i[2].length <= 60) { titel = i[1]; sted = i[2]; }
  }
  e.titel = stortBogstav(ren(titel.replace(/^[:\s]+/, '')));
  if (sted) e.sted = ren(sted);
}
const stortBogstav = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Læser en hentet side: iCal, schema.org (JSON-LD) og arrangementskort. Returnerer arrangementer mellem fra og til. */
export function laesSide(txt, contentType = '', { fra = iDag(), til = plus(iDag(), 10) } = {}) {
  const ical = /text\/calendar/i.test(contentType) || /^\s*BEGIN:VCALENDAR/.test(txt);
  let alle = ical ? icalEvents(txt) : jsonLdEvents(txt);
  if (!ical) {
    const kort = kortEvents(txt, { ref: iDag(), fra });
    const set = new Set(alle.map((e) => e.dato + '|' + e.start));
    for (const k of kort) if (!set.has(k.dato + '|' + k.start)) alle.push(k);
  }
  // fjern hale som "// 28.11.26 - 13.12.2026" og råb-titler med store bogstaver
  const pynt = (t) => { t = String(t || '').replace(/\s*\/\/.*$/, '').trim(); return t.length > 6 && t === t.toUpperCase() && /[A-ZÆØÅ]{4}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t; };
  for (const e of alle) e.titel = pynt(e.titel);
  return { ical, events: alle.filter((e) => e.titel && e.dato >= fra && e.dato <= til) };
}

/* ---------- tjek én URL ---------- */
const synligTekst = (html) => afkod(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
async function sha(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Tjekker én URL. Returnerer status, et fingeraftryk af indholdet og arrangementer mellem fra og til (YYYY-MM-DD). */
export async function tjekUrl(url, { fra = iDag(), til = plus(iDag(), 10) } = {}) {
  const res = { status: 0, ok: false, fejl: '', hash: '', events: [] };
  try {
    const svar = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,text/calendar,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(25000) });
    res.status = svar.status; res.ok = svar.ok;
    const txt = await laesTekst(svar);
    if (!svar.ok) { res.fejl = 'HTTP ' + svar.status; return res; }
    const { ical, events } = laesSide(txt, svar.headers.get('content-type') || '', { fra, til });
    const base = svar.url || url;
    res.events = events.map((e) => { let u = e.url || ''; try { if (u) u = new URL(u, base).href; } catch {} return { ...e, url: u }; });
    res.hash = await sha(ical ? txt : synligTekst(txt));
  } catch (e) {
    res.fejl = e && e.name === 'TimeoutError' ? 'Siden svarede ikke inden for 25 sekunder' : String((e && e.cause && e.cause.code) || (e && e.message) || e);
  }
  return res;
}

/** Samme id som appen bruger for en URL i en kommune. */
export function urlId(kommune, url) {
  let h = 5381;
  for (const c of String(url).trim().toLowerCase()) h = ((h << 5) + h + c.codePointAt(0)) | 0;
  return kommune + '_' + (h >>> 0).toString(36);
}

/** Id for en rettelse til et fast sted eller en mødekilde (samme som appen bruger). */
export function fastId(kommune, type, originalNavn) {
  let h = 5381;
  for (const c of String(originalNavn).trim().toLowerCase()) h = ((h << 5) + h + c.codePointAt(0)) | 0;
  return kommune + '_' + type + '_' + (h >>> 0).toString(36);
}

/** Byer uden for de fem kommuner, som ofte dukker op på fælles sider (museer, foreninger). */
const NABOBYER = ['Holbæk', 'Ringsted', 'Kalundborg', 'Køge', 'Roskilde', 'Nykøbing', 'Nakskov', 'Maribo', 'Odense', 'Nyborg', 'København', 'Store Heddinge', 'Rødvig', 'Tølløse', 'Jyderup', 'Svebølle', 'Gørlev', 'Høng', 'Tureby', 'Bjæverskov'];
/** Sand, hvis stedet nævner en by, der ligger i en anden kommune end den valgte. */
export function udenforKommune(sted, kommuneId, kommuner) {
  if (!sted) return false;
  const k = kommuner.find((x) => x.id === kommuneId);
  const egne = new Set([k && k.navn, ...String((k && k.byer) || '').split(',')].map((b) => String(b || '').trim().toLowerCase()).filter(Boolean));
  const andre = [...NABOBYER, ...kommuner.filter((x) => x.id !== kommuneId).flatMap((x) => [x.navn, ...String(x.byer || '').split(',')])].map((b) => String(b).trim()).filter(Boolean);
  const s = ' ' + sted.toLowerCase() + ' ';
  for (const by of andre) {
    const b = by.toLowerCase();
    if (egne.has(b)) continue;
    if (new RegExp('(^|[^a-zæøå])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zæøå])').test(s)) return true;
  }
  return false;
}

/** Byråds- og kommunalbestyrelsesmøder i en dagsordensportal eller mødekalender.
 *  Læser både links som "Dagsorden-Byraadet-d.26-11-2026-kl.18.30" og tekst som "Byrådet d. 26-11-2026 … kl. 18:30". */
export function moedeLinks(html, { ref = iDag() } = {}) {
  const ud = new Map();
  const RAAD = /byr(?:å|aa)d(?:et)?|kommunalbestyrelse(?:n)?/i;
  const tilfoej = (dato, start, kilde) => { if (!dato) return; const k = dato; if (!ud.has(k) || (!ud.get(k).start && start)) ud.set(k, { dato, start: start || '', kilde: kilde || '' }); };
  let dek = html;
  try { dek = decodeURIComponent(html.replace(/%(?![0-9a-f]{2})/gi, '%25')); } catch {}
  for (const m of dek.matchAll(/(?:Dagsorden|Referat)-([^"'<>\s]+?)-d\.(\d{2})-(\d{2})-(\d{4})(?:-kl\.(\d{2})\.(\d{2}))?/gi)) {
    if (!RAAD.test(m[1].replace(/-/g, ' '))) continue;
    tilfoej(`${m[4]}-${m[3]}-${m[2]}`, m[5] ? `${m[5]}:${m[6]}` : '', '');
  }
  const linjer = htmlTilLinjer(html);
  // Afsnit under en overskrift som "Byrådet" / "Kommunalbestyrelsen": tag datoerne, til næste overskrift med "udvalg"
  let aar = '';
  const aarFoer = (i) => { for (let j = i; j >= Math.max(0, i - 200); j--) { const a = aarILinje(linjer[j]); if (a) return a; } return ''; };
  for (let i = 0; i < linjer.length; i++) {
    if (!(RAAD.test(linjer[i]) && linjer[i].length <= 40 && !/udvalg/i.test(linjer[i]))) continue;
    aar = aarFoer(i);
    for (let j = i + 1; j < Math.min(linjer.length, i + 60); j++) {
      const l = linjer[j];
      if (aarILinje(l) && !findDato(l, ref)) { aar = aarILinje(l); continue; }
      if (/udvalg|råd\b(?!.*byr)/i.test(l) && l.length <= 60 && !findDato(l, ref)) break;
      if (/opdateret|publiceret|udgivet|senest|nyhed|presse/i.test(l)) continue;
      const dm = l.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
      const d = dm ? { dato: `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` } : findDatoIAar(l, ref, aar);
      if (!d || !d.dato || d.ugedag) continue;
      const t = findTid(l.replace(/\d{1,2}-\d{1,2}-\d{4}/g, ' '));
      tilfoej(d.dato, t ? t.start : '', '');
    }
  }
  for (let i = 0; i < linjer.length; i++) {
    if (!RAAD.test(linjer[i]) || /udvalg/i.test(linjer[i])) continue;
    if (/opdateret|publiceret|udgivet|nyhed|presse/i.test(linjer[i])) continue;
    const vindue = linjer.slice(i, i + 2).join(' ');
    const d = findDatoIAar(vindue, ref, aarFoer(i)) || (vindue.match(/(\d{2})-(\d{2})-(\d{4})/) && { dato: vindue.match(/(\d{2})-(\d{2})-(\d{4})/).slice(1).reverse().join('-') });
    if (!d || !d.dato || d.ugedag) continue;
    const t = findTid(vindue.replace(/\d{2}-\d{2}-\d{4}/g, ' '));
    tilfoej(d.dato, t ? t.start : '', '');
  }
  return [...ud.values()].sort((a, b) => a.dato.localeCompare(b.dato));
}

/* ---------- KultuNaut ---------- */
/** Adressen på KultuNauts liste for en kommune (startnr = 1, 21, 41 …). */
export const kultunautUrl = (kommunenavn, startnr = 1) =>
  'https://www.kultunaut.dk/perl/arrlist2/type-nynaut?startnr=' + startnr + '&Area=' + encodeURIComponent(kommunenavn) + '-storkommune&';
const RE_KN_DATO = /^(?:man|tir|ons|tor|fre|lør|søn)[a-zæøå]*\.?\s+\d{1,2}\.\s*[a-zæøå]+\.?(?:\s+\d{4})?/i;
/** Læser KultuNauts liste: kategori, titel, "Man. 23. nov. 2026 kl. 09.30-10.30", sted, beskrivelse. */
export function kultunautEvents(htmlEllerTekst, { ref = iDag(), fra = ref } = {}) {
  const linjer = /<[a-z][\s\S]*>/i.test(htmlEllerTekst) ? htmlTilLinjer(htmlEllerTekst) : String(htmlEllerTekst).split('\n').map((l) => l.trim()).filter(Boolean);
  const ud = [];
  for (let i = 1; i < linjer.length; i++) {
    const l = linjer[i];
    if (!RE_KN_DATO.test(l)) continue;
    const d = findDato(l, ref, fra);
    if (!d || !d.dato) continue;
    const t = findTid(l);
    let titel = linjer[i - 1];
    if (RE_KN_DATO.test(titel) || RE_META.test(titel)) continue;
    if (RE_UDELAD.test(titel + ' ' + (linjer[i - 2] || ''))) continue;
    let sted = linjer[i + 1] || '';
    if (sted.length > 60 || RE_KN_DATO.test(sted) || RE_META.test(sted)) sted = '';
    ud.push({ dato: d.dato, start: t ? t.start : '', slut: t ? t.slut : '', titel: ren(titel), sted: ren(sted), url: '', udsolgt: /udsolgt/i.test(linjer.slice(i - 1, i + 3).join(' ')), usikker: true });
  }
  return ud.length ? ud : tekstEvents(linjer.join('\n'), { ref, fra });
}

/** Ugedag (0 = søndag … 6 = lørdag) for en dato, og navnet på den. */
export const UGEDAGNAVNE = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const ugedagFor = (iso) => UGEDAGNAVNE[new Date(iso + 'T12:00:00Z').getUTCDay()];

/** Læser et fetch-svar som tekst og respekterer tegnsættet (KultuNaut m.fl. bruger iso-8859-1). */
export async function laesTekst(svar) {
  const buf = new Uint8Array(await svar.arrayBuffer());
  let cs = ((svar.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) { const hoved = new TextDecoder('latin1').decode(buf.slice(0, 4000)); cs = (hoved.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]; }
  cs = (cs || 'utf-8').toLowerCase();
  try { return new TextDecoder(/^(iso-8859-1|latin-?1|windows-1252|cp1252)$/.test(cs) ? 'windows-1252' : cs).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

/** Som findDato, men en dato uden årstal får årstallet fra den nærmeste overskrift (fx "Mødeplan 2027"). */
export function findDatoIAar(l, ref, aar) {
  const d = findDato(l, ref);
  if (!d || !d.dato || d.ugedag || !aar || /\d{4}/.test(d.match)) return d;
  return { ...d, dato: aar + d.dato.slice(4) };
}
/** Et årstal der står alene på linjen (ikke inde i en dato). */
export const aarILinje = (l) => { const m = String(l).replace(/\b20\d\d\s*[-–\/]\s*(20)?\d\d\b/g, ' ').replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.?\s*[a-zæøå]+\.?\s+\d{4}\b/gi, ' ').match(/\b(20[2-4]\d)\b(?!\s*[-–]\s*20)/); return m ? m[1] : ''; };
