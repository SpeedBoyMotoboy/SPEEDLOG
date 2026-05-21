// SpeedLog v8 — OCR Pack ID
var DATA_KEY = 'sl_data';
var FB_KEY   = 'sl_fb';

var SM = {
  recebido:  {label:'Recebido',   icon:'📥', next:'separacao',  nxt:'Iniciar Separação'},
  separacao: {label:'Separação', icon:'🔍', next:'expedicao',  nxt:'Marcar Expedição'},
  expedicao: {label:'Expedição', icon:'📦', next:'finalizado', nxt:'Despachar ✅'},
  finalizado:{label:'Despachado', icon:'✅', next:null,         nxt:null}
};
var SO = ['recebido','separacao','expedicao','finalizado'];
var GALPOES = {real:'Real', comdip:'Comdip', bressan:'Bressan', sama:'Sama', pellegrino:'Pellegrino', eletropar:'Eletropar Nal.'};

var ST = {pedidos:[], fStatus:null, fGalpao:null, fSearch:''};
var fbDb = null;
var qrScanner = null;
var PREFILL = null;

function g(id){return document.getElementById(id);}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function today(){return new Date().toISOString().slice(0,10);}
function uid(){try{return crypto.randomUUID();}catch(e){return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function prazoStatus(d){if(!d)return null;var t=today(),v=d.slice(0,10);if(v<t)return'atrasado';if(v===t)return'hoje';return null;}
function fmtDate(s){if(!s)return'';try{return new Date(s+'T12:00:00').toLocaleDateString('pt-BR');}catch(e){return s;}}

function loadData(){try{ST.pedidos=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');}catch(e){ST.pedidos=[];}}
function saveData(){try{localStorage.setItem(DATA_KEY,JSON.stringify(ST.pedidos));}catch(e){}}
function getFbConfig(){try{return JSON.parse(localStorage.getItem(FB_KEY)||'null');}catch(e){return null;}}
function saveFbConfig(c){localStorage.setItem(FB_KEY,JSON.stringify(c));}

// ── FIREBASE ────────────────────────────────────────────────────────────────
function initFirebase(){
  var cfg = getFbConfig();
  if(!cfg || !cfg.databaseURL){ fbDb = null; return; }
  try{
    if(!window.firebase){toast('Firebase SDK não carregou','err');return;}
    if(firebase.apps.length) firebase.apps[0].delete().catch(function(){});
    firebase.initializeApp(cfg);
    fbDb = firebase.database();
    fbDb.ref('pedidos').on('value', function(snap){
      var raw = snap.val()||{};
      var arr = Object.values(raw);
      arr.sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
      ST.pedidos = arr;
      saveData();
      var page = routeParse().page;
      var main = g('app-main');
      if(page==='home' && main) renderHome(main);
      else if(page==='pedidos' && main) renderList();
      updateAlertBadge();
    }, function(err){
      var msg = err.message||'';
      if(msg.indexOf('Permission')>=0||msg.indexOf('permission')>=0){
        toast('Firebase: configure as Regras no Console','err');
      } else {
        toast('Firebase: '+msg,'err');
      }
    });
  }catch(e){
    fbDb = null;
    toast('Erro Firebase: '+e.message,'err');
  }
}

function pushFB(p){if(!fbDb)return;fbDb.ref('pedidos/'+p.id).set(p).catch(function(){});}
function delFB(id){if(!fbDb)return;fbDb.ref('pedidos/'+id).remove().catch(function(){});}

function updateAlertBadge(){
  try{
    var al=getAlerts();
    var an=document.querySelector('[data-page=alertas]');
    if(!an)return;
    var badge=an.querySelector('.alert-badge');
    if(al.total>0){
      if(!badge){badge=document.createElement('span');badge.className='alert-badge';an.style.position='relative';an.appendChild(badge);}
      badge.textContent=al.total>9?'9+':String(al.total);
    }else if(badge){badge.remove();}
  }catch(e){}
}

// ── CRUD ────────────────────────────────────────────────────────────────────
function createPedido(data){
  var now=new Date().toISOString();
  var p={}; for(var k in data)p[k]=data[k];
  p.id=uid();p.created_at=now;p.updated_at=now;
  if(!p.status)p.status='recebido';
  ST.pedidos.unshift(p); saveData(); pushFB(p);
  return p;
}
function getPedido(id){for(var i=0;i<ST.pedidos.length;i++){if(ST.pedidos[i].id===id)return ST.pedidos[i];}return null;}
function updatePedido(id,u){
  for(var i=0;i<ST.pedidos.length;i++){
    if(ST.pedidos[i].id===id){
      var p=ST.pedidos[i]; for(var k in u)p[k]=u[k];
      p.updated_at=new Date().toISOString();
      saveData(); pushFB(p); return p;
    }
  }
  return null;
}
function deletePedido(id){
  ST.pedidos=ST.pedidos.filter(function(p){return p.id!==id;});
  saveData(); delFB(id);
}

// ── ALERTS ──────────────────────────────────────────────────────────────────
function getAlerts(){
  var ativos=ST.pedidos.filter(function(p){return p.status!=='finalizado';});
  var atrasados=ativos.filter(function(p){return prazoStatus(p.data_despacho)==='atrasado';});
  var hojeL=ativos.filter(function(p){return prazoStatus(p.data_despacho)==='hoje';});
  var vm={};
  ST.pedidos.forEach(function(p){if(p.numero_venda){if(!vm[p.numero_venda])vm[p.numero_venda]=[];vm[p.numero_venda].push(p);}});
  var dups=[];for(var k in vm){if(vm[k].length>1)dups=dups.concat(vm[k]);}
  var cutoff=new Date(Date.now()-3*86400000).toISOString();
  var parados=ST.pedidos.filter(function(p){return p.status==='recebido'&&p.created_at<cutoff;});
  return{atrasados:atrasados,hoje:hojeL,duplicados:dups,parados:parados,total:atrasados.length+hojeL.length+dups.length+parados.length};
}

// ── SCANNER ─────────────────────────────────────────────────────────────────
function stopScanner(){if(qrScanner){try{qrScanner.stop().catch(function(){});}catch(e){}qrScanner=null;}}
function startScanner(){
  stopScanner();
  var reader=g('reader');
  if(!reader||!window.Html5Qrcode){
    var st=g('scan-status');if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Use o campo abaixo para digitar o código</h3></div>';
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
      var st=g('scan-status');if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Permita acesso à câmera</h3><p>Toque no cadeado na barra de endereço e autorize.</p></div>';
    });
  }catch(e){
    var st=g('scan-status');if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Erro: '+esc(e.message)+'</h3></div>';
  }
}

function onCodeFound(code){
  var r=g('scan-result');if(!r)return;
  var codeU=code.trim().toUpperCase();
  var codeT=code.trim();
  var matches=ST.pedidos.filter(function(p){
    return(
      (p.codigo_produto&&p.codigo_produto.trim().toUpperCase()===codeU)||
      (p.etiqueta_ml&&p.etiqueta_ml.trim().toUpperCase()===codeU)||
      (p.numero_venda&&p.numero_venda.trim()===codeT)||
      (p.etiqueta_ml&&codeU.length>5&&p.etiqueta_ml.toUpperCase().indexOf(codeU)>=0)
    );
  });
  var topBar='<div class="scan-code"><span style="font-size:1.4rem">🔍</span><span class="scan-code-val">'+esc(codeT)+'</span><button class="btn btn-n" style="font-size:.8rem;padding:.4rem .8rem;min-height:36px" onclick="window.restartScan()">Nova bipagem</button></div>';
  if(matches.length===0){
    var campo='fc2';var tipoLabel='código de produto';
    if(/^(ML|BR)[A-Z0-9]{5,}$/i.test(codeT)){campo='fe';tipoLabel='etiqueta Mercado Livre';}
    else if(/^\d{10,}$/.test(codeT)){campo='fv';tipoLabel='número de venda / Pack ID';}
    PREFILL={campo:campo,valor:campo==='fc2'?codeU:codeT};
    var noPedidos=ST.pedidos.length===0;
    var msg=noPedidos
      ?'<p style="color:var(--muted);font-size:.85rem">Nenhum pedido cadastrado ainda.<br>Cadastre as etiquetas do WhatsApp primeiro, depois bipe para encontrar.</p>'
      :'<p style="color:var(--muted);font-size:.85rem">Nenhum pedido com '+tipoLabel+' <strong>'+esc(codeT)+'</strong>.<br>Cadastre agora com o código já preenchido:</p>';
    r.innerHTML='<div class="scan-result">'+topBar+'<div class="scan-matches"><div class="no-match" style="padding:1.25rem;text-align:center"><div style="font-size:2.5rem;margin-bottom:.5rem">🤔</div><div style="font-weight:700;font-size:1rem;margin-bottom:.5rem">Não encontrado</div>'+msg+'<a href="#/novo" class="btn btn-p btn-bl" style="margin-top:.75rem">+ Cadastrar pedido com este código</a></div></div></div>';
  }else{
    var cards='';
    matches.forEach(function(p){
      var s=SM[p.status]||SM.recebido;
      var ps=prazoStatus(p.data_despacho);
      var isAt=ps==='atrasado'&&p.status!=='finalizado';
      var details='';
      if(p.nome_cliente)details+='<div class="scan-detail-row"><span class="dl">Cliente</span><span class="dv bold">'+esc(p.nome_cliente)+'</span></div>';
      if(p.numero_venda)details+='<div class="scan-detail-row"><span class="dl">Venda ML</span><span class="dv mono">'+esc(p.numero_venda)+'</span></div>';
      if(p.etiqueta_ml)details+='<div class="scan-detail-row"><span class="dl">Etiqueta</span><span class="dv mono">'+esc(p.etiqueta_ml)+'</span></div>';
      if(p.nome_produto)details+='<div class="scan-detail-row"><span class="dl">Produto</span><span class="dv">'+esc(p.nome_produto)+(p.marca?' — '+esc(p.marca):'')+'</span></div>';
      if(p.quantidade)details+='<div class="scan-detail-row"><span class="dl">Qtd</span><span class="dv">'+esc(p.quantidade)+'</span></div>';
      if(p.galpao&&GALPOES[p.galpao])details+='<div class="scan-detail-row"><span class="dl">Galpão</span><span class="dv bold">🏭 '+esc(GALPOES[p.galpao])+'</span></div>';
      if(p.data_despacho)details+='<div class="scan-detail-row"><span class="dl">Prazo</span><span class="dv" style="color:'+(isAt?'var(--red)':ps==='hoje'?'#856404':'inherit')+';">'+fmtDate(p.data_despacho)+(isAt?' ⏰ ATRASADO':ps==='hoje'?' ⚠️ HOJE':'')+'</span></div>';
      var actionBtn='';
      if(s.next){actionBtn='<button class="btn btn-p btn-bl" style="margin-top:.75rem" onclick="window.advanceScan(\''+p.id+'\',\''+s.next+'\')">'+SM[s.next].icon+' '+s.nxt+'</button>';}
      cards+='<div class="scan-match-card '+(isAt?'atrasado':p.status)+'"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem"><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span><a href="#/pedido/'+p.id+'" style="font-size:.78rem;color:var(--blue);font-weight:600">Ver detalhes →</a></div>'+details+actionBtn+'</div>';
    });
    r.innerHTML='<div class="scan-result">'+topBar+'<div class="scan-matches">'+cards+'</div></div>';
  }
}
window.restartScan=function(){var r=g('scan-result');if(r)r.innerHTML='';startScanner();};
window.advanceScan=function(id,nxt){
  updatePedido(id,{status:nxt});
  toast(SM[nxt].icon+' '+SM[nxt].label+' ✅','ok');
  var p=getPedido(id);
  if(p)onCodeFound(p.codigo_produto||p.etiqueta_ml||p.numero_venda||'');
};

// ── ROUTER ──────────────────────────────────────────────────────────────────
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
  var route=routeParse();var page=route.page,id=route.id;
  var main=g('app-main'),back=g('btn-back'),ttl=g('page-title'),acts=g('header-actions');
  if(!main)return;
  document.querySelectorAll('.nav-item').forEach(function(el){
    var dp=el.dataset.page;
    el.classList.toggle('active',dp===page||(page==='detalhe'&&dp==='pedidos')||(page==='editar'&&dp==='pedidos'));
  });
  if(acts)acts.innerHTML='';
  if(back){back.classList.add('hidden');back.onclick=null;}
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';
  updateAlertBadge();
  try{
    if(page==='home'){if(ttl)ttl.textContent='SpeedLog';renderHome(main);}
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
        '<a href="#/editar/'+id+'" class="btn-icon" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></a>'+
        '<button class="btn-icon" onclick="window.confirmDel(\''+id+'\')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>';
      pgDetalhe(main,id);
    }
    else if(page==='bipar'){if(ttl)ttl.textContent='Bipar Produto';pgBipar(main);}
    else if(page==='alertas'){if(ttl)ttl.textContent='Alertas';pgAlertas(main);}
    else if(page==='config'){if(ttl)ttl.textContent='Configurações';pgConfig(main);}
  }catch(e){
    main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao carregar</h3><p style="color:var(--red);font-size:.8rem">'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';
  }
}

