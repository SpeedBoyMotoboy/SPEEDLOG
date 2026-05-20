'use strict';

const CFG_KEY  = 'sl_cfg';
const DATA_KEY = 'sl_data';

const SM = {
  recebido:  { label:'Recebido',   icon:'📥', next:'separacao',  nxt:'Iniciar Separação' },
  separacao: { label:'Separação', icon:'🔍', next:'expedicao',  nxt:'Marcar Expedição' },
  expedicao: { label:'Expedição', icon:'📦', next:'finalizado', nxt:'Despachar ✅' },
  finalizado:{ label:'Despachado', icon:'✅',         next:null,         nxt:null }
};
const SO = ['recebido','separacao','expedicao','finalizado'];

const SQL = `CREATE TABLE IF NOT EXISTS pedidos (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  numero_venda   TEXT,
  codigo_produto TEXT,
  etiqueta_ml    TEXT,
  nome_cliente   TEXT,
  nome_produto   TEXT,
  marca          TEXT,
  quantidade     TEXT,
  data_despacho  TEXT,
  status         TEXT        DEFAULT 'recebido',
  observacoes    TEXT
);`;

let ST = { sb:null, pedidos:[], fStatus:null, fSearch:'' };
let qrScanner = null;

// ─ HELPERS ───────────────────────────────────────────
function $$(id){ return document.getElementById(id); }
function esc(s){ if(!s&&s!==0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function today(){ return new Date().toISOString().slice(0,10); }
function uid(){ return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)); }

function prazoStatus(data_despacho){
  if(!data_despacho) return null;
  const t=today(), d=data_despacho.slice(0,10);
  if(d < t) return 'atrasado';
  if(d === t) return 'hoje';
  return null;
}

function fmtDate(s){
  if(!s) return '';
  try{ return new Date(s+'T12:00:00').toLocaleDateString('pt-BR'); }catch{ return s; }
}

// ─ STORAGE ──────────────────────────────────────────
function loadData(){ try{ ST.pedidos=JSON.parse(localStorage.getItem(DATA_KEY)||'[]'); }catch{ ST.pedidos=[]; } }
function saveData(){ localStorage.setItem(DATA_KEY,JSON.stringify(ST.pedidos)); }
function getConfig(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY)||'null'); }catch{ return null; } }
function saveConfig(c){ localStorage.setItem(CFG_KEY,JSON.stringify(c)); }

// ─ SUPABASE ─────────────────────────────────────────
function initSB(){ const c=getConfig(); if(!c?.url||!c?.key){ST.sb=null;return;} try{ST.sb=window.supabase.createClient(c.url,c.key);}catch{ST.sb=null;} }
async function syncSB(){ if(!ST.sb) return; try{ const {data,error}=await ST.sb.from('pedidos').select('*').order('created_at',{ascending:false}); if(error)throw error; ST.pedidos=data||[]; saveData(); }catch(e){toast('Sync: '+e.message,'err');} }
async function pushSB(p){ if(!ST.sb)return; try{await ST.sb.from('pedidos').upsert([p]);}catch{} }
async function delSB(id){ if(!ST.sb)return; try{await ST.sb.from('pedidos').delete().eq('id',id);}catch{} }

// ─ CRUD ───────────────────────────────────────────────
function createPedido(data){
  const p={...data,id:uid(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),status:data.status||'recebido'};
  ST.pedidos.unshift(p); saveData(); pushSB(p); return p;
}
function getPedido(id){ return ST.pedidos.find(p=>p.id===id)||null; }
function updatePedido(id,u){ const i=ST.pedidos.findIndex(p=>p.id===id); if(i<0)return null; ST.pedidos[i]={...ST.pedidos[i],...u,updated_at:new Date().toISOString()}; saveData(); pushSB(ST.pedidos[i]); return ST.pedidos[i]; }
function deletePedido(id){ ST.pedidos=ST.pedidos.filter(p=>p.id!==id); saveData(); delSB(id); }

