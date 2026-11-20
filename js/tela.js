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
  // Várias obras: cada conversa importada fica em "obra:<nome do grupo>"; "atual" diz qual está aberta.
  salvarObra(d){return this.usar('readwrite',s=>{s.put(d,'obra:'+d.nome);return s.put(d.nome,'atual');});},
  lerObra(nome){return this.usar('readonly',s=>s.get('obra:'+nome));},
  lerAtual(){return this.usar('readonly',s=>s.get('atual'));},
  definirAtual(nome){return this.usar('readwrite',s=>s.put(nome,'atual'));},
  async listarObras(){const k=await this.usar('readonly',s=>s.getAllKeys());return (k||[]).filter(x=>String(x).startsWith('obra:')).map(x=>x.slice(5)).sort((a,b)=>a.localeCompare(b,'pt-BR'));},
  apagarObra(nome){return this.usar('readwrite',s=>s.delete('obra:'+nome));},
  ler(){return this.usar('readonly',s=>s.get('ultima'));},          // formato antigo (uma conversa só), só para migrar
  apagarAntiga(){return this.usar('readwrite',s=>s.delete('ultima'));},
  salvarTranscricoes(t){return this.usar('readwrite',s=>s.put(t,'transcricoes'));},
  lerTranscricoes(){return this.usar('readonly',s=>s.get('transcricoes'));},
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
    $('#de').value='';$('#ate').value='';render();recolherImportar();
    if(!NOME)NOME='Obra sem nome';
    Guarda.salvarObra({texto:TEXTO,nome:NOME,audios:AUDIOS}).then(()=>{$('#apagar').classList.remove('oculto');return Guarda.listarObras();}).then(n=>montarSeletor(n,NOME)).catch(()=>{});
  }catch(e){$('#nomeGrupo').textContent='Não consegui ler o arquivo: '+e.message;}
}
const drop=$('#drop');
drop.onclick=()=>$('#arq').click();
$('#arq').onchange=e=>e.target.files.length&&abrir(e.target.files);
drop.ondragover=e=>{e.preventDefault();drop.classList.add('on')};
drop.ondragleave=()=>drop.classList.remove('on');
drop.ondrop=e=>{e.preventDefault();drop.classList.remove('on');e.dataTransfer.files.length&&abrir(e.dataTransfer.files)};
$('#aplicar').onclick=render;
$('#apagar').onclick=()=>{if(confirm(`Apagar a obra "${NOME}" deste aparelho?`))Guarda.apagarObra(NOME).catch(()=>{}).finally(()=>location.reload());};
// --- lista de obras no topo ---
function montarSeletor(nomes,atual){
  const sel=$('#obraSel');
  sel.innerHTML=nomes.map(n=>`<option value="${esc(n)}"${n===atual?' selected':''}>${esc(n)}</option>`).join('')+'<option value="__nova">+ Adicionar outra obra…</option>';
  $('#obrasBar').classList.toggle('oculto',!nomes.length);
}
async function carregarObra(nome){
  const d=await Guarda.lerObra(nome);if(!d)return;
  TEXTO=d.texto;NOME=d.nome;AUDIOS=d.audios||{};ERRO_TRANSC='';
  $('#de').value='';$('#ate').value='';render();recolherImportar();Guarda.definirAtual(nome).catch(()=>{});
}
$('#obraSel').onchange=e=>{const v=e.target.value;
  if(v==='__nova'){e.target.value=NOME;$('#importar').open=true;$('#importarTit').classList.remove('oculto');$('#drop').scrollIntoView({behavior:'smooth',block:'center'});return;}
  carregarObra(v).catch(()=>{});};
