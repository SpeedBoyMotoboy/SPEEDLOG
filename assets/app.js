// SpeedLog v3
const CFG_KEY='sl_cfg';
const DATA_KEY='sl_data';

const SM={
  recebido: {label:'Recebido',  icon:'📥',next:'separacao', nxt:'Iniciar Separação'},
  separacao:{label:'Separação', icon:'🔍',next:'expedicao', nxt:'Marcar Expedição'},
  expedicao:{label:'Expedição', icon:'📦',next:'finalizado',nxt:'Despachar ✅'},
  finalizado:{label:'Despachado',icon:'✅',next:null,       nxt:null}
};
const SO=['recebido','separacao','expedicao','finalizado'];

const SQL='CREATE TABLE IF NOT EXISTS pedidos (\n'+
  '  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,\n'+
  '  created_at     TIMESTAMPTZ DEFAULT NOW(),\n'+
  '  updated_at     TIMESTAMPTZ DEFAULT NOW(),\n'+
  '  numero_venda   TEXT,\n'+
  '  codigo_produto TEXT,\n'+
  '  etiqueta_ml    TEXT,\n'+
  '  nome_cliente   TEXT,\n'+
  '  nome_produto   TEXT,\n'+
  '  marca          TEXT,\n'+
  '  quantidade     TEXT,\n'+
  '  data_despacho  TEXT,\n'+
  '  status         TEXT DEFAULT \'recebido\',\n'+
  '  observacoes    TEXT\n'+
');';

var ST={sb:null,pedidos:[],fStatus:null,fSearch:''};
var qrScanner=null;