// ─ ALERTS LOGIC ────────────────────────────────────────
function getAlerts(){
  const ativos=ST.pedidos.filter(p=>p.status!=='finalizado');
  const atrasados=ativos.filter(p=>prazoStatus(p.data_despacho)==='atrasado');
  const hoje_lst=ativos.filter(p=>prazoStatus(p.data_despacho)==='hoje');
  // duplicates: same numero_venda, 2+ orders active
  const vendaMap={};
  ST.pedidos.forEach(p=>{ if(p.numero_venda){ if(!vendaMap[p.numero_venda])vendaMap[p.numero_venda]=[]; vendaMap[p.numero_venda].push(p); } });
  const duplicados=Object.values(vendaMap).filter(arr=>arr.length>1).flat();
  // parados: recebido > 3 days
  const cutoff=new Date(Date.now()-3*86400000).toISOString();
  const parados=ST.pedidos.filter(p=>p.status==='recebido'&&p.created_at<cutoff);
  return {atrasados,hoje:hoje_lst,duplicados,parados,total:atrasados.length+hoje_lst.length+duplicados.length+parados.length};
}

// ─ SCANNER ─────────────────────────────────────────────
function stopScanner(){
  if(qrScanner){ try{ qrScanner.stop().catch(()=>{}); }catch{} qrScanner=null; }
}

function startScanner(){
  stopScanner();
  const reader=$$('reader');
  if(!reader||!window.Html5Qrcode) return;
  qrScanner=new Html5Qrcode('reader');
  qrScanner.start(
    {facingMode:'environment'},
    {fps:10,qrbox:{width:260,height:120},supportedScanTypes:[Html5QrcodeScanType.SCAN_TYPE_CAMERA]},
    (code)=>{
      stopScanner();
      onCodeFound(code);
    },
    ()=>{}
  ).catch(()=>{
    const a=$$('scan-status');
    if(a) a.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Permita acesso à câmera</h3><p>Toque no ícone de câmera na barra de endereço e autorize.</p></div>';
  });
}

function onCodeFound(code){
  const r=$$('scan-result');
  if(!r) return;
  const matches=ST.pedidos.filter(p=>p.codigo_produto&&p.codigo_produto.trim().toUpperCase()===code.trim().toUpperCase());
  r.innerHTML=`
    <div class="scan-result">
      <div class="scan-code">
        <span style="font-size:1.4rem">🔍</span>
        <span class="scan-code-val">${esc(code)}</span>
        <button class="btn btn-n" style="font-size:.8rem;padding:.4rem .8rem;min-height:36px" onclick="restartScan()">Nova bipagem</button>
      </div>
      <div class="scan-matches">
        ${matches.length===0
          ?`<div class="no-match">❌ Código <strong>${esc(code)}</strong> não encontrado.<br><a href="#/novo" style="color:var(--blue);font-weight:600">+ Cadastrar novo pedido</a></div>`
          :matches.map(p=>{
            const s=SM[p.status]||SM.recebido;
            const ps=prazoStatus(p.data_despacho);
            return `<a href="#/pedido/${p.id}" class="order-card ${p.status}" style="margin:0">
              <div class="oc-hdr">
                <span class="oc-ttl">${esc(p.nome_cliente||'Cliente não informado')}</span>
                <span class="badge ${p.status}">${s.icon} ${s.label}</span>
              </div>
              <div class="oc-meta">
                ${p.numero_venda?`<span class="meta">🏷 <strong>${esc(p.numero_venda)}</strong></span>`:''}
                ${p.nome_produto?`<span class="meta">${esc(p.nome_produto)}</span>`:''}
                ${ps==='atrasado'?`<span class="meta danger">⏰ ATRASADO</span>`:''}
                ${ps==='hoje'?`<span class="meta warn">⚠️ DESPACHAR HOJE</span>`:''}
              </div>
            </a>`;
          }).join('')
        }
      </div>
    </div>`;
}

function restartScan(){
  const r=$$('scan-result'); if(r) r.innerHTML='';
  startScanner();
}

// ─ ROUTER ───────────────────────────────────────────────
function routeParse(){
  const h=location.hash.slice(1)||'/';
  const p=h.split('/').filter(Boolean);
  if(!p.length) return {page:'home',params:{}};
  if(p[0]==='pedidos') return {page:'pedidos',params:{}};
  if(p[0]==='novo')    return {page:'novo',params:{}};
  if(p[0]==='editar'&&p[1]) return {page:'editar',params:{id:p[1]}};
  if(p[0]==='pedido'&&p[1]) return {page:'detalhe',params:{id:p[1]}};
  if(p[0]==='bipar')   return {page:'bipar',params:{}};
  if(p[0]==='alertas') return {page:'alertas',params:{}};
  if(p[0]==='config')  return {page:'config',params:{}};
  return {page:'home',params:{}};
}

