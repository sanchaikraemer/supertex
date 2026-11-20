// Tela: upload do arquivo, filtros e montagem do relatório.
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const {hhmm,duracao}=Analise;
let TEXTO='', NOME='', AUDIOS={}, TRANSC={}, TRANSCREVENDO='', ERRO_TRANSC='';
const fmt=n=>(Math.round(n*10)/10).toLocaleString('pt-BR');
const isoDe=ch=>ch.slice(0,4)+'-'+ch.slice(4,6)+'-'+ch.slice(6,8);
const semana=ch=>['dom','seg','ter','qua','qui','sex','sáb'][new Date(isoDe(ch)+'T12:00').getDay()];

// --- leitura de .zip sem biblioteca ---
async function lerZip(buf){
  const dv=new DataView(buf);let eocd=-1;
  for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-70000);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('zip inválido');
  const n=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);const dec=new TextDecoder();
  let txt=null;const audios={};
  for(let k=0;k<n;k++){
    const met=dv.getUint16(p+10,true),csz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    const nome=dec.decode(new Uint8Array(buf,p+46,nl));p+=46+nl+el+cl;
    const ehTxt=/\.txt$/i.test(nome)&&!txt, ehAudio=/\.(opus|ogg|m4a|mp3)$/i.test(nome);
    if(!ehTxt&&!ehAudio)continue;
    const ln=dv.getUint16(off+26,true),le=dv.getUint16(off+28,true);
    const dados=new Uint8Array(buf,off+30+ln+le,csz);
    let bytes=dados;
    if(met===8){const ds=new DecompressionStream('deflate-raw');bytes=new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(ds)).arrayBuffer());}
    if(ehTxt)txt={nome,texto:dec.decode(bytes)};
    else audios[nome.split('/').pop()]=bytes.slice(); // cópia só do áudio (não o zip inteiro)
  }
  if(!txt)throw new Error('nenhum .txt dentro do zip');
  return {...txt,audios};
}
// --- guarda a última conversa importada neste aparelho (só sai ao clicar em "Apagar conversa") ---
const Guarda={
  banco(){return new Promise((ok,erro)=>{const r=indexedDB.open('concreteira',1);r.onupgradeneeded=()=>r.result.createObjectStore('conversa');r.onsuccess=()=>ok(r.result);r.onerror=()=>erro(r.error);});},
  async usar(modo,fazer){const db=await this.banco();return new Promise((ok,erro)=>{const t=db.transaction('conversa',modo);const r=fazer(t.objectStore('conversa'));t.oncomplete=()=>ok(r.result);t.onerror=()=>erro(t.error);});},
  salvar(d){return this.usar('readwrite',s=>s.put(d,'ultima'));},
  ler(){return this.usar('readonly',s=>s.get('ultima'));},
  salvarTranscricoes(t){return this.usar('readwrite',s=>s.put(t,'transcricoes'));},
  lerTranscricoes(){return this.usar('readonly',s=>s.get('transcricoes'));},
  apagar(){return this.usar('readwrite',s=>s.clear());}, // conversa, áudios e transcrições
};
// --- transcrição dos áudios (OpenAI). A chave fica só neste aparelho, nunca no GitHub. ---
const MODELO_TRANSCRICAO='gpt-4o-mini-transcribe';
const Chave={
  ler(){try{return localStorage.getItem('chaveOpenAI')||''}catch(e){return ''}},
  salvar(v){try{v?localStorage.setItem('chaveOpenAI',v):localStorage.removeItem('chaveOpenAI')}catch(e){}},
};
const arquivoDoAudio=t=>(String(t).replace(/‎/g,'').match(/([^\s]+\.(?:opus|ogg|m4a|mp3))\s*\(arquivo anexado\)/i)||[])[1]||'';
async function transcrever(nome,bytes,chave){
  const ext=nome.split('.').pop().toLowerCase();
  const tipo={opus:'audio/ogg',ogg:'audio/ogg',m4a:'audio/mp4',mp3:'audio/mpeg'}[ext]||'audio/ogg';
  const fd=new FormData();
  fd.append('file',new Blob([bytes],{type:tipo}),nome.replace(/\.opus$/i,'.ogg'));
  fd.append('model',MODELO_TRANSCRICAO);fd.append('language','pt');
  const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+chave},body:fd});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(r.status===401?'chave inválida ou vencida':r.status===429?'sem saldo ou limite atingido na OpenAI':(j.error&&j.error.message)||'erro '+r.status);
  return (j.text||'').trim();
}
async function transcreverPendentes(lista){
  const chave=Chave.ler();let feitos=0,erro='';ERRO_TRANSC='';
  for(const nome of lista){
    TRANSCREVENDO=`Transcrevendo ${feitos+1} de ${lista.length}…`;render();
    try{TRANSC[nome]=await transcrever(nome,AUDIOS[nome],chave);feitos++;await Guarda.salvarTranscricoes(TRANSC).catch(()=>{});}
    catch(e){erro=e.message;break;}
  }
  TRANSCREVENDO='';ERRO_TRANSC=erro?`Parou: ${erro}. ${feitos} transcrito(s).`:'';render();
}
function mostrarChave(){
  const c=Chave.ler();
  $('#chaveInfo').textContent=c?'Chave guardada neste aparelho (termina em …'+c.slice(-4)+'). Os áudios são enviados à OpenAI só para transcrever.':'Nenhuma chave guardada neste aparelho.';
  $('#tirarChave').classList.toggle('oculto',!c);
}
// Aceita o .zip exportado OU os arquivos já extraídos (o .txt junto com os áudios), escolhidos de uma vez.
async function abrir(arquivos){
  try{
    arquivos=[...arquivos];
    const soltos=arquivos.filter(f=>/\.(opus|ogg|m4a|mp3)$/i.test(f.name));
    const f=arquivos.find(x=>/\.(zip|txt)$/i.test(x.name))||arquivos.find(x=>!soltos.includes(x));
    if(!f)throw new Error('escolha também o .txt da conversa (ou o .zip)');
    const buf=await f.arrayBuffer(),u=new Uint8Array(buf);
    let nome=f.name,texto,audios={};
    if(u[0]===0x50&&u[1]===0x4b){const r=await lerZip(buf);texto=r.texto;nome=r.nome;audios=r.audios;} // é zip (começa com "PK")
    else texto=new TextDecoder().decode(buf);
    for(const a of soltos)audios[a.name]=new Uint8Array(await a.arrayBuffer());
    TEXTO=texto;NOME=nome.replace(/\.(txt|zip)$/i,'').replace(/^Conversa do WhatsApp com /i,'');AUDIOS=audios;
    $('#de').value='';$('#ate').value='';render();
    Guarda.salvar({texto:TEXTO,nome:NOME,audios:AUDIOS}).then(()=>$('#apagar').classList.remove('oculto')).catch(()=>{});
  }catch(e){$('#nomeGrupo').textContent='Não consegui ler o arquivo: '+e.message;}
}
const drop=$('#drop');
drop.onclick=()=>$('#arq').click();
$('#arq').onchange=e=>e.target.files.length&&abrir(e.target.files);
drop.ondragover=e=>{e.preventDefault();drop.classList.add('on')};
drop.ondragleave=()=>drop.classList.remove('on');
drop.ondrop=e=>{e.preventDefault();drop.classList.remove('on');e.dataTransfer.files.length&&abrir(e.dataTransfer.files)};
$('#aplicar').onclick=render;
$('#apagar').onclick=()=>{if(confirm('Apagar a conversa guardada neste aparelho?'))Guarda.apagar().catch(()=>{}).finally(()=>location.reload());};
$('#salvarChave').onclick=()=>{const v=$('#chave').value.trim();if(!v)return;Chave.salvar(v);$('#chave').value='';ERRO_TRANSC='';mostrarChave();render();};
$('#tirarChave').onclick=()=>{Chave.salvar('');mostrarChave();render();};
mostrarChave();
document.querySelectorAll('#abas button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#abas button').forEach(x=>x.classList.toggle('at',x===b));
  ['resumo','dias','cargas','ocorr','nfs'].forEach(a=>$('#a-'+a).classList.toggle('oculto',a!==b.dataset.a));
});