// ── HOME ────────────────────────────────────────────────────────────────────
function renderHome(main){
  var c={recebido:0,separacao:0,expedicao:0,finalizado:0};
  ST.pedidos.forEach(function(p){if(c[p.status]!==undefined)c[p.status]++;});
  var urgent=ST.pedidos.filter(function(p){return p.status!=='finalizado';}).slice(0,6);
  var al=getAlerts();
  var cfg=getFbConfig();
  var fbStatus=fbDb?'🟢 Firebase sincronizado':(cfg&&cfg.databaseURL?'🟡 Reconectando...':'🔴 Configure Firebase em Config');
  var h='<div class="page">';
  h+='<div class="stats-grid">';
  h+=sCard('s-rec','📥',c.recebido,'Recebidos');
  h+=sCard('s-sep','🔍',c.separacao,'Separação');
  h+=sCard('s-exp','📦',c.expedicao,'Expedição');
  h+=sCard('s-fin','✅',c.finalizado,'Despachados');
  h+='</div>';
  h+='<div style="text-align:center;font-size:.72rem;color:var(--muted)">'+fbStatus+'</div>';
  if(al.total>0){
    h+='<a href="#/alertas" style="background:#fef2f2;border-radius:var(--r);padding:1rem;display:flex;align-items:center;gap:.75rem;text-decoration:none;border:1.5px solid #fecaca">';
    h+='<span style="font-size:1.5rem">⚠️</span><div style="flex:1"><span style="font-weight:700;color:#b91c1c;font-size:.95rem">'+al.total+' alerta'+(al.total>1?'s':'')+'</span><br>';
    h+='<span style="font-size:.8rem;color:#6b7280">'+al.atrasados.length+' atrasado · '+al.hoje.length+' hoje · '+al.duplicados.length+' duplicado</span></div>';
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
    h+='<p style="font-size:.9rem;opacity:.9;margin-bottom:.75rem"><strong>Como começar:</strong><br>1. Configure o Firebase em ⚙️ Config<br>2. Cole etiquetas ML em Novo Pedido<br>3. Bipe produtos no galpão para encontrar</p>';
    h+='<a href="#/novo" class="btn btn-o btn-bl">+ Cadastrar Etiqueta</a></div>';
  }
  main.innerHTML=h+'</div>';
}
function sCard(cls,ico,num,lbl){return '<div class="stat-card '+cls+'"><span class="stat-ico">'+ico+'</span><span class="stat-num">'+num+'</span><span class="stat-lbl">'+lbl+'</span></div>';}