async function go(){
  stopScanner();
  const {page,params}=routeParse();
  const main=$$('app-main'), back=$$('btn-back'), ttl=$$('page-title'), acts=$$('header-actions');

  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active', el.dataset.page===page||(page==='detalhe'&&el.dataset.page==='pedidos')||(page==='editar'&&el.dataset.page==='pedidos'));
  });

  acts.innerHTML=''; back.classList.add('hidden'); back.onclick=null;
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';

  // Alert badge on nav
  const alrts=getAlerts();
  const alrtNav=document.querySelector('[data-page=alertas]');
  if(alrtNav){
    let badge=alrtNav.querySelector('.alert-badge');
    if(alrts.total>0){
      if(!badge){ badge=document.createElement('span'); badge.className='alert-badge'; alrtNav.style.position='relative'; alrtNav.appendChild(badge); }
      badge.textContent=alrts.total>9?'9+':alrts.total;
    } else if(badge){ badge.remove(); }
  }

  if(page==='home')     { ttl.textContent='SpeedLog'; await pgHome(main); }
  else if(page==='pedidos'){ ttl.textContent='Pedidos'; pgPedidos(main); }
  else if(page==='novo'){    ttl.textContent='Novo Pedido'; back.classList.remove('hidden'); back.onclick=()=>history.back(); pgNovo(main); }
  else if(page==='editar'){  ttl.textContent='Editar'; back.classList.remove('hidden'); back.onclick=()=>history.back(); pgEditar(main,params.id); }
  else if(page==='detalhe'){
    ttl.textContent='Pedido'; back.classList.remove('hidden'); back.onclick=()=>history.back();
    acts.innerHTML=`<a href="#/editar/${params.id}" class="btn-icon" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></a><button class="btn-icon" onclick="confirmDel('${params.id}')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>`;
    pgDetalhe(main,params.id);
  }
  else if(page==='bipar'){   ttl.textContent='Bipar Produto'; pgBipar(main); }
  else if(page==='alertas'){ ttl.textContent='Alertas'; pgAlertas(main); }
  else if(page==='config'){  ttl.textContent='Configurações'; pgConfig(main); }
}

