// Modo app: guarda uma cópia da página para ela abrir mesmo sem internet.
// Sempre busca a versão nova primeiro; a cópia só é usada quando não há internet.
// Também recebe a conversa compartilhada pelo WhatsApp ("Exportar conversa" → app Concreteira).
const CACHE = 'concreteira-v1';
const RECEBIDOS = 'concreteira-compartilhado';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function receberCompartilhado(req) {
  const dados = await req.formData();
  const arquivos = dados.getAll('arquivos').filter(f => f && typeof f === 'object' && f.size);
  const texto = dados.get('texto');
  if (!arquivos.length && typeof texto === 'string' && texto.trim()) {
    arquivos.push(new File([texto], (dados.get('titulo') || 'conversa') + '.txt', { type: 'text/plain' }));
  }
  await caches.delete(RECEBIDOS);
  const c = await caches.open(RECEBIDOS);
  await Promise.all(arquivos.map((f, i) =>
    c.put('recebido-' + i, new Response(f, { headers: { 'x-nome': encodeURIComponent(f.name || 'arquivo-' + i) } }))));
  return Response.redirect(new URL('./?compartilhado=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    e.respondWith(receberCompartilhado(e.request));
    return;
  }
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
