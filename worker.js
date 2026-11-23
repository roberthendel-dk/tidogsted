// Indgang for Cloudflare Workers: /api/* håndteres af funktionen, alt andet er sidens egne filer.
import { onRequest } from './functions/api/[[path]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent);
      return onRequest({ request, env, params: { path }, waitUntil: ctx.waitUntil.bind(ctx) });
    }
    return env.ASSETS.fetch(request);
  },
};
