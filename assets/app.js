'use strict';

const CONFIG_KEY = 'speedlog_config';

const STATUS_MAP = {
  recebido:   { label: 'Recebido',   icon: '📥', next: 'separacao',  nextLabel: 'Iniciar Separação' },
  separacao:  { label: 'Separação', icon: '🔍', next: 'expedicao',  nextLabel: 'Marcar Expedição' },
  expedicao:  { label: 'Expedição', icon: '📦', next: 'finalizado', nextLabel: 'Finalizar Pedido' },
  finalizado: { label: 'Finalizado', icon: '✅',         next: null,         nextLabel: null }
};

const STATUS_ORDER = ['recebido', 'separacao', 'expedicao', 'finalizado'];

const GALPOES = ['Real', 'Comdip', 'Bressan', 'Sama', 'Pellegrino', 'Eletropar Nacional'];

const SQL_SCHEMA = `CREATE TABLE IF NOT EXISTS pedidos (
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
  observacoes    TEXT,
  data_coleta    TIMESTAMPTZ,
  data_entrega   TIMESTAMPTZ
);`;

let state = {
  sb: null,
  pedidos: [],
  filter: { status: null, galpao: null, search: '' }
};

// CONFIG
function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); }
  catch { return null; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// SUPABASE
function initSupabase() {
  const cfg = getConfig();
  if (!cfg || !cfg.url || !cfg.key) { state.sb = null; return null; }
  try {
    state.sb = window.supabase.createClient(cfg.url, cfg.key);
    return state.sb;
  } catch { state.sb = null; return null; }
}

async function dbGetPedidos() {
  if (!state.sb) return [];
  try {
    const { data, error } = await state.sb.from('pedidos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    state.pedidos = data || [];
    return state.pedidos;
  } catch (e) { showToast('Erro ao carregar: ' + e.message, 'error'); return state.pedidos; }
}

async function dbGetPedido(id) {
  if (!state.sb) return null;
  try {
    const { data, error } = await state.sb.from('pedidos').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  } catch { return null; }
}

async function dbCreatePedido(pedido) {
  if (!state.sb) { showToast('Configure o Supabase primeiro', 'error'); return null; }
  try {
    const { data, error } = await state.sb.from('pedidos').insert([pedido]).select().single();
    if (error) throw error;
    return data;
  } catch (e) { showToast('Erro ao salvar: ' + e.message, 'error'); return null; }
}

async function dbUpdatePedido(id, updates) {
  if (!state.sb) return null;
  try {
    updates.updated_at = new Date().toISOString();
    const { data, error } = await state.sb.from('pedidos').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } catch (e) { showToast('Erro ao atualizar: ' + e.message, 'error'); return null; }
}

async function dbDeletePedido(id) {
  if (!state.sb) return false;
  try {
    const { error } = await state.sb.from('pedidos').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) { showToast('Erro ao excluir: ' + e.message, 'error'); return false; }
}

// ROUTER
function getRoute() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  if (!parts.length) return { page: 'home', params: {} };
  if (parts[0] === 'pedidos') return { page: 'pedidos', params: {} };
  if (parts[0] === 'novo') return { page: 'novo', params: {} };
  if (parts[0] === 'editar' && parts[1]) return { page: 'editar', params: { id: parts[1] } };
  if (parts[0] === 'pedido' && parts[1]) return { page: 'detalhe', params: { id: parts[1] } };
  if (parts[0] === 'galpoes') return { page: 'galpoes', params: {} };
  if (parts[0] === 'config') return { page: 'config', params: {} };
  return { page: 'home', params: {} };
}

async function handleRoute() {
  const { page, params } = getRoute();
  const main = document.getElementById('app-main');
  const backBtn = document.getElementById('btn-back');
  const pageTitle = document.getElementById('page-title');
  const headerActions = document.getElementById('header-actions');

  document.querySelectorAll('.nav-item').forEach(el => {
    const pg = el.dataset.page;
    el.classList.toggle('active',
      pg === page ||
      (page === 'detalhe' && pg === 'pedidos') ||
      (page === 'editar' && pg === 'pedidos')
    );
  });

  headerActions.innerHTML = '';
  backBtn.classList.add('hidden');
  backBtn.onclick = null;

  main.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  if (page === 'home') {
    pageTitle.textContent = 'SpeedLog';
    await renderHome(main);
  } else if (page === 'pedidos') {
    pageTitle.textContent = 'Pedidos';
    await renderPedidos(main);
  } else if (page === 'novo') {
    pageTitle.textContent = 'Novo Pedido';
    backBtn.classList.remove('hidden');
    backBtn.onclick = () => history.back();
    renderNovo(main);
  } else if (page === 'editar') {
    pageTitle.textContent = 'Editar Pedido';
    backBtn.classList.remove('hidden');
    backBtn.onclick = () => history.back();
    await renderEditar(main, params.id);
  } else if (page === 'detalhe') {
    pageTitle.textContent = 'Pedido';
    backBtn.classList.remove('hidden');
    backBtn.onclick = () => history.go(-1);
    headerActions.innerHTML = `
      <a href="#/editar/${params.id}" class="btn-icon" aria-label="Editar">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </a>
      <button class="btn-icon" onclick="confirmDelete('${params.id}')" aria-label="Excluir">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>`;
    await renderDetalhe(main, params.id);
  } else if (page === 'galpoes') {
    pageTitle.textContent = 'Por Galpão';
    await renderGalpoes(main);
  } else if (page === 'config') {
    pageTitle.textContent = 'Configurações';
    renderConfig(main);
  }
}

// HOME
async function renderHome(main) {
  if (!state.sb) {
    main.innerHTML = `<div class="page-content">
      <div style="background:var(--blue);border-radius:var(--radius);padding:1.5rem;color:#fff;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:0.75rem">🚚</div>
        <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:0.5rem">SpeedLog</h2>
        <p style="opacity:0.85;font-size:0.9rem;margin-bottom:1.25rem">Sistema de controle de separação e expedição de pedidos Mercado Livre.</p>
        <a href="#/config" class="btn btn-orange btn-block">⚙️ Configurar Supabase</a>
      </div>
      <div class="empty-state">
        <span class="empty-state-icon">📋</span>
        <h3>Como começar</h3>
        <p>1. Acesse Configurações<br>2. Crie um projeto gratuito no supabase.com<br>3. Cole a URL e a chave anon<br>4. Execute o SQL para criar a tabela<br>5. Comece a cadastrar pedidos!</p>
      </div>
    </div>`;
    return;
  }
  await dbGetPedidos();
  const counts = { recebido: 0, separacao: 0, expedicao: 0, finalizado: 0 };
  state.pedidos.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
  const urgent = state.pedidos.filter(p => p.status !== 'finalizado').slice(0, 8);

  main.innerHTML = `<div class="page-content">
    <div class="stats-grid">
      <div class="stat-card recebido"><span class="stat-icon">📥</span><span class="stat-num">${counts.recebido}</span><span class="stat-label">Recebidos</span></div>
      <div class="stat-card separacao"><span class="stat-icon">🔍</span><span class="stat-num">${counts.separacao}</span><span class="stat-label">Separação</span></div>
      <div class="stat-card expedicao"><span class="stat-icon">📦</span><span class="stat-num">${counts.expedicao}</span><span class="stat-label">Expedição</span></div>
      <div class="stat-card finalizado"><span class="stat-icon">✅</span><span class="stat-num">${counts.finalizado}</span><span class="stat-label">Finalizados</span></div>
    </div>
    ${urgent.length ? `
      <div>
        <div class="section-header">
          <span class="section-title">Pendentes</span>
          <a href="#/pedidos" style="font-size:0.8rem;color:var(--blue);font-weight:600">Ver todos →</a>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.75rem">${urgent.map(renderOrderCard).join('')}</div>
      </div>` : `
      <div class="empty-state"><span class="empty-state-icon">🎉</span><h3>Tudo em dia!</h3><p>Nenhum pedido pendente.</p></div>`}
  </div>`;
}

// PEDIDOS
async function renderPedidos(main) {
  if (!state.sb) {
    main.innerHTML = `<div class="page-content"><div class="empty-state"><span class="empty-state-icon">⚙️</span><h3>Supabase não configurado</h3><a href="#/config" class="btn btn-primary mt-md">Configurar</a></div></div>`;
    return;
  }
  await dbGetPedidos();
  main.innerHTML = `<div class="page-content">
    <div class="search-bar">
      <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
      <input type="search" id="search-input" placeholder="Buscar cliente, código, nº venda, etiqueta..." value="${esc(state.filter.search)}" oninput="handleSearch(this.value)" autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="filter-chips">
      <span class="chip ${!state.filter.status ? 'active' : ''}" onclick="setStatusFilter(null)">Todos</span>
      ${STATUS_ORDER.map(s => `<span class="chip ${state.filter.status === s ? 'active ' + s : ''}" onclick="setStatusFilter('${s}')">${STATUS_MAP[s].icon} ${STATUS_MAP[s].label}</span>`).join('')}
    </div>
    <div class="filter-chips">
      <span class="chip ${!state.filter.galpao ? 'active' : ''}" onclick="setGalpaoFilter(null)">Todos galpões</span>
      ${GALPOES.map(g => `<span class="chip ${state.filter.galpao === g ? 'active' : ''}" onclick="setGalpaoFilter('${g}')">${g}</span>`).join('')}
    </div>
    <div id="pedidos-list"></div>
  </div>`;
  renderPedidosList();
}

function renderPedidosList() {
  const list = document.getElementById('pedidos-list');
  if (!list) return;
  let filtered = state.pedidos;
  if (state.filter.status) filtered = filtered.filter(p => p.status === state.filter.status);
  if (state.filter.galpao) filtered = filtered.filter(p => p.galpao === state.filter.galpao);
  if (state.filter.search) {
    const q = state.filter.search.toLowerCase();
    filtered = filtered.filter(p =>
      [p.nome_cliente, p.codigo_produto, p.numero_venda, p.etiqueta_ml, p.nome_produto, p.marca]
        .some(v => v && v.toLowerCase().includes(q))
    );
  }
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔍</span><h3>Nenhum pedido encontrado</h3><p>Ajuste os filtros ou a busca.</p></div>`;
    return;
  }
  list.innerHTML = `<div style="display:flex;flex-direction:column;gap:0.75rem">${filtered.map(renderOrderCard).join('')}</div>`;
}

function renderOrderCard(p) {
  const s = STATUS_MAP[p.status] || STATUS_MAP.recebido;
  const date = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '';
  return `<a href="#/pedido/${p.id}" class="order-card ${p.status}">
    <div class="order-card-header">
      <span class="order-card-title">${esc(p.nome_cliente || 'Cliente não informado')}</span>
      <span class="badge ${p.status}">${s.icon} ${s.label}</span>
    </div>
    <div class="order-card-meta">
      ${p.numero_venda ? `<span class="meta-tag">🏷 <strong>${esc(p.numero_venda)}</strong></span>` : ''}
      ${p.codigo_produto ? `<span class="meta-tag">📦 ${esc(p.codigo_produto)}</span>` : ''}
      ${p.nome_produto ? `<span class="meta-tag">${esc(p.nome_produto)}${p.marca ? ' — ' + esc(p.marca) : ''}</span>` : ''}
      ${p.galpao ? `<span class="meta-tag">🏭 ${esc(p.galpao)}</span>` : ''}
      ${p.quantidade ? `<span class="meta-tag">Qtd: ${p.quantidade}</span>` : ''}
      ${date ? `<span class="meta-tag">📅 ${date}</span>` : ''}
    </div>
  </a>`;
}

// DETALHE
async function renderDetalhe(main, id) {
  const p = await dbGetPedido(id);
  if (!p) {
    main.innerHTML = `<div class="page-content"><div class="empty-state"><span class="empty-state-icon">❌</span><h3>Pedido não encontrado</h3><a href="#/pedidos" class="btn btn-outline mt-md">Voltar</a></div></div>`;
    return;
  }
  const s = STATUS_MAP[p.status] || STATUS_MAP.recebido;
  const currentIdx = STATUS_ORDER.indexOf(p.status);
  const createdAt = p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : '—';

  main.innerHTML = `<div class="page-content">
    <div class="status-progress">
      ${STATUS_ORDER.map((st, i) => {
        const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : '');
        return `<div class="progress-step ${cls}"><div class="step-dot">${i < currentIdx ? '✓' : (i + 1)}</div><span class="step-label">${STATUS_MAP[st].label}</span></div>`;
      }).join('')}
    </div>

    <div class="detail-card">
      <div class="flex-between">
        <h2 style="font-size:1.1rem;font-weight:800;flex:1">${esc(p.nome_cliente || 'Cliente não informado')}</h2>
        <span class="badge ${p.status}">${s.icon} ${s.label}</span>
      </div>
      <div class="detail-grid">
        ${df('Nº Venda ML', p.numero_venda)}
        ${df('Etiqueta ML', p.etiqueta_ml)}
        ${df('Cód. Produto', p.codigo_produto)}
        ${df('Galpão', p.galpao)}
        ${df('Produto', p.nome_produto)}
        ${df('Marca', p.marca)}
        ${df('Quantidade', p.quantidade)}
        ${df('Recebido em', createdAt)}
      </div>
      ${p.observacoes ? `<div class="detail-field"><span class="detail-label">Observações</span><span class="detail-value">${esc(p.observacoes)}</span></div>` : ''}
    </div>

    ${s.next ? `
      <button class="status-action-btn ${s.next}" onclick="advanceStatus('${p.id}', '${s.next}')">
        <div class="action-icon ${s.next}">${STATUS_MAP[s.next].icon}</div>
        <div>
          <div style="font-weight:800;font-size:0.95rem">${s.nextLabel}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Avançar para ${STATUS_MAP[s.next].label}</div>
        </div>
        <svg style="margin-left:auto;opacity:0.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </button>` : `
      <div style="background:var(--status-finalizado-bg);border-radius:var(--radius);padding:1rem;text-align:center;color:#2e7d32;font-weight:700;font-size:1rem">
        ✅ Pedido Finalizado
      </div>`}
  </div>`;
}

function df(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
}

// NOVO
function renderNovo(main) {
  main.innerHTML = `<div class="page-content">
    <div class="wpp-box">
      <div class="wpp-box-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        Colar do WhatsApp
      </div>
      <textarea class="form-control" id="wpp-text" placeholder="Cole aqui o texto do WhatsApp com os dados do pedido..." rows="4"></textarea>
      <button class="btn btn-outline btn-block mt-sm" onclick="parseWhatsApp()">🔍 Interpretar Texto</button>
    </div>
    <div class="detail-card">
      <span style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Dados do Pedido</span>
      ${buildForm()}
      <button class="btn btn-primary btn-block mt-md" onclick="submitNovo()">💾 Salvar Pedido</button>
    </div>
  </div>`;
}

// EDITAR
async function renderEditar(main, id) {
  const p = await dbGetPedido(id);
  if (!p) { main.innerHTML = `<div class="page-content"><div class="empty-state"><span class="empty-state-icon">❌</span><h3>Pedido não encontrado</h3></div></div>`; return; }
  main.innerHTML = `<div class="page-content"><div class="detail-card">${buildForm(p)}<button class="btn btn-primary btn-block mt-md" onclick="submitEditar('${id}')">💾 Salvar Alterações</button></div></div>`;
}

function buildForm(p = {}) {
  const statusOpts = STATUS_ORDER.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${STATUS_MAP[s].label}</option>`).join('');
  return `
    <div class="form-group">
      <label class="form-label">Nome do Cliente *</label>
      <input class="form-control" id="f-nome_cliente" type="text" placeholder="Ex: João Silva" value="${esc(p.nome_cliente || '')}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
      <div class="form-group">
        <label class="form-label">Nº Venda ML</label>
        <input class="form-control" id="f-numero_venda" type="text" placeholder="Ex: 12345678" value="${esc(p.numero_venda || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Etiqueta ML</label>
        <input class="form-control" id="f-etiqueta_ml" type="text" placeholder="Ex: BR123" value="${esc(p.etiqueta_ml || '')}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
      <div class="form-group">
        <label class="form-label">Cód. Produto</label>
        <input class="form-control" id="f-codigo_produto" type="text" placeholder="Ex: SKU-001" value="${esc(p.codigo_produto || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Quantidade</label>
        <input class="form-control" id="f-quantidade" type="number" min="1" value="${p.quantidade || 1}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nome do Produto</label>
      <input class="form-control" id="f-nome_produto" type="text" placeholder="Ex: Fone Bluetooth XYZ" value="${esc(p.nome_produto || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Marca</label>
      <input class="form-control" id="f-marca" type="text" placeholder="Ex: Samsung" value="${esc(p.marca || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Galpão</label>
      <div class="galpao-chips" id="galpao-chips">
        ${GALPOES.map(g => `<span class="galpao-chip ${p.galpao === g ? 'selected' : ''}" onclick="selectGalpao('${g}', this)">${g}</span>`).join('')}
      </div>
      <input type="hidden" id="f-galpao" value="${esc(p.galpao || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-control" id="f-status">${statusOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Observações</label>
      <textarea class="form-control" id="f-observacoes" placeholder="Notas adicionais...">${esc(p.observacoes || '')}</textarea>
    </div>`;
}

