'use strict';

const CFG_KEY  = 'sl_cfg';
const DATA_KEY = 'sl_data';

const SM = {
  recebido:  { label:'Recebido',  icon:'📥', next:'separacao',  nxt:'Iniciar Separação' },
  separacao: { label:'Separação', icon:'🔍', next:'expedicao',  nxt:'Marcar Expedição' },
  expedicao: { label:'Expedição', icon:'📦', next:'finalizado', nxt:'Finalizar Pedido' },
  finalizado:{ label:'Finalizado',icon:'✅', next:null,         nxt:null }
};
const SO = ['recebido','separacao','expedicao','finalizado'];
const GALPOES = ['Real','Comdip','Bressan','Sama','Pellegrino','Eletropar Nacional'];

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
  quantidade     INTEGER     DEFAULT 1,
  galpao         TEXT,
  status         TEXT        DEFAULT 'recebido',
  observacoes    TEXT
);`;

let ST = { sb:null, pedidos:[], fStatus:null, fGalpao:null, fSearch:'' };

// ── STORAGE ─────────────────────────────────────────────
function loadData(){
  try{ ST.pedidos = JSON.parse(localStorage.getItem(DATA_KEY)||'[]'); }
  catch{ ST.pedidos=[]; }
}
function saveData(){ localStorage.setItem(DATA_KEY, JSON.stringify(ST.pedidos)); }
function getConfig(){
  try{ return JSON.parse(localStorage.getItem(CFG_KEY)||'null'); }
  catch{ return null; }
}
function saveConfig(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

function uid(){
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>
    (c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
}

// ── SUPABASE ─────────────────────────────────────────────
function initSB(){
  const cfg=getConfig();
  if(!cfg||!cfg.url||!cfg.key){ ST.sb=null; return; }
  try{ ST.sb=window.supabase.createClient(cfg.url,cfg.key); }
  catch{ ST.sb=null; }
}

async function syncFromSB(){
  if(!ST.sb) return;
  try{
    const {data,error}=await ST.sb.from('pedidos').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    ST.pedidos=data||[];
    saveData();
  }catch(e){ toast('Sync falhou: '+e.message,'err'); }
}

async function pushToSB(pedido){
  if(!ST.sb) return;
  try{
    const {error}=await ST.sb.from('pedidos').upsert([pedido]);
    if(error) throw error;
  }catch{ /* silently fail, local is source of truth */ }
}

async function deleteFromSB(id){
  if(!ST.sb) return;
  try{ await ST.sb.from('pedidos').delete().eq('id',id); }catch{}
}

// ── CRUD ─────────────────────────────────────────────────
function createPedido(data){
  const p={...data, id:uid(), created_at:new Date().toISOString(), updated_at:new Date().toISOString(), status:data.status||'recebido'};
  ST.pedidos.unshift(p);
  saveData();
  pushToSB(p);
  return p;
}

function getPedido(id){ return ST.pedidos.find(p=>p.id===id)||null; }

function updatePedido(id,updates){
  const i=ST.pedidos.findIndex(p=>p.id===id);
  if(i<0) return null;
  ST.pedidos[i]={...ST.pedidos[i],...updates,updated_at:new Date().toISOString()};
  saveData();
  pushToSB(ST.pedidos[i]);
  return ST.pedidos[i];
}

function deletePedido(id){
  ST.pedidos=ST.pedidos.filter(p=>p.id!==id);
  saveData();
  deleteFromSB(id);
}

// ── ROUTER ───────────────────────────────────────────────
function route(){
  const h=location.hash.slice(1)||'/';
  const p=h.split('/').filter(Boolean);
  if(!p.length) return {page:'home',params:{}};
  if(p[0]==='pedidos') return {page:'pedidos',params:{}};
  if(p[0]==='novo')    return {page:'novo',params:{}};
  if(p[0]==='editar'&&p[1]) return {page:'editar',params:{id:p[1]}};
  if(p[0]==='pedido'&&p[1]) return {page:'detalhe',params:{id:p[1]}};
  if(p[0]==='galpoes') return {page:'galpoes',params:{}};
  if(p[0]==='config')  return {page:'config',params:{}};
  return {page:'home',params:{}};
}

async function go(){
  const {page,params}=route();
  const main=$$('app-main');
  const back=$$('btn-back');
  const ttl =$$('page-title');
  const acts=$$('header-actions');

  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active',
      el.dataset.page===page||
      (page==='detalhe'&&el.dataset.page==='pedidos')||
      (page==='editar'&&el.dataset.page==='pedidos'));
  });

  acts.innerHTML='';
  back.classList.add('hidden');
  back.onclick=null;
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';

  if(page==='home'){
    ttl.textContent='SpeedLog';
    await pgHome(main);
  } else if(page==='pedidos'){
    ttl.textContent='Pedidos';
    pgPedidos(main);
  } else if(page==='novo'){
    ttl.textContent='Novo Pedido';
    back.classList.remove('hidden'); back.onclick=()=>history.back();
    pgNovo(main);
  } else if(page==='editar'){
    ttl.textContent='Editar';
    back.classList.remove('hidden'); back.onclick=()=>history.back();
    pgEditar(main,params.id);
  } else if(page==='detalhe'){
    ttl.textContent='Pedido';
    back.classList.remove('hidden'); back.onclick=()=>history.back();
    acts.innerHTML=`
      <a href="#/editar/${params.id}" class="btn-icon" title="Editar">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </a>
      <button class="btn-icon" onclick="confirmDel('${params.id}')" title="Excluir">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>`;
    pgDetalhe(main,params.id);
  } else if(page==='galpoes'){
    ttl.textContent='Por Galpão';
    pgGalpoes(main);
  } else if(page==='config'){
    ttl.textContent='Configurações';
    pgConfig(main);
  }
}

// ── HOME ─────────────────────────────────────────────────
async function pgHome(main){
  if(ST.sb) await syncFromSB();
  const c={recebido:0,separacao:0,expedicao:0,finalizado:0};
  ST.pedidos.forEach(p=>{ if(c[p.status]!==undefined) c[p.status]++; });
  const urgent=ST.pedidos.filter(p=>p.status!=='finalizado').slice(0,8);

  main.innerHTML=`<div class="page">
    <div class="stats-grid">
      <div class="stat-card s-rec"><span class="stat-ico">📥</span><span class="stat-num">${c.recebido}</span><span class="stat-lbl">Recebidos</span></div>
      <div class="stat-card s-sep"><span class="stat-ico">🔍</span><span class="stat-num">${c.separacao}</span><span class="stat-lbl">Separação</span></div>
      <div class="stat-card s-exp"><span class="stat-ico">📦</span><span class="stat-num">${c.expedicao}</span><span class="stat-lbl">Expedição</span></div>
      <div class="stat-card s-fin"><span class="stat-ico">✅</span><span class="stat-num">${c.finalizado}</span><span class="stat-lbl">Finalizados</span></div>
    </div>
    ${urgent.length?`
      <div>
        <div class="sec-hdr">
          <span class="sec-ttl">Pendentes</span>
          <a href="#/pedidos" style="font-size:.8rem;color:var(--blue);font-weight:600">Ver todos →</a>
        </div>
        <div style="display:flex;flex-direction:column;gap:.75rem">${urgent.map(orderCard).join('')}</div>
      </div>`
    :`<div class="empty"><span class="empty-ico">🎉</span><h3>Tudo em dia!</h3><p>Nenhum pedido pendente.</p></div>`}
    ${ST.pedidos.length===0?`
      <div style="background:var(--blue);border-radius:var(--r);padding:1.25rem;color:#fff;text-align:center">
        <div style="font-size:1.8rem;margin-bottom:.5rem">🚀</div>
        <p style="font-size:.9rem;opacity:.9;margin-bottom:1rem">Toque em <strong>+</strong> para cadastrar seu primeiro pedido!</p>
        <a href="#/novo" class="btn btn-o btn-bl">+ Novo Pedido</a>
      </div>`:''}
  </div>`;
}

// ── PEDIDOS ──────────────────────────────────────────────
function pgPedidos(main){
  main.innerHTML=`<div class="page">
    <div class="search-wrap">
      <svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
      <input type="search" id="si" placeholder="Buscar cliente, código, nº venda, etiqueta..." value="${esc(ST.fSearch)}" oninput="doSearch(this.value)" autocomplete="off">
    </div>
    <div class="chips">
      <span class="chip ${!ST.fStatus?'on':''}" onclick="fSt(null)">Todos</span>
      ${SO.map(s=>`<span class="chip ${ST.fStatus===s?'on '+s:''}" onclick="fSt('${s}')">${SM[s].icon} ${SM[s].label}</span>`).join('')}
    </div>
    <div class="chips">
      <span class="chip ${!ST.fGalpao?'on':''}" onclick="fGl(null)">Todos galpões</span>
      ${GALPOES.map(g=>`<span class="chip ${ST.fGalpao===g?'on':''}" onclick="fGl('${g}')">${g}</span>`).join('')}
    </div>
    <div id="lst"></div>
  </div>`;
  renderList();
}

function renderList(){
  const el=document.getElementById('lst');
  if(!el) return;
  let d=[...ST.pedidos];
  if(ST.fStatus) d=d.filter(p=>p.status===ST.fStatus);
  if(ST.fGalpao) d=d.filter(p=>p.galpao===ST.fGalpao);
  if(ST.fSearch){
    const q=ST.fSearch.toLowerCase();
    d=d.filter(p=>[p.nome_cliente,p.codigo_produto,p.numero_venda,p.etiqueta_ml,p.nome_produto,p.marca].some(v=>v&&v.toLowerCase().includes(q)));
  }
  if(!d.length){ el.innerHTML=`<div class="empty"><span class="empty-ico">🔍</span><h3>Nenhum pedido encontrado</h3><p>Ajuste os filtros.</p></div>`; return; }
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:.75rem">${d.map(orderCard).join('')}</div>`;
}