$('#salvarChave').onclick=()=>{const v=$('#chave').value.trim();if(!v)return;Chave.salvar(v);$('#chave').value='';ERRO_TRANSC='';mostrarChave();render();};
$('#tirarChave').onclick=()=>{Chave.salvar('');mostrarChave();render();};
mostrarChave();
// --- regra do contrato: carga mínima, taxa e preços por fck. Padrão no código (CONTRATO_PADRAO); o aparelho pode sobrepor. ---
// Valores do contrato com a Supertex (decisão do Sanchai em 20/11/2026: ficam no código e aparecem sozinhos;
// o repositório é público, então qualquer um pode ver). O que for salvo no aparelho (campos ou link) tem prioridade.
const CONTRATO_PADRAO={min:8,taxa:192.5,precos:[[20,668],[25,685],[30,700],[35,728],[40,749]]};
const Contrato={
  ler(){let s={};try{s=JSON.parse(localStorage.getItem('contratoCargaMin')||'null')||{}}catch(e){}
    return {min:s.min>0?s.min:CONTRATO_PADRAO.min,taxa:s.taxa>0?s.taxa:CONTRATO_PADRAO.taxa,
      precos:s.precos&&s.precos.length?s.precos:CONTRATO_PADRAO.precos};},
  salvar(o){try{localStorage.setItem('contratoCargaMin',JSON.stringify(o))}catch(e){}},
};
const reais=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
// Preços do concreto por fck, escritos como "fck:preço" separados por vírgula, ponto e vírgula ou espaço (ex.: 25:600, 30:650).
const lerPrecos=t=>String(t||'').split(/[;\s]+|,(?=\s*\d+\s*[:=])/).map(x=>x.split(/[:=]/)).filter(x=>x.length===2)
  .map(([f,p])=>[+f.replace(',','.'),+p.replace(',','.')]).filter(([f,p])=>f>0&&p>0);
const textoPrecos=l=>(l||[]).map(([f,p])=>`${fmt(f)}:${String(p).replace('.',',')}`).join(', ');
// Link de configuração: endereço terminado em #carga=X&taxa=Y&fck=F:P,F:P salva a regra neste aparelho e some do endereço.
// (o que vem depois do "#" não é enviado ao servidor)
// Salva a regra a partir do texto do link (o que vem depois do "#"). Devolve o resumo do que foi salvo, ou '' se não reconheceu.
function salvarConfig(txt){const i=String(txt||'').indexOf('#'),h=new URLSearchParams(i>=0?txt.slice(i+1):String(txt||'').trim());
 if(!(h.has('carga')||h.has('taxa')||h.has('fck')))return '';
 const o=Contrato.ler(),num=k=>+h.get(k).replace(',','.')||0;
 if(h.has('carga'))o.min=num('carga');if(h.has('taxa'))o.taxa=num('taxa');if(h.has('fck'))o.precos=lerPrecos(h.get('fck'));
 Contrato.salvar(o);
 return [o.min&&`carga mínima ${fmt(o.min)} m³`,o.taxa&&`taxa de ${reais(o.taxa)} por m³ que falta`,o.precos&&o.precos.length&&`preços de ${o.precos.length} fck`].filter(Boolean).join(', ');}
function preencherContrato(){const r=Contrato.ler();$('#cMin').value=r.min||'';$('#cTaxa').value=r.taxa||'';$('#cPrecos').value=textoPrecos(r.precos);}
function aplicarLinkConfig(){const ok=salvarConfig(location.hash);if(!ok)return false;
 history.replaceState(null,'',location.pathname+location.search);
 setTimeout(()=>alert(`Regra do contrato salva neste aparelho: ${ok}.`),300);return true;}
aplicarLinkConfig();
// se o link for aberto com o app já aberto na mesma aba, só o "#" muda: aplica e redesenha
window.addEventListener('hashchange',()=>{if(aplicarLinkConfig()){preencherContrato();render();}});
preencherContrato();
// Colar o link de configuração dentro do app (aba Custos)
$('#aplicarLink').onclick=()=>{const ok=salvarConfig($('#linkConfig').value);
 if(!ok){alert('Não reconheci esse link. Copie a mensagem inteira com o link de configuração do contrato e cole de novo.');return;}
 $('#linkConfig').value='';preencherContrato();render();alert(`Regra do contrato salva neste aparelho: ${ok}.`);};
$('#simVol').oninput=$('#simCam').oninput=()=>renderSim();
$('#salvarContrato').onclick=()=>{Contrato.salvar({min:+$('#cMin').value||0,taxa:+$('#cTaxa').value||0,precos:lerPrecos($('#cPrecos').value)});render();};
document.querySelectorAll('#abas button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#abas button').forEach(x=>x.classList.toggle('at',x===b));
  ['resumo','dias','cargas','ocorr','nfs','custos'].forEach(a=>$('#a-'+a).classList.toggle('oculto',a!==b.dataset.a));
});