function g(id){return document.getElementById(id);}
function esc(s){if(s==null)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function today(){return new Date().toISOString().slice(0,10);}
function uid(){try{return crypto.randomUUID();}catch(e){return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}

function prazoStatus(d){
  if(!d)return null;
  var t=today(),v=d.slice(0,10);
  if(v<t)return 'atrasado';
  if(v===t)return 'hoje';
  return null;
}

function fmtDate(s){
  if(!s)return '';
  try{return new Date(s+'T12:00:00').toLocaleDateString('pt-BR');}catch(e){return s;}
}

// Storage
function loadData(){try{ST.pedidos=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');}catch(e){ST.pedidos=[];}}
function saveData(){try{localStorage.setItem(DATA_KEY,JSON.stringify(ST.pedidos));}catch(e){}}
function getConfig(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'null');}catch(e){return null;}}
function saveConfig(c){localStorage.setItem(CFG_KEY,JSON.stringify(c));}

// Supabase
function initSB(){
  var c=getConfig();
  if(!c||!c.url||!c.key){ST.sb=null;return;}
  try{
    if(!window.supabase){ST.sb=null;return;}
    ST.sb=window.supabase.createClient(c.url,c.key);
  }catch(e){ST.sb=null;}
}

function syncSB(){
  if(!ST.sb)return Promise.resolve();
  return ST.sb.from('pedidos').select('*').order('created_at',{ascending:false})
    .then(function(res){
      if(res.error)throw res.error;
      ST.pedidos=res.data||[];
      saveData();
    })
    .catch(function(e){
      var msg=e.message||'';
      if(msg.indexOf('does not exist')>=0||msg.indexOf('relation')>=0){
        toast('Execute o SQL em Config para criar a tabela','err');
      }else{
        toast('Sync: '+msg,'err');
      }
    });
}

function pushSB(p){
  if(!ST.sb)return;
  ST.sb.from('pedidos').upsert([p]).catch(function(){});
}

function delSB(id){
  if(!ST.sb)return;
  ST.sb.from('pedidos').delete().eq('id',id).catch(function(){});
}

// CRUD
function createPedido(data){
  var now=new Date().toISOString();
  var p={};
  for(var k in data)p[k]=data[k];
  p.id=uid();p.created_at=now;p.updated_at=now;
  if(!p.status)p.status='recebido';
  ST.pedidos.unshift(p);
  saveData();
  pushSB(p);
  return p;
}

function getPedido(id){for(var i=0;i<ST.pedidos.length;i++){if(ST.pedidos[i].id===id)return ST.pedidos[i];}return null;}

function updatePedido(id,u){
  for(var i=0;i<ST.pedidos.length;i++){
    if(ST.pedidos[i].id===id){
      var p=ST.pedidos[i];
      for(var k in u)p[k]=u[k];
      p.updated_at=new Date().toISOString();
      saveData();
      pushSB(p);
      return p;
    }
  }
  return null;
}

function deletePedido(id){
  ST.pedidos=ST.pedidos.filter(function(p){return p.id!==id;});
  saveData();
  delSB(id);
}

// Alerts
function getAlerts(){
  var ativos=ST.pedidos.filter(function(p){return p.status!=='finalizado';});
  var atrasados=ativos.filter(function(p){return prazoStatus(p.data_despacho)==='atrasado';});
  var hojeL=ativos.filter(function(p){return prazoStatus(p.data_despacho)==='hoje';});
  var vm={};
  ST.pedidos.forEach(function(p){if(p.numero_venda){if(!vm[p.numero_venda])vm[p.numero_venda]=[];vm[p.numero_venda].push(p);}});
  var dups=[];
  for(var k in vm){if(vm[k].length>1)dups=dups.concat(vm[k]);}
  var cutoff=new Date(Date.now()-3*86400000).toISOString();
  var parados=ST.pedidos.filter(function(p){return p.status==='recebido'&&p.created_at<cutoff;});
  return{atrasados:atrasados,hoje:hojeL,duplicados:dups,parados:parados,total:atrasados.length+hojeL.length+dups.length+parados.length};
}

// Scanner
function stopScanner(){
  if(qrScanner){
    try{qrScanner.stop().catch(function(){});}catch(e){}
    qrScanner=null;
  }
}

function startScanner(){
  stopScanner();
  var reader=g('reader');
  if(!reader||!window.Html5Qrcode){
    var st=g('scan-status');
    if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Use o campo abaixo para digitar o código</h3></div>';
    return;
  }
  try{
    qrScanner=new Html5Qrcode('reader');
    var cfg={fps:10,qrbox:{width:260,height:120}};
    if(window.Html5QrcodeScanType)cfg.supportedScanTypes=[Html5QrcodeScanType.SCAN_TYPE_CAMERA];
    qrScanner.start({facingMode:'environment'},cfg,
      function(code){stopScanner();onCodeFound(code);},
      function(){}
    ).catch(function(){
      var st=g('scan-status');
      if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Permita acesso à câmera</h3><p>Toque no cadeado na barra de endereço e autorize a câmera.</p></div>';
    });
  }catch(e){
    var st=g('scan-status');
    if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Erro na câmera</h3><p>'+esc(e.message)+'</p></div>';
  }
}

function onCodeFound(code){
  var r=g('scan-result');
  if(!r)return;
  var matches=ST.pedidos.filter(function(p){
    return p.codigo_produto&&p.codigo_produto.trim().toUpperCase()===code.trim().toUpperCase();
  });
  var inner='';
  if(matches.length===0){
    inner='<div class="no-match">❌ Código <strong>'+esc(code)+'</strong> não encontrado.<br><a href="#/novo" style="color:var(--blue);font-weight:600">+ Cadastrar novo pedido</a></div>';
  }else{
    matches.forEach(function(p){inner+=orderCard(p);});
  }
  r.innerHTML='<div class="scan-result">'+
    '<div class="scan-code"><span style="font-size:1.4rem">🔍</span>'+
    '<span class="scan-code-val">'+esc(code)+'</span>'+
    '<button class="btn btn-n" style="font-size:.8rem;padding:.4rem .8rem;min-height:36px" onclick="window.restartScan()">Nova bipagem</button></div>'+
    '<div class="scan-matches">'+inner+'</div></div>';
}

window.restartScan=function(){var r=g('scan-result');if(r)r.innerHTML='';startScanner();};

// Router
function routeParse(){
  var h=location.hash.slice(1)||'/';
  var p=h.split('/').filter(function(x){return x;});
  if(!p.length)return{page:'home',id:null};
  if(p[0]==='pedidos')return{page:'pedidos',id:null};
  if(p[0]==='novo')return{page:'novo',id:null};
  if(p[0]==='editar'&&p[1])return{page:'editar',id:p[1]};
  if(p[0]==='pedido'&&p[1])return{page:'detalhe',id:p[1]};
  if(p[0]==='bipar')return{page:'bipar',id:null};
  if(p[0]==='alertas')return{page:'alertas',id:null};
  if(p[0]==='config')return{page:'config',id:null};
  return{page:'home',id:null};
}

function go(){
  stopScanner();
  var route=routeParse();
  var page=route.page,id=route.id;
  var main=g('app-main'),back=g('btn-back'),ttl=g('page-title'),acts=g('header-actions');
  if(!main)return;

  document.querySelectorAll('.nav-item').forEach(function(el){
    var dp=el.dataset.page;
    el.classList.toggle('active',dp===page||(page==='detalhe'&&dp==='pedidos')||(page==='editar'&&dp==='pedidos'));
  });

  if(acts)acts.innerHTML='';
  if(back){back.classList.add('hidden');back.onclick=null;}
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';

  // Alert badge
  try{
    var al=getAlerts();
    var an=document.querySelector('[data-page=alertas]');
    if(an){
      var badge=an.querySelector('.alert-badge');
      if(al.total>0){
        if(!badge){badge=document.createElement('span');badge.className='alert-badge';an.style.position='relative';an.appendChild(badge);}
        badge.textContent=al.total>9?'9+':String(al.total);
      }else if(badge){badge.remove();}
    }
  }catch(e){}

  try{
    if(page==='home'){if(ttl)ttl.textContent='SpeedLog';pgHome(main);}
    else if(page==='pedidos'){if(ttl)ttl.textContent='Pedidos';pgPedidos(main);}
    else if(page==='novo'){
      if(ttl)ttl.textContent='Novo Pedido';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgNovo(main);
    }
    else if(page==='editar'){
      if(ttl)ttl.textContent='Editar';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgEditar(main,id);
    }
    else if(page==='detalhe'){
      if(ttl)ttl.textContent='Pedido';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      if(acts)acts.innerHTML=
        '<a href="#/editar/'+id+'" class="btn-icon" title="Editar">'+
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></a>'+
        '<button class="btn-icon" onclick="window.confirmDel(\'' +id+ '\')" >'+
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>';
      pgDetalhe(main,id);
    }
    else if(page==='bipar'){if(ttl)ttl.textContent='Bipar Produto';pgBipar(main);}
    else if(page==='alertas'){if(ttl)ttl.textContent='Alertas';pgAlertas(main);}
    else if(page==='config'){if(ttl)ttl.textContent='Configurações';pgConfig(main);}
  }catch(e){
    main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao carregar</h3><p style="color:var(--red);font-size:.8rem">'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar App</button></div></div>';
  }
}

// HOME
function pgHome(main){
  if(ST.sb){
    main.innerHTML='<div class="loader"><div class="spin"></div></div>';
    syncSB().then(function(){renderHome(main);});
  }else{
    renderHome(main);
  }
}

function renderHome(main){
  var c={recebido:0,separacao:0,expedicao:0,finalizado:0};
  ST.pedidos.forEach(function(p){if(c[p.status]!==undefined)c[p.status]++;});
  var urgent=ST.pedidos.filter(function(p){return p.status!=='finalizado';}).slice(0,6);
  var al=getAlerts();
  var h='<div class="page">';
  h+='<div class="stats-grid">';
  h+=sCard('s-rec','📥',c.recebido,'Recebidos');
  h+=sCard('s-sep','🔍',c.separacao,'Separação');
  h+=sCard('s-exp','📦',c.expedicao,'Expedição');
  h+=sCard('s-fin','✅',c.finalizado,'Despachados');
  h+='</div>';
  if(al.total>0){
    h+='<a href="#/alertas" style="background:#fef2f2;border-radius:var(--r);padding:1rem;display:flex;align-items:center;gap:.75rem;text-decoration:none;border:1.5px solid #fecaca">';
    h+='<span style="font-size:1.5rem">⚠️</span><div style="flex:1">';
    h+='<span style="font-weight:700;color:#b91c1c;font-size:.95rem">'+al.total+' alerta'+(al.total>1?'s':'')+'</span><br>';
    h+='<span style="font-size:.8rem;color:#6b7280">'+al.atrasados.length+' atrasado'+(al.atrasados.length!==1?'s':'')+' · '+al.hoje.length+' hoje · '+al.duplicados.length+' duplicado'+(al.duplicados.length!==1?'s':'')+'</span></div>';
    h+='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#b91c1c" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></a>';
  }
  if(urgent.length){
    h+='<div><div class="sec-hdr"><span class="sec-ttl">Pendentes</span><a href="#/pedidos" style="font-size:.8rem;color:var(--blue);font-weight:600">Ver todos →</a></div>';
    h+='<div style="display:flex;flex-direction:column;gap:.75rem">';
    urgent.forEach(function(p){h+=orderCard(p);});
    h+='</div></div>';
  }else{
    h+='<div class="empty"><span class="empty-ico">🎉</span><h3>Tudo em dia!</h3><p>Nenhum pedido pendente.</p></div>';
  }
  if(ST.pedidos.length===0){
    h+='<div style="background:var(--blue);border-radius:var(--r);padding:1.25rem;color:#fff;text-align:center">';
    h+='<div style="font-size:1.8rem;margin-bottom:.5rem">🚚</div>';
    h+='<p style="font-size:.9rem;opacity:.9;margin-bottom:1rem">Toque em 📷 para bipar ou cadastre manualmente!</p>';
    h+='<a href="#/novo" class="btn btn-o btn-bl">+ Novo Pedido</a></div>';
  }
  h+='</div>';
  main.innerHTML=h;
}

function sCard(cls,ico,num,lbl){
  return '<div class="stat-card '+cls+'">'+'<span class="stat-ico">'+ico+'</span><span class="stat-num">'+num+'</span><span class="stat-lbl">'+lbl+'</span></div>';
}

// PEDIDOS
function pgPedidos(main){
  var chips='<span class="chip '+(!ST.fStatus?'on':'')+' " onclick="window.fSt(null)">Todos</span>';
  SO.forEach(function(s){
    chips+='<span class="chip '+(ST.fStatus===s?'on '+s:'')+' " onclick="window.fSt(\'' +s+ '\')">'+ SM[s].icon+' '+SM[s].label+'</span>';
  });
  main.innerHTML='<div class="page">'+
    '<div class="search-wrap">'+
    '<svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>'+
    '<input type="search" id="si" placeholder="Nome, nº venda, código..." value="'+esc(ST.fSearch)+'" oninput="window.doSearch(this.value)" autocomplete="off">'+
    '</div>'+
    '<div class="chips">'+chips+'</div>'+
    '<div id="lst"></div>'+
    '</div>';
  renderList();
}

function renderList(){
  var el=g('lst');if(!el)return;
  var d=ST.pedidos.slice();
  if(ST.fStatus)d=d.filter(function(p){return p.status===ST.fStatus;});
  if(ST.fSearch){
    var q=ST.fSearch.toLowerCase();
    d=d.filter(function(p){
      return [p.nome_cliente,p.codigo_produto,p.numero_venda,p.etiqueta_ml,p.nome_produto,p.marca].some(function(v){return v&&v.toLowerCase().indexOf(q)>=0;});
    });
  }
  if(!d.length){el.innerHTML='<div class="empty"><span class="empty-ico">🔍</span><h3>Nenhum pedido encontrado</h3></div>';return;}
  var h='<div style="display:flex;flex-direction:column;gap:.75rem">';
  d.forEach(function(p){h+=orderCard(p);});
  el.innerHTML=h+'</div>';
}

function orderCard(p){
  var s=SM[p.status]||SM.recebido;
  var ps=prazoStatus(p.data_despacho);
  var isAt=ps==='atrasado'&&p.status!=='finalizado';
  var dt=p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'';
  var meta='';
  if(p.numero_venda)meta+='<span class="meta">🏷 <strong>'+esc(p.numero_venda)+'</strong></span>';
  if(p.codigo_produto)meta+='<span class="meta">📊 '+esc(p.codigo_produto)+'</span>';
  if(p.nome_produto)meta+='<span class="meta">'+esc(p.nome_produto)+(p.marca?' — '+esc(p.marca):'')+'</span>';
  if(p.quantidade)meta+='<span class="meta">Qtd: '+esc(p.quantidade)+'</span>';
  if(p.data_despacho&&p.status!=='finalizado'){
    meta+='<span class="meta '+(isAt?'danger':ps==='hoje'?'warn':'')+'">Prazo: '+fmtDate(p.data_despacho)+(isAt?' ⏰':ps==='hoje'?' ⚠️':'')+'</span>';
  }
  if(dt)meta+='<span class="meta">📅 '+dt+'</span>';
  return '<a href="#/pedido/'+p.id+'" class="order-card '+(isAt?'atrasado':p.status)+'">'+'<div class="oc-hdr"><span class="oc-ttl">'+esc(p.nome_cliente||'Cliente não informado')+'</span><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span></div>'+'<div class="oc-meta">'+meta+'</div></a>';
}

// BIPAR
function pgBipar(main){
  main.innerHTML='<div class="page">'+
    '<div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Aponte para o código de barras do produto</div>'+
    '<div id="scan-status"></div>'+
    '<div id="scan-result"></div>'+
    '<div style="background:var(--card);border-radius:var(--r);padding:1rem;box-shadow:var(--sh)">'+
    '<div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Ou digite o código manualmente</div>'+
    '<div style="display:flex;gap:.5rem">'+
    '<input class="fc" id="manual-code" type="text" placeholder="Ex: KTB759" style="flex:1;text-transform:uppercase">'+
    '<button class="btn btn-p" onclick="window.manualCode()">Buscar</button>'+
    '</div></div></div>';
  setTimeout(startScanner,200);
}

window.manualCode=function(){
  var inp=g('manual-code');
  var code=inp?inp.value.trim().toUpperCase():'';
  if(!code){toast('Digite um código','err');return;}
  stopScanner();
  onCodeFound(code);
};

// ALERTAS
function pgAlertas(main){
  var al=getAlerts();
  function sec(title,cls,items){
    if(!items.length)return '';
    var h='<div class="alert-group"><div class="alert-group-ttl '+cls+'">'+title+' <span style="background:currentColor;color:#fff;border-radius:20px;padding:1px 8px;font-size:.65rem">'+items.length+'</span></div>';
    items.forEach(function(p){h+=orderCard(p);});
    return h+'</div>';
  }
  var total=al.atrasados.length+al.hoje.length+al.duplicados.length+al.parados.length;
  var h='<div class="page">';
  if(total===0)h+='<div class="empty"><span class="empty-ico">✅</span><h3>Nenhum alerta!</h3><p>Todos os pedidos estão em dia.</p></div>';
  h+=sec('⏰ Atrasados — prazo vencido','red',al.atrasados);
  h+=sec('⚠️ Despachar hoje','yellow',al.hoje);
  h+=sec('⚠️ Possíveis duplicatas','yellow',al.duplicados);
  h+=sec('🕗 Parados há mais de 3 dias','blue',al.parados);
  main.innerHTML=h+'</div>';
}

// DETALHE
function pgDetalhe(main,id){
  var p=getPedido(id);
  if(!p){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Pedido não encontrado</h3></div></div>';return;}
  var s=SM[p.status]||SM.recebido;
  var ci=SO.indexOf(p.status);
  var ps=prazoStatus(p.data_despacho);
  var dupes=p.numero_venda?ST.pedidos.filter(function(x){return x.numero_venda===p.numero_venda&&x.id!==p.id;}):[];
  var h='<div class="page">';
  if(ps==='atrasado'&&p.status!=='finalizado')h+='<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:var(--r);padding:.75rem 1rem;color:#b91c1c;font-weight:700">⏰ PRAZO VENCIDO — '+fmtDate(p.data_despacho)+'</div>';
  if(ps==='hoje'&&p.status!=='finalizado')h+='<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--r);padding:.75rem 1rem;color:#856404;font-weight:700">⚠️ DESPACHAR HOJE!</div>';
  if(dupes.length)h+='<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--r);padding:.75rem 1rem;color:#856404;font-size:.875rem">⚠️ Esta venda aparece em '+(dupes.length+1)+' pedido(s). Pode ser duplicata.</div>';
  // Progress
  h+='<div class="sprog">';
  SO.forEach(function(st,i){
    var cl=i<ci?'done':(i===ci?'active':'');
    h+='<div class="pstep '+cl+'"><div class="pdot">'+(i<ci?'✓':String(i+1))+'</div><span class="plbl">'+SM[st].label+'</span></div>';
  });
  h+='</div>';
  // Card
  h+='<div class="dcard"><div class="fb"><h2 style="font-size:1.1rem;font-weight:800;flex:1;padding-right:.5rem">'+esc(p.nome_cliente||'Cliente não informado')+'</h2><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span></div><div class="dg">';
  h+=dfield('Nº Venda ML',p.numero_venda);
  h+=dfield('Cód. Produto',p.codigo_produto);
  h+=dfield('Etiqueta ML',p.etiqueta_ml);
  h+=dfield('Produto',p.nome_produto);
  h+=dfield('Marca',p.marca);
  h+=dfield('Quantidade',p.quantidade);
  if(p.data_despacho)h+='<div class="df"><span class="dl">Prazo Despacho</span><span class="dv" style="color:'+(ps==='atrasado'?'var(--red)':ps==='hoje'?'#856404':'inherit')+'">'+fmtDate(p.data_despacho)+(ps==='atrasado'?' ⏰':ps==='hoje'?' ⚠️':'')+'</span></div>';
  if(p.created_at)h+=dfield('Cadastrado',new Date(p.created_at).toLocaleString('pt-BR'));
  h+='</div>';
  if(p.observacoes)h+='<div class="df"><span class="dl">Observações</span><span class="dv">'+esc(p.observacoes)+'</span></div>';
  h+='</div>';
  // Action
  if(s.next){
    h+='<button class="act-btn '+s.next+'" onclick="window.advance(\'' +p.id+ '\',\'' +s.next+ '\')">';
    h+='<div class="act-ico '+s.next+'">'+SM[s.next].icon+'</div>';
    h+='<div style="flex:1"><div style="font-weight:800;font-size:.95rem">'+esc(s.nxt)+'</div><div style="font-size:.75rem;color:var(--muted);margin-top:2px">→ '+SM[s.next].label+'</div></div>';
    h+='<svg style="opacity:.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>';
  }else{
    h+='<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700">✅ Pedido Despachado</div>';
  }
  main.innerHTML=h+'</div>';
}

function dfield(l,v){
  if(v==null||v==='')return '';
  return '<div class="df"><span class="dl">'+l+'</span><span class="dv">'+esc(String(v))+'</span></div>';
}

// NOVO
function pgNovo(main){
  main.innerHTML='<div class="page">'+
    '<div class="wbox">'+
    '<div class="wbox-hdr"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> Colar texto do WhatsApp</div>'+
    '<p class="muted sm" style="margin-bottom:.5rem">Cole a mensagem do grupo: VENDA / CLIENTE / PRODUTO / CÓDIGO / QUANTIDADE</p>'+
    '<textarea class="fc" id="wt" rows="5" placeholder="VENDA: 2000001...\nCLIENTE: João Silva\nPRODUTO: Kit Correia\nCÓDIGO: KTB759\nQUANTIDADE: 1 KIT"></textarea>'+
    '<button class="btn btn-n btn-bl mt" onclick="window.parseWpp()">🔍 Interpretar e preencher</button>'+
    '</div>'+
    '<div class="dcard">'+
    '<span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Dados do Pedido</span>'+
    buildForm(null)+
    '<button class="btn btn-p btn-bl mt2" onclick="window.saveNovo()">💾 Salvar Pedido</button>'+
    '</div></div>';
}

// EDITAR
function pgEditar(main,id){
  var p=getPedido(id);
  if(!p){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>';return;}
  main.innerHTML='<div class="page"><div class="dcard">'+buildForm(p)+'<button class="btn btn-p btn-bl mt2" onclick="window.saveEditar(\'' +id+ '\')" >💾 Salvar Alterações</button></div></div>';
}

function buildForm(p){
  if(!p)p={};
  var opts='';
  SO.forEach(function(s){opts+='<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+SM[s].label+'</option>';});
  return '<div class="fg"><label class="fl">Cliente *</label><input class="fc" id="fn" type="text" placeholder="Ex: Amarildo da Conceição" value="'+esc(p.nome_cliente||'')+'"></div>'+
    '<div class="g2">'+
    '<div class="fg"><label class="fl">Nº Venda ML</label><input class="fc" id="fv" type="text" placeholder="2000001296..." value="'+esc(p.numero_venda||'')+'"></div>'+
    '<div class="fg"><label class="fl">Etiqueta ML</label><input class="fc" id="fe" type="text" placeholder="BR0001..." value="'+esc(p.etiqueta_ml||'')+'"></div>'+
    '</div>'+
    '<div class="g2">'+
    '<div class="fg"><label class="fl">Cód. Produto</label><input class="fc" id="fc2" type="text" placeholder="Ex: KTB759" style="text-transform:uppercase" value="'+esc(p.codigo_produto||'')+'"></div>'+
    '<div class="fg"><label class="fl">Quantidade</label><input class="fc" id="fq" type="text" placeholder="Ex: 1 KIT" value="'+esc(p.quantidade||'')+'"></div>'+
    '</div>'+
    '<div class="fg"><label class="fl">Nome do Produto</label><input class="fc" id="fp" type="text" placeholder="Ex: Kit Correia Dentada Jeep" value="'+esc(p.nome_produto||'')+'"></div>'+
    '<div class="g2">'+
    '<div class="fg"><label class="fl">Marca</label><input class="fc" id="fm" type="text" placeholder="Ex: Gates" value="'+esc(p.marca||'')+'"></div>'+
    '<div class="fg"><label class="fl">Prazo Despacho</label><input class="fc" id="fd" type="date" value="'+esc(p.data_despacho||'')+'"></div>'+
    '</div>'+
    '<div class="fg"><label class="fl">Status</label><select class="fc" id="fs">'+opts+'</select></div>'+
    '<div class="fg"><label class="fl">Observações</label><textarea class="fc" id="fo" placeholder="Notas...">'+esc(p.observacoes||'')+'</textarea></div>';
}

// CONFIG
function pgConfig(main){
  var cfg=getConfig()||{},n=ST.pedidos.length;
  main.innerHTML='<div class="page">'+
    '<div class="csec">'+
    '<div class="csec-ttl">☁️ Supabase (sincronização entre celulares)</div>'+
    '<p class="muted sm" style="margin-bottom:.75rem">Crie um projeto gratuito em supabase.com.</p>'+
    '<div class="fg"><label class="fl">URL do Projeto</label><input class="fc" id="cu" type="url" placeholder="https://xxxxx.supabase.co" value="'+esc(cfg.url||'')+'"></div>'+
    '<div class="fg mt"><label class="fl">Anon Key</label><input class="fc" id="ck" type="text" placeholder="sb_publishable_... ou eyJhbG..." value="'+esc(cfg.key||'')+'"></div>'+
    '<div style="display:flex;gap:.75rem;margin-top:1rem">'+
    '<button class="btn btn-p" onclick="window.saveCfg()" style="flex:1">💾 Salvar</button>'+
    '<button class="btn btn-n" onclick="window.testCfg()">🔌 Testar</button>'+
    '</div><div id="cst" class="mt sm"></div></div>'+
    '<div class="csec">'+
    '<div class="csec-ttl">📋 SQL — criar tabela no Supabase</div>'+
    '<textarea class="fc" id="sql-box" readonly rows="14" style="font-family:monospace;font-size:.72rem;background:#f8fafc">'+esc(SQL)+'</textarea>'+
    '<button class="btn btn-n btn-bl mt" onclick="window.copySql()">📋 Copiar SQL</button></div>'+
    '<div class="csec">'+
    '<div class="csec-ttl">📊 Dados locais ('+n+' pedido'+(n!==1?'s':'')+' )</div>'+
    '<div style="display:flex;gap:.75rem">'+
    '<button class="btn btn-n" style="flex:1" onclick="window.exportData()">⬇️ Exportar JSON</button>'+
    '<button class="btn btn-d" style="flex:1" onclick="window.confirmClear()">🗑️ Limpar tudo</button>'+
    '</div></div></div>';
}

// ACTIONS
function formData(){
  function v(id){var el=g(id);return el&&el.value.trim()?el.value.trim():null;}
  return{
    nome_cliente:v('fn'),
    numero_venda:v('fv'),
    etiqueta_ml:v('fe'),
    codigo_produto:v('fc2')?v('fc2').toUpperCase():null,
    nome_produto:v('fp'),
    marca:v('fm'),
    quantidade:v('fq'),
    data_despacho:v('fd'),
    status:g('fs')?g('fs').value:'recebido',
    observacoes:v('fo')
  };
}

window.saveNovo=function(){
  var d=formData();
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  if(d.numero_venda){
    var dup=getPedido&&ST.pedidos.find(function(p){return p.numero_venda===d.numero_venda;});
    if(dup)toast('⚠️ Venda '+d.numero_venda+' já existe!','warn');
  }
  var p=createPedido(d);
  toast('Pedido salvo! ✅','ok');
  location.hash='#/pedido/'+p.id;
};

window.saveEditar=function(id){
  var d=formData();
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  updatePedido(id,d);
  toast('Atualizado! ✅','ok');
  location.hash='#/pedido/'+id;
};

window.advance=function(id,nxt){
  updatePedido(id,{status:nxt});
  toast(SM[nxt].icon+' '+SM[nxt].label,'ok');
  go();
};

window.confirmDel=function(id){
  modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir pedido?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDel(\'' +id+ '\')" >Excluir</button></div></div>');
};

window.doDel=function(id){
  window.closeModal();
  deletePedido(id);
  toast('Excluído','ok');
  location.hash='#/pedidos';
};

window.confirmClear=function(){
  modal('<div class="modal"><div class="modal-ttl">⚠️ Limpar tudo?</div><div class="modal-txt">Apagará TODOS os '+ST.pedidos.length+' pedidos localmente.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doClear()">Limpar</button></div></div>');
};

window.doClear=function(){
  window.closeModal();
  ST.pedidos=[];
  saveData();
  toast('Apagado','ok');
  location.hash='#/';
};

window.doSearch=function(v){ST.fSearch=v;renderList();};
window.fSt=function(v){ST.fStatus=v;pgPedidos(g('app-main'));};

window.parseWpp=function(){
  var wt=g('wt');
  var txt=wt?wt.value:'';
  if(!txt.trim()){toast('Cole o texto primeiro','err');return;}
  function ex(pats,t){for(var i=0;i<pats.length;i++){var m=t.match(pats[i]);if(m&&m[1])return m[1].trim();}return null;}
  var pairs=[
    ['fn', [/CLIENTE[:\s]+([^\n]+)/i]],
    ['fv', [/VENDA[:\s]+([^\n]+)/i]],
    ['fc2',[/C[ÓO]DIGO[:\s]+([^\n]+)/i]],
    ['fp', [/PRODUTO[:\s]+([^\n]+)/i]],
    ['fm', [/MARCA[:\s]+([^\n]+)/i]],
    ['fq', [/QUANTIDADE[:\s]+([^\n]+)/i]],
    ['fe', [/etiqueta[:\s]+([^\n]+)/i,/\b((?:ML|BR)[0-9A-Z]{8,})\b/i]]
  ];
  var n=0;
  for(var i=0;i<pairs.length;i++){
    var fid=pairs[i][0],pats=pairs[i][1];
    var val=ex(pats,txt);
    if(val){
      var el=g(fid);
      if(el){el.value=fid==='fc2'?val.toUpperCase():val;n++;}
    }
  }
  toast(n?n+' campo(s) preenchido(s) ✅':'Nada reconhecido. Preencha manualmente.',n?'ok':'err');
};

window.saveCfg=function(){
  var cu=g('cu'),ck=g('ck');
  var u=cu?cu.value.trim():'',k=ck?ck.value.trim():'';
  if(!u||!k){toast('Preencha URL e Key','err');return;}
  saveConfig({url:u,key:k});
  initSB();
  toast('Salvo! ✅','ok');
};

window.testCfg=function(){
  window.saveCfg();
  var el=g('cst');
  if(!el)return;
  if(!ST.sb){el.innerHTML='<span style="color:#b91c1c">❌ Client inválido — verifique URL e Key</span>';return;}
  el.innerHTML='Testando...';
  ST.sb.from('pedidos').select('id').limit(1)
    .then(function(res){
      if(res.error){
        var msg=res.error.message||'';
        if(msg.indexOf('does not exist')>=0||msg.indexOf('relation')>=0){
          el.innerHTML='<span style="color:#856404">⚠️ Conectado! Execute o SQL acima para criar a tabela.</span>';
        }else{
          el.innerHTML='<span style="color:#b91c1c">❌ '+esc(msg)+'</span>';
        }
      }else{
        el.innerHTML='<span style="color:var(--s-fin)">✅ Conectado e tabela OK!</span>';
        syncSB().then(function(){toast('Sincronizado!','ok');});
      }
    })
    .catch(function(e){
      el.innerHTML='<span style="color:#b91c1c">❌ '+esc(e.message)+'</span>';
    });
};

window.copySql=function(){
  var box=g('sql-box');
  var text=box?box.value:SQL;
  navigator.clipboard.writeText(text).then(function(){toast('SQL copiado!','ok');}).catch(function(){toast('Erro ao copiar','err');});
};

window.exportData=function(){
  var b=new Blob([JSON.stringify(ST.pedidos,null,2)],{type:'application/json'});
  var u=URL.createObjectURL(b);
  var a=document.createElement('a');
  a.href=u;a.download='speedlog-'+today()+'.json';a.click();
  URL.revokeObjectURL(u);
};

// Modal / Toast
function modal(html){var o=g('modal-overlay');if(o){o.classList.remove('hidden');o.innerHTML=html;}}
window.closeModal=function(){var o=g('modal-overlay');if(o)o.classList.add('hidden');};

function toast(msg,type){
  var c=g('toast-container');if(!c)return;
  var t=document.createElement('div');
  t.className='toast '+(type||'');
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(function(){try{t.remove();}catch(e){}},3200);
}

// Init
document.addEventListener('DOMContentLoaded',function(){
  try{
    loadData();
    initSB();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
    window.addEventListener('hashchange',function(){try{go();}catch(e){}});
    var ov=g('modal-overlay');
    if(ov)ov.addEventListener('click',function(e){if(e.target===this)window.closeModal();});
    try{go();}catch(e){
      var m=g('app-main');
      if(m)m.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao iniciar</h3><p>'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';
    }
  }catch(e){
    document.body.innerHTML='<div style="padding:2rem;text-align:center"><h2>Erro crítico</h2><p>'+esc(e.message)+'</p><button onclick="location.reload()">Recarregar</button></div>';
  }
});