function orderCard(p){
  const s=SM[p.status]||SM.recebido;
  const dt=p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'';
  return `<a href="#/pedido/${p.id}" class="order-card ${p.status}">
    <div class="oc-hdr">
      <span class="oc-ttl">${esc(p.nome_cliente||'Cliente não informado')}</span>
      <span class="badge ${p.status}">${s.icon} ${s.label}</span>
    </div>
    <div class="oc-meta">
      ${p.numero_venda?`<span class="meta">🏷 <strong>${esc(p.numero_venda)}</strong></span>`:''}
      ${p.etiqueta_ml?`<span class="meta">🏪 ${esc(p.etiqueta_ml)}</span>`:''}
      ${p.codigo_produto?`<span class="meta">📦 ${esc(p.codigo_produto)}</span>`:''}
      ${p.nome_produto?`<span class="meta">${esc(p.nome_produto)}${p.marca?' — '+esc(p.marca):''}</span>`:''}
      ${p.galpao?`<span class="meta">🏭 ${esc(p.galpao)}</span>`:''}
      ${p.quantidade?`<span class="meta">Qtd: ${p.quantidade}</span>`:''}
      ${dt?`<span class="meta">📅 ${dt}</span>`:''}
    </div>
  </a>`;
}

// ── DETALHE ──────────────────────────────────────────────
function pgDetalhe(main,id){
  const p=getPedido(id);
  if(!p){ main.innerHTML=`<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Pedido não encontrado</h3><a href="#/pedidos" class="btn btn-n mt2">Voltar</a></div></div>`; return; }
  const s=SM[p.status]||SM.recebido;
  const ci=SO.indexOf(p.status);
  const dt=p.created_at?new Date(p.created_at).toLocaleString('pt-BR'):'—';

  main.innerHTML=`<div class="page">
    <div class="sprog">
      ${SO.map((st,i)=>{
        const cl=i<ci?'done':(i===ci?'active':'');
        return `<div class="pstep ${cl}"><div class="pdot">${i<ci?'✓':(i+1)}</div><span class="plbl">${SM[st].label}</span></div>`;
      }).join('')}
    </div>
    <div class="dcard">
      <div class="fb">
        <h2 style="font-size:1.1rem;font-weight:800;flex:1">${esc(p.nome_cliente||'Cliente não informado')}</h2>
        <span class="badge ${p.status}">${s.icon} ${s.label}</span>
      </div>
      <div class="dg">
        ${df('Nº Venda ML',p.numero_venda)}
        ${df('Etiqueta ML',p.etiqueta_ml)}
        ${df('Cód. Produto',p.codigo_produto)}
        ${df('Galpão',p.galpao)}
        ${df('Produto',p.nome_produto)}
        ${df('Marca',p.marca)}
        ${df('Quantidade',p.quantidade)}
        ${df('Cadastrado em',dt)}
      </div>
      ${p.observacoes?`<div class="df"><span class="dl">Observações</span><span class="dv">${esc(p.observacoes)}</span></div>`:''}
    </div>
    ${s.next?`
      <button class="act-btn ${s.next}" onclick="advance('${p.id}','${s.next}')">
        <div class="act-ico ${s.next}">${SM[s.next].icon}</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:.95rem">${s.nxt}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:2px">→ ${SM[s.next].label}</div>
        </div>
        <svg style="opacity:.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </button>`
    :`<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700;font-size:1rem">✅ Pedido Finalizado</div>`}
  </div>`;
}

function df(l,v){
  if(v===null||v===undefined||v==='') return '';
  return `<div class="df"><span class="dl">${l}</span><span class="dv">${esc(String(v))}</span></div>`;
}

// ── NOVO ─────────────────────────────────────────────────
function pgNovo(main){
  main.innerHTML=`<div class="page">
    <div class="wbox">
      <div class="wbox-hdr">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        Colar texto do WhatsApp
      </div>
      <textarea class="fc" id="wt" placeholder="Cole aqui o texto do WhatsApp com os dados do pedido e toque em Interpretar..." rows="4"></textarea>
      <button class="btn btn-n btn-bl mt" onclick="parseWpp()">🔍 Interpretar Texto</button>
    </div>
    <div class="dcard">
      <span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Dados do Pedido</span>
      ${buildForm()}
      <button class="btn btn-p btn-bl mt2" onclick="saveNovo()">💾 Salvar Pedido</button>
    </div>
  </div>`;
}

// ── EDITAR ───────────────────────────────────────────────
function pgEditar(main,id){
  const p=getPedido(id);
  if(!p){ main.innerHTML=`<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>`; return; }
  main.innerHTML=`<div class="page"><div class="dcard">${buildForm(p)}<button class="btn btn-p btn-bl mt2" onclick="saveEditar('${id}')">💾 Salvar Alterações</button></div></div>`;
}

function buildForm(p={}){
  const opts=SO.map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${SM[s].label}</option>`).join('');
  return `
    <div class="fg">
      <label class="fl">Nome do Cliente *</label>
      <input class="fc" id="fn" type="text" placeholder="Ex: João Silva" value="${esc(p.nome_cliente||'')}">
    </div>
    <div class="g2">
      <div class="fg">
        <label class="fl">Nº Venda ML</label>
        <input class="fc" id="fv" type="text" placeholder="12345678" value="${esc(p.numero_venda||'')}">
      </div>
      <div class="fg">
        <label class="fl">Etiqueta ML</label>
        <input class="fc" id="fe" type="text" placeholder="BR123..." value="${esc(p.etiqueta_ml||'')}">
      </div>
    </div>
    <div class="g2">
      <div class="fg">
        <label class="fl">Cód. Produto</label>
        <input class="fc" id="fc2" type="text" placeholder="SKU-001" value="${esc(p.codigo_produto||'')}">
      </div>
      <div class="fg">
        <label class="fl">Quantidade</label>
        <input class="fc" id="fq" type="number" min="1" value="${p.quantidade||1}">
      </div>
    </div>
    <div class="fg">
      <label class="fl">Nome do Produto</label>
      <input class="fc" id="fp" type="text" placeholder="Ex: Fone Bluetooth" value="${esc(p.nome_produto||'')}">
    </div>
    <div class="fg">
      <label class="fl">Marca</label>
      <input class="fc" id="fm" type="text" placeholder="Ex: Samsung" value="${esc(p.marca||'')}">
    </div>
    <div class="fg">
      <label class="fl">Galpão</label>
      <div class="gcl" id="gcl">
        ${GALPOES.map(g=>`<span class="${p.galpao===g?'on':''}" onclick="pickG('${g}',this)">${g}</span>`).join('')}
      </div>
      <input type="hidden" id="fg2" value="${esc(p.galpao||'')}">
    </div>
    <div class="fg">
      <label class="fl">Status</label>
      <select class="fc" id="fs">${opts}</select>
    </div>
    <div class="fg">
      <label class="fl">Observações</label>
      <textarea class="fc" id="fo" placeholder="Notas adicionais...">${esc(p.observacoes||'')}</textarea>
    </div>`;
}