// GALPOES VIEW
async function renderGalpoes(main) {
  if (!state.sb) {
    main.innerHTML = `<div class="page-content"><div class="empty-state"><span class="empty-state-icon">⚙️</span><h3>Supabase não configurado</h3><a href="#/config" class="btn btn-primary mt-md">Configurar</a></div></div>`;
    return;
  }
  await dbGetPedidos();
  const byGalpao = {};
  GALPOES.forEach(g => { byGalpao[g] = { recebido: 0, separacao: 0, expedicao: 0, finalizado: 0, total: 0 }; });
  state.pedidos.forEach(p => {
    if (p.galpao && byGalpao[p.galpao]) {
      byGalpao[p.galpao][p.status] = (byGalpao[p.galpao][p.status] || 0) + 1;
      byGalpao[p.galpao].total++;
    }
  });
  const cards = GALPOES.map(g => {
    const d = byGalpao[g];
    const active = d.recebido + d.separacao + d.expedicao;
    return `
      <div class="galpao-stat-card">
        <div class="flex-between">
          <span class="galpao-name">🏭 ${g}</span>
          <span style="font-size:0.8rem;color:var(--text-muted)">${d.total} pedidos</span>
        </div>
        ${active > 0 ? `<div class="galpao-counts">
          ${d.recebido ? `<span class="galpao-count recebido">📥 ${d.recebido} Recebido${d.recebido > 1 ? 's' : ''}</span>` : ''}
          ${d.separacao ? `<span class="galpao-count separacao">🔍 ${d.separacao} Separação</span>` : ''}
          ${d.expedicao ? `<span class="galpao-count expedicao">📦 ${d.expedicao} Expedição</span>` : ''}
          ${d.finalizado ? `<span class="galpao-count finalizado">✅ ${d.finalizado} Finalizado${d.finalizado > 1 ? 's' : ''}</span>` : ''}
        </div>` : `<span style="font-size:0.82rem;color:var(--text-muted)">Nenhum pedido ativo</span>`}
        <button class="btn btn-outline" style="font-size:0.8rem;padding:0.5rem 1rem;min-height:36px" onclick="filterByGalpao('${g}')">
          Ver pedidos deste galpão →
        </button>
      </div>`;
  }).join('');
  main.innerHTML = `<div class="page-content">${cards}</div>`;
}

