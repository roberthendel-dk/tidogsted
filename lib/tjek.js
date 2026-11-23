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
    const txt = await svar.text();
    if (!svar.ok) { res.fejl = 'HTTP ' + svar.status; return res; }
    const ical = /text\/calendar/i.test(svar.headers.get('content-type') || '') || /^\s*BEGIN:VCALENDAR/.test(txt);
    const alle = ical ? icalEvents(txt) : jsonLdEvents(txt);
    res.events = alle.filter((e) => e.titel && e.dato >= fra && e.dato <= til);
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