// ── GALPÕES ──────────────────────────────────────────────
function pgGalpoes(main){
  const by={};
  GALPOES.forEach(g=>{ by[g]={recebido:0,separacao:0,expedicao:0,finalizado:0,total:0}; });
  ST.pedidos.forEach(p=>{
    if(p.galpao&&by[p.galpao]){
      by[p.galpao][p.status]=(by[p.galpao][p.status]||0)+1;
      by[p.galpao].total++;
    }
  });
  const cards=GALPOES.map(g=>{
    const d=by[g];
    const atv=d.recebido+d.separacao+d.expedicao;
    return `<div class="gc">
      <div class="fb">
        <span class="gn">🏭 ${g}</span>
        <span class="muted sm">${d.total} pedido${d.total!==1?'s':''}</span>
      </div>
      ${atv>0?`<div class="gcounts">
        ${d.recebido?`<span class="gcnt recebido">📥 ${d.recebido}</span>`:''}
        ${d.separacao?`<span class="gcnt separacao">🔍 ${d.separacao}</span>`:''}
        ${d.expedicao?`<span class="gcnt expedicao">📦 ${d.expedicao}</span>`:''}
        ${d.finalizado?`<span class="gcnt finalizado">✅ ${d.finalizado}</span>`:''}
      </div>`:`<span class="muted sm">Nenhum pedido ativo</span>`}
      <button class="btn btn-n" style="font-size:.8rem;padding:.5rem 1rem;min-height:36px" onclick="goGalpao('${g}')">Ver pedidos →</button>
    </div>`;
  }).join('');
  main.innerHTML=`<div class="page">${cards}</div>`;
}

