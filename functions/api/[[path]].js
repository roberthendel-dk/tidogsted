// Cloudflare Pages Function for "Tid & Sted".
// Gemmer mine OK'er/rettelser (tjek), møder og arrangementer (moeder), egne steder (kilder),
// ekstra URL'er (urler), rettelser til de faste steder (steder) og indsatte søgeresultater (fund) i Cloudflare KV.
// /api/tjek?url=… tjekker én URL med det samme ("Tjek nu" i appen).
// /api/hent?url=… henter en side til "Søg uden Claude", som appen selv læser.
//
// KV-bindingen TS oprettes automatisk af wrangler.jsonc.
// Dage, der er passeret, ryddes automatisk ud af tjek og fund.
//   Secret:      TS_KODE           (valgfri, men anbefalet) – kode, der kræves for at gemme

import { tjekUrl, laesTekst } from '../../lib/tjek.js';

const SAMLINGER = ['moeder', 'tjek', 'kilder', 'fund', 'urler', 'steder', 'undtag'];

const svar = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequest({ request, env, params }) {
  const dele = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const metode = request.method;
  const godkendt = !env.TS_KODE || request.headers.get('x-kode') === env.TS_KODE;

  if (dele[0] === 'status') {
    return svar({ kv: !!env.TS, kode: !!env.TS_KODE, godkendt });
  }

  if (dele[0] === 'data') {
    if (!env.TS) return svar({ fejl: 'KV-bindingen TS mangler' }, 501);
    const samling = dele[1];
    if (!SAMLINGER.includes(samling)) return svar({ fejl: 'Ukendt samling' }, 404);
    const noegle = 'samling:' + samling;
    const alle = JSON.parse((await env.TS.get(noegle)) || '{}');
    // Ryd op: OK'er, rettelser og fund for dage, der er passeret, slettes (der gemmes højst ~9 dage frem)
    if (samling === 'tjek' || samling === 'fund') {
      const igaar = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' });
      let ryddet = 0;
      for (const [k, d] of Object.entries(alle)) {
        const liste = d && Array.isArray(d.arrangementer) ? d.arrangementer : null;
        const gammel = d && ((d.dato && d.dato < igaar) || (liste && liste.length && liste.every((e) => (e.dato || '') < igaar)) || (liste && !liste.length && d.til && d.til < igaar));
        if (gammel) { delete alle[k]; ryddet++; }
      }
      if (ryddet) await env.TS.put(noegle, JSON.stringify(alle));
    }
    if (metode === 'GET') return svar(alle);
    if (!godkendt) return svar({ fejl: 'Forkert kode' }, 401);
    const id = dele[2];
    if (!id || !/^[a-z0-9._-]{1,160}$/i.test(id)) return svar({ fejl: 'Ugyldigt id' }, 400);
    if (metode === 'PUT') {
      let data;
      try { data = await request.json(); } catch { return svar({ fejl: 'Ugyldig JSON' }, 400); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return svar({ fejl: 'Ugyldige data' }, 400);
      if (JSON.stringify(data).length > 250000) return svar({ fejl: 'For store data' }, 413);
      alle[id] = data;
      await env.TS.put(noegle, JSON.stringify(alle));
      return svar({ ok: true });
    }
    if (metode === 'DELETE') {
      delete alle[id];
      await env.TS.put(noegle, JSON.stringify(alle));
      return svar({ ok: true });
    }
    return svar({ fejl: 'Metoden understøttes ikke' }, 405);
  }

  if (dele[0] === 'hent' && metode === 'GET') {
    // Henter en side for appen ("Søg uden Claude"), så browseren selv kan læse arrangementerne.
    if (!godkendt) return svar({ fejl: 'Forkert kode' }, 401);
    const url = new URL(request.url).searchParams.get('url') || '';
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return svar({ fejl: 'Ugyldig URL' }, 400);
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; TidOgSted/1.0; +https://github.com/roberthendel-dk/tidogsted)', accept: 'text/html,text/calendar,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(25000) });
      const tekst = (await laesTekst(r)).slice(0, 3000000);
      return new Response(tekst, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-status': String(r.status), 'x-type': r.headers.get('content-type') || '', 'x-url': r.url || url } });
    } catch (e) {
      return svar({ fejl: (e && e.name === 'TimeoutError') ? 'Siden svarede ikke inden for 25 sekunder' : 'Siden kunne ikke hentes' }, 502);
    }
  }

  if (dele[0] === 'tjek' && metode === 'GET') {
    if (!godkendt) return svar({ fejl: 'Forkert kode' }, 401);
    const url = new URL(request.url).searchParams.get('url') || '';
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return svar({ fejl: 'Ugyldig URL' }, 400);
    return svar(await tjekUrl(url));
  }

  return svar({ fejl: 'Ikke fundet' }, 404);
}