// ─ HOME ────────────────────────────────────────────────
async function pgHome(main){
  if(ST.sb) await syncSB();
  const c={recebido:0,separacao:0,expedicao:0,finalizado:0};
  ST.pedidos.forEach(p=>{if(c[p.status]!==undefined)c[p.status]++;});
  const urgent=ST.pedidos.filter(p=>p.status!=='finalizado').slice(0,6);
  const alrts=getAlerts();

  main.innerHTML=`<div class="page">
    <div class="stats-grid">
      <div class="stat-card s-rec"><span class="stat-ico">📥</span><span class="stat-num">${c.recebido}</span><span class="stat-lbl">Recebidos</span></div>
      <div class="stat-card s-sep"><span class="stat-ico">🔍</span><span class="stat-num">${c.separacao}</span><span class="stat-lbl">Separação</span></div>
      <div class="stat-card s-exp"><span class="stat-ico">📦</span><span class="stat-num">${c.expedicao}</span><span class="stat-lbl">Expedição</span></div>
      <div class="stat-card s-fin"><span class="stat-ico">✅</span><span class="stat-num">${c.finalizado}</span><span class="stat-lbl">Despachados</span></div>
    </div>
    ${alrts.total>0?`
      <a href="#/alertas" style="background:#fef2f2;border-radius:var(--r);padding:1rem;display:flex;align-items:center;gap:.75rem;text-decoration:none;border:1.5px solid #fecaca">
        <span style="font-size:1.5rem">⚠️</span>
        <div style="flex:1"><span style="font-weight:700;color:#b91c1c;font-size:.95rem">${alrts.total} alerta${alrts.total>1?'s':''}</span><br><span style="font-size:.8rem;color:#6b7280">${alrts.atrasados.length} atrasado${alrts.atrasados.length!==1?'s':''} • ${alrts.hoje.length} hoje • ${alrts.duplicados.length} duplicado${alrts.duplicados.length!==1?'s':''}</span></div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#b91c1c" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </a>`:''}
    ${urgent.length?`
      <div>
        <div class="sec-hdr"><span class="sec-ttl">Pendentes</span><a href="#/pedidos" style="font-size:.8rem;color:var(--blue);font-weight:600">Ver todos →</a></div>
        <div style="display:flex;flex-direction:column;gap:.75rem">${urgent.map(orderCard).join('')}</div>
      </div>`
    :`<div class="empty"><span class="empty-ico">🎉</span><h3>Tudo em dia!</h3><p>Nenhum pedido pendente.</p></div>`}
    ${ST.pedidos.length===0?`
      <div style="background:var(--blue);border-radius:var(--r);padding:1.25rem;color:#fff;text-align:center">
        <div style="font-size:1.8rem;margin-bottom:.5rem">🚚</div>
        <p style="font-size:.9rem;opacity:.9;margin-bottom:1rem">Toque em 🔍 para bipar ou em <strong>+</strong> para cadastrar um pedido!</p>
        <a href="#/novo" class="btn btn-o btn-bl">+ Novo Pedido</a>
      </div>`:''}
  </div>`;
}

// ─ PEDIDOS ──────────────────────────────────────────────
function pgPedidos(main){
  main.innerHTML=`<div class="page">
    <div class="search-wrap">
      <svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
      <input type="search" id="si" placeholder="Nome, nº venda, código, etiqueta..." value="${esc(ST.fSearch)}" oninput="doSearch(this.value)" autocomplete="off">
    </div>
    <div class="chips">
      <span class="chip ${!ST.fStatus?'on':''}" onclick="fSt(null)">Todos</span>
      ${SO.map(s=>`<span class="chip ${ST.fStatus===s?'on '+s:''}" onclick="fSt('${s}')">${SM[s].icon} ${SM[s].label}</span>`).join('')}
    </div>
    <div id="lst"></div>
  </div>`;
  renderList();
}

function renderList(){
  const el=$$('lst'); if(!el) return;
  let d=[...ST.pedidos];
  if(ST.fStatus) d=d.filter(p=>p.status===ST.fStatus);
  if(ST.fSearch){ const q=ST.fSearch.toLowerCase(); d=d.filter(p=>[p.nome_cliente,p.codigo_produto,p.numero_venda,p.etiqueta_ml,p.nome_produto,p.marca].some(v=>v&&v.toLowerCase().includes(q))); }
  if(!d.length){ el.innerHTML=`<div class="empty"><span class="empty-ico">🔍</span><h3>Nenhum pedido encontrado</h3></div>`; return; }
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:.75rem">${d.map(orderCard).join('')}</div>`;
}