// ── PEDIDOS ─────────────────────────────────────────────────────────────────
function pgPedidos(main){
  var chips='<span class="chip '+(!ST.fStatus?'on':'')+' " onclick="window.fSt(null)">Todos</span>';
  SO.forEach(function(s){chips+='<span class="chip '+(ST.fStatus===s?'on '+s:'')+' " onclick="window.fSt(\''+s+'\')">'+SM[s].icon+' '+SM[s].label+'</span>';});
  var gchips='<span class="chip '+(!ST.fGalpao?'on':'')+' " onclick="window.fGal(null)">Todos</span>';
  Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip '+(ST.fGalpao===k?'on':'')+' " onclick="window.fGal(\''+k+'\')">'+ GALPOES[k]+'</span>';});
  main.innerHTML='<div class="page"><div class="search-wrap">'+
    '<svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>'+
    '<input type="search" id="si" placeholder="Nome, venda, código, etiqueta..." value="'+esc(ST.fSearch)+'" oninput="window.doSearch(this.value)" autocomplete="off">'+
    '</div>'+
    '<div class="filter-label">Status</div><div class="chips">'+chips+'</div>'+
    '<div class="filter-label">Galpão</div><div class="chips">'+gchips+'</div>'+
    '<div id="lst"></div></div>';
  renderList();
}
function renderList(){
  var el=g('lst');if(!el)return;
  var d=ST.pedidos.slice();
  if(ST.fStatus)d=d.filter(function(p){return p.status===ST.fStatus;});
  if(ST.fGalpao)d=d.filter(function(p){return p.galpao===ST.fGalpao;});
  if(ST.fSearch){var q=ST.fSearch.toLowerCase();d=d.filter(function(p){return[p.nome_cliente,p.codigo_produto,p.numero_venda,p.etiqueta_ml,p.nome_produto,p.marca,p.galpao&&GALPOES[p.galpao]].some(function(v){return v&&v.toLowerCase().indexOf(q)>=0;});});}
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
  if(p.galpao&&GALPOES[p.galpao])meta+='<span class="meta">🏭 '+esc(GALPOES[p.galpao])+'</span>';
  if(p.nome_produto)meta+='<span class="meta">'+esc(p.nome_produto)+(p.marca?' — '+esc(p.marca):'')+'</span>';
  if(p.quantidade)meta+='<span class="meta">Qtd: '+esc(p.quantidade)+'</span>';
  if(p.data_despacho&&p.status!=='finalizado'){meta+='<span class="meta '+(isAt?'danger':ps==='hoje'?'warn':'')+' ">Prazo: '+fmtDate(p.data_despacho)+(isAt?' ⏰':ps==='hoje'?' ⚠️':'')+'</span>';}
  if(dt)meta+='<span class="meta">📅 '+dt+'</span>';
  return '<a href="#/pedido/'+p.id+'" class="order-card '+(isAt?'atrasado':p.status)+'"><div class="oc-hdr"><span class="oc-ttl">'+esc(p.nome_cliente||'Cliente não informado')+'</span><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span></div><div class="oc-meta">'+meta+'</div></a>';
}

