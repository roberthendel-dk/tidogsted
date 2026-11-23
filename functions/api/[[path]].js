// Cloudflare Pages Function for "Tid & Sted".
// Gemmer mine OK'er/rettelser (tjek), møder og arrangementer (moeder),
// egne steder (kilder) og indsatte søgeresultater (fund) i Cloudflare KV.
//
// Opsætning i Cloudflare (Pages-projektet > Settings):
//   KV-binding:  TS  -> et KV-navnerum, fx "tidogsted"
//   Secret:      TS_KODE           (valgfri, men anbefalet) – kode, der kræves for at gemme
//   Secret:      ANTHROPIC_API_KEY (valgfri) – gør "Sæt spalten" og KultuNaut-udtræk automatiske
//   Variabel:    CLAUDE_MODEL      (valgfri) – standard er claude-sonnet-5-5

const SAMLINGER = ['moeder', 'tjek', 'kilder', 'fund'];

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
    return svar({ kv: !!env.TS, claude: !!env.ANTHROPIC_API_KEY, kode: !!env.TS_KODE, godkendt });
  }

  if (dele[0] === 'data') {
    if (!env.TS) return svar({ fejl: 'KV-bindingen TS mangler' }, 501);
    const samling = dele[1];
    if (!SAMLINGER.includes(samling)) return svar({ fejl: 'Ukendt samling' }, 404);
    const noegle = 'samling:' + samling;
    const alle = JSON.parse((await env.TS.get(noegle)) || '{}');
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

  if (dele[0] === 'claude' && metode === 'POST') {
    if (!env.ANTHROPIC_API_KEY) return svar({ fejl: 'ANTHROPIC_API_KEY er ikke sat' }, 501);
    if (!godkendt) return svar({ fejl: 'Forkert kode' }, 401);
    let prompt = '';
    try { prompt = String((await request.json()).prompt || ''); } catch { return svar({ fejl: 'Ugyldig JSON' }, 400); }
    if (!prompt) return svar({ fejl: 'Tom opgave' }, 400);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt.slice(0, 200000) }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return svar({ fejl: (d.error && d.error.message) || 'Fejl fra Claude' }, 502);
    return svar({ text: (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('') });
  }

  return svar({ fejl: 'Ikke fundet' }, 404);
}