function orderCard(p){
  const s=SM[p.status]||SM.recebido;
  const ps=prazoStatus(p.data_despacho);
  const dt=p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'';
  const isAtrasado=ps==='atrasado'&&p.status!=='finalizado';
  return `<a href="#/pedido/${p.id}" class="order-card ${isAtrasado?'atrasado':p.status}">
    <div class="oc-hdr">
      <span class="oc-ttl">${esc(p.nome_cliente||'Cliente não informado')}</span>
      <span class="badge ${p.status}">${s.icon} ${s.label}</span>
    </div>
    <div class="oc-meta">
      ${p.numero_venda?`<span class="meta">🏷 <strong>${esc(p.numero_venda)}</strong></span>`:''}
      ${p.codigo_produto?`<span class="meta">📊 ${esc(p.codigo_produto)}</span>`:''}
      ${p.nome_produto?`<span class="meta">${esc(p.nome_produto)}${p.marca?' — '+esc(p.marca):''}</span>`:''}
      ${p.quantidade?`<span class="meta">Qtd: ${esc(p.quantidade)}</span>`:''}
      ${p.data_despacho&&p.status!=='finalizado'?`<span class="meta ${isAtrasado?'danger':ps==='hoje'?'warn':''}">Prazo: ${fmtDate(p.data_despacho)}${isAtrasado?' ⏰':ps==='hoje?' ⚠️':''}</span>`:''}
      ${dt?`<span class="meta">📅 ${dt}</span>`:''}
    </div>
  </a>`;
}

// ─ BIPAR ───────────────────────────────────────────────
function pgBipar(main){
  main.innerHTML=`<div class="page">
    <div class="scan-area">
      <div id="reader"></div>
      <div class="scan-laser"></div>
    </div>
    <div class="scan-hint">📷 Aponte para o código de barras do produto</div>
    <div id="scan-status"></div>
    <div id="scan-result"></div>
    <div style="background:var(--card);border-radius:var(--r);padding:1rem;box-shadow:var(--sh)">
      <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Ou digite o código manualmente</div>
      <div style="display:flex;gap:.5rem">
        <input class="fc" id="manual-code" type="text" placeholder="Ex: KTB759" style="flex:1;text-transform:uppercase">
        <button class="btn btn-p" onclick="manualCode()">Buscar</button>
      </div>
    </div>
  </div>`;
  setTimeout(startScanner, 100);
}

function manualCode(){
  const code=$$('manual-code')?.value.trim().toUpperCase();
  if(!code){ toast('Digite um código','err'); return; }
  stopScanner();
  onCodeFound(code);
}

// ─ ALERTAS ─────────────────────────────────────────────
function pgAlertas(main){
  const {atrasados,hoje,duplicados,parados}=getAlerts();
  const section=(title,cls,items,emptyMsg)=>{
    if(!items.length) return '';
    return `<div class="alert-group">
      <div class="alert-group-ttl ${cls}">${title} <span style="background:currentColor;color:#fff;border-radius:20px;padding:1px 8px;font-size:.65rem">${items.length}</span></div>
      ${items.map(orderCard).join('')}
    </div>`;
  };
  const total=atrasados.length+hoje.length+duplicados.length+parados.length;
  main.innerHTML=`<div class="page">
    ${total===0?`<div class="empty"><span class="empty-ico">✅</span><h3>Nenhum alerta!</h3><p>Todos os pedidos estão em dia.</p></div>`:''}
    ${section('⏰ Atrasados — prazo vencido','red',atrasados)}
    ${section('⚠️ Despachar hoje','yellow',hoje)}
    ${section('⚠️ Possíveis duplicatas','yellow',duplicados)}
    ${section('🕗 Parados há mais de 3 dias','blue',parados)}
  </div>`;
}

// ─ DETALHE ──────────────────────────────────────────────
function pgDetalhe(main,id){
  const p=getPedido(id);
  if(!p){ main.innerHTML=`<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Pedido não encontrado</h3></div></div>`; return; }
  const s=SM[p.status]||SM.recebido;
  const ci=SO.indexOf(p.status);
  const ps=prazoStatus(p.data_despacho);

  // Duplicate check
  const dupes=p.numero_venda?ST.pedidos.filter(x=>x.numero_venda===p.numero_venda&&x.id!==p.id):[];

  main.innerHTML=`<div class="page">
    ${ps==='atrasado'&&p.status!=='finalizado'?`<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:var(--r);padding:.75rem 1rem;color:#b91c1c;font-weight:700;display:flex;align-items:center;gap:.5rem">⏰ PRAZO VENCIDO — ${fmtDate(p.data_despacho)}</div>`:''}
    ${ps==='hoje'&&p.status!=='finalizado'?`<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--r);padding:.75rem 1rem;color:#856404;font-weight:700;display:flex;align-items:center;gap:.5rem">⚠️ DESPACHAR HOJE!</div>`:''}
    ${dupes.length?`<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--r);padding:.75rem 1rem;color:#856404;font-size:.875rem">⚠️ Esta venda aparece em ${dupes.length+1} pedido(s). Pode ser duplicata.</div>`:''}
    <div class="sprog">
      ${SO.map((st,i)=>{ const cl=i<ci?'done':(i===ci?'active':''); return `<div class="pstep ${cl}"><div class="pdot">${i<ci?'✓':(i+1)}</div><span class="plbl">${SM[st].label}</span></div>`; }).join('')}
    </div>
    <div class="dcard">
      <div class="fb">
        <h2 style="font-size:1.1rem;font-weight:800;flex:1;padding-right:.5rem">${esc(p.nome_cliente||'Cliente não informado')}</h2>
        <span class="badge ${p.status}">${s.icon} ${s.label}</span>
      </div>
      <div class="dg">
        ${df('Nº Venda ML',p.numero_venda)}
        ${df('Cód. Produto',p.codigo_produto)}
        ${df('Etiqueta ML',p.etiqueta_ml)}
        ${df('Produto',p.nome_produto)}
        ${df('Marca',p.marca)}
        ${df('Quantidade',p.quantidade)}
        ${p.data_despacho?`<div class="df"><span class="dl">Prazo Despacho</span><span class="dv" style="color:${ps==='atrasado'?'var(--red)':ps==='hoje'?'#856404':'inherit'}">${fmtDate(p.data_despacho)}${ps==='atrasado'?' ⏰':ps==='hoje'?' ⚠️':''}</span></div>`:''}
        ${df('Cadastrado',p.created_at?new Date(p.created_at).toLocaleString('pt-BR'):'')}
      </div>
      ${p.observacoes?`<div class="df"><span class="dl">Observações</span><span class="dv">${esc(p.observacoes)}</span></div>`:''}
    </div>
    ${s.next?`<button class="act-btn ${s.next}" onclick="advance('${p.id}','${s.next}')">
      <div class="act-ico ${s.next}">${SM[s.next].icon}</div>
      <div style="flex:1"><div style="font-weight:800;font-size:.95rem">${s.nxt}</div><div style="font-size:.75rem;color:var(--muted);margin-top:2px">→ ${SM[s.next].label}</div></div>
      <svg style="opacity:.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
    </button>`
    :`<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700;font-size:1rem">✅ Pedido Despachado</div>`}
  </div>`;
}

function df(l,v){ if(!v&&v!==0) return ''; return `<div class="df"><span class="dl">${l}</span><span class="dv">${esc(String(v))}</span></div>`; }

// ─ NOVO ────────────────────────────────────────────────
function pgNovo(main){
  main.innerHTML=`<div class="page">
    <div class="wbox">
      <div class="wbox-hdr">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        Colar texto do WhatsApp
      </div>
      <p class="muted sm" style="margin-bottom:.5rem">Cole o texto enviado pelo grupo (VENDA / CLIENTE / PRODUTO / CÓDIGO / QUANTIDADE)</p>
      <textarea class="fc" id="wt" rows="5" placeholder="VENDA: 2000001296772996&#10;CLIENTE: João Silva&#10;PRODUTO: Kit Correia Dentada&#10;CÓDIGO: KTB759&#10;QUANTIDADE: 1 KIT"></textarea>
      <button class="btn btn-n btn-bl mt" onclick="parseWpp()">🔍 Interpretar e preencher</button>
    </div>
    <div class="dcard">
      <span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Dados do Pedido</span>
      ${buildForm()}
      <button class="btn btn-p btn-bl mt2" onclick="saveNovo()">💾 Salvar Pedido</button>
    </div>
  </div>`;
}

// ─ EDITAR ──────────────────────────────────────────────
function pgEditar(main,id){
  const p=getPedido(id);
  if(!p){ main.innerHTML=`<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>`; return; }
  main.innerHTML=`<div class="page"><div class="dcard">${buildForm(p)}<button class="btn btn-p btn-bl mt2" onclick="saveEditar('${id}')">💾 Salvar Alterações</button></div></div>`;
}

function buildForm(p={}){
  const opts=SO.map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${SM[s].label}</option>`).join('');
  return `
    <div class="fg"><label class="fl">Cliente *</label><input class="fc" id="fn" type="text" placeholder="Ex: Amarildo da Conceição" value="${esc(p.nome_cliente||'')}"></div>
    <div class="g2">
      <div class="fg"><label class="fl">Nº Venda ML</label><input class="fc" id="fv" type="text" placeholder="2000001296..." value="${esc(p.numero_venda||'')}"></div>
      <div class="fg"><label class="fl">Etiqueta ML</label><input class="fc" id="fe" type="text" placeholder="BR0001..." value="${esc(p.etiqueta_ml||'')}"></div>
    </div>
    <div class="g2">
      <div class="fg"><label class="fl">Cód. Produto 📊</label><input class="fc" id="fc2" type="text" placeholder="Ex: KTB759" value="${esc(p.codigo_produto||'')}" style="text-transform:uppercase"></div>
      <div class="fg"><label class="fl">Quantidade</label><input class="fc" id="fq" type="text" placeholder="Ex: 1 KIT" value="${esc(p.quantidade||'')}"></div>
    </div>
    <div class="fg"><label class="fl">Nome do Produto</label><input class="fc" id="fp" type="text" placeholder="Ex: Kit Correia Dentada Jeep" value="${esc(p.nome_produto||'')}"></div>
    <div class="g2">
      <div class="fg"><label class="fl">Marca</label><input class="fc" id="fm" type="text" placeholder="Ex: Gates" value="${esc(p.marca||'')}"></div>
      <div class="fg"><label class="fl">Prazo Despacho</label><input class="fc" id="fd" type="date" value="${esc(p.data_despacho||'')}"></div>
    </div>
    <div class="fg"><label class="fl">Status</label><select class="fc" id="fs">${opts}</select></div>
    <div class="fg"><label class="fl">Observações</label><textarea class="fc" id="fo" placeholder="Notas...">${esc(p.observacoes||'')}</textarea></div>`;
}