// ── BIPAR ─────────────────────────────────────────────────────────────────
function pgBipar(main){
  var hasOCR='TextDetector' in window;
  main.innerHTML='<div class="page"><div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Bipe o código de barras — ou use OCR para Pack ID sem código de barras</div>'+
    '<div id="scan-status"></div><div id="scan-result"></div>'+
    (hasOCR
      ? '<button class="btn ocr-btn btn-bl" id="btn-ocr" onclick="window.captureOCR()">📸 Ler Pack ID da etiqueta (OCR)</button>'
      : '<div style="background:#fffbeb;border-radius:var(--rs);padding:.75rem;font-size:.8rem;color:#856404">⚠️ OCR não disponível neste navegador (use Chrome). Digite o Pack ID abaixo.</div>'
    )+
    '<div style="background:var(--card);border-radius:var(--r);padding:1rem;box-shadow:var(--sh)">'+
    '<div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Ou digite o código / Pack ID manualmente</div>'+
    '<div style="display:flex;gap:.5rem"><input class="fc" id="manual-code" type="text" placeholder="Pack ID, KTB759, nº venda..." style="flex:1">'+
    '<button class="btn btn-p" onclick="window.manualCode()">Buscar</button></div></div></div>';
  setTimeout(startScanner,200);
}
window.manualCode=function(){
  var inp=g('manual-code');var code=inp?inp.value.trim():'';
  if(!code){toast('Digite um código','err');return;}
  stopScanner();onCodeFound(code);
};
window.captureOCR=async function(){
  var video=document.querySelector('#reader video');
  if(!video){toast('Câmera não iniciou — aguarde 2 segundos e tente novamente','err');return;}
  var btn=g('btn-ocr');
  if(btn){btn.textContent='⏳ Lendo texto...';btn.disabled=true;}
  try{
    var td=new TextDetector();
    var results=await td.detect(video);
    var all=results.map(function(r){return r.rawValue;}).join('\n');
    // Tenta Pack ID primeiro, depois número longo (>= 10 dígitos)
    var m=all.match(/Pack\s*ID[:\s]*(\d{8,})/i)
        ||all.match(/\b(2\d{9,15})\b/)  // ML IDs começam com 2
        ||all.match(/\b(\d{12,16})\b/);
    if(m){
      toast('Pack ID: '+m[1],'ok');
      stopScanner();
      onCodeFound(m[1]);
    }else{
      toast('Número não encontrado — centralize o Pack ID e tente novamente','warn');
    }
  }catch(e){
    toast('OCR: '+e.message,'err');
  }finally{
    if(btn){btn.textContent='📸 Ler Pack ID da etiqueta (OCR)';btn.disabled=false;}
  }
};