// ── CONFIG ───────────────────────────────────────────────
function pgConfig(main){
  const cfg=getConfig()||{};
  const total=ST.pedidos.length;
  main.innerHTML=`<div class="page">
    <div class="csec">
      <div class="csec-ttl">☁️ Supabase (sincronização em nuvem)</div>
      <p class="muted sm" style="margin-bottom:.75rem">Opcional. Permite usar o app em vários celulares.</p>
      <div class="fg">
        <label class="fl">URL do Projeto</label>
        <input class="fc" id="cu" type="url" placeholder="https://xxxxx.supabase.co" value="${esc(cfg.url||'')}">
      </div>
      <div class="fg mt">
        <label class="fl">Anon Key</label>
        <input class="fc" id="ck" type="text" placeholder="eyJhbGci..." value="${esc(cfg.key||'')}">
      </div>
      <div style="display:flex;gap:.75rem;margin-top:1rem">
        <button class="btn btn-p" onclick="saveCfg()" style="flex:1">💾 Salvar</button>
        <button class="btn btn-n" onclick="testCfg()">🔌 Testar</button>
      </div>
      <div id="cst" class="mt" style="font-size:.875rem"></div>
    </div>
    <div class="csec">
      <div class="csec-ttl">📋 SQL — criar tabela no Supabase</div>
      <textarea class="fc" readonly rows="14" style="font-family:monospace;font-size:.72rem;background:#f8fafc">${esc(SQL)}</textarea>
      <button class="btn btn-n btn-bl mt" onclick="copySql()">📋 Copiar SQL</button>
    </div>
    <div class="csec">
      <div class="csec-ttl">💾 Dados locais (${total} pedido${total!==1?'s':''})</div>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-n" style="flex:1" onclick="exportData()">⬇️ Exportar JSON</button>
        <button class="btn btn-d" style="flex:1" onclick="confirmClear()">🗑️ Limpar tudo</button>
      </div>
    </div>
  </div>`;
}