// ─ CONFIG ─────────────────────────────────────────────
function pgConfig(main){
  const cfg=getConfig()||{}, n=ST.pedidos.length;
  main.innerHTML=`<div class="page">
    <div class="csec">
      <div class="csec-ttl">☁️ Supabase (sincronização — opcional)</div>
      <p class="muted sm" style="margin-bottom:.75rem">Use em vários celulares. Crie um projeto gratuito em supabase.com.</p>
      <div class="fg"><label class="fl">URL do Projeto</label><input class="fc" id="cu" type="url" placeholder="https://xxxxx.supabase.co" value="${esc(cfg.url||'')}"></div>
      <div class="fg mt"><label class="fl">Anon Key</label><input class="fc" id="ck" type="text" placeholder="eyJhbGci..." value="${esc(cfg.key||'')}"></div>
      <div style="display:flex;gap:.75rem;margin-top:1rem">
        <button class="btn btn-p" onclick="saveCfg()" style="flex:1">💾 Salvar</button>
        <button class="btn btn-n" onclick="testCfg()">🔌 Testar</button>
      </div>
      <div id="cst" class="mt sm"></div>
    </div>
    <div class="csec">
      <div class="csec-ttl">📋 SQL — criar tabela no Supabase</div>
      <textarea class="fc" readonly rows="14" style="font-family:monospace;font-size:.72rem;background:#f8fafc">${esc(SQL)}</textarea>
      <button class="btn btn-n btn-bl mt" onclick="copySql()">📋 Copiar SQL</button>
    </div>
    <div class="csec">
      <div class="csec-ttl">📊 Dados locais (${n} pedido${n!==1?'s':''})</div>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-n" style="flex:1" onclick="exportData()">⬇️ Exportar JSON</button>
        <button class="btn btn-d" style="flex:1" onclick="confirmClear()">🗑️ Limpar tudo</button>
      </div>
    </div>
  </div>`;
}