function render(){
  const termos=$('#obra').value.split(',').map(s=>s.trim()).filter(Boolean);
  const lim=+$('#limite').value||60;
  const R=Analise.analisar(TEXTO,termos);
  if(!R.msgs.length){$('#nomeGrupo').textContent=TEXTO?'Arquivo sem mensagens reconhecidas.':'Nenhuma conversa carregada ainda — arraste o arquivo exportado do grupo no quadro abaixo.';return;}
  const de=$('#de').value.replace(/-/g,''),ate=$('#ate').value.replace(/-/g,'');
  const dentro=ch=>(!de||ch>=de)&&(!ate||ch<=ate);
  const cargas=R.cargas.filter(c=>dentro(c.chave));
  const dias=R.dias.filter(d=>dentro(d.chave));
  const ocorr=R.ocorrencias.filter(o=>dentro(o.chave));
  const anexos=R.anexos.filter(o=>dentro(o.chave));
  const pedidos=R.pedidos.filter(p=>dentro(p.chave));
  const primeiro=R.dias[0],ultimo=R.dias[R.dias.length-1];
  if(!$('#de').value){$('#de').value=isoDe(primeiro.chave);$('#ate').value=isoDe(ultimo.chave);}
  $('#nomeGrupo').textContent=NOME+' · '+R.msgs.length+' mensagens · '+primeiro.data+' a '+ultimo.data;

  const vol=cargas.reduce((s,c)=>s+c.vol,0);
  const comEsp=cargas.filter(c=>c.espera!=null);
  const media=comEsp.length?Math.round(comEsp.reduce((s,c)=>s+c.espera,0)/comEsp.length):null;
  const atras=comEsp.filter(c=>c.espera>lim);
  const maior=comEsp.reduce((a,c)=>!a||c.espera>a.espera?c:a,null);
  const diasConc=dias.filter(d=>d.cargas.length);
  const diasSem=dias.filter(d=>!d.cargas.length&&d.cancel.length+d.ocorr.length>0);
  const naoAt=pedidos.filter(p=>!p.atendido);

  $('#kpis').innerHTML=[
    [fmt(vol)+' m³','Concreto entregue'],[cargas.length,'Cargas (caminhões)'],[diasConc.length,'Dias com concretagem'],
    [duracao(media),'Espera média pedido → saída'],[atras.length,'Cargas com espera > '+lim+' min'],[maior?duracao(maior.espera):'—','Maior espera'+(maior?' ('+maior.data.slice(0,5)+')':'')]
  ].map(([v,l])=>`<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

  // ---------- RELATÓRIO ----------
  const linhasDia=diasConc.map(d=>{
    const v=d.cargas.reduce((s,c)=>s+c.vol,0);
    const e=d.cargas.filter(c=>c.espera!=null);const m=e.length?Math.round(e.reduce((s,c)=>s+c.espera,0)/e.length):null;
    return `• ${d.data.slice(0,5)} (${semana(d.chave)}): ${d.cargas.length} carga${d.cargas.length>1?'s':''}, ${fmt(v)} m³ — espera média ${duracao(m)}`;
  });
  const linhasSem=diasSem.map(d=>{
    const motivo=[...d.cancel,...d.ocorr].map(x=>x.texto).join(' ').toLowerCase();
    let r='sem concretagem';
    if(/chuv|chov|molhad/.test(motivo))r='sem concretagem (chuva/terreno molhado)';
    else if(/cancel/.test(motivo))r='concretagem cancelada pela obra';
    return `• ${d.data.slice(0,5)} (${semana(d.chave)}): ${r}`;
  });
  const linhasAtr=atras.sort((a,b)=>b.espera-a.espera).map(c=>`• ${c.data.slice(0,5)} – pedida ${hhmm(c.pedido)}, saiu ${hhmm(c.saida)} (${duracao(c.espera)}) – BT ${c.bt}, NF ${c.nf}`);
  const alertasNF=cargas.filter(c=>c.alertaNF);
  const resumo=[
    `RELATÓRIO CONCRETAGEM – ${NOME}`,`Período: ${dias[0]?.data||'—'} a ${dias[dias.length-1]?.data||'—'}`,'',
    `Total entregue: ${fmt(vol)} m³ em ${cargas.length} cargas, ${diasConc.length} dias de concretagem.`,
    `Espera média entre pedido e saída do caminhão: ${duracao(media)}.`,
    `Cargas com espera acima de ${lim} min: ${atras.length} de ${comEsp.length}.`,'',
    'DIAS COM CONCRETAGEM',...linhasDia,
    ...(linhasSem.length?['','DIAS SEM CONCRETAGEM',...linhasSem]:[]),
    ...(linhasAtr.length?['',`ESPERAS ACIMA DE ${lim} MIN`,...linhasAtr]:[]),
    ...(naoAt.length?['','PEDIDOS NÃO ENVIADOS (cancelados/segurados pela obra)',...naoAt.map(p=>`• ${p.data.slice(0,5)} ${p.hora} – ${fmt(p.vol)} m³`)]:[]),
    ...(alertasNF.length?['','CONFERIR',...alertasNF.map(c=>`• NF ${c.nf} (${c.data.slice(0,5)}, ${c.ordem}ª carga) fora da sequência – possível erro de digitação`)]:[]),
  ].join('\n');

  const porDiaMax=Math.max(1,...diasConc.map(d=>d.cargas.reduce((s,c)=>s+c.vol,0)));
  $('#a-resumo').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
      <div><h2>Resumo pronto para enviar</h2><pre class="resumo" id="txtResumo">${esc(resumo)}</pre>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button id="copiar">Copiar texto</button><span id="okc" class="leg"></span></div></div>
      <div><h2>m³ por dia</h2><div class="barras">${diasConc.map(d=>{const v=d.cargas.reduce((s,c)=>s+c.vol,0);
        return `<div class="br"><span>${d.data.slice(0,5)} ${semana(d.chave)}</span><div class="f" style="width:${v/porDiaMax*100}%"></div><span>${fmt(v)} m³</span></div>`}).join('')}</div>
      <h2 style="margin-top:20px">Quem mais falou no grupo</h2>
      <table>${Object.entries(R.participantes).sort((a,b)=>b[1]-a[1]).map(([q,n])=>`<tr><td>${esc(q)} ${termos.some(t=>q.toLowerCase().includes(t.toLowerCase()))?'<span class="tag t-mut">obra</span>':''}</td><td class="n">${n}</td></tr>`).join('')}</table></div>
    </div>`;
  $('#copiar').onclick=async()=>{try{await navigator.clipboard.writeText(resumo);$('#okc').textContent='Copiado ✓'}catch(e){const r=document.createRange();r.selectNode($('#txtResumo'));getSelection().removeAllRanges();getSelection().addRange(r);$('#okc').textContent='Texto selecionado — use Ctrl+C'}};

  // ---------- POR DIA ----------
  $('#a-dias').innerHTML=`<div class="scroll"><table><tr><th>Dia</th><th class="n">Cargas</th><th class="n">m³</th><th class="n">1º pedido</th><th class="n">1ª saída</th><th class="n">Última saída</th><th class="n">Espera média</th><th class="n">Maior espera</th><th>Observação</th></tr>
    ${dias.map(d=>{const v=d.cargas.reduce((s,c)=>s+c.vol,0);const e=d.cargas.filter(c=>c.espera!=null);
      const m=e.length?Math.round(e.reduce((s,c)=>s+c.espera,0)/e.length):null;const mx=e.length?Math.max(...e.map(c=>c.espera)):null;
      const ped=pedidos.filter(p=>p.chave===d.chave);
      const obs=[...d.cancel.map(c=>c.texto.split('\n').filter(l=>l.trim()).pop()),...d.ocorr.filter(o=>/chuv|chov|molhad|atras|dif[ií]cil|problema/i.test(o.texto)&&!d.cancel.some(c=>c.texto===o.texto)).map(o=>o.texto.split('\n').find(l=>/chuv|chov|molhad|atras|dif[ií]cil|problema/i.test(l))||o.texto)].slice(0,2).map(t=>esc(t.slice(0,80))).join('<br>');
      if(!d.cargas.length&&!obs)return '';
      return `<tr><td>${d.data.slice(0,5)} <span class="leg">${semana(d.chave)}</span></td><td class="n">${d.cargas.length||'—'}</td><td class="n">${v?fmt(v):'—'}</td>
      <td class="n">${ped[0]?ped[0].hora:'—'}</td><td class="n">${d.cargas[0]?hhmm(d.cargas[0].saida):'—'}</td><td class="n">${d.cargas.length?hhmm(d.cargas[d.cargas.length-1].saida):'—'}</td>
      <td class="n">${duracao(m)}</td><td class="n">${mx!=null?`<span class="tag ${mx>lim?'t-bad':'t-ok'}">${duracao(mx)}</span>`:'—'}</td><td style="font-size:12px">${obs}</td></tr>`}).join('')}</table></div>`;

  // ---------- CARGAS ----------
  $('#a-cargas').innerHTML=`<div class="scroll"><table><tr><th>Dia</th><th class="n">Nº</th><th class="n">m³</th><th>BT</th><th>NF</th><th class="n">Pedido</th><th class="n">Saída</th><th class="n">Espera</th></tr>
    ${cargas.map(c=>`<tr><td>${c.data.slice(0,5)}</td><td class="n">${c.ordem}ª</td><td class="n">${fmt(c.vol)}${c.volPedido&&c.volPedido!==c.vol?` <span class="tag t-warn">pedido ${fmt(c.volPedido)}</span>`:''}</td><td>${esc(c.bt)}</td>
    <td>${esc(c.nf)}${c.alertaNF?' <span class="tag t-warn">conferir</span>':''}</td><td class="n">${hhmm(c.pedido)}</td><td class="n">${hhmm(c.saida)}</td>
    <td class="n">${c.espera==null?'—':`<span class="tag ${c.espera>lim?'t-bad':c.espera>lim*0.75?'t-warn':'t-ok'}">${duracao(c.espera)}</span>`}</td></tr>`).join('')}
    <tr><th colspan="2">Total</th><th class="n">${fmt(vol)}</th><th colspan="5">${cargas.length} cargas</th></tr></table></div>
    ${naoAt.length?`<h2 style="margin-top:16px">Pedidos que não saíram</h2><table>${naoAt.map(p=>`<tr><td>${p.data.slice(0,5)} ${p.hora}</td><td>${fmt(p.vol)} m³</td><td>${esc(p.quem)}</td><td><span class="tag t-mut">${p.cancelado?'cancelado/segurado pela obra':'sem carga anunciada'}</span></td></tr>`).join('')}</table>`:''}`;

  // ---------- OCORRÊNCIAS ----------
  const tudo=[...ocorr.map(o=>({...o,k:'o'})),...anexos.map(a=>({...a,k:'a',arq:a.tipo==='Áudio'?arquivoDoAudio(a.texto):'',obra:termos.some(t=>a.quem.toLowerCase().includes(t.toLowerCase()))}))]
    .sort((a,b)=>(a.chave+a.hora).localeCompare(b.chave+b.hora));
  const audiosPer=tudo.filter(o=>o.arq), pendentes=[...new Set(audiosPer.filter(o=>TRANSC[o.arq]==null&&AUDIOS[o.arq]).map(o=>o.arq))];
  const semArquivo=audiosPer.filter(o=>TRANSC[o.arq]==null&&!AUDIOS[o.arq]).length;
  // Com chave guardada, transcreve sozinho (sem clicar). Se der erro, aparece o botão "Tentar de novo".
  if(pendentes.length&&Chave.ler()&&!TRANSCREVENDO&&!ERRO_TRANSC){TRANSCREVENDO='Transcrevendo os áudios…';setTimeout(()=>transcreverPendentes(pendentes));}
  const avisoAudio=!audiosPer.length?'':TRANSCREVENDO?`<b>${esc(TRANSCREVENDO)}</b>`
    :pendentes.length&&!Chave.ler()?`${pendentes.length} áudio(s) para transcrever: cole a chave da OpenAI em <b>Transcrição dos áudios</b>, no quadro de cima.`
    :pendentes.length?`${ERRO_TRANSC?`<b>${esc(ERRO_TRANSC)}</b> `:''}<button id="transcrever">${ERRO_TRANSC?'Tentar de novo':`Transcrever ${pendentes.length} áudio(s)`}</button>`
    :semArquivo?`${semArquivo} áudio(s) sem o arquivo: para transcrever, importe a conversa exportada <b>com mídia</b> (.zip).`
    :'Todos os áudios do período estão transcritos.';
  const legAnexo=o=>o.arq&&TRANSC[o.arq]!=null?'<span class="tag t-ok">Áudio transcrito</span>':`<span class="tag t-warn">${o.tipo} – ouvir/ver no celular</span>`;
  const txtAnexo=o=>o.arq&&TRANSC[o.arq]!=null?'🎤 “'+esc(TRANSC[o.arq]||'(áudio sem fala)')+'”':esc(o.texto.replace(/\(arquivo anexado\)/,'').trim());
  $('#a-ocorr').innerHTML=`<p class="leg" style="margin-top:0">Mensagens com cancelamento, chuva, atraso, reclamação, troca de usina, manutenção etc. <span class="tag t-mut" style="border-left:3px solid var(--ac)">obra</span> <span class="tag t-mut" style="border-left:3px solid var(--warn)">concreteira</span></p>
    ${avisoAudio?`<div class="aviso-audio">${avisoAudio}</div>`:''}
    ${tudo.map(o=>`<div class="oc"><div class="q">${o.data.slice(0,5)} ${o.hora}<br>${o.k==='a'?legAnexo(o):''}</div>
    <div class="${o.obra?'lado-obra':'lado-conc'}"><div class="q">${esc(o.quem)}</div><div class="tx">${o.k==='a'?txtAnexo(o):esc(o.texto)}</div></div></div>`).join('')||'<p>Nenhuma ocorrência no período.</p>'}`;
  if($('#transcrever'))$('#transcrever').onclick=()=>transcreverPendentes(pendentes);

  // ---------- NFs e caminhões ----------
  const bts={};cargas.forEach(c=>{bts[c.bt]=bts[c.bt]||{n:0,v:0};bts[c.bt].n++;bts[c.bt].v+=c.vol});
  $('#a-nfs').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
    <div><h2>Notas fiscais (para conferir com a fatura)</h2><table><tr><th>NF</th><th>Dia</th><th class="n">m³</th></tr>
    ${cargas.map(c=>`<tr><td>${esc(c.nf)}${c.alertaNF?' <span class="tag t-warn">fora da sequência</span>':''}</td><td>${c.data.slice(0,5)}</td><td class="n">${fmt(c.vol)}</td></tr>`).join('')}
    <tr><th>Total</th><th></th><th class="n">${fmt(vol)}</th></tr></table></div>
    <div><h2>Caminhões (BT) usados</h2><table><tr><th>BT</th><th class="n">Viagens</th><th class="n">m³</th></tr>
    ${Object.entries(bts).sort((a,b)=>b[1].n-a[1].n).map(([b,x])=>`<tr><td>${esc(b)}</td><td class="n">${x.n}</td><td class="n">${fmt(x.v)}</td></tr>`).join('')}</table></div></div>`;
}
// Ao abrir a página: volta a última conversa guardada, se tiver.
// Conversa recebida pelo "Compartilhar" do WhatsApp (o sw.js guarda os arquivos e abre a página com ?compartilhado=1).
async function pegarCompartilhado(){
  if(!/compartilhado=1/.test(location.search)||!('caches' in window))return false;
  history.replaceState(null,'',location.pathname);
  const c=await caches.open('concreteira-compartilhado'),chaves=await c.keys(),arqs=[];
  for(const k of chaves){const r=await c.match(k);arqs.push(new File([await r.blob()],decodeURIComponent(r.headers.get('x-nome')||'arquivo')));}
  await caches.delete('concreteira-compartilhado');
  if(!arqs.length)return false;
  await abrir(arqs);return true;
}
Guarda.ler().then(d=>{if(d&&d.texto){TEXTO=d.texto;NOME=d.nome||'';AUDIOS=d.audios||{};$('#apagar').classList.remove('oculto');}})
  .then(()=>Guarda.lerTranscricoes()).then(t=>{TRANSC=t||{};}).catch(()=>{})
  .finally(()=>{render();pegarCompartilhado().catch(e=>{$('#nomeGrupo').textContent='Não consegui ler o arquivo compartilhado: '+e.message;});});