// ── ACTIONS ──────────────────────────────────────────────
function pickG(g,el){
  document.querySelectorAll('#gcl span').forEach(s=>s.classList.remove('on'));
  el.classList.add('on');
  const i=document.getElementById('fg2'); if(i) i.value=g;
}

function formData(){
  const v=id=>document.getElementById(id)?.value?.trim()||null;
  return {
    nome_cliente: v('fn'), numero_venda: v('fv'), etiqueta_ml: v('fe'),
    codigo_produto: v('fc2'), nome_produto: v('fp'), marca: v('fm'),
    quantidade: parseInt(document.getElementById('fq')?.value)||1,
    galpao: v('fg2'),
    status: document.getElementById('fs')?.value||'recebido',
    observacoes: v('fo')
  };
}

function saveNovo(){
  const d=formData();
  if(!d.nome_cliente){ toast('Informe o nome do cliente','err'); return; }
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
  const ts={};
  if(nxt==='expedicao') ts.data_coleta=new Date().toISOString();
  if(nxt==='finalizado') ts.data_entrega=new Date().toISOString();
  updatePedido(id,{status:nxt,...ts});
  const s=SM[nxt];
  toast(s.icon+' '+s.label,'ok');
  pgDetalhe($$('app-main'),id);
  // refresh header actions id
  go();
}