// ─ ACTIONS ──────────────────────────────────────────────
function formData(){
  const v=id=>$$( id)?.value?.trim()||null;
  return { nome_cliente:v('fn'), numero_venda:v('fv'), etiqueta_ml:v('fe'), codigo_produto:v('fc2')?.toUpperCase()||null, nome_produto:v('fp'), marca:v('fm'), quantidade:v('fq'), data_despacho:v('fd'), status:$$('fs')?.value||'recebido', observacoes:v('fo') };
}

function saveNovo(){
  const d=formData();
  if(!d.nome_cliente){ toast('Informe o nome do cliente','err'); return; }
  // duplicate check
  if(d.numero_venda){
    const dup=ST.pedidos.find(p=>p.numero_venda===d.numero_venda);
    if(dup){ toast('⚠️ Venda '+d.numero_venda+' já existe!','warn'); }
  }
  const p=createPedido(d);
  toast('Pedido salvo! ✅','ok');
  location.hash='#/pedido/'+p.id;
}

function saveEditar(id){
  const d=formData();
  if(!d.nome_cliente){ toast('Informe o nome do cliente','err'); return; }
  updatePedido(id,d);
  toast('Atualizado! ✅','ok');
  location.hash='#/pedido/'+id;
}

function advance(id,nxt){
  updatePedido(id,{status:nxt});
  toast(SM[nxt].icon+' '+SM[nxt].label,'ok');
  go();
}

function confirmDel(id){
  modal(`<div class="modal"><div class="modal-ttl">⚠️ Excluir pedido?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="doDel('${id}')">Excluir</button></div></div>`);
}

function doDel(id){ closeModal(); deletePedido(id); toast('Excluído','ok'); location.hash='#/pedidos'; }
function confirmClear(){ modal(`<div class="modal"><div class="modal-ttl">⚠️ Limpar tudo?</div><div class="modal-txt">Apagará TODOS os ${ST.pedidos.length} pedidos localmente.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="doClear()">Limpar</button></div></div>`); }
function doClear(){ closeModal(); ST.pedidos=[]; saveData(); toast('Apagado','ok'); location.hash='#/'; }

function doSearch(v){ ST.fSearch=v; renderList(); }
function fSt(v){ ST.fStatus=v; pgPedidos($$('app-main')); }

