// ===== Leitura e análise da conversa exportada do WhatsApp =====
(function (g) {
  const RX_INICIO = /^(\d{2})\/(\d{2})\/(\d{4}),? (\d{2}):(\d{2})(?::\d{2})? - (.*)$/;

  function minutos(hhmm) {
    const m = String(hhmm).replace('h', ':').match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function hhmm(min) {
    if (min == null) return '—';
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }
  function duracao(min) {
    if (min == null) return '—';
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
  }

  function lerMensagens(texto) {
    const linhas = texto.replace(/\r/g, '').split('\n');
    const msgs = [];
    let atual = null;
    for (let linha of linhas) {
      linha = linha.replace(/[‎‏‪-‮⁨⁩]/g, '');
      const m = linha.match(RX_INICIO);
      if (m) {
        const resto = m[6];
        const i = resto.indexOf(': ');
        let quem = '', txt = resto, sistema = true;
        if (i > 0 && i < 80) { quem = resto.slice(0, i).trim(); txt = resto.slice(i + 2); sistema = false; }
        atual = { data: m[1] + '/' + m[2] + '/' + m[3], chave: m[3] + m[2] + m[1], hora: m[4] + ':' + m[5],
                  min: (+m[4]) * 60 + (+m[5]), quem, texto: txt, sistema };
        msgs.push(atual);
      } else if (atual) {
        atual.texto += '\n' + linha;
      }
    }
    msgs.forEach(x => { x.texto = x.texto.replace(/<Mensagem editada>/g, '').trim(); });
    return msgs;
  }

  function ehObra(quem, termosObra) {
    if (!quem) return false;
    const q = quem.toLowerCase();
    return termosObra.some(t => t && q.includes(t.toLowerCase()));
  }

  const RX_CARGA = /(\d+)\s*[⁰°ºª]?\s*\n?\s*BT\s*(\d+)[\s\S]*?Sa[ií]ndo\s*(?:[àa]s?)?\s*(\d{1,2}[:h]\d{2})[\s\S]*?(\d+(?:[.,]\d+)?)\s*m(?:3|³)?\b[\s\S]*?NF\s*(\d+)/i;
  const RX_VOLUME = /(\d+(?:[.,]\d+)?)\s*(?:m³|m3|metros?|mts?|m)(?![a-zà-ú])/i;
  const RX_OCORRENCIA = /cancel|chuv|chov|atras|problema|dif[ií]cil|pepino|estresse|acordado|segur|manuten|molhad|passo fundo|\bpf\b|contrato|reclam|n[aã]o tem como|demor|espera|cobrar|fila/i;

  function analisar(texto, termosObra) {
    const msgs = lerMensagens(texto);
    const pedidos = [], cargas = [], ocorrencias = [], cancelamentos = [];
    const pendentes = {}; // por dia

    for (const m of msgs) {
      if (m.sistema) continue;
      const t = m.texto;
      if (/^mensagem apagada$/i.test(t) || /arquivo anexado/i.test(t) && t.length < 60) continue;
      const obra = ehObra(m.quem, termosObra);
      const dia = m.chave;
      pendentes[dia] = pendentes[dia] || [];

      // Carga anunciada pela concreteira
      const c = !obra && t.match(RX_CARGA);
      if (c) {
        const saida = minutos(c[3]);
        const carga = { data: m.data, chave: dia, ordem: +c[1], bt: c[2], saida, vol: parseFloat(c[4].replace(',', '.')),
                        nf: c[5], aviso: m.min, pedido: null, espera: null };
        const p = pendentes[dia].shift();
        if (p) { p.atendido = carga; carga.pedido = p.min; carga.espera = saida != null ? saida - p.min : null; carga.volPedido = p.vol; }
        cargas.push(carga);
        continue;
      }

      if (obra) {
        // Cancelamento / segurar
        if (/cancel|segura|n[aã]o vamos mais|n[aã]o vamos mais precisar|por hj fechou|vamos parar/i.test(t)) {
          const canc = pendentes[dia].splice(0);
          canc.forEach(p => { p.cancelado = true; });
          cancelamentos.push({ data: m.data, chave: dia, hora: m.hora, quem: m.quem, texto: t, pedidosCancelados: canc.length });
        }
        // Pedido de carga
        const v = t.match(RX_VOLUME);
        if (v && /carreg|manda|mand|outro|caminh|segundo|hotel|metros/i.test(t) && !/fck\s*\d+\s*$/i.test(v[0])) {
          const vol = parseFloat(v[1].replace(',', '.'));
          let n = 1;
          const nc = t.match(/(\d+)\s*caminh/i);
          if (nc) n = Math.min(+nc[1], 6);
          const ult = pendentes[dia][pendentes[dia].length - 1];
          if (/^(pode\s+)?carreg\w*\s+com\b/i.test(t.trim()) && ult && m.min - ult.min <= 60 && n === 1) {
            ult.vol = vol; ult.correcao = m.hora; // correção do volume do pedido anterior
          } else {
            for (let i = 0; i < n; i++) {
              const p = { data: m.data, chave: dia, min: m.min, hora: m.hora, quem: m.quem, vol, texto: t };
              pedidos.push(p); pendentes[dia].push(p);
            }
          }
        }
      }

      if (RX_OCORRENCIA.test(t) && !c) {
        ocorrencias.push({ data: m.data, chave: dia, hora: m.hora, quem: m.quem, obra, texto: t });
      }
    }

    // Áudios e imagens (não lidos automaticamente)
    const anexos = msgs.filter(m => /\.(opus|ogg|mp3|m4a|jpg|jpeg|png|webp|pdf|mp4|vcf)\s*\(arquivo anexado\)/i.test(m.texto))
      .map(m => ({ data: m.data, chave: m.chave, hora: m.hora, quem: m.quem,
                   tipo: /\.(opus|ogg|mp3|m4a)/i.test(m.texto) ? 'Áudio' : /\.(jpg|jpeg|png|webp)/i.test(m.texto) ? 'Foto' : /\.mp4/i.test(m.texto) ? 'Vídeo' : /\.vcf/i.test(m.texto) ? 'Contato' : 'Arquivo',
                   texto: m.texto }));

    // NF fora de sequência
    let maxNF = 0;
    cargas.forEach(c => { const n = +c.nf; if (maxNF && Math.abs(n - maxNF) > 40 && n < maxNF) c.alertaNF = true; if (n > maxNF) maxNF = n; });

    // Dias
    const dias = {};
    msgs.forEach(m => { if (!dias[m.chave]) dias[m.chave] = { chave: m.chave, data: m.data, cargas: [], cancel: [], ocorr: [], msgs: 0 }; dias[m.chave].msgs++; });
    cargas.forEach(c => dias[c.chave].cargas.push(c));
    cancelamentos.forEach(c => dias[c.chave].cancel.push(c));
    ocorrencias.forEach(o => dias[o.chave].ocorr.push(o));

    const participantes = {};
    msgs.forEach(m => { if (!m.sistema && m.quem) participantes[m.quem] = (participantes[m.quem] || 0) + 1; });

    return { msgs, pedidos, cargas, ocorrencias, cancelamentos, anexos, dias: Object.values(dias).sort((a, b) => a.chave.localeCompare(b.chave)), participantes };
  }

  g.Analise = { analisar, hhmm, duracao, lerMensagens };
})(typeof window !== 'undefined' ? window : globalThis);