// CONFIG
function renderConfig(main) {
  const cfg = getConfig() || {};
  main.innerHTML = `<div class="page-content">
    <div class="config-section">
      <div class="config-section-title">🔌 Supabase</div>
      <div class="form-group">
        <label class="form-label">URL do Projeto</label>
        <input class="form-control" id="cfg-url" type="url" placeholder="https://xxxxx.supabase.co" value="${esc(cfg.url || '')}">
      </div>
      <div class="form-group mt-sm">
        <label class="form-label">Anon Key (chave pública)</label>
        <input class="form-control" id="cfg-key" type="text" placeholder="eyJhbGci..." value="${esc(cfg.key || '')}">
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:1rem">
        <button class="btn btn-primary" onclick="saveConfigForm()" style="flex:1">💾 Salvar</button>
        <button class="btn btn-outline" onclick="testConnection()">🔌 Testar</button>
      </div>
      <div id="connection-status" class="mt-sm" style="font-size:0.875rem"></div>
    </div>

    <div class="config-section">
      <div class="config-section-title">📋 SQL para criar tabela</div>
      <p class="text-muted text-sm" style="margin-bottom:0.75rem">Execute no Editor SQL do Supabase (supabase.com → seu projeto → SQL Editor):</p>
      <textarea class="form-control" readonly rows="16" style="font-family:monospace;font-size:0.72rem;background:#f8fafc;line-height:1.5">${esc(SQL_SCHEMA)}</textarea>
      <button class="btn btn-outline btn-block mt-sm" onclick="copySQL()">📋 Copiar SQL</button>
    </div>

    <div class="config-section">
      <div class="config-section-title">💾 Backup</div>
      <p class="text-muted text-sm" style="margin-bottom:0.75rem">Exportar todos os pedidos como JSON.</p>
      <button class="btn btn-outline btn-block" onclick="exportData()">&darr; Exportar JSON</button>
    </div>

    <div class="config-section">
      <div class="config-section-title">ℹ️ Sobre</div>
      <p class="text-muted text-sm">SpeedLog v1.0 — Speedboy Motoboy</p>
      <p class="text-muted text-sm mt-sm">Controle de separação, expedição e rastreamento de pedidos do Mercado Livre.</p>
    </div>
  </div>`;
}