function confirmDel(id){
  modal(`<div class="modal">
    <div class="modal-ttl">⚠️ Excluir pedido?</div>
    <div class="modal-txt">Essa ação não pode ser desfeita.</div>
    <div class="modal-acts">
      <button class="btn btn-n" style="flex:1" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-d" style="flex:1" onclick="doDel('${id}')">Excluir</button>
    </div>
  </div>`);
}

function doDel(id){
  closeModal();
  deletePedido(id);
  toast('Excluído','ok');
  location.hash='#/pedidos';
}

function confirmClear(){
  modal(`<div class="modal">
    <div class="modal-ttl">⚠️ Limpar todos os pedidos?</div>
    <div class="modal-txt">Isso apagará TODOS os ${ST.pedidos.length} pedidos localmente.</div>
    <div class="modal-acts">
      <button class="btn btn-n" style="flex:1" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-d" style="flex:1" onclick="doClear()">Limpar</button>
    </div>
  </div>`);
}

function doClear(){ closeModal(); ST.pedidos=[]; saveData(); toast('Dados apagados','ok'); location.hash='#/'; }

function doSearch(v){ ST.fSearch=v; renderList(); }
function fSt(v){ ST.fStatus=v; pgPedidos($$('app-main')); }
function fGl(v){ ST.fGalpao=v; pgPedidos($$('app-main')); }
function goGalpao(g){ ST.fGalpao=g; ST.fStatus=null; ST.fSearch=''; location.hash='#/pedidos'; }

