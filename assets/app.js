// SpeedLog v9 — Logistics Tracking Refactor
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

var ST = {registros:[], fStatus:null, fGalpao:null, fSearch:''};
var fbDb = null;
var qrScanner = null;
var PREFILL = null;
var scannerCallback = null;

function g(id){return document.getElementById(id);}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function today(){return new Date().toISOString().slice(0,10);}
function uid(){try{return crypto.randomUUID();}catch(e){return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function prazoStatus(d){if(!d)return null;var t=today(),v=d.slice(0,10);if(v<t)return'atrasado';if(v===t)return'hoje';return null;}
function fmtDate(s){if(!s)return'';try{return new Date(s+'T12:00:00').toLocaleDateString('pt-BR');}catch(e){return s;}}
function fmtDateTime(s){if(!s)return'';try{return new Date(s).toLocaleString('pt-BR');}catch(e){return s;}}

function loadData(){
  try{
    ST.registros=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');
    ST.registros.forEach(function(r){if(!r.tipo)r.tipo='etiqueta';});
  }catch(e){ST.registros=[];}
}
function saveData(){try{localStorage.setItem(DATA_KEY,JSON.stringify(ST.registros));}catch(e){}}
function getFbConfig(){try{return JSON.parse(localStorage.getItem(FB_KEY)||'null');}catch(e){return null;}}
function saveFbConfig(c){localStorage.setItem(FB_KEY,JSON.stringify(c));}

// ── FIREBASE ───────────────────────────────────────────────────────────
function initFirebase(){
  var cfg = getFbConfig();
  if(!cfg || !cfg.databaseURL){ fbDb = null; return; }
  try{
    if(!window.firebase){toast('Firebase SDK não carregou','err');return;}
    if(firebase.apps.length) firebase.apps[0].delete().catch(function(){});
    firebase.initializeApp(cfg);
    fbDb = firebase.database();
    fbDb.ref('registros').on('value', function(snap){
      var raw = snap.val()||{};
      var arr = Object.values(raw);
      arr.forEach(function(r){if(!r.tipo)r.tipo='etiqueta';});
      arr.sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
      ST.registros = arr;
      saveData();
      var page = routeParse().page;
      var main = g('app-main');
      if(page==='home' && main) renderHome(main);
      else if(page==='nfs' && main) renderNFsList();
      else if(page==='etiquetas' && main) renderEtiquetasList();
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

function pushFB(r){if(!fbDb)return;fbDb.ref('registros/'+r.id).set(r).catch(function(){});}
function delFB(id){if(!fbDb)return;fbDb.ref('registros/'+id).remove().catch(function(){});}

// ── CRUD ────────────────────────────────────────────────────────────
function createRegistro(data){
  var now=new Date().toISOString();
  var r={}; for(var k in data)r[k]=data[k];
  r.id=uid();r.created_at=now;r.updated_at=now;
  if(!r.tipo)r.tipo='etiqueta';
  ST.registros.unshift(r); saveData(); pushFB(r);
  return r;
}
function getRegistro(id){for(var i=0;i<ST.registros.length;i++){if(ST.registros[i].id===id)return ST.registros[i];}return null;}
function updateRegistro(id,u){
  for(var i=0;i<ST.registros.length;i++){
    if(ST.registros[i].id===id){
      var r=ST.registros[i]; for(var k in u)r[k]=u[k];
      r.updated_at=new Date().toISOString();
      saveData(); pushFB(r); return r;
    }
  }
  return null;
}
function deleteRegistro(id){
  ST.registros=ST.registros.filter(function(r){return r.id!==id;});
  saveData(); delFB(id);
}

// ── SCANNER ───────────────────────────────────────────────────────────
function stopScanner(){if(qrScanner){try{qrScanner.stop().catch(function(){});}catch(e){}qrScanner=null;}}
function startScanner(callback){
  scannerCallback=callback||null;
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
  if(scannerCallback){scannerCallback(code); return;}
  var r=g('scan-result');if(!r)return;
  var codeU=code.trim().toUpperCase();
  var codeT=code.trim();
  var matches=ST.registros.filter(function(p){
    return(
      (p.codigo_produto&&p.codigo_produto.trim().toUpperCase()===codeU)||
      (p.etiqueta_ml&&p.etiqueta_ml.trim().toUpperCase()===codeU)||
      (p.etiqueta_barcode&&p.etiqueta_barcode.trim().toUpperCase()===codeU)||
      (p.nf_codigo&&p.nf_codigo.trim().toUpperCase()===codeU)||
      (p.numero_venda&&p.numero_venda.trim()===codeT)||
      (p.etiqueta_ml&&codeU.length>5&&p.etiqueta_ml.toUpperCase().indexOf(codeU)>=0)
    );
  });
  var topBar='<div class="scan-code"><span style="font-size:1.4rem">🔍</span><span class="scan-code-val">'+esc(codeT)+'</span><button class="btn btn-n" style="font-size:.8rem;padding:.4rem .8rem" onclick="window.restartScan()">🔄 Nova busca</button></div>';
  if(matches.length===0){
    var campo='fc2';var tipoLabel='código de produto';
    if(/^(ML|BR)[A-Z0-9]{5,}$/i.test(codeT)){campo='fe';tipoLabel='etiqueta Mercado Livre';}
    else if(/^\d{10,}$/.test(codeT)){campo='fv';tipoLabel='número de venda / Pack ID';}
    PREFILL={campo:campo,valor:campo==='fc2'?codeU:codeT};
    var noRegistros=ST.registros.length===0;
    var msg=noRegistros
      ?'<p style="color:var(--muted);font-size:.85rem">Nenhum registro cadastrado ainda.<br>Cadastre as etiquetas do WhatsApp primeiro, depois bipe para encontrar.</p>'
      :'<p style="color:var(--muted);font-size:.85rem">Nenhum registro com '+tipoLabel+' <strong>'+esc(codeT)+'</strong>.<br>Cadastre agora com o código já preenchido:</p>';
    r.innerHTML='<div class="scan-result">'+topBar+'<div class="scan-matches"><div class="no-match" style="padding:1.25rem;text-align:center"><div style="font-size:2.5rem;margin-bottom:.5rem">❌</div>'+msg+'<a href="#/etiquetas" class="btn btn-p btn-bl mt">+ Cadastrar Etiqueta</a></div></div></div>';
  }else{
    var cards='';
    matches.forEach(function(p){
      var s=p.tipo==='nf'?null:(SM[p.status]||SM.recebido);
      var isNF=p.tipo==='nf';
      if(isNF){
        var dt=p.created_at?new Date(p.created_at).toLocaleString('pt-BR'):'';
        cards+='<div class="nf-card"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;color:var(--blue)">🏭 NF Coletada</span><span class="badge recebido">📥 Recebido</span></div><div style="font-size:.85rem;color:var(--muted)">'+esc(p.nf_codigo)+'</div><div style="font-size:.75rem;color:var(--muted)">'+dt+'</div><div style="font-size:.85rem;margin-top:.5rem"><strong>Galpão:</strong> '+esc(GALPOES[p.galpao]||p.galpao)+'</div></div>';
      }else{
        var ps=prazoStatus(p.data_despacho);
        var isAt=ps==='atrasado'&&p.status!=='finalizado';
        var details='';
        if(p.nome_cliente)details+='<div class="scan-detail-row"><span class="dl">Cliente</span><span class="dv bold">'+esc(p.nome_cliente)+'</span></div>';
        if(p.numero_venda)details+='<div class="scan-detail-row"><span class="dl">Venda ML</span><span class="dv mono">'+esc(p.numero_venda)+'</span></div>';
        if(p.etiqueta_ml)details+='<div class="scan-detail-row"><span class="dl">Etiqueta</span><span class="dv mono">'+esc(p.etiqueta_ml)+'</span></div>';
        if(p.nome_produto)details+='<div class="scan-detail-row"><span class="dl">Produto</span><span class="dv">'+esc(p.nome_produto)+(p.marca?' — '+esc(p.marca):'')+'</span></div>';
        if(p.quantidade)details+='<div class="scan-detail-row"><span class="dl">Qtd</span><span class="dv">'+esc(p.quantidade)+'</span></div>';
        if(p.galpao&&GALPOES[p.galpao])details+='<div class="scan-detail-row"><span class="dl">Galpão</span><span class="dv bold">🏭 '+esc(GALPOES[p.galpao])+'</span></div>';
        var actionBtn='';
        if(s&&s.next){actionBtn='<button class="btn btn-p btn-bl" style="margin-top:.75rem" onclick="window.advanceScan(\''+p.id+'\',\''+s.next+'\')">'+SM[s.next].icon+' '+s.nxt+'</button>';}
        cards+='<div class="scan-match-card '+(isAt?'atrasado':p.status)+'"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem"><span class="badge '+p.status+'">'+SM[p.status].icon+' '+SM[p.status].label+'</span></div>'+details+actionBtn+'</div>';
      }
    });
    r.innerHTML='<div class="scan-result">'+topBar+'<div class="scan-matches">'+cards+'</div></div>';
  }
}
window.restartScan=function(){var r=g('scan-result');if(r)r.innerHTML='';startScanner(scannerCallback);};
window.advanceScan=function(id,nxt){
  updateRegistro(id,{status:nxt});
  toast(SM[nxt].icon+' '+SM[nxt].label+' ✅','ok');
  var p=getRegistro(id);
  if(p)onCodeFound(p.codigo_produto||p.etiqueta_ml||p.etiqueta_barcode||p.nf_codigo||p.numero_venda||'');
};

// ── ROUTER ───────────────────────────────────────────────────────────
function routeParse(){
  var h=location.hash.slice(1)||'/';
  var p=h.split('/').filter(function(x){return x;});
  if(!p.length)return{page:'home',id:null};
  if(p[0]==='nfs')return{page:'nfs',id:null};
  if(p[0]==='nova-nf')return{page:'nova-nf',id:null};
  if(p[0]==='etiquetas')return{page:'etiquetas',id:null};
  if(p[0]==='novo')return{page:'novo',id:null};
  if(p[0]==='editar'&&p[1])return{page:'editar',id:p[1]};
  if(p[0]==='detalhe'&&p[1])return{page:'detalhe',id:p[1]};
  if(p[0]==='bipar')return{page:'bipar',id:null};
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
    el.classList.toggle('active',dp===page||(page==='detalhe'&&dp==='etiquetas')||(page==='editar'&&dp==='etiquetas')||(page==='nova-nf'&&dp==='nfs'));
  });
  if(acts)acts.innerHTML='';
  if(back){back.classList.add('hidden');back.onclick=null;}
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';
  try{
    if(page==='home'){if(ttl)ttl.textContent='SpeedLog';renderHome(main);}
    else if(page==='nfs'){if(ttl)ttl.textContent='NFs';pgNFs(main);}
    else if(page==='nova-nf'){
      if(ttl)ttl.textContent='Nova NF';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgNovaNF(main);
    }
    else if(page==='etiquetas'){if(ttl)ttl.textContent='Etiquetas';pgEtiquetas(main);}
    else if(page==='novo'){
      if(ttl)ttl.textContent='Nova Etiqueta';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgNovo(main);
    }
    else if(page==='editar'){
      if(ttl)ttl.textContent='Editar';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgEditar(main,id);
    }
    else if(page==='detalhe'){
      if(ttl)ttl.textContent='Etiqueta';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      if(acts)acts.innerHTML=
        '<a href="#/editar/'+id+'" class="btn-icon" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></a>'+
        '<button class="btn-icon" onclick="window.confirmDel(\''+id+'\')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>';
      pgDetalhe(main,id);
    }
    else if(page==='bipar'){if(ttl)ttl.textContent='Bipar Produto';pgBipar(main);}
    else if(page==='config'){if(ttl)ttl.textContent='Configurações';pgConfig(main);}
  }catch(e){
    main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao carregar</h3><p style="color:var(--red);font-size:.8rem">'+esc(e.message)+'</p><button class="btn btn-n mt" onclick="location.reload()">Recarregar</button></div></div>';
  }
}

// ── HOME ────────────────────────────────────────────────────────────
function renderHome(main){
  var nfCount=ST.registros.filter(function(r){return r.tipo==='nf'&&r.created_at&&r.created_at.slice(0,10)===today();}).length;
  var etqByStatus={};
  ST.registros.filter(function(r){return r.tipo==='etiqueta';}).forEach(function(r){if(!etqByStatus[r.status])etqByStatus[r.status]=0;etqByStatus[r.status]++;});
  var cfg=getFbConfig();
  var fbStatus=fbDb?'🟢 Firebase sincronizado':(cfg&&cfg.databaseURL?'🟡 Reconectando...':'🔴 Configure Firebase em Config');
  var h='<div class="page">';
  h+='<div class="stats-grid">';
  h+=sCard('s-rec','📥',nfCount,'NFs hoje');
  h+=sCard('s-sep','🏷',etqByStatus.recebido||0,'Etiquetas');
  h+='</div>';
  h+='<div style="text-align:center;font-size:.72rem;color:var(--muted)">'+fbStatus+'</div>';
  var nfs=ST.registros.filter(function(r){return r.tipo==='nf'&&r.created_at&&r.created_at.slice(0,10)===today();});
  if(nfs.length){
    h+='<div><div class="sec-hdr"><span class="sec-ttl">NFs Coletadas Hoje</span><a href="#/nfs" style="font-size:.8rem;color:var(--blue);font-weight:600">Ver todas →</a></div>';
    h+='<div style="display:flex;flex-direction:column;gap:.75rem">';
    nfs.slice(0,3).forEach(function(r){h+='<div class="nf-card"><span style="font-weight:700;color:var(--blue)">📋 '+esc(r.nf_codigo)+'</span><span style="font-size:.75rem;color:var(--muted)">'+fmtDateTime(r.created_at)+'</span><span style="font-size:.85rem">🏭 '+esc(GALPOES[r.galpao]||r.galpao)+'</span></div>';});
    h+='</div></div>';
  }
  if(ST.registros.length===0){
    h+='<div style="background:var(--blue);border-radius:var(--r);padding:1.25rem;color:#fff;text-align:center">';
    h+='<div style="font-size:1.8rem;margin-bottom:.5rem">🚀</div>';
    h+='<p style="font-size:.9rem;opacity:.9;margin-bottom:.75rem"><strong>Como começar:</strong><br>1. Configure o Firebase em ⚙️ Config<br>2. Colete NFs em 📋 NFs → +<br>3. Registre Etiquetas em 🏷 Etiquetas → +</p>';
    h+='<a href="#/nova-nf" class="btn btn-o btn-bl">+ Coletar NF</a></div>';
  }
  main.innerHTML=h+'</div>';
}
function sCard(cls,ico,num,lbl){return '<div class="stat-card '+cls+'"><span class="stat-ico">'+ico+'</span><span class="stat-num">'+num+'</span><span class="stat-lbl">'+lbl+'</span></div>';}

// ── NFs ───────────────────────────────────────────────────────────
function pgNFs(main){
  var gchips='<span class="chip '+(!ST.fGalpao?'on':'')+' " onclick="window.fGal(null)">Todos</span>';
  Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip '+(ST.fGalpao===k?'on':'')+' " onclick="window.fGal(\''+k+'\')">'+ GALPOES[k]+'</span>';});
  main.innerHTML='<div class="page"><div class="search-wrap">'+
    '<svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>'+
    '<input type="search" id="si" placeholder="Código NF, galpão..." value="'+esc(ST.fSearch)+'" oninput="window.doSearch(this.value)" autocomplete="off">'+
    '</div>'+
    '<div style="text-align:right;padding:0 1rem"><a href="#/nova-nf" class="btn btn-p" style="padding:.5rem 1rem;font-size:.85rem">+ Coletar</a></div>'+
    '<div class="filter-label">Galpão</div><div class="chips">'+gchips+'</div>'+
    '<div id="lst"></div></div>';
  renderNFsList();
}
function renderNFsList(){
  var el=g('lst');if(!el)return;
  var d=ST.registros.filter(function(r){return r.tipo==='nf';}).slice();
  if(ST.fGalpao)d=d.filter(function(r){return r.galpao===ST.fGalpao;});
  if(ST.fSearch){var q=ST.fSearch.toLowerCase();d=d.filter(function(r){return[r.nf_codigo,r.galpao&&GALPOES[r.galpao]].some(function(x){return x&&String(x).toLowerCase().indexOf(q)>=0;});});}
  if(!d.length){el.innerHTML='<div class="empty"><span class="empty-ico">🔍</span><h3>Nenhuma NF encontrada</h3></div>';return;}
  var h='<div style="display:flex;flex-direction:column;gap:.75rem">';
  d.forEach(function(r){h+='<div class="nf-card"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;color:var(--blue)">'+esc(r.nf_codigo)+'</span><span style="font-size:.75rem;color:var(--muted)">'+fmtDateTime(r.created_at)+'</span></div><span style="font-size:.85rem">🏭 '+esc(GALPOES[r.galpao]||r.galpao)+'</span></div>';});
  el.innerHTML=h+'</div>';
}

// ── NOVA NF ───────────────────────────────────────────────────────────
function pgNovaNF(main){
  var gchips='';Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip galpao-chip" onclick="window.pickGalpaoNF(\''+k+'\')" data-gv="'+k+'">'+GALPOES[k]+'</span>';});
  main.innerHTML='<div class="page">'+
    '<div class="dcard">'+
    '<div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Selecione o Galpão</div>'+
    '<div class="chips" id="galpao-chips-nf">'+gchips+'</div>'+
    '<input type="hidden" id="fg-nf" value="">'+
    '</div>'+
    '<div id="scanner-section" class="step-section"><div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Bipe o código de barras da NF</div>'+
    '<div id="scan-status"></div></div>'+
    '</div>';
  
  window.pickGalpaoNF=function(k){
    var hi=g('fg-nf');if(hi)hi.value=k;
    document.querySelectorAll('#galpao-chips-nf .chip').forEach(function(c){c.classList.toggle('on',c.dataset.gv===k);});
    var sec=g('scanner-section');if(sec){sec.classList.add('active');setTimeout(function(){startScanner(function(code){
      stopScanner();
      var galpao=g('fg-nf')?g('fg-nf').value:'';
      if(!galpao){toast('Selecione um galpão','err');return;}
      var r=createRegistro({tipo:'nf',nf_codigo:code.trim(),galpao:galpao});
      toast('NF coletada! ✅','ok');
      location.hash='#/nfs';
    });},300);}
  };
}

// ── ETIQUETAS ───────────────────────────────────────────────────────────
function pgEtiquetas(main){
  var chips='<span class="chip '+(!ST.fStatus?'on':'')+' " onclick="window.fSt(null)">Todos</span>';
  SO.forEach(function(s){chips+='<span class="chip '+(ST.fStatus===s?'on '+s:'')+' " onclick="window.fSt(\''+s+'\')">'+SM[s].icon+' '+SM[s].label+'</span>';});
  main.innerHTML='<div class="page"><div class="search-wrap">'+
    '<svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>'+
    '<input type="search" id="si" placeholder="Nome, código, etiqueta..." value="'+esc(ST.fSearch)+'" oninput="window.doSearch(this.value)" autocomplete="off">'+
    '</div>'+
    '<div style="text-align:right;padding:0 1rem"><a href="#/novo" class="btn btn-p" style="padding:.5rem 1rem;font-size:.85rem">+ Registrar</a></div>'+
    '<div class="filter-label">Status</div><div class="chips">'+chips+'</div>'+
    '<div id="lst"></div></div>';
  renderEtiquetasList();
}
function renderEtiquetasList(){
  var el=g('lst');if(!el)return;
  var d=ST.registros.filter(function(r){return r.tipo==='etiqueta';}).slice();
  if(ST.fStatus)d=d.filter(function(r){return r.status===ST.fStatus;});
  if(ST.fSearch){var q=ST.fSearch.toLowerCase();d=d.filter(function(r){return[r.nome_cliente,r.codigo_produto,r.numero_venda,r.etiqueta_ml,r.nome_produto,r.marca].some(function(x){return x&&String(x).toLowerCase().indexOf(q)>=0;});});}
  if(!d.length){el.innerHTML='<div class="empty"><span class="empty-ico">🔍</span><h3>Nenhuma etiqueta encontrada</h3></div>';return;}
  var h='<div style="display:flex;flex-direction:column;gap:.75rem">';
  d.forEach(function(r){h+=etiquetaCard(r);});
  el.innerHTML=h+'</div>';
}
function etiquetaCard(r){
  var s=SM[r.status]||SM.recebido;
  var dt=r.created_at?new Date(r.created_at).toLocaleDateString('pt-BR'):'';
  var meta='';
  if(r.numero_venda)meta+='<span class="meta">🏷 <strong>'+esc(r.numero_venda)+'</strong></span>';
  if(r.codigo_produto)meta+='<span class="meta">📊 '+esc(r.codigo_produto)+'</span>';
  if(r.nome_produto)meta+='<span class="meta">'+esc(r.nome_produto)+(r.marca?' — '+esc(r.marca):'')+'</span>';
  if(r.quantidade)meta+='<span class="meta">Qtd: '+esc(r.quantidade)+'</span>';
  if(dt)meta+='<span class="meta">📅 '+dt+'</span>';
  return '<a href="#/detalhe/'+r.id+'" class="order-card '+r.status+'"><div class="oc-hdr"><span class="oc-ttl">'+esc(r.nome_cliente||'Cliente não informado')+'</span><span class="badge '+r.status+'">'+s.icon+' '+s.label+'</span></div><div class="oc-meta">'+meta+'</div></a>';
}

// ── NOVO / EDITAR ─────────────────────────────────────────────────────────
function pgNovo(main){
  main.innerHTML='<div class="page"><div class="wbox"><div class="wbox-hdr"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M.057 24l1.6-7.118L0 9a9 9 0 1118 0l-1.657 7.882L23.943 24H.057z"/></svg> Cole mensagem WhatsApp</div>'+
    '<p class="muted sm" style="margin-bottom:.5rem">Cole a mensagem com VENDA / CLIENTE / PRODUTO / CÓDIGO / QUANTIDADE</p>'+
    '<textarea class="fc" id="wt" rows="5" placeholder="VENDA: 2000001...\nCLIENTE: João Silva\nPRODUTO: Kit Correia\nCÓDIGO: KTB759\nQUANTIDADE: 1 KIT"></textarea>'+
    '<button class="btn btn-n btn-bl mt" onclick="window.parseWpp()">🔍 Interpretar e preencher</button></div>'+
    '<div class="dcard"><span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Dados da Etiqueta</span>'+buildForm(null)+
    '<div class="step-section" id="step-barcode-scan"><div class="scan-area"><div id="reader-etq"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Bipe o código de barras da etiqueta</div>'+
    '<div id="scan-status-etq"></div></div>'+
    '<button class="btn btn-p btn-bl mt2" onclick="window.saveNovo()">💾 Salvar Etiqueta</button></div></div>';
  if(PREFILL){setTimeout(function(){var el=g(PREFILL.campo);if(el){el.value=PREFILL.valor;el.focus();}PREFILL=null;},50);}
}
function pgEditar(main,id){
  var r=getRegistro(id);
  if(!r){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>';return;}
  main.innerHTML='<div class="page"><div class="dcard">'+buildForm(r)+'<button class="btn btn-p btn-bl mt2" onclick="window.saveEditar(\''+id+'\')" >💾 Salvar Alterações</button></div></div>';
}
function buildForm(r){
  if(!r)r={};
  var opts='';SO.forEach(function(s){opts+='<option value="'+s+'"'+(r.status===s?' selected':'')+'>'+SM[s].label+'</option>';});
  var gchips='';Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip'+(r.galpao===k?' on':'')+' galpao-chip" onclick="window.pickGalpao(\''+k+'\')" data-gv="'+k+'">'+GALPOES[k]+'</span>';});
  return '<div class="fg"><label class="fl">Cliente *</label><input class="fc" id="fn" type="text" placeholder="Ex: Amarildo da Conceição" value="'+esc(r.nome_cliente||'')+'">'+'</div>'+
    '<div class="g2"><div class="fg"><label class="fl">Nº Venda ML</label><input class="fc" id="fv" type="text" placeholder="2000001296..." value="'+esc(r.numero_venda||'')+'"></div>'+
    '<div class="fg"><label class="fl">Etiqueta ML</label><input class="fc" id="fe" type="text" placeholder="BR0001..." value="'+esc(r.etiqueta_ml||'')+'"></div></div>'+
    '<div class="g2"><div class="fg"><label class="fl">Cód. Produto 🔑</label><input class="fc" id="fc2" type="text" placeholder="Ex: KTB759" style="text-transform:uppercase" value="'+esc(r.codigo_produto||'')+'"></div>'+
    '<div class="fg"><label class="fl">Quantidade</label><input class="fc" id="fq" type="text" placeholder="Ex: 1 KIT" value="'+esc(r.quantidade||'')+'"></div></div>'+
    '<div class="fg"><label class="fl">Nome do Produto</label><input class="fc" id="fp" type="text" placeholder="Ex: Kit Correia Dentada Jeep" value="'+esc(r.nome_produto||'')+'"></div>'+
    '<div class="g2"><div class="fg"><label class="fl">Marca</label><input class="fc" id="fm" type="text" placeholder="Ex: Gates" value="'+esc(r.marca||'')+'"></div>'+
    '<div class="fg"><label class="fl">Prazo Despacho</label><input class="fc" id="fd" type="date" value="'+esc(r.data_despacho||'')+'"></div></div>'+
    '<div class="fg"><label class="fl">Galpão</label><div class="chips" id="galpao-chips">'+gchips+'</div><input type="hidden" id="fg" value="'+esc(r.galpao||'')+'"></div>'+
    '<div class="fg"><label class="fl">Status</label><select class="fc" id="fs">'+opts+'</select></div>'+
    '<div class="fg"><label class="fl">Observações</label><textarea class="fc" id="fo" placeholder="Notas...">'+esc(r.observacoes||'')+'</textarea></div>';
}

// ── DETALHE ───────────────────────────────────────────────────────────
function pgDetalhe(main,id){
  var r=getRegistro(id);
  if(!r){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Etiqueta não encontrada</h3></div></div>';return;}
  var s=SM[r.status]||SM.recebido;var ci=SO.indexOf(r.status);
  var h='<div class="page">';
  h+='<div class="dcard"><div class="fb"><h2 style="font-size:1.1rem;font-weight:800;flex:1;padding-right:.5rem">'+esc(r.nome_cliente||'Cliente não informado')+'</h2><span class="badge '+r.status+'">'+s.icon+' '+s.label+'</span></div>';
  h+=dfield('Nº Venda ML',r.numero_venda);h+=dfield('Cód. Produto',r.codigo_produto);h+=dfield('Etiqueta ML',r.etiqueta_ml);h+=dfield('Código Barr.',r.etiqueta_barcode);h+=dfield('Produto',r.nome_produto);h+=dfield('Marca',r.marca);
  h+=dfield('Quantidade',r.quantidade);if(r.galpao&&GALPOES[r.galpao])h+=dfield('Galpão','🏭 '+GALPOES[r.galpao]);
  if(r.created_at)h+=dfield('Cadastrado',fmtDateTime(r.created_at));
  h+='</div>';
  if(r.observacoes)h+='<div class="dcard">'+dfield('Observações',r.observacoes)+'</div>';
  if(s.next){
    h+='<button class="act-btn '+s.next+'" onclick="window.advance(\''+r.id+'\',\''+s.next+'\')" ><div class="act-ico '+s.next+'">'+SM[s.next].icon+'</div><div style="flex:1"><div style="font-weight:700">'+SM[s.next].label+'</div><div style="font-size:.8rem;opacity:.8">'+s.nxt+'</div></div></button>';
  }else{
    h+='<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700">✅ Etiqueta Despachada</div>';
  }
  main.innerHTML=h+'</div>';
}
function dfield(l,v){if(v==null||v==='')return'';return'<div class="df"><span class="dl">'+l+'</span><span class="dv">'+esc(String(v))+'</span></div>';}

// ── BIPAR ───────────────────────────────────────────────────────────
function pgBipar(main){
  main.innerHTML='<div class="page"><div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Bipe o código de barras</div>'+
    '<div id="scan-status"></div><div id="scan-result"></div>'+
    '<div style="background:var(--card);border-radius:var(--r);padding:1rem;box-shadow:var(--sh)">'+
    '<div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Ou digite o código manualmente</div>'+
    '<div style="display:flex;gap:.5rem"><input class="fc" id="manual-code" type="text" placeholder="Código NF, KTB759, nº venda..." style="flex:1">'+
    '<button class="btn btn-p" onclick="window.manualCode()">Buscar</button></div></div></div>';
  setTimeout(startScanner,200);
}
window.manualCode=function(){
  var inp=g('manual-code');var code=inp?inp.value.trim():'';
  if(!code){toast('Digite um código','err');return;}
  stopScanner();onCodeFound(code);
};

// ── CONFIG ───────────────────────────────────────────────────────────
function pgConfig(main){
  var n=ST.registros.length;
  var cfg=getFbConfig()||{};
  var fbStatus=fbDb
    ?'<span style="color:var(--s-fin)">🟢 Conectado e sincronizando</span>'
    :'<span style="color:var(--red)">🔴 Não conectado — configure abaixo</span>';
  var projectHint=cfg.projectId?'<p class="muted sm">Projeto: <strong>'+esc(cfg.projectId)+'</strong></p>':'';
  main.innerHTML='<div class="page">'+
    '<div class="csec"><div class="csec-ttl">🔥 Firebase Realtime Database</div>'+
    '<div style="padding:.4rem 0">'+fbStatus+'</div>'+projectHint+
    '<p class="muted sm" style="margin-top:.5rem;margin-bottom:.75rem">Cole abaixo o JSON do seu Firebase (console.firebase.google.com → Configurações do projeto → Seus apps → SDK):</p>'+
    '<textarea class="fc" id="fb-json" rows="9" placeholder="{...}"></textarea>'+
    '<div style="display:flex;gap:.75rem;margin-top:.75rem">'+
    '<button class="btn btn-p" onclick="window.saveFbCfg()" style="flex:1">💾 Salvar e Conectar</button>'+
    '<button class="btn btn-n" onclick="window.clearFbCfg()">🗑️ Limpar</button>'+
    '</div>'+
    '<div id="fb-status" class="mt sm"></div>'+
    '<div style="background:#e8f5e9;border-radius:var(--rs);padding:.75rem;margin-top:.75rem;font-size:.8rem;color:#2e7d32">'+
    '<strong>ℹ️ Segurança:</strong> o JSON fica só no seu celular (localStorage). Não fica exposto em nenhum código público.'+
    '</div></div>'+
    '<div class="csec"><div class="csec-ttl">📊 Dados ('+n+' registro'+(n!==1?'s':'')+' em cache)</div>'+
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
      if(st2)st2.innerHTML=fbDb?'<span style="color:var(--s-fin)">✅ Conectado!</span>':'<span style="color:var(--red)">❌ Falha — verifique as permissões do Firebase</span>';
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

// ── FORM ACTIONS ─────────────────────────────────────────────────────────
function formData(){
  function v(id){var el=g(id);return el&&el.value.trim()?el.value.trim():null;}
  return{nome_cliente:v('fn'),numero_venda:v('fv'),etiqueta_ml:v('fe'),codigo_produto:v('fc2')?v('fc2').toUpperCase():null,nome_produto:v('fp'),marca:v('fm'),quantidade:v('fq'),data_despacho:v('fd'),galpao:v('fg'),status:v('fs')||'recebido',observacoes:v('fo')};
}
window.saveNovo=function(){
  var d=formData();
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  if(d.numero_venda){var dup=ST.registros.find(function(p){return p.numero_venda===d.numero_venda&&p.tipo==='etiqueta';});if(dup)toast('⚠️ Venda '+d.numero_venda+' já existe!','warn');}
  d.tipo='etiqueta';
  var r=createRegistro(d);toast('Etiqueta salva! ✅','ok');location.hash='#/detalhe/'+r.id;
};
window.saveEditar=function(id){
  var d=formData();
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  updateRegistro(id,d);toast('Atualizado! ✅','ok');location.hash='#/detalhe/'+id;
};
window.advance=function(id,nxt){updateRegistro(id,{status:nxt});toast(SM[nxt].icon+' '+SM[nxt].label,'ok');go();};
window.confirmDel=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir etiqueta?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-d" onclick="window.doDel(\''+id+'\')">🗑️ Sim, excluir</button><button class="btn btn-n" onclick="window.closeModal()">Cancelar</button></div></div>');};
window.doDel=function(id){window.closeModal();deleteRegistro(id);toast('Excluído','ok');location.hash='#/etiquetas';};
window.confirmClear=function(){modal('<div class="modal"><div class="modal-ttl">⚠️ Limpar cache local?</div><div class="modal-txt">Dados do Firebase permanecem. Serão baixados novamente ao reconectar.</div><div class="modal-acts"><button class="btn btn-d" onclick="window.doClear()">🗑️ Sim, limpar</button><button class="btn btn-n" onclick="window.closeModal()">Cancelar</button></div></div>');};
window.doClear=function(){window.closeModal();ST.registros=[];saveData();toast('Cache limpo','ok');location.hash='#/';};
window.doSearch=function(v){ST.fSearch=v;if(routeParse().page==='nfs')renderNFsList();else if(routeParse().page==='etiquetas')renderEtiquetasList();};
window.fSt=function(v){ST.fStatus=v;pgEtiquetas(g('app-main'));};
window.fGal=function(v){ST.fGalpao=v;if(routeParse().page==='nfs')renderNFsList();};
window.pickGalpao=function(k){
  var hi=g('fg');if(hi)hi.value=k;
  document.querySelectorAll('.galpao-chip').forEach(function(c){c.classList.toggle('on',c.dataset.gv===k);});
};
window.parseWpp=function(){
  var wt=g('wt');var txt=wt?wt.value:'';
  if(!txt.trim()){toast('Cole o texto primeiro','err');return;}
  function ex(pats,t){for(var i=0;i<pats.length;i++){var m=t.match(pats[i]);if(m&&m[1])return m[1].trim();}return null;}
  var pairs=[['fn',[/CLIENTE[:\s]+([^\n]+)/i]],['fv',[/VENDA[:\s]+([^\n]+)/i]],['fc2',[/C[ÓO]DIGO[:\s]+([^\n]+)/i]],['fp',[/PRODUTO[:\s]+([^\n]+)/i]],['fm',[/MARCA[:\s]+([^\n]+)/i]],['fq',[/QUAN[TTND]+[.\s]*[^\n]+([^\n]+)/i]]];
  var n=0;
  for(var i=0;i<pairs.length;i++){var fid=pairs[i][0],pats=pairs[i][1];var val=ex(pats,txt);if(val){var el=g(fid);if(el){el.value=fid==='fc2'?val.toUpperCase():val;n++;}}}
  if(n>0){
    var sec=g('step-barcode-scan');if(sec){sec.classList.add('active');setTimeout(function(){
      startScanner(function(code){
        stopScanner();
        var etq=g('fe');if(etq)etq.value=code.trim();
        var dataEl=g('fn');if(dataEl)dataEl.focus();
        sec.classList.remove('active');
      });
    },300);}
  }
  toast(n?n+' campo(s) preenchido(s) ✅':'Nada reconhecido. Preencha manualmente.',n?'ok':'err');
};
window.exportData=function(){
  var b=new Blob([JSON.stringify(ST.registros,null,2)],{type:'application/json'});
  var u=URL.createObjectURL(b);var a=document.createElement('a');
  a.href=u;a.download='speedlog-'+today()+'.json';a.click();URL.revokeObjectURL(u);
};

// ── MODAL / TOAST ─────────────────────────────────────────────────────────
function modal(html){var o=g('modal-overlay');if(o){o.classList.remove('hidden');o.innerHTML=html;}}
window.closeModal=function(){var o=g('modal-overlay');if(o)o.classList.add('hidden');};
function toast(msg,type){var c=g('toast-container');if(!c)return;var t=document.createElement('div');t.className='toast '+(type||'');t.textContent=msg;c.appendChild(t);setTimeout(function(){try{t.remove();}catch(e){}},3500);}

// ── INIT ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  try{
    loadData();initFirebase();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
    window.addEventListener('hashchange',function(){try{go();}catch(e){}});
    var ov=g('modal-overlay');if(ov)ov.addEventListener('click',function(e){if(e.target===this)window.closeModal();});
    try{go();}catch(e){var m=g('app-main');if(m)m.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao iniciar</h3><p>'+esc(e.message)+'</p><button class="btn btn-n mt" onclick="location.reload()">Recarregar</button></div></div>';}
  }catch(e){document.body.innerHTML='<div style="padding:2rem;text-align:center"><h2>Erro crítico</h2><p>'+e.message+'</p><button onclick="location.reload()">Recarregar</button></div>';}
});