// ---------- CUSTOS: simulação com a regra e os preços do contrato salvos NESTE aparelho (nada do contrato fica no código) ----------
function custosBase(){
  const r=Contrato.ler(),precos=r.precos||[];
  if(!(r.min>0&&r.taxa>0&&precos.length))return null;
  const media=precos.reduce((s,p)=>s+p[1],0)/precos.length;
  return {r,media,linhas:[...precos.map(([f,p])=>['fck '+fmt(f),p]),['Preço médio',media]],
    custo:(vol,cam,preco)=>{const falta=Math.max(0,cam*r.min-vol),taxa=falta*r.taxa,conc=vol*preco,total=conc+taxa;return {falta,taxa,conc,total,porM3:vol?total/vol:0};}};
}
const linhaCusto=(n,cels)=>`<tr${n==='Preço médio'?' class="destaque"':''}><td>${n}</td>${cels.map(c=>typeof c==='string'?`<td class="n">${c}</td>`:`<td class="n ${c[1]}">${c[0]}</td>`).join('')}</tr>`;
function renderCustos(){
  const B=custosBase();
  $('#custosSemRegra').classList.toggle('oculto',!!B);$('#custosConteudo').classList.toggle('oculto',!B);
  if(!B){const r=Contrato.ler(),f=[!(r.min>0)&&'a carga mínima',!(r.taxa>0)&&'a taxa',!(r.precos&&r.precos.length)&&'os preços por fck'].filter(Boolean);
    $('#custosFalta').textContent=`Este aparelho ainda não tem ${f.join(', ').replace(/, ([^,]*)$/,' e $1')} do contrato.`;return;}
  const {r,media}=B;
  $('#custosRegra').innerHTML=`Regra do contrato: mínimo <b>${fmt(r.min)} m³</b> por caminhão · <b>${reais(r.taxa)}</b> por m³ que falta · preço médio dos fck <b>${reais(media)}/m³</b>. Sem bombeamento.`;
  renderSim();
}
function renderSim(){
  const B=custosBase();if(!B)return;
  const {r,linhas,custo}=B,vol=Math.max(0,parseFloat(String($('#simVol').value).replace(',','.'))||0),cam=Math.max(1,parseInt($('#simCam').value)||1);
  if(!vol){$('#simInfo').textContent='Informe o volume.';$('#tSim').innerHTML='';return;}
  const min=Math.ceil(vol/r.min),falta=Math.max(0,cam*r.min-vol);
  if(cam<min){$('#simInfo').textContent=`${fmt(vol)} m³ não cabem em ${cam} caminhão(ões): o mínimo é ${min}.`;$('#tSim').innerHTML='';return;}
  $('#simInfo').textContent=`${fmt(vol)} m³ em ${cam} caminhão(ões): faltam ${fmt(falta)} m³ → taxa ${reais(falta*r.taxa)}.`+(cam>min?` Com ${min} caminhões a taxa seria ${reais(Math.max(0,min*r.min-vol)*r.taxa)}.`:'');
  $('#tSim').innerHTML=`<tr><th>Concreto</th><th class="n">Total</th><th class="n">m³ sai por</th></tr>`+
    linhas.map(([n,p])=>{const c=custo(vol,cam,p);return linhaCusto(n,[[reais(c.total),'forte'],reais(c.porM3)]);}).join('');
}
function render(){
  renderCustos();$('#custosConversa').textContent='';$('#custosObra').innerHTML='';
  const termos=$('#obra').value.split(',').map(s=>s.trim()).filter(Boolean);
  const lim=+$('#limite').value||60;
  const R=Analise.analisar(TEXTO,termos);
  $('#resumoObra').classList.add('oculto');
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

  const regra=Contrato.ler(),temRegra=regra.min>0&&regra.taxa>0;
  const abaixo=temRegra?cargas.filter(c=>c.vol<regra.min):[];
  const m3Falta=abaixo.reduce((s,c)=>s+(regra.min-c.vol),0),taxaAbaixo=m3Falta*(regra.taxa||0);
  // Gasto: cada carga pelo preço do fck dela (lido no pedido, na mensagem da carga ou no último fck citado no dia);
  // sem fck identificado, usa o preço médio dos fck do contrato. Mais o excedente das cargas abaixo do mínimo.
  const precos=regra.precos||[],precoMedio=precos.length?precos.reduce((s,p)=>s+p[1],0)/precos.length:0;
  const RX_FCK=/fck\s*[:=]?\s*(\d{2})\b/i,COD_FCK={84305:20,84307:25,84308:30,84309:35,84310:40,84317:30};
  const fckDe=t=>{t=String(t||'');const m=t.match(RX_FCK);if(m)return +m[1];const k=t.match(/\b(843(?:05|07|08|09|10|17))\b/);return k?COD_FCK[k[1]]:null;};
  const pedidoDe=new Map(R.pedidos.filter(p=>p.atendido).map(p=>[p.atendido,p])),msgsDia={};
  R.msgs.forEach(m=>{(msgsDia[m.chave]=msgsDia[m.chave]||[]).push(m);});
  R.cargas.forEach(c=>{const dia=msgsDia[c.chave]||[],p=pedidoDe.get(c);let f=p?fckDe(p.texto):null;
    if(!f){const mc=dia.find(m=>m.min===c.aviso&&m.texto.includes(c.nf));f=mc?fckDe(mc.texto):null;}
    if(!f){const ant=dia.filter(m=>m.min<=c.aviso).map(m=>fckDe(m.texto)).filter(Boolean);f=ant.length?ant[ant.length-1]:null;}
    c.fck=precos.some(x=>x[0]===f)?f:null;});
  const precoDe=c=>c.fck?precos.find(x=>x[0]===c.fck)[1]:precoMedio;
  const valorConc=cargas.reduce((s,c)=>s+c.vol*precoDe(c),0),gasto=valorConc+taxaAbaixo,semFck=cargas.filter(c=>!c.fck).length;
  const grupos={};cargas.forEach(c=>{const k=c.fck||0;(grupos[k]=grupos[k]||{n:0,vol:0}).n++;grupos[k].vol+=c.vol;});
  const porFck=Object.keys(grupos).map(Number).sort((a,b)=>(a||99)-(b||99)).map(k=>{const g=grupos[k],pr=k?precos.find(x=>x[0]===k)[1]:precoMedio;
    return {rotulo:k?'fck '+k:'fck não identificado (preço médio)',preco:pr,n:g.n,vol:g.vol,valor:g.vol*pr};});
  const temValor=precos.length&&vol;
  const tabelaGasto=()=>`<div class="scroll"><table><tr><th>Concreto</th><th class="n">Cargas</th><th class="n">m³</th><th class="n pc">R$/m³</th><th class="n">Valor</th></tr>
    ${porFck.map(g=>`<tr><td>${g.rotulo}</td><td class="n">${g.n}</td><td class="n">${fmt(g.vol)}</td><td class="n pc">${reais(g.preco)}</td><td class="n">${reais(g.valor)}</td></tr>`).join('')}
    ${temRegra?`<tr><td>Excedente (cargas abaixo de ${fmt(regra.min)} m³)</td><td class="n">${abaixo.length}</td><td class="n">${fmt(m3Falta)}</td><td class="n pc">${reais(regra.taxa)}</td><td class="n">${reais(taxaAbaixo)}</td></tr>`:''}
    <tr class="destaque"><td>Gasto até agora</td><td class="n">${cargas.length}</td><td class="n">${fmt(vol)}</td><td class="n pc">${reais(vol?gasto/vol:0)}</td><td class="n">${reais(gasto)}</td></tr></table></div>`;
  if(temValor){
    $('#custosConversa').innerHTML=`<p style="margin:0 0 8px;font-weight:600">Compra de ${dias[0]?.data.slice(0,5)||'—'} a ${dias[dias.length-1]?.data.slice(0,5)||'—'}: ${fmt(vol)} m³ em ${cargas.length} cargas</p>
    <div class="kpis" style="margin-bottom:6px">
      <div class="kpi"><div class="v">${reais(gasto)}</div><div class="l">Gasto até agora (concreto + excedente)</div></div>
      ${temRegra?`<div class="kpi"><div class="v">${reais(taxaAbaixo)}</div><div class="l">Excedente: ${abaixo.length} de ${cargas.length} cargas abaixo de ${fmt(regra.min)} m³ (faltaram ${fmt(m3Falta)} m³)</div></div>`:''}
      <div class="kpi"><div class="v">${reais(gasto/vol)}</div><div class="l">Quanto saiu o m³ (com o excedente)</div></div>
    </div>`;
    $('#custosObra').innerHTML=`<p class="leg" style="margin:10px 0 4px">Por fck (lido no pedido ou na mensagem de cada carga${semFck?`; ${semFck} carga(s) sem fck usaram o preço médio`:''}):</p>`+tabelaGasto();}
  // ---------- RESUMO (quadro no topo) ----------
  {const porDiaVol={};cargas.forEach(c=>{porDiaVol[c.chave]=(porDiaVol[c.chave]||0)+c.vol;});
   // excedente se cada dia fosse pedido em caminhões cheios (um caminhão não junta concreto de dias diferentes)
   const taxaIdeal=temRegra?Object.values(porDiaVol).reduce((s,v)=>s+(Math.ceil(v/regra.min)*regra.min-v)*regra.taxa,0):0;
   const economia=Math.max(0,taxaAbaixo-taxaIdeal),nfConf=cargas.filter(c=>c.alertaNF).map(c=>c.nf);
   const conferir=[naoAt.length&&`${naoAt.length} pedido(s) que não saíram`,nfConf.length&&`NF ${nfConf.join(', ')} fora da sequência`,temValor&&semFck&&`${semFck} carga(s) sem fck (usado o preço médio)`].filter(Boolean);
   $('#resumoObra').innerHTML=`<h2>Resumo</h2><ul>
     <li><b>${fmt(vol)} m³</b> em <b>${cargas.length} cargas</b> · ${diasConc.length} dias com concretagem (${dias[0]?.data.slice(0,5)||'—'} a ${dias[dias.length-1]?.data.slice(0,5)||'—'})</li>
     <li>Espera média <b>${duracao(media)}</b> · <b>${atras.length}</b> carga(s) acima de ${lim} min${maior?` · maior <b>${duracao(maior.espera)}</b> (${maior.data.slice(0,5)})`:''}</li>
     ${temValor?`<li>Gasto até agora <b>${reais(gasto)}</b> (${reais(gasto/vol)}/m³): concreto ${reais(valorConc)}${temRegra?` + excedente ${reais(taxaAbaixo)}`:''}</li>`:''}
     ${temRegra?`<li><b>${abaixo.length} de ${cargas.length}</b> cargas abaixo de ${fmt(regra.min)} m³.${economia>0?` Pedindo caminhões de ${fmt(regra.min)} m³, o excedente cairia para ${reais(taxaIdeal)}: <b>economia de ${reais(economia)}</b>.`:abaixo.length?' Cada dia já usou o mínimo de caminhões possível; o excedente vem do volume do dia não fechar em múltiplos de '+fmt(regra.min)+' m³.':''}</li>`:''}
     ${conferir.length?`<li>Conferir: ${conferir.join(' · ')}</li>`:''}
   </ul>`;
   $('#resumoObra').classList.remove('oculto');}
  $('#kpis').innerHTML=[
    [fmt(vol)+' m³','Concreto entregue'],[cargas.length,'Cargas (caminhões)'],[diasConc.length,'Dias com concretagem'],
    [duracao(media),'Espera média pedido → saída'],[atras.length,'Cargas com espera > '+lim+' min'],[maior?duracao(maior.espera):'—','Maior espera'+(maior?' ('+maior.data.slice(0,5)+')':'')],
    ...(temValor?[[reais(valorConc),`Valor do concreto (${fmt(vol)} m³ pelo fck de cada carga${semFck?`; ${semFck} sem fck: preço médio`:''})`]]:[]),
    ...(temRegra?[[reais(taxaAbaixo),`Excedente: ${fmt(m3Falta)} m³ faltantes em ${abaixo.length} carga(s) abaixo de ${fmt(regra.min)} m³`]]:[]),
    ...(temValor?[[reais(gasto),`Gasto até agora (concreto${temRegra?' + excedente':''})`],[reais(gasto/vol),`Valor médio do m³${temRegra?' com excedente':''}`]]:[])
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
    ...(abaixo.length?['',`CARGAS ABAIXO DE ${fmt(regra.min)} m³ (taxa do contrato)`,`• ${abaixo.length} carga(s), faltaram ${fmt(m3Falta)} m³ no total – taxa estimada ${reais(taxaAbaixo)}`]:[]),
    ...(temValor?['','GASTO ATÉ AGORA (preços do contrato)',
      ...porFck.map(g=>`• ${g.rotulo}: ${g.n} carga(s), ${fmt(g.vol)} m³ × ${reais(g.preco)} = ${reais(g.valor)}`),
      ...(temRegra?[`• Excedente: ${fmt(m3Falta)} m³ faltantes em ${abaixo.length} carga(s) abaixo de ${fmt(regra.min)} m³ × ${reais(regra.taxa)} = ${reais(taxaAbaixo)}`]:[]),
      `• TOTAL: ${reais(gasto)} (${reais(gasto/vol)} por m³)`]:[]),
    ...(alertasNF.length?['','CONFERIR',...alertasNF.map(c=>`• NF ${c.nf} (${c.data.slice(0,5)}, ${c.ordem}ª carga) fora da sequência – possível erro de digitação`)]:[]),
  ].join('\n');

  const porDiaMax=Math.max(1,...diasConc.map(d=>d.cargas.reduce((s,c)=>s+c.vol,0)));
  $('#a-resumo').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
      <div><h2>Resumo pronto para enviar</h2><pre class="resumo" id="txtResumo">${esc(resumo)}</pre>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button id="copiar">Copiar texto</button><span id="okc" class="leg"></span></div></div>
      <div><h2>m³ por dia</h2><div class="barras">${diasConc.map(d=>{const v=d.cargas.reduce((s,c)=>s+c.vol,0);
        return `<div class="br"><span>${d.data.slice(0,5)} ${semana(d.chave)}</span><div class="f" style="width:${v/porDiaMax*100}%"></div><span>${fmt(v)} m³</span></div>`}).join('')}</div>
      ${temValor?`<h2 style="margin-top:20px">Gasto até agora</h2>${tabelaGasto()}`:''}
      <h2 style="margin-top:20px">Quem mais falou no grupo</h2>
      <table>${Object.entries(R.participantes).sort((a,b)=>b[1]-a[1]).map(([q,n])=>`<tr><td>${esc(q)} ${termos.some(t=>q.toLowerCase().includes(t.toLowerCase()))?'<span class="tag t-mut">obra</span>':''}</td><td class="n">${n}</td></tr>`).join('')}</table></div>
    </div>`;
  $('#copiar').onclick=async()=>{try{await navigator.clipboard.writeText(resumo);$('#okc').textContent='Copiado ✓'}catch(e){const r=document.createRange();r.selectNode($('#txtResumo'));getSelection().removeAllRanges();getSelection().addRange(r);$('#okc').textContent='Texto selecionado — use Ctrl+C'}};

  // ---------- POR DIA ----------
  $('#a-dias').innerHTML=`<div class="scroll"><table><tr><th>Dia</th><th class="n">Cargas</th><th class="n">m³</th><th class="n pc">1º pedido</th><th class="n pc">1ª saída</th><th class="n pc">Última saída</th><th class="n">Espera média</th><th class="n">Maior espera</th><th class="pc">Observação</th></tr>
    ${dias.map(d=>{const v=d.cargas.reduce((s,c)=>s+c.vol,0);const e=d.cargas.filter(c=>c.espera!=null);
      const m=e.length?Math.round(e.reduce((s,c)=>s+c.espera,0)/e.length):null;const mx=e.length?Math.max(...e.map(c=>c.espera)):null;
      const ped=pedidos.filter(p=>p.chave===d.chave);
      const obs=[...d.cancel.map(c=>c.texto.split('\n').filter(l=>l.trim()).pop()),...d.ocorr.filter(o=>/chuv|chov|molhad|atras|dif[ií]cil|problema/i.test(o.texto)&&!d.cancel.some(c=>c.texto===o.texto)).map(o=>o.texto.split('\n').find(l=>/chuv|chov|molhad|atras|dif[ií]cil|problema/i.test(l))||o.texto)].slice(0,2).map(t=>esc(t.slice(0,80))).join('<br>');
      if(!d.cargas.length&&!obs)return '';
      return `<tr><td>${d.data.slice(0,5)} <span class="leg">${semana(d.chave)}</span></td><td class="n">${d.cargas.length||'—'}</td><td class="n">${v?fmt(v):'—'}</td>
      <td class="n pc">${ped[0]?ped[0].hora:'—'}</td><td class="n pc">${d.cargas[0]?hhmm(d.cargas[0].saida):'—'}</td><td class="n pc">${d.cargas.length?hhmm(d.cargas[d.cargas.length-1].saida):'—'}</td>
      <td class="n">${duracao(m)}</td><td class="n">${mx!=null?`<span class="tag ${mx>lim?'t-bad':'t-ok'}">${duracao(mx)}</span>`:'—'}</td><td class="pc" style="font-size:12px">${obs}</td></tr>`}).join('')}</table></div>`;

  // ---------- CARGAS ----------
  $('#a-cargas').innerHTML=`<div class="scroll"><table><tr><th>Dia</th><th class="n">Nº</th><th class="n">fck</th><th class="n">m³</th><th class="pc">BT</th><th class="pc">NF</th><th class="n pc">Pedido</th><th class="n">Saída</th><th class="n">Espera</th></tr>
    ${cargas.map(c=>`<tr><td>${c.data.slice(0,5)}</td><td class="n">${c.ordem}ª</td><td class="n">${c.fck||'—'}</td><td class="n">${fmt(c.vol)}${c.volPedido&&c.volPedido!==c.vol?` <span class="tag t-warn">pedido ${fmt(c.volPedido)}</span>`:''}${temRegra&&c.vol<regra.min?` <span class="tag t-bad" title="Abaixo da carga mínima do contrato">falta ${fmt(regra.min-c.vol)}</span>`:''}</td><td class="pc">${esc(c.bt)}</td>
    <td class="pc">${esc(c.nf)}${c.alertaNF?' <span class="tag t-warn">conferir</span>':''}</td><td class="n pc">${hhmm(c.pedido)}</td><td class="n">${hhmm(c.saida)}</td>
    <td class="n">${c.espera==null?'—':`<span class="tag ${c.espera>lim?'t-bad':c.espera>lim*0.75?'t-warn':'t-ok'}">${duracao(c.espera)}</span>`}</td></tr>`).join('')}
    <tr><th colspan="3">Total</th><th class="n">${fmt(vol)}</th><th colspan="5">${cargas.length} cargas</th></tr></table></div>
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
// Depois que tem conversa carregada, o quadro "Arraste aqui" fica recolhido (abre em "Trocar conversa, datas e filtros").
function recolherImportar(){if(!TEXTO)return;$('#importarTit').classList.remove('oculto');$('#importar').open=false;}
(async()=>{try{
  // migração: quem tinha só uma conversa guardada (versões antigas) passa a ter essa conversa como uma obra
  const velha=await Guarda.ler();
  if(velha&&velha.texto){await Guarda.salvarObra({texto:velha.texto,nome:velha.nome||'Obra sem nome',audios:velha.audios||{}});await Guarda.apagarAntiga();}
  const nomes=await Guarda.listarObras();let atual=await Guarda.lerAtual();if(!nomes.includes(atual))atual=nomes[0];
  if(atual){const d=await Guarda.lerObra(atual);if(d){TEXTO=d.texto;NOME=d.nome;AUDIOS=d.audios||{};$('#apagar').classList.remove('oculto');recolherImportar();}}
  montarSeletor(nomes,atual);
  TRANSC=(await Guarda.lerTranscricoes())||{};
}catch(e){}})().finally(()=>{render();pegarCompartilhado().catch(e=>{$('#nomeGrupo').textContent='Não consegui ler o arquivo compartilhado: '+e.message;});});