// ── ALERTAS ──────────────────────────────────────────────────────────────────
function pgAlertas(main){
  var al=getAlerts();
  function sec(title,cls,items){if(!items.length)return'';var h='<div class="alert-group"><div class="alert-group-ttl '+cls+'">'+title+' <span style="background:currentColor;color:#fff;border-radius:20px;padding:1px 8px;font-size:.65rem">'+items.length+'</span></div>';items.forEach(function(p){h+=orderCard(p);});return h+'</div>';}
  var total=al.atrasados.length+al.hoje.length+al.duplicados.length+al.parados.length;
  var h='<div class="page">';
  if(total===0)h+='<div class="empty"><span class="empty-ico">✅</span><h3>Nenhum alerta!</h3><p>Todos os pedidos estão em dia.</p></div>';
  h+=sec('⏰ Atrasados','red',al.atrasados)+sec('⚠️ Despachar hoje','yellow',al.hoje)+sec('⚠️ Possíveis duplicatas','yellow',al.duplicados)+sec('🕗 Parados há mais de 3 dias','blue',al.parados);
  main.innerHTML=h+'</div>';
}

// ── DETALHE ──────────────────────────────────────────────────────────────────
function pgDetalhe(main,id){
  var p=getPedido(id);
  if(!p){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Pedido não encontrado</h3></div></div>';return;}
  var s=SM[p.status]||SM.recebido;var ci=SO.indexOf(p.status);var ps=prazoStatus(p.data_despacho);
  var dupes=p.numero_venda?ST.pedidos.filter(function(x){return x.numero_venda===p.numero_venda&&x.id!==p.id;}):[];
  var h='<div class="page">';
  if(ps==='atrasado'&&p.status!=='finalizado')h+='<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:var(--r);padding:.75rem 1rem;color:#b91c1c;font-weight:700">⏰ PRAZO VENCIDO — '+fmtDate(p.data_despacho)+'</div>';
  if(ps==='hoje'&&p.status!=='finalizado')h+='<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--r);padding:.75rem 1rem;color:#856404;font-weight:700">⚠️ DESPACHAR HOJE!</div>';
  if(dupes.length)h+='<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--r);padding:.75rem 1rem;color:#856404;font-size:.875rem">⚠️ Esta venda aparece em '+(dupes.length+1)+' pedido(s). Pode ser duplicata.</div>';
  h+='<div class="sprog">';
  SO.forEach(function(st,i){var cl=i<ci?'done':(i===ci?'active':'');h+='<div class="pstep '+cl+'"><div class="pdot">'+(i<ci?'✓':String(i+1))+'</div><span class="plbl">'+SM[st].label+'</span></div>';});
  h+='</div><div class="dcard"><div class="fb"><h2 style="font-size:1.1rem;font-weight:800;flex:1;padding-right:.5rem">'+esc(p.nome_cliente||'Cliente não informado')+'</h2><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span></div><div class="dg">';
  h+=dfield('Nº Venda ML',p.numero_venda);h+=dfield('Cód. Produto',p.codigo_produto);h+=dfield('Etiqueta ML',p.etiqueta_ml);h+=dfield('Produto',p.nome_produto);h+=dfield('Marca',p.marca);h+=dfield('Quantidade',p.quantidade);
  if(p.galpao&&GALPOES[p.galpao])h+=dfield('Galpão','🏭 '+GALPOES[p.galpao]);
  if(p.data_despacho)h+='<div class="df"><span class="dl">Prazo Despacho</span><span class="dv" style="color:'+(ps==='atrasado'?'var(--red)':ps==='hoje'?'#856404':'inherit')+';">'+fmtDate(p.data_despacho)+(ps==='atrasado'?' ⏰':ps==='hoje'?' ⚠️':'')+'</span></div>';
  if(p.created_at)h+=dfield('Cadastrado',new Date(p.created_at).toLocaleString('pt-BR'));
  h+='</div>';
  if(p.observacoes)h+='<div class="df"><span class="dl">Observações</span><span class="dv">'+esc(p.observacoes)+'</span></div>';
  h+='</div>';
  if(s.next){
    h+='<button class="act-btn '+s.next+'" onclick="window.advance(\''+p.id+'\',\''+s.next+'\')" ><div class="act-ico '+s.next+'">'+SM[s.next].icon+'</div><div style="flex:1"><div style="font-weight:800;font-size:.95rem">'+esc(s.nxt)+'</div><div style="font-size:.75rem;color:var(--muted);margin-top:2px">→ '+SM[s.next].label+'</div></div><svg style="opacity:.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>';
  }else{
    h+='<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700">✅ Pedido Despachado</div>';
  }
  main.innerHTML=h+'</div>';
}
function dfield(l,v){if(v==null||v==='')return'';return'<div class="df"><span class="dl">'+l+'</span><span class="dv">'+esc(String(v))+'</span></div>';}

// ── NOVO / EDITAR ───────────────────────────────────────────────────────────────
function pgNovo(main){
  main.innerHTML='<div class="page"><div class="wbox"><div class="wbox-hdr"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> Colar texto do WhatsApp</div>'+
    '<p class="muted sm" style="margin-bottom:.5rem">Cole a mensagem com VENDA / CLIENTE / PRODUTO / CÓDIGO / QUANTIDADE</p>'+
    '<textarea class="fc" id="wt" rows="5" placeholder="VENDA: 2000001...\nCLIENTE: João Silva\nPRODUTO: Kit Correia\nCÓDIGO: KTB759\nQUANTIDADE: 1 KIT"></textarea>'+
    '<button class="btn btn-n btn-bl mt" onclick="window.parseWpp()">🔍 Interpretar e preencher</button></div>'+
    '<div class="dcard"><span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Dados do Pedido</span>'+buildForm(null)+
    '<button class="btn btn-p btn-bl mt2" onclick="window.saveNovo()">💾 Salvar Pedido</button></div></div>';
  if(PREFILL){setTimeout(function(){var el=g(PREFILL.campo);if(el){el.value=PREFILL.valor;el.focus();}PREFILL=null;},50);}
}
function pgEditar(main,id){
  var p=getPedido(id);
  if(!p){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>';return;}
  main.innerHTML='<div class="page"><div class="dcard">'+buildForm(p)+'<button class="btn btn-p btn-bl mt2" onclick="window.saveEditar(\''+id+'\')" >💾 Salvar Alterações</button></div></div>';
}
function buildForm(p){
  if(!p)p={};
  var opts='';SO.forEach(function(s){opts+='<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+SM[s].label+'</option>';});
  var gchips='';Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip'+(p.galpao===k?' on':'')+' galpao-chip" onclick="window.pickGalpao(\''+k+'\')" data-gv="'+k+'">'+GALPOES[k]+'</span>';});
  return '<div class="fg"><label class="fl">Cliente *</label><input class="fc" id="fn" type="text" placeholder="Ex: Amarildo da Conceição" value="'+esc(p.nome_cliente||'')+'">'+'</div>'+
    '<div class="g2"><div class="fg"><label class="fl">Nº Venda ML</label><input class="fc" id="fv" type="text" placeholder="2000001296..." value="'+esc(p.numero_venda||'')+'"></div>'+
    '<div class="fg"><label class="fl">Etiqueta ML</label><input class="fc" id="fe" type="text" placeholder="BR0001..." value="'+esc(p.etiqueta_ml||'')+'"></div></div>'+
    '<div class="g2"><div class="fg"><label class="fl">Cód. Produto 🔑</label><input class="fc" id="fc2" type="text" placeholder="Ex: KTB759" style="text-transform:uppercase" value="'+esc(p.codigo_produto||'')+'"></div>'+
    '<div class="fg"><label class="fl">Quantidade</label><input class="fc" id="fq" type="text" placeholder="Ex: 1 KIT" value="'+esc(p.quantidade||'')+'"></div></div>'+
    '<div class="fg"><label class="fl">Nome do Produto</label><input class="fc" id="fp" type="text" placeholder="Ex: Kit Correia Dentada Jeep" value="'+esc(p.nome_produto||'')+'"></div>'+
    '<div class="g2"><div class="fg"><label class="fl">Marca</label><input class="fc" id="fm" type="text" placeholder="Ex: Gates" value="'+esc(p.marca||'')+'"></div>'+
    '<div class="fg"><label class="fl">Prazo Despacho</label><input class="fc" id="fd" type="date" value="'+esc(p.data_despacho||'')+'"></div></div>'+
    '<div class="fg"><label class="fl">Galpão</label><div class="chips" id="galpao-chips">'+gchips+'</div><input type="hidden" id="fg" value="'+esc(p.galpao||'')+'"></div>'+
    '<div class="fg"><label class="fl">Status</label><select class="fc" id="fs">'+opts+'</select></div>'+
    '<div class="fg"><label class="fl">Observações</label><textarea class="fc" id="fo" placeholder="Notas...">'+esc(p.observacoes||'')+'</textarea></div>';
}

// ── CONFIG ───────────────────────────────────────────────────────────────────
function pgConfig(main){
  var n=ST.pedidos.length;
  var cfg=getFbConfig()||{};
  var fbStatus=fbDb
    ?'<span style="color:var(--s-fin)">🟢 Conectado e sincronizando</span>'
    :'<span style="color:var(--red)">🔴 Não conectado — configure abaixo</span>';
  var projectHint=cfg.projectId?'<p class="muted sm">Projeto: <strong>'+esc(cfg.projectId)+'</strong></p>':'';
  main.innerHTML='<div class="page">'+
    '<div class="csec"><div class="csec-ttl">🔥 Firebase Realtime Database</div>'+
    '<div style="padding:.4rem 0">'+fbStatus+'</div>'+projectHint+
    '<p class="muted sm" style="margin-top:.5rem;margin-bottom:.75rem">Cole abaixo o JSON do seu Firebase (console.firebase.google.com → Configurações do projeto → Seus apps → SDK):</p>'+
    '<textarea class="fc" id="fb-json" rows="9" placeholder="{\n  &quot;apiKey&quot;: &quot;AIza...&quot;,\n  &quot;databaseURL&quot;: &quot;https://...firebaseio.com&quot;,\n  &quot;projectId&quot;: &quot;...&quot;,\n  ...\n}">'+esc(cfg.projectId?JSON.stringify(cfg,null,2):'')+'</textarea>'+
    '<div style="display:flex;gap:.75rem;margin-top:.75rem">'+
    '<button class="btn btn-p" onclick="window.saveFbCfg()" style="flex:1">💾 Salvar e Conectar</button>'+
    '<button class="btn btn-n" onclick="window.clearFbCfg()">🗑️ Limpar</button>'+
    '</div>'+
    '<div id="fb-status" class="mt sm"></div>'+
    '<div style="background:#e8f5e9;border-radius:var(--rs);padding:.75rem;margin-top:.75rem;font-size:.8rem;color:#2e7d32">'+
    '<strong>ℹ️ Segurança:</strong> o JSON fica só no seu celular (localStorage). Não fica exposto em nenhum código público.'+
    '</div></div>'+
    '<div class="csec"><div class="csec-ttl">📜 Regras do Firebase (1x só)</div>'+
    '<p class="muted sm" style="margin-bottom:.5rem">No Firebase Console → Realtime Database → Regras:</p>'+
    '<code style="background:#f8fafc;border:1px solid var(--border);border-radius:var(--rs);padding:.75rem;display:block;font-size:.75rem;white-space:pre">{\n  &quot;rules&quot;: {\n    &quot;.read&quot;: true,\n    &quot;.write&quot;: true\n  }\n}</code>'+
    '<p class="muted sm" style="margin-top:.5rem">Para mais segurança: restrinja o apiKey no Google Cloud Console para aceitar só de speedboymotoboy.github.io.</p>'+
    '</div>'+
    '<div class="csec"><div class="csec-ttl">📊 Dados ('+n+' pedido'+(n!==1?'s':'')+' em cache)</div>'+
    '<div style="display:flex;gap:.75rem">'+
    '<button class="btn btn-n" style="flex:1" onclick="window.exportData()">⬇️ Exportar JSON</button>'+
    '<button class="btn btn-d" style="flex:1" onclick="window.confirmClear()">🗑️ Limpar cache</button>'+
    '</div></div></div>';
}

window.saveFbCfg=function(){
  var el=g('fb-json');var txt=el?el.value.trim():'';
  if(!txt){toast('Cole o JSON do Firebase','err');return;}
  try{
    var cfg=JSON.parse(txt);
    if(!cfg.databaseURL){toast('JSON precisa ter o campo databaseURL','err');return;}
    saveFbConfig(cfg);
    initFirebase();
    var st=g('fb-status');
    if(st)st.innerHTML='<span style="color:var(--muted)">Conectando...</span>';
    setTimeout(function(){
      var st2=g('fb-status');
      if(st2)st2.innerHTML=fbDb?'<span style="color:var(--s-fin)">✅ Conectado!</span>':'<span style="color:var(--red)">❌ Falha — verifique as Regras do Firebase</span>';
    },2000);
  }catch(e){
    toast('JSON inválido: '+e.message,'err');
  }
};
window.clearFbCfg=function(){
  localStorage.removeItem(FB_KEY);
  fbDb=null;
  toast('Configuração removida','ok');
  pgConfig(g('app-main'));
};

// ── FORM ACTIONS ─────────────────────────────────────────────────────────────
function formData(){
  function v(id){var el=g(id);return el&&el.value.trim()?el.value.trim():null;}
  return{nome_cliente:v('fn'),numero_venda:v('fv'),etiqueta_ml:v('fe'),codigo_produto:v('fc2')?v('fc2').toUpperCase():null,nome_produto:v('fp'),marca:v('fm'),quantidade:v('fq'),data_despacho:v('fd'),status:g('fs')?g('fs').value:'recebido',observacoes:v('fo'),galpao:v('fg')};}
window.saveNovo=function(){
  var d=formData();
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  if(d.numero_venda){var dup=ST.pedidos.find(function(p){return p.numero_venda===d.numero_venda;});if(dup)toast('⚠️ Venda '+d.numero_venda+' já existe!','warn');}
  var p=createPedido(d);toast('Pedido salvo! ✅','ok');location.hash='#/pedido/'+p.id;
};
window.saveEditar=function(id){
  var d=formData();
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  updatePedido(id,d);toast('Atualizado! ✅','ok');location.hash='#/pedido/'+id;
};
window.advance=function(id,nxt){updatePedido(id,{status:nxt});toast(SM[nxt].icon+' '+SM[nxt].label,'ok');go();};
window.confirmDel=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir pedido?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDel(\''+id+'\')" >Excluir</button></div></div>');};
window.doDel=function(id){window.closeModal();deletePedido(id);toast('Excluído','ok');location.hash='#/pedidos';};
window.confirmClear=function(){modal('<div class="modal"><div class="modal-ttl">⚠️ Limpar cache local?</div><div class="modal-txt">Dados do Firebase permanecem. Serão baixados novamente ao reabrir.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doClear()">Limpar</button></div></div>');};
window.doClear=function(){window.closeModal();ST.pedidos=[];saveData();toast('Cache limpo','ok');location.hash='#/';};
window.doSearch=function(v){ST.fSearch=v;renderList();};
window.fSt=function(v){ST.fStatus=v;pgPedidos(g('app-main'));};
window.fGal=function(v){ST.fGalpao=v;pgPedidos(g('app-main'));};
window.pickGalpao=function(k){
  var hi=g('fg');if(hi)hi.value=k;
  document.querySelectorAll('.galpao-chip').forEach(function(c){c.classList.toggle('on',c.dataset.gv===k);});
};
window.parseWpp=function(){
  var wt=g('wt');var txt=wt?wt.value:'';
  if(!txt.trim()){toast('Cole o texto primeiro','err');return;}
  function ex(pats,t){for(var i=0;i<pats.length;i++){var m=t.match(pats[i]);if(m&&m[1])return m[1].trim();}return null;}
  var pairs=[['fn',[/CLIENTE[:\s]+([^\n]+)/i]],['fv',[/VENDA[:\s]+([^\n]+)/i]],['fc2',[/C[ÓO]DIGO[:\s]+([^\n]+)/i]],['fp',[/PRODUTO[:\s]+([^\n]+)/i]],['fm',[/MARCA[:\s]+([^\n]+)/i]],['fq',[/QUANTIDADE[:\s]+([^\n]+)/i]],['fe',[/etiqueta[:\s]+([^\n]+)/i,/\b((?:ML|BR)[0-9A-Z]{8,})\b/i]]];
  var n=0;
  for(var i=0;i<pairs.length;i++){var fid=pairs[i][0],pats=pairs[i][1];var val=ex(pats,txt);if(val){var el=g(fid);if(el){el.value=fid==='fc2'?val.toUpperCase():val;n++;}}}
  toast(n?n+' campo(s) preenchido(s) ✅':'Nada reconhecido. Preencha manualmente.',n?'ok':'err');
};
window.exportData=function(){
  var b=new Blob([JSON.stringify(ST.pedidos,null,2)],{type:'application/json'});
  var u=URL.createObjectURL(b);var a=document.createElement('a');
  a.href=u;a.download='speedlog-'+today()+'.json';a.click();URL.revokeObjectURL(u);
};

// ── MODAL / TOAST ────────────────────────────────────────────────────────────
function modal(html){var o=g('modal-overlay');if(o){o.classList.remove('hidden');o.innerHTML=html;}}
window.closeModal=function(){var o=g('modal-overlay');if(o)o.classList.add('hidden');};
function toast(msg,type){var c=g('toast-container');if(!c)return;var t=document.createElement('div');t.className='toast '+(type||'');t.textContent=msg;c.appendChild(t);setTimeout(function(){try{t.remove();}catch(e){}},3200);}

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  try{
    loadData();initFirebase();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
    window.addEventListener('hashchange',function(){try{go();}catch(e){}});
    var ov=g('modal-overlay');if(ov)ov.addEventListener('click',function(e){if(e.target===this)window.closeModal();});
    try{go();}catch(e){var m=g('app-main');if(m)m.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao iniciar</h3><p>'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';}
  }catch(e){document.body.innerHTML='<div style="padding:2rem;text-align:center"><h2>Erro crítico</h2><p>'+e.message+'</p><button onclick="location.reload()">Recarregar</button></div>';}
});