function parseWpp(){
  const txt=document.getElementById('wt')?.value||'';
  if(!txt.trim()){ toast('Cole o texto primeiro','err'); return; }
  const P={
    fn: [/(?:cliente|comprador|destinat[aá]rio|nome)[:\s]*([^\n]{3,60})/i],
    fv: [/(?:venda|pedido|n[uú]mero|nº|#)[:\s]*([A-Z0-9\-]{4,})/i, /\b([0-9]{8,20})\b/],
    fe: [/(?:etiqueta|label)[:\s]*([A-Z0-9\-]+)/i, /\b((?:ML|BR)[0-9A-Z]{8,})\b/i],
    fc2:[/(?:cód|sku|ref)[:\s]*([A-Z0-9\-_]{3,})/i],
    fp: [/(?:produto|item|descrição)[:\s]*([^\n]{3,60})/i],
    fm: [/(?:marca|brand)[:\s]*([^\n]{2,30})/i],
    fq: [/(?:quantidade|qtd)[:\s]*(\d+)/i],
  };
  let n=0;
  for(const [id,pats] of Object.entries(P)){
    for(const pat of pats){
      const m=txt.match(pat);
      if(m&&m[1]){ const el=document.getElementById(id); if(el){ el.value=m[1].trim(); n++; } break; }
    }
  }
  toast(n?`${n} campo(s) preenchido(s) ✅`:'Nenhum campo reconhecido. Preencha manualmente.', n?'ok':'err');
}

function saveCfg(){
  const url=document.getElementById('cu')?.value.trim();
  const key=document.getElementById('ck')?.value.trim();
  if(!url||!key){ toast('Preencha URL e Key','err'); return; }
  saveConfig({url,key}); initSB(); toast('Salvo! ✅','ok');
}

async function testCfg(){
  saveCfg();
  const el=document.getElementById('cst'); if(!el) return;
  if(!ST.sb){ el.innerHTML='<span style="color:#b91c1c">❌ Configuração inválida</span>'; return; }
  el.innerHTML='<span style="color:var(--muted)">Testando...</span>';
  try{
    const {error}=await ST.sb.from('pedidos').select('id').limit(1);
    if(error) throw error;
    el.innerHTML='<span style="color:var(--s-fin)">✅ Conectado!</span>';
    await syncFromSB();
    toast('Sincronizado com sucesso!','ok');
  }catch(e){ el.innerHTML=`<span style="color:#b91c1c">❌ ${esc(e.message)}</span>`; }
}

function copySql(){
  navigator.clipboard.writeText(SQL).then(()=>toast('SQL copiado! 📋','ok')).catch(()=>toast('Erro ao copiar','err'));
}

function exportData(){
  const b=new Blob([JSON.stringify(ST.pedidos,null,2)],{type:'application/json'});
  const u=URL.createObjectURL(b);
  const a=document.createElement('a'); a.href=u; a.download=`speedlog-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(u);
}

// ── MODAL ────────────────────────────────────────────────
function modal(html){ const o=$$('modal-overlay'); o.classList.remove('hidden'); o.innerHTML=html; }
function closeModal(){ $$('modal-overlay').classList.add('hidden'); }

// ── TOAST ────────────────────────────────────────────────
function toast(msg,type=''){
  const c=$$('toast-container');
  const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),3200);
}

// ── UTILS ────────────────────────────────────────────────
function $$(id){ return document.getElementById(id); }
function esc(s){
  if(s===null||s===undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  loadData();
  initSB();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  window.addEventListener('hashchange',go);
  $$('modal-overlay').addEventListener('click',function(e){ if(e.target===this) closeModal(); });
  go();
});