// ACTIONS
function selectGalpao(g, el) {
  document.querySelectorAll('.galpao-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const inp = document.getElementById('f-galpao');
  if (inp) inp.value = g;
}

function getFormData() {
  return {
    nome_cliente: v('f-nome_cliente'),
    numero_venda: v('f-numero_venda'),
    etiqueta_ml: v('f-etiqueta_ml'),
    codigo_produto: v('f-codigo_produto'),
    nome_produto: v('f-nome_produto'),
    marca: v('f-marca'),
    quantidade: parseInt(document.getElementById('f-quantidade')?.value) || 1,
    galpao: v('f-galpao'),
    status: document.getElementById('f-status')?.value || 'recebido',
    observacoes: v('f-observacoes'),
  };
}

function v(id) {
  const val = document.getElementById(id)?.value?.trim();
  return val || null;
}

async function submitNovo() {
  const data = getFormData();
  if (!data.nome_cliente) { showToast('Informe o nome do cliente', 'error'); return; }
  const result = await dbCreatePedido(data);
  if (result) { showToast('Pedido salvo! ✅', 'success'); location.hash = '#/pedido/' + result.id; }
}

async function submitEditar(id) {
  const data = getFormData();
  if (!data.nome_cliente) { showToast('Informe o nome do cliente', 'error'); return; }
  const result = await dbUpdatePedido(id, data);
  if (result) { showToast('Atualizado! ✅', 'success'); location.hash = '#/pedido/' + id; }
}

async function advanceStatus(id, newStatus) {
  const result = await dbUpdatePedido(id, { status: newStatus });
  if (result) {
    const s = STATUS_MAP[newStatus];
    showToast(s.icon + ' ' + s.label, 'success');
    await renderDetalhe(document.getElementById('app-main'), id);
  }
}

function confirmDelete(id) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="modal">
    <div class="modal-title">⚠️ Excluir pedido?</div>
    <div class="modal-text">Essa ação não pode ser desfeita.</div>
    <div class="modal-actions">
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-danger" style="flex:1" onclick="doDelete('${id}')">Excluir</button>
    </div>
  </div>`;
}

async function doDelete(id) {
  closeModal();
  const ok = await dbDeletePedido(id);
  if (ok) { showToast('Pedido excluído', 'success'); state.pedidos = state.pedidos.filter(p => p.id !== id); location.hash = '#/pedidos'; }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function handleSearch(val) {
  state.filter.search = val;
  renderPedidosList();
}

function setStatusFilter(val) {
  state.filter.status = val;
  renderPedidos(document.getElementById('app-main'));
}

function setGalpaoFilter(val) {
  state.filter.galpao = val;
  renderPedidos(document.getElementById('app-main'));
}

function filterByGalpao(g) {
  state.filter.galpao = g;
  state.filter.status = null;
  state.filter.search = '';
  location.hash = '#/pedidos';
}

function parseWhatsApp() {
  const text = document.getElementById('wpp-text')?.value || '';
  if (!text.trim()) { showToast('Cole o texto do WhatsApp primeiro', 'error'); return; }
  const patterns = {
    numero_venda: [/(?:venda|pedido|order|n[uú]mero|n[º°]|#)[:\s]*([A-Z0-9\-]{5,})/i, /\b([0-9]{8,20})\b/],
    etiqueta_ml: [/(?:etiqueta|label)[:\s]*([A-Z0-9\-]+)/i, /\b((?:ML|BR)[0-9A-Z]{8,})\b/i],
    codigo_produto: [/(?:c[oó]d(?:igo)?|sku|ref(?:er[eê]ncia)?)[:\s]*([A-Z0-9\-_]{3,})/i],
    nome_produto: [/(?:produto|item|descri[cç][aã]o)[:\s]*([^\n]{3,60})/i],
    marca: [/(?:marca|brand)[:\s]*([^\n]{2,30})/i],
    nome_cliente: [/(?:cliente|comprador|destinat[aá]rio|nome)[:\s]*([^\n]{3,60})/i],
    quantidade: [/(?:quantidade|qtd|qtde|qty)[:\s]*(\d+)/i],
  };
  const extracted = {};
  for (const [field, pats] of Object.entries(patterns)) {
    for (const pat of pats) {
      const m = text.match(pat);
      if (m && m[1]) { extracted[field] = m[1].trim(); break; }
    }
  }
  let filled = 0;
  for (const [field, value] of Object.entries(extracted)) {
    const el = document.getElementById('f-' + field);
    if (el && value) { el.value = value; filled++; }
  }
  showToast(filled ? `${filled} campo(s) preenchido(s) ✅` : 'Nenhum campo reconhecido. Preencha manualmente.', filled ? 'success' : 'error');
}

function saveConfigForm() {
  const url = document.getElementById('cfg-url')?.value.trim();
  const key = document.getElementById('cfg-key')?.value.trim();
  if (!url || !key) { showToast('Preencha URL e Key', 'error'); return; }
  saveConfig({ url, key });
  state.sb = null;
  initSupabase();
  showToast('Configuração salva! ✅', 'success');
}

async function testConnection() {
  const statusEl = document.getElementById('connection-status');
  saveConfigForm();
  if (!state.sb) { if (statusEl) statusEl.innerHTML = '<span style="color:#b91c1c">❌ Configuração inválida</span>'; return; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted)">Testando...</span>';
  try {
    const { error } = await state.sb.from('pedidos').select('id').limit(1);
    if (error) throw error;
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--status-finalizado)">✅ Conectado com sucesso!</span>';
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#b91c1c">❌ Erro: ${esc(e.message)}</span>`;
  }
}

function copySQL() {
  navigator.clipboard.writeText(SQL_SCHEMA)
    .then(() => showToast('SQL copiado! 📋', 'success'))
    .catch(() => showToast('Não foi possível copiar', 'error'));
}

async function exportData() {
  if (!state.sb) { showToast('Supabase não configurado', 'error'); return; }
  await dbGetPedidos();
  const json = JSON.stringify(state.pedidos, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speedlog-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('hashchange', handleRoute);
  document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  handleRoute();
});