// WhatsApp parser — formato exato: VENDA / CLIENTE / PRODUTO / CÓDIGO / QUANTIDADE
function parseWpp(){
  const txt=$$('wt')?.value||'';
  if(!txt.trim()){ toast('Cole o texto primeiro','err'); return; }
  const extract=(pats,t)=>{ for(const p of pats){ const m=t.match(p); if(m&&m[1]) return m[1].trim(); } return null; };
  const pairs=[
    ['fn',  [/^CLIENTE[:\s]+(.+)/im, /CLIENTE[:\s]+([^\n]+)/i, /nome[:\s]+([^\n]+)/i]],
    ['fv',  [/^VENDA[:\s]+(.+)/im,   /VENDA[:\s]+([^\n]+)/i,   /número[:\s]+([^\n]+)/i]],
    ['fc2', [/^C[ÓO]DIGO[:\s]+(.+)/im, /C[ÓO]DIGO[:\s]+([^\n]+)/i, /\bSKU[:\s]+([^\n]+)/i]],
    ['fp',  [/^PRODUTO[:\s]+(.+)/im, /PRODUTO[:\s]+([^\n]+)/i, /item[:\s]+([^\n]+)/i]],
    ['fm',  [/^MARCA[:\s]+(.+)/im,   /MARCA[:\s]+([^\n]+)/i]],
    ['fq',  [/^QUANTIDADE[:\s]+(.+)/im, /QUANTIDADE[:\s]+([^\n]+)/i, /qtd[:\s]+([^\n]+)/i]],
    ['fe',  [/etiqueta[:\s]+([^\n]+)/i, /\b((?:ML|BR)[0-9A-Z]{8,})\b/i]],
  ];
  let n=0;
  for(const [id,pats] of pairs){
    const val=extract(pats,txt);
    if(val){ const el=$$(id); if(el){ el.value=id==='fc2'?val.toUpperCase():val; n++; } }
  }
  // Extract date from text (e.g., "prazo 15/05" or "despachar em 2025-05-15")
  const dateMatch=txt.match(/(?:prazo|despachar?(?:\s+em)?|até)[:\s]*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i);
  if(dateMatch){ const fd=$$('fd'); if(fd){ try{ const parts=dateMatch[1].split(/[\/\-]/); if(parts.length>=2){ fd.value=`${new Date().getFullYear()}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; n++; } }catch{} } }
  toast(n?`${n} campo(s) preenchido(s) ✅`:'Nada reconhecido. Preencha manualmente.', n?'ok':'err');
}

function saveCfg(){ const u=$$('cu')?.value.trim(), k=$$('ck')?.value.trim(); if(!u||!k){ toast('Preencha URL e Key','err'); return; } saveConfig({url:u,key:k}); initSB(); toast('Salvo! ✅','ok'); }
async function testCfg(){ saveCfg(); const el=$$('cst'); if(!el)return; if(!ST.sb){el.innerHTML='<span style="color:#b91c1c">❌ Inválido</span>';return;} el.innerHTML='Testando...'; try{ const {error}=await ST.sb.from('pedidos').select('id').limit(1); if(error)throw error; el.innerHTML='<span style="color:var(--s-fin)">✅ Conectado!</span>'; await syncSB(); toast('Sincronizado!','ok'); }catch(e){el.innerHTML=`<span style="color:#b91c1c">❌ ${esc(e.message)}</span>`;} }
function copySql(){ navigator.clipboard.writeText(SQL).then(()=>toast('SQL copiado!','ok')).catch(()=>toast('Erro ao copiar','err')); }
function exportData(){ const b=new Blob([JSON.stringify(ST.pedidos,null,2)],{type:'application/json'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`speedlog-${today()}.json`; a.click(); URL.revokeObjectURL(u); }

function modal(html){ const o=$$('modal-overlay'); o.classList.remove('hidden'); o.innerHTML=html; }
function closeModal(){ $$('modal-overlay').classList.add('hidden'); }
function toast(msg,type=''){ const c=$$('toast-container'); const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg; c.appendChild(t); setTimeout(()=>t.remove(),3200); }

document.addEventListener('DOMContentLoaded',()=>{
  loadData(); initSB();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  window.addEventListener('hashchange',go);
  $$('modal-overlay').addEventListener('click',function(e){ if(e.target===this) closeModal(); });
  go();
});
