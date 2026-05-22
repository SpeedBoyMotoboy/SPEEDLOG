// SpeedLog v9
var DATA_KEY='sl_data';
var FB_KEY='sl_fb';
var SM={recebido:{label:'Recebido',icon:'📥',next:'separacao',nxt:'Iniciar Separação'},separacao:{label:'Separação',icon:'🔍',next:'expedicao',nxt:'Marcar Expedição'},expedicao:{label:'Expedição',icon:'📦',next:'finalizado',nxt:'Despachar ✅'},finalizado:{label:'Despachado',icon:'✅',next:null,nxt:null}};
var SO=['recebido','separacao','expedicao','finalizado'];
var GALPOES={real:'Real',comdip:'Comdip',bressan:'Bressan',sama:'Sama',pellegrino:'Pellegrino',eletropar:'Eletropar Nal.'};
var ST={registros:[],fStatus:null,fGalpao:null,fSearch:''};
var fbDb=null,qrScanner=null,qrScanner2=null,PREFILL=null,_pendingNF=null;

function g(id){return document.getElementById(id);}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function today(){return new Date().toISOString().slice(0,10);}
function uid(){try{return crypto.randomUUID();}catch(e){return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function fmtDateTime(s){if(!s)return'';try{var d=new Date(s);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch(e){return s;}}

function loadData(){
  try{
    var raw=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');
    ST.registros=raw.map(function(r){if(!r.tipo)r.tipo='etiqueta';return r;});
  }catch(e){ST.registros=[];}
}
function saveData(){try{localStorage.setItem(DATA_KEY,JSON.stringify(ST.registros));}catch(e){}}
function getFbConfig(){try{return JSON.parse(localStorage.getItem(FB_KEY)||'null');}catch(e){return null;}}
function saveFbConfig(c){localStorage.setItem(FB_KEY,JSON.stringify(c));}

function initFirebase(){
  var cfg=getFbConfig();
  if(!cfg||!cfg.databaseURL){fbDb=null;return;}
  try{
    if(!window.firebase){toast('Firebase SDK não carregou','err');return;}
    if(firebase.apps.length)firebase.apps[0].delete().catch(function(){});
    firebase.initializeApp(cfg);
    fbDb=firebase.database();
    fbDb.ref('registros').on('value',function(snap){
      var raw=snap.val()||{};
      var arr=Object.values(raw).map(function(r){if(!r.tipo)r.tipo='etiqueta';return r;});
      arr.sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
      ST.registros=arr;
      saveData();
      var page=routeParse().page;
      var main=g('app-main');
      if(page==='home'&&main)renderHome(main);
      else if(page==='nfs'&&main)renderNFList();
      else if(page==='etiquetas'&&main)renderListEtiquetas();
    },function(err){
      var msg=err.message||'';
      toast('Firebase: '+(msg.indexOf('ermission')>=0?'configure as Regras no Console':msg),'err');
    });
    fbDb.ref('pedidos').once('value',function(snap){
      var raw=snap.val()||{};
      if(!Object.keys(raw).length)return;
      Object.values(raw).forEach(function(r){
        if(!r.tipo)r.tipo='etiqueta';
        fbDb.ref('registros/'+r.id).set(r).catch(function(){});
      });
      fbDb.ref('pedidos').remove().catch(function(){});
      toast('Dados migrados ✅','ok');
    }).catch(function(){});
  }catch(e){fbDb=null;toast('Erro Firebase: '+e.message,'err');}
}

function pushFB(r){if(!fbDb)return;fbDb.ref('registros/'+r.id).set(r).catch(function(){});}
function delFB(id){if(!fbDb)return;fbDb.ref('registros/'+id).remove().catch(function(){});}

function createRegistro(data){
  var now=new Date().toISOString();
  var r={};for(var k in data)r[k]=data[k];
  r.id=uid();r.created_at=now;
  if(r.tipo==='etiqueta'){r.updated_at=now;if(!r.status)r.status='recebido';}
  ST.registros.unshift(r);saveData();pushFB(r);return r;
}
function getRegistro(id){for(var i=0;i<ST.registros.length;i++){if(ST.registros[i].id===id)return ST.registros[i];}return null;}
function updateRegistro(id,u){
  for(var i=0;i<ST.registros.length;i++){
    if(ST.registros[i].id===id){
      var r=ST.registros[i];for(var k in u)r[k]=u[k];
      r.updated_at=new Date().toISOString();
      saveData();pushFB(r);return r;
    }
  }return null;
}
function deleteRegistro(id){ST.registros=ST.registros.filter(function(r){return r.id!==id;});saveData();delFB(id);}

function stopScanner(){if(qrScanner){try{qrScanner.stop().catch(function(){});}catch(e){}qrScanner=null;}}
function stopScanner2(){if(qrScanner2){try{qrScanner2.stop().catch(function(){});}catch(e){}qrScanner2=null;}}
function stopAllScanners(){stopScanner();stopScanner2();}

function startScanner(onFound){
  stopScanner();
  var reader=g('reader');
  if(!reader||!window.Html5Qrcode){
    var st=g('scan-status');if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Use o campo abaixo</h3></div>';
    return;
  }
  try{
    qrScanner=new Html5Qrcode('reader');
    var cfg={fps:10,qrbox:{width:260,height:120}};
    if(window.Html5QrcodeScanType)cfg.supportedScanTypes=[Html5QrcodeScanType.SCAN_TYPE_CAMERA];
    qrScanner.start({facingMode:'environment'},cfg,
      function(code){stopScanner();if(onFound)onFound(code.trim());},
      function(){}
    ).catch(function(){
      var st=g('scan-status');if(st)st.innerHTML='<div class="empty"><span class="empty-ico">📷</span><h3>Permita acesso à câmera</h3></div>';
    });
  }catch(e){var st=g('scan-status');if(st)st.innerHTML='<div class="empty"><span class="empty-ico">⚠️</span><h3>'+esc(e.message)+'</h3></div>';}
}

function startScanner2(onFound){
  stopScanner2();
  var reader=g('reader2');
  if(!reader||!window.Html5Qrcode)return;
  try{
    qrScanner2=new Html5Qrcode('reader2');
    var cfg={fps:10,qrbox:{width:260,height:100}};
    if(window.Html5QrcodeScanType)cfg.supportedScanTypes=[Html5QrcodeScanType.SCAN_TYPE_CAMERA];
    qrScanner2.start({facingMode:'environment'},cfg,
      function(code){stopScanner2();if(onFound)onFound(code.trim());},
      function(){}
    ).catch(function(){});
  }catch(e){}
}

function routeParse(){
  var h=location.hash.slice(1)||'/';
  var p=h.split('/').filter(function(x){return x;});
  if(!p.length)return{page:'home',id:null};
  if(p[0]==='nfs')return{page:'nfs',id:null};
  if(p[0]==='nova-nf')return{page:'nova-nf',id:null};
  if(p[0]==='etiquetas')return{page:'etiquetas',id:null};
  if(p[0]==='novo')return{page:'novo',id:null};
  if(p[0]==='editar'&&p[1])return{page:'editar',id:p[1]};
  if(p[0]==='etiqueta'&&p[1])return{page:'detalhe',id:p[1]};
  if(p[0]==='bipar')return{page:'bipar',id:null};
  if(p[0]==='config')return{page:'config',id:null};
  return{page:'home',id:null};
}

var PLUS_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>';
var EDIT_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
var DEL_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

function go(){
  stopAllScanners();
  var route=routeParse();var page=route.page,id=route.id;
  var main=g('app-main'),back=g('btn-back'),ttl=g('page-title'),acts=g('header-actions');
  if(!main)return;
  document.querySelectorAll('.nav-item').forEach(function(el){
    var dp=el.dataset.page;
    el.classList.toggle('active',dp===page||(page==='nova-nf'&&dp==='nfs')||(page==='novo'&&dp==='etiquetas')||(page==='editar'&&dp==='etiquetas')||(page==='detalhe'&&dp==='etiquetas'));
  });
  if(acts)acts.innerHTML='';
  if(back){back.classList.add('hidden');back.onclick=null;}
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';
  try{
    if(page==='home'){if(ttl)ttl.textContent='SpeedLog';renderHome(main);}
    else if(page==='nfs'){
      if(ttl)ttl.textContent='NFs Coletadas';
      if(acts)acts.innerHTML='<a href="#/nova-nf" class="btn-icon" title="Nova NF">'+PLUS_SVG+'</a>';
      pgNFs(main);
    }
    else if(page==='nova-nf'){
      if(ttl)ttl.textContent='Nova NF';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgNovaNF(main);
    }
    else if(page==='etiquetas'){
      if(ttl)ttl.textContent='Etiquetas';
      if(acts)acts.innerHTML='<a href="#/novo" class="btn-icon" title="Nova Etiqueta">'+PLUS_SVG+'</a>';
      pgEtiquetas(main);
    }
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
      if(acts)acts.innerHTML='<a href="#/editar/'+id+'" class="btn-icon">'+EDIT_SVG+'</a><button class="btn-icon" onclick="window.confirmDel(\''+id+'\')">' +DEL_SVG+'</button>';
      pgDetalhe(main,id);
    }
    else if(page==='bipar'){if(ttl)ttl.textContent='Bipar';pgBipar(main);}
    else if(page==='config'){if(ttl)ttl.textContent='Configurações';pgConfig(main);}
  }catch(e){
    main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao carregar</h3><p style="color:var(--red);font-size:.8rem">'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';
  }
}

function gcChips(selected){
  var h='';
  Object.keys(GALPOES).forEach(function(k){h+='<span class="chip'+(selected===k?' on':'')+' galpao-chip" onclick="window.pickGalpao(\''+k+'\')" data-gv="'+k+'">'+GALPOES[k]+'</span>';});
  return h;
}

function renderHome(main){
  var hoje=today();
  var nfsHoje=ST.registros.filter(function(r){return r.tipo==='nf'&&(r.created_at||'').slice(0,10)===hoje;}).length;
  var ets=ST.registros.filter(function(r){return r.tipo==='etiqueta';});
  var c={recebido:0,separacao:0,expedicao:0,finalizado:0};
  ets.forEach(function(r){if(c[r.status]!==undefined)c[r.status]++;});
  var cfg=getFbConfig();
  var fbStatus=fbDb?'🟢 Firebase sincronizado':(cfg&&cfg.databaseURL?'🟡 Reconectando...':'🔴 Configure Firebase em Config');
  var pendentes=ets.filter(function(r){return r.status!=='finalizado';}).slice(0,5);
  var h='<div class="page">';
  h+='<div class="stats-grid">';
  h+=sCard('s-nf','📋',nfsHoje,'NFs hoje');
  h+=sCard('s-rec','📥',c.recebido,'Recebidos');
  h+=sCard('s-sep','🔍',c.separacao,'Separação');
  h+=sCard('s-fin','✅',c.finalizado,'Despachados');
  h+='</div>';
  h+='<div style="text-align:center;font-size:.72rem;color:var(--muted)">'+fbStatus+'</div>';
  if(pendentes.length){
    h+='<div><div class="sec-hdr"><span class="sec-ttl">Pendentes</span><a href="#/etiquetas" style="font-size:.8rem;color:var(--blue);font-weight:600">Ver todas →</a></div>';
    h+='<div style="display:flex;flex-direction:column;gap:.75rem">';
    pendentes.forEach(function(r){h+=etiquetaCard(r);});
    h+='</div></div>';
  }else{
    h+='<div class="empty"><span class="empty-ico">🎉</span><h3>Tudo em dia!</h3><p>Nenhuma etiqueta pendente.</p></div>';
  }
  if(ST.registros.length===0){
    h+='<div style="background:var(--blue);border-radius:var(--r);padding:1.25rem;color:#fff;text-align:center">';
    h+='<div style="font-size:1.8rem;margin-bottom:.5rem">🚚</div>';
    h+='<p style="font-size:.9rem;opacity:.9;margin-bottom:.75rem"><strong>Como começar:</strong><br>1. Configure Firebase em ⚙️ Config<br>2. NFs: colete nos galpões e bipe<br>3. Etiquetas: cole o texto do WhatsApp e bipe</p>';
    h+='<div style="display:flex;gap:.75rem;flex-direction:column">';
    h+='<a href="#/nova-nf" class="btn btn-o btn-bl">📋 Registrar NF</a>';
    h+='<a href="#/novo" class="btn btn-bl" style="background:rgba(255,255,255,.2);color:#fff">🏷 Nova Etiqueta</a>';
    h+='</div></div>';
  }
  main.innerHTML=h+'</div>';
}
function sCard(cls,ico,num,lbl){return '<div class="stat-card '+cls+'"><span class="stat-ico">'+ico+'</span><span class="stat-num">'+num+'</span><span class="stat-lbl">'+lbl+'</span></div>';}

function pgNFs(main){
  var gchips='<span class="chip '+(!ST.fGalpao?'on':'')+' " onclick="window.fGalNF(null)">Todos</span>';
  Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip '+(ST.fGalpao===k?'on':'')+' " onclick="window.fGalNF(\''+k+'\')">'+ GALPOES[k]+'</span>';});
  main.innerHTML='<div class="page"><div class="filter-label">Galpão</div><div class="chips">'+gchips+'</div><div id="nf-lst"></div></div>';
  renderNFList();
}
function renderNFList(){
  var el=g('nf-lst');if(!el)return;
  var d=ST.registros.filter(function(r){return r.tipo==='nf';});
  if(ST.fGalpao)d=d.filter(function(r){return r.galpao===ST.fGalpao;});
  if(!d.length){el.innerHTML='<div class="empty"><span class="empty-ico">📋</span><h3>Nenhuma NF registrada</h3><p>Toque em + para registrar.</p></div>';return;}
  var h='<div style="display:flex;flex-direction:column;gap:.75rem">';
  d.forEach(function(r){
    var gl=r.galpao&&GALPOES[r.galpao]?GALPOES[r.galpao]:'—';
    h+='<div class="nf-card"><div style="display:flex;justify-content:space-between;align-items:flex-start">';
    h+='<div><div class="nf-code">'+esc(r.nf_codigo||'—')+'</div>';
    h+='<div class="nf-meta">🏭 '+esc(gl)+' &nbsp;·&nbsp; 📅 '+esc(fmtDateTime(r.created_at))+'</div></div>';
    h+='<button class="btn-icon-sm" onclick="window.confirmDelNF(\''+r.id+'\')" style="color:var(--red)">✕</button>';
    h+='</div>';
    if(r.observacoes)h+='<div style="font-size:.8rem;color:var(--muted);margin-top:.4rem">'+esc(r.observacoes)+'</div>';
    h+='</div>';
  });
  el.innerHTML=h+'</div>';
}
window.fGalNF=function(v){ST.fGalpao=v;pgNFs(g('app-main'));};
window.confirmDelNF=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir NF?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDelNF(\''+id+'\')" >Excluir</button></div></div>');};
window.doDelNF=function(id){window.closeModal();deleteRegistro(id);toast('NF removida','ok');renderNFList();};

function pgNovaNF(main){
  main.innerHTML='<div class="page">'+
    '<div class="dcard"><div class="fl" style="margin-bottom:.75rem">Galpão *</div>'+
    '<div class="chips" id="galpao-chips">'+gcChips(null)+'</div>'+
    '<input type="hidden" id="fg" value=""></div>'+
    '<div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Aponte para o código de barras da NF</div>'+
    '<div id="scan-status"></div>'+
    '<div id="nf-found" class="dcard" style="display:none">'+
    '<div class="fl">NF bipada ✅</div>'+
    '<div id="nf-code-display" style="font-family:monospace;font-size:1.1rem;font-weight:800;color:var(--blue);margin:.4rem 0"></div>'+
    '<div id="nf-dt-display" style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem"></div>'+
    '<div style="display:flex;gap:.75rem">'+
    '<button class="btn btn-n" style="flex:1" onclick="window.novaNFReset()">↩ Bipar outra</button>'+
    '<button class="btn btn-p" style="flex:1" onclick="window.salvarNF()">💾 Salvar NF</button>'+
    '</div></div>'+
    '<div class="dcard">'+
    '<div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Ou digite o código manualmente</div>'+
    '<div style="display:flex;gap:.5rem">'+
    '<input class="fc" id="manual-nf" type="text" placeholder="Código / número da NF..." style="flex:1">'+
    '<button class="btn btn-p" onclick="window.manualNF()">OK</button>'+
    '</div>'+
    '<div class="fg" style="margin-top:.75rem"><label class="fl">Observações</label>'+
    '<input class="fc" id="nf-obs" type="text" placeholder="Opcional..."></div>'+
    '</div></div>';
  setTimeout(function(){startScanner(onNFFound);},200);
}
function onNFFound(code){
  _pendingNF=code;
  var f=g('nf-found');if(f)f.style.display='';
  var cd=g('nf-code-display');if(cd)cd.textContent=code;
  var dt=g('nf-dt-display');if(dt)dt.textContent='📅 '+new Date().toLocaleString('pt-BR');
}
window.manualNF=function(){
  var inp=g('manual-nf');var code=inp?inp.value.trim():'';
  if(!code){toast('Digite o código da NF','err');return;}
  stopScanner();onNFFound(code);
};
window.novaNFReset=function(){
  _pendingNF=null;
  var f=g('nf-found');if(f)f.style.display='none';
  startScanner(onNFFound);
};
window.salvarNF=function(){
  var galpao=g('fg')?g('fg').value:'';
  if(!galpao){toast('Selecione o galpão primeiro','err');return;}
  if(!_pendingNF){toast('Bipe ou digite o código da NF','err');return;}
  var obs=g('nf-obs')?g('nf-obs').value.trim():'';
  createRegistro({tipo:'nf',nf_codigo:_pendingNF,galpao:galpao,observacoes:obs||null});
  toast('NF registrada! ✅','ok');
  _pendingNF=null;
  location.hash='#/nfs';
};

function pgEtiquetas(main){
  var chips='<span class="chip '+(!ST.fStatus?'on':'')+' " onclick="window.fSt(null)">Todas</span>';
  SO.forEach(function(s){chips+='<span class="chip '+(ST.fStatus===s?'on '+s:'')+' " onclick="window.fSt(\''+s+'\')">'+ SM[s].icon+' '+SM[s].label+'</span>';});
  var gchips='<span class="chip '+(!ST.fGalpao?'on':'')+' " onclick="window.fGal(null)">Todos</span>';
  Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip '+(ST.fGalpao===k?'on':'')+' " onclick="window.fGal(\''+k+'\')">'+ GALPOES[k]+'</span>';});
  main.innerHTML='<div class="page"><div class="search-wrap">'+
    '<svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>'+
    '<input type="search" id="si" placeholder="Nome, venda, código..." value="'+esc(ST.fSearch)+'" oninput="window.doSearch(this.value)" autocomplete="off"></div>'+
    '<div class="filter-label">Status</div><div class="chips">'+chips+'</div>'+
    '<div class="filter-label">Galpão</div><div class="chips">'+gchips+'</div>'+
    '<div id="lst"></div></div>';
  renderListEtiquetas();
}
function renderListEtiquetas(){
  var el=g('lst');if(!el)return;
  var d=ST.registros.filter(function(r){return r.tipo==='etiqueta';});
  if(ST.fStatus)d=d.filter(function(r){return r.status===ST.fStatus;});
  if(ST.fGalpao)d=d.filter(function(r){return r.galpao===ST.fGalpao;});
  if(ST.fSearch){var q=ST.fSearch.toLowerCase();d=d.filter(function(r){return[r.nome_cliente,r.codigo_produto,r.numero_venda,r.etiqueta_barcode,r.nome_produto,r.marca,r.galpao&&GALPOES[r.galpao]].some(function(v){return v&&v.toLowerCase().indexOf(q)>=0;});});}
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
  if(r.etiqueta_barcode)meta+='<span class="meta">▌▌ '+esc(r.etiqueta_barcode.slice(0,18))+'</span>';
  if(r.galpao&&GALPOES[r.galpao])meta+='<span class="meta">🏭 '+esc(GALPOES[r.galpao])+'</span>';
  if(r.nome_produto)meta+='<span class="meta">'+esc(r.nome_produto)+(r.marca?' — '+esc(r.marca):'')+'</span>';
  if(r.quantidade)meta+='<span class="meta">Qtd: '+esc(r.quantidade)+'</span>';
  if(dt)meta+='<span class="meta">📅 '+dt+'</span>';
  return '<a href="#/etiqueta/'+r.id+'" class="order-card '+r.status+'"><div class="oc-hdr"><span class="oc-ttl">'+esc(r.nome_cliente||'Cliente não informado')+'</span><span class="badge '+r.status+'">'+s.icon+' '+s.label+'</span></div><div class="oc-meta">'+meta+'</div></a>';
}

function pgNovo(main){
  main.innerHTML='<div class="page">'+
    '<div class="step-card">'+
    '<div class="step-hdr"><span class="step-num">1</span><span class="step-lbl">Cole o texto do WhatsApp</span></div>'+
    '<textarea class="fc" id="wt" rows="5" placeholder="VENDA: 2000016511054860&#10;CLIENTE: Cintyha Raiane&#10;PRODUTO: Bobina Ignição&#10;UNIDADE: 4 unidades&#10;SKU: BI0021MM"></textarea>'+
    '<button class="btn btn-n btn-bl mt" onclick="window.parseWpp()">🔍 Interpretar →</button>'+
    '</div>'+
    '<div id="step2" style="display:none" class="step-card">'+
    '<div class="step-hdr"><span class="step-num">2</span><span class="step-lbl">Bipe o código de barras da etiqueta</span></div>'+
    '<div class="scan-area" style="min-height:200px"><div id="reader2"></div><div class="scan-laser"></div></div>'+
    '<div id="barcode-found" style="display:none;background:var(--card);border-radius:var(--rs);padding:.75rem;margin-top:.5rem">'+
    '<div style="font-size:.75rem;color:var(--muted);font-weight:700">Código vinculado:</div>'+
    '<div id="barcode-display" style="font-family:monospace;font-size:1rem;font-weight:800;color:var(--blue);word-break:break-all"></div>'+
    '</div>'+
    '<div style="display:flex;gap:.5rem;margin-top:.75rem">'+
    '<input class="fc" id="manual-barcode" type="text" placeholder="Ou digite o código da etiqueta..." style="flex:1">'+
    '<button class="btn btn-n" onclick="window.manualBarcode()">OK</button>'+
    '</div>'+
    '<input type="hidden" id="etiqueta-barcode" value="">'+
    '</div>'+
    '<div id="step-fields" style="display:none" class="dcard">'+
    '<span class="fl" style="display:block;margin-bottom:.75rem">Dados do pedido</span>'+
    buildFormFields(null)+
    '</div>'+
    '<div class="dcard">'+
    '<div class="fl" style="margin-bottom:.5rem">Galpão</div>'+
    '<div class="chips" id="galpao-chips">'+gcChips(null)+'</div>'+
    '<input type="hidden" id="fg" value="">'+
    '</div>'+
    '<button class="btn btn-p btn-bl" onclick="window.saveNovo()">💾 Salvar Etiqueta</button>'+
    '</div>';
  if(PREFILL){
    setTimeout(function(){
      var el=g(PREFILL.campo);if(el){el.value=PREFILL.valor;el.focus();}
      var sf=g('step-fields');if(sf)sf.style.display='';
      PREFILL=null;
    },50);
  }
}
function buildFormFields(r){
  if(!r)r={};
  var opts=SO.map(function(s){return '<option value="'+s+'"'+(r.status===s?' selected':'')+'>'+SM[s].label+'</option>';}).join('');
  return '<div class="fg"><label class="fl">Cliente *</label><input class="fc" id="fn" type="text" placeholder="Nome do cliente" value="'+esc(r.nome_cliente||'')+'"></div>'+
    '<div class="g2"><div class="fg"><label class="fl">Nº Venda</label><input class="fc" id="fv" type="text" placeholder="2000016511..." value="'+esc(r.numero_venda||'')+'"></div>'+
    '<div class="fg"><label class="fl">SKU / Cód.</label><input class="fc" id="fc2" type="text" style="text-transform:uppercase" placeholder="BI0021MM" value="'+esc(r.codigo_produto||'')+'"></div></div>'+
    '<div class="fg"><label class="fl">Produto</label><input class="fc" id="fp" type="text" placeholder="Nome do produto" value="'+esc(r.nome_produto||'')+'"></div>'+
    '<div class="g2"><div class="fg"><label class="fl">Unidade / Qtd</label><input class="fc" id="fq" type="text" placeholder="4 unidades" value="'+esc(r.quantidade||'')+'"></div>'+
    '<div class="fg"><label class="fl">Marca</label><input class="fc" id="fm" type="text" placeholder="Magneti Marelli" value="'+esc(r.marca||'')+'"></div></div>'+
    '<div class="fg"><label class="fl">Status</label><select class="fc" id="fs">'+opts+'</select></div>'+
    '<div class="fg"><label class="fl">Observações</label><textarea class="fc" id="fo" placeholder="Notas...">'+esc(r.observacoes||'')+'</textarea></div>';
}
window.parseWpp=function(){
  var wt=g('wt');var txt=wt?wt.value:'';
  if(!txt.trim()){toast('Cole o texto primeiro','err');return;}
  function ex(pats,t){for(var i=0;i<pats.length;i++){var m=t.match(pats[i]);if(m&&m[1])return m[1].trim();}return null;}
  var pairs=[
    ['fn',[/CLIENTE[:\s]+([^\n]+)/i]],
    ['fv',[/VENDA[:\s]+([^\n]+)/i]],
    ['fc2',[/SKU[:\s]+([^-\n\(]+)/i,/C[ÓO]DIGO[:\s]+([^\n]+)/i]],
    ['fp',[/PRODUTO[:\s]+([^\n]+)/i]],
    ['fm',[/MARCA[:\s]+([^\n]+)/i]],
    ['fq',[/UNIDADE[:\s]+([^\n]+)/i,/QUANTIDADE[:\s]+([^\n]+)/i]]
  ];
  var sf=g('step-fields');if(sf)sf.style.display='';
  var n=0;
  for(var i=0;i<pairs.length;i++){
    var fid=pairs[i][0],pats=pairs[i][1];
    var val=ex(pats,txt);
    if(val){var el=g(fid);if(el){el.value=fid==='fc2'?val.replace(/[*\(\)\s]/g,'').toUpperCase():val;n++;}}
  }
  toast(n?n+' campo(s) preenchido(s) ✅':'Nada reconhecido — preencha manualmente.',n?'ok':'warn');
  var s2=g('step2');if(s2)s2.style.display='';
  setTimeout(function(){startScanner2(onEtiquetaBarcode);},300);
};
function onEtiquetaBarcode(code){
  var hi=g('etiqueta-barcode');if(hi)hi.value=code;
  var bf=g('barcode-found');if(bf)bf.style.display='';
  var bd=g('barcode-display');if(bd)bd.textContent=code;
  toast('Código vinculado ✅','ok');
}
window.manualBarcode=function(){
  var inp=g('manual-barcode');var code=inp?inp.value.trim():'';
  if(!code){toast('Digite o código','err');return;}
  stopScanner2();onEtiquetaBarcode(code);
};
window.saveNovo=function(){
  stopScanner2();
  function v(id){var el=g(id);return el&&el.value.trim()?el.value.trim():null;}
  var d={tipo:'etiqueta',nome_cliente:v('fn'),numero_venda:v('fv'),codigo_produto:v('fc2')?v('fc2').toUpperCase():null,nome_produto:v('fp'),marca:v('fm'),quantidade:v('fq'),status:g('fs')?g('fs').value:'recebido',observacoes:v('fo'),galpao:v('fg'),etiqueta_barcode:v('etiqueta-barcode')};
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  var r=createRegistro(d);
  toast('Etiqueta salva! ✅','ok');
  location.hash='#/etiqueta/'+r.id;
};

function pgEditar(main,id){
  var r=getRegistro(id);
  if(!r||r.tipo!=='etiqueta'){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>';return;}
  main.innerHTML='<div class="page"><div class="dcard">'+
    buildFormFields(r)+
    '<div class="fg"><label class="fl">Cód. barras (etiqueta)</label><input class="fc" id="etiqueta-barcode" type="text" value="'+esc(r.etiqueta_barcode||'')+'"></div>'+
    '<div class="fg"><label class="fl">Galpão</label><div class="chips" id="galpao-chips">'+gcChips(r.galpao)+'</div><input type="hidden" id="fg" value="'+esc(r.galpao||'')+'"></div>'+
    '<button class="btn btn-p btn-bl mt2" onclick="window.saveEditar(\''+id+'\')" >💾 Salvar Alterações</button>'+
    '</div></div>';
}
window.saveEditar=function(id){
  function v(eid){var el=g(eid);return el&&el.value.trim()?el.value.trim():null;}
  var d={nome_cliente:v('fn'),numero_venda:v('fv'),codigo_produto:v('fc2')?v('fc2').toUpperCase():null,nome_produto:v('fp'),marca:v('fm'),quantidade:v('fq'),observacoes:v('fo'),galpao:v('fg'),status:g('fs')?g('fs').value:'recebido',etiqueta_barcode:v('etiqueta-barcode')};
  if(!d.nome_cliente){toast('Informe o nome do cliente','err');return;}
  updateRegistro(id,d);toast('Atualizado! ✅','ok');location.hash='#/etiqueta/'+id;
};

function pgDetalhe(main,id){
  var r=getRegistro(id);
  if(!r||r.tipo!=='etiqueta'){main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">❌</span><h3>Não encontrado</h3></div></div>';return;}
  var s=SM[r.status]||SM.recebido;var ci=SO.indexOf(r.status);
  var h='<div class="page">';
  h+='<div class="sprog">';
  SO.forEach(function(st,i){var cl=i<ci?'done':(i===ci?'active':'');h+='<div class="pstep '+cl+'"><div class="pdot">'+(i<ci?'✓':String(i+1))+'</div><span class="plbl">'+SM[st].label+'</span></div>';});
  h+='</div>';
  h+='<div class="dcard"><div class="fb"><h2 style="font-size:1.1rem;font-weight:800;flex:1;padding-right:.5rem">'+esc(r.nome_cliente||'Cliente não informado')+'</h2><span class="badge '+r.status+'">'+s.icon+' '+s.label+'</span></div><div class="dg">';
  h+=dfield('Nº Venda',r.numero_venda);
  h+=dfield('SKU / Cód.',r.codigo_produto);
  h+=dfield('Produto',r.nome_produto);
  h+=dfield('Marca',r.marca);
  h+=dfield('Quantidade',r.quantidade);
  if(r.etiqueta_barcode)h+=dfield('Cód. barras',r.etiqueta_barcode);
  if(r.galpao&&GALPOES[r.galpao])h+=dfield('Galpão','🏭 '+GALPOES[r.galpao]);
  if(r.created_at)h+=dfield('Cadastrado',new Date(r.created_at).toLocaleString('pt-BR'));
  h+='</div>';
  if(r.observacoes)h+='<div class="df"><span class="dl">Observações</span><span class="dv">'+esc(r.observacoes)+'</span></div>';
  h+='</div>';
  if(s.next){h+='<button class="act-btn '+s.next+'" onclick="window.advance(\''+r.id+'\',\''+s.next+'\')" ><div class="act-ico '+s.next+'">'+SM[s.next].icon+'</div><div style="flex:1"><div style="font-weight:800;font-size:.95rem">'+esc(s.nxt)+'</div><div style="font-size:.75rem;color:var(--muted);margin-top:2px">→ '+SM[s.next].label+'</div></div><svg style="opacity:.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>';}
  else{h+='<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700">✅ Pedido Despachado</div>';}
  main.innerHTML=h+'</div>';
}
function dfield(l,v){if(v==null||v==='')return'';return'<div class="df"><span class="dl">'+l+'</span><span class="dv">'+esc(String(v))+'</span></div>';}

function pgBipar(main){
  main.innerHTML='<div class="page"><div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Bipe código de barras da etiqueta ou NF</div>'+
    '<div id="scan-status"></div><div id="scan-result"></div>'+
    '<div class="dcard"><div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.75rem">Ou digite o código manualmente</div>'+
    '<div style="display:flex;gap:.5rem">'+
    '<input class="fc" id="manual-code" type="text" placeholder="Código da etiqueta, NF, venda..." style="flex:1">'+
    '<button class="btn btn-p" onclick="window.manualCode()">Buscar</button>'+
    '</div></div></div>';
  setTimeout(function(){startScanner(onCodeFoundBipar);},200);
}
window.manualCode=function(){var inp=g('manual-code');var code=inp?inp.value.trim():'';if(!code){toast('Digite um código','err');return;}stopScanner();onCodeFoundBipar(code);};
function onCodeFoundBipar(code){
  var r=g('scan-result');if(!r)return;
  var codeU=code.toUpperCase();var codeT=code;
  var matches=ST.registros.filter(function(p){
    if(p.tipo==='nf')return p.nf_codigo&&p.nf_codigo.trim()===codeT;
    return(p.etiqueta_barcode&&p.etiqueta_barcode.trim().toUpperCase()===codeU)||(p.codigo_produto&&p.codigo_produto.trim().toUpperCase()===codeU)||(p.numero_venda&&p.numero_venda.trim()===codeT);
  });
  var topBar='<div class="scan-code"><span style="font-size:1.4rem">🔍</span><span class="scan-code-val">'+esc(codeT)+'</span><button class="btn btn-n" style="font-size:.8rem;padding:.4rem .8rem;min-height:36px" onclick="window.restartScan()">Nova bipagem</button></div>';
  if(!matches.length){
    PREFILL={campo:/^\d{10,}$/.test(codeT)?'fv':'fc2',valor:/^\d{10,}$/.test(codeT)?codeT:codeU};
    r.innerHTML='<div class="scan-result">'+topBar+'<div class="scan-matches"><div class="no-match" style="padding:1.25rem;text-align:center"><div style="font-size:2.5rem;margin-bottom:.5rem">🤔</div><div style="font-weight:700;margin-bottom:.5rem">Não encontrado</div><p style="color:var(--muted);font-size:.85rem">Cadastre agora com o código já preenchido:</p><a href="#/novo" class="btn btn-p btn-bl" style="margin-top:.75rem">+ Cadastrar Etiqueta</a></div></div></div>';
    return;
  }
  var cards='';
  matches.forEach(function(p){
    if(p.tipo==='nf'){
      var gl=p.galpao&&GALPOES[p.galpao]?GALPOES[p.galpao]:'—';
      cards+='<div class="nf-card"><div class="nf-code">'+esc(p.nf_codigo)+'</div><div class="nf-meta">🏭 '+esc(gl)+' · 📅 '+esc(fmtDateTime(p.created_at))+'</div></div>';
      return;
    }
    var s=SM[p.status]||SM.recebido;
    var details='';
    if(p.nome_cliente)details+='<div class="scan-detail-row"><span class="dl">Cliente</span><span class="dv bold">'+esc(p.nome_cliente)+'</span></div>';
    if(p.numero_venda)details+='<div class="scan-detail-row"><span class="dl">Venda</span><span class="dv mono">'+esc(p.numero_venda)+'</span></div>';
    if(p.etiqueta_barcode)details+='<div class="scan-detail-row"><span class="dl">Barcode</span><span class="dv mono">'+esc(p.etiqueta_barcode)+'</span></div>';
    if(p.nome_produto)details+='<div class="scan-detail-row"><span class="dl">Produto</span><span class="dv">'+esc(p.nome_produto)+(p.marca?' — '+esc(p.marca):'')+'</span></div>';
    if(p.quantidade)details+='<div class="scan-detail-row"><span class="dl">Qtd</span><span class="dv">'+esc(p.quantidade)+'</span></div>';
    if(p.galpao&&GALPOES[p.galpao])details+='<div class="scan-detail-row"><span class="dl">Galpão</span><span class="dv bold">🏭 '+esc(GALPOES[p.galpao])+'</span></div>';
    var ab=s.next?'<button class="btn btn-p btn-bl" style="margin-top:.75rem" onclick="window.advanceScan(\''+p.id+'\',\''+s.next+'\')" >'+SM[s.next].icon+' '+s.nxt+'</button>':'';
    cards+='<div class="scan-match-card '+p.status+'"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem"><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span><a href="#/etiqueta/'+p.id+'" style="font-size:.78rem;color:var(--blue);font-weight:600">Ver detalhes →</a></div>'+details+ab+'</div>';
  });
  r.innerHTML='<div class="scan-result">'+topBar+'<div class="scan-matches">'+cards+'</div></div>';
}
window.restartScan=function(){var r=g('scan-result');if(r)r.innerHTML='';startScanner(onCodeFoundBipar);};
window.advanceScan=function(id,nxt){updateRegistro(id,{status:nxt});toast(SM[nxt].icon+' '+SM[nxt].label+' ✅','ok');var p=getRegistro(id);if(p)onCodeFoundBipar(p.etiqueta_barcode||p.codigo_produto||p.numero_venda||'');};

function pgConfig(main){
  var n=ST.registros.length;
  var cfg=getFbConfig()||{};
  var fbStatus=fbDb?'<span style="color:var(--s-fin)">🟢 Conectado</span>':'<span style="color:var(--red)">🔴 Não conectado</span>';
  var projectHint=cfg.projectId?'<p class="muted sm">Projeto: <strong>'+esc(cfg.projectId)+'</strong></p>':'';
  main.innerHTML='<div class="page">'+
    '<div class="csec"><div class="csec-ttl">🔥 Firebase Realtime Database</div>'+
    '<div style="padding:.4rem 0">'+fbStatus+'</div>'+projectHint+
    '<p class="muted sm" style="margin-top:.5rem;margin-bottom:.75rem">Cole o JSON do Firebase (console.firebase.google.com → Configurações → Seus apps → SDK):</p>'+
    '<textarea class="fc" id="fb-json" rows="9" placeholder="{\n  &quot;apiKey&quot;: &quot;AIza...&quot;,\n  &quot;databaseURL&quot;: &quot;https://...firebaseio.com&quot;,\n  &quot;projectId&quot;: &quot;...&quot;\n}">'+esc(cfg.projectId?JSON.stringify(cfg,null,2):'')+'</textarea>'+
    '<div style="display:flex;gap:.75rem;margin-top:.75rem">'+
    '<button class="btn btn-p" onclick="window.saveFbCfg()" style="flex:1">💾 Salvar e Conectar</button>'+
    '<button class="btn btn-n" onclick="window.clearFbCfg()">🗑️ Limpar</button>'+
    '</div><div id="fb-status" class="mt sm"></div>'+
    '<div style="background:#e8f5e9;border-radius:var(--rs);padding:.75rem;margin-top:.75rem;font-size:.8rem;color:#2e7d32"><strong>ℹ️</strong> O JSON fica só no seu celular (localStorage).</div>'+
    '</div>'+
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
    if(!cfg.databaseURL){toast('JSON precisa ter databaseURL','err');return;}
    saveFbConfig(cfg);initFirebase();
    var st=g('fb-status');if(st)st.innerHTML='<span style="color:var(--muted)">Conectando...</span>';
    setTimeout(function(){var st2=g('fb-status');if(st2)st2.innerHTML=fbDb?'<span style="color:var(--s-fin)">✅ Conectado!</span>':'<span style="color:var(--red)">❌ Verifique as Regras do Firebase</span>';},2000);
  }catch(e){toast('JSON inválido: '+e.message,'err');}
};
window.clearFbCfg=function(){localStorage.removeItem(FB_KEY);fbDb=null;toast('Configuração removida','ok');pgConfig(g('app-main'));};
window.advance=function(id,nxt){updateRegistro(id,{status:nxt});toast(SM[nxt].icon+' '+SM[nxt].label,'ok');go();};
window.confirmDel=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir etiqueta?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDel(\''+id+'\')" >Excluir</button></div></div>');};
window.doDel=function(id){window.closeModal();deleteRegistro(id);toast('Excluído','ok');location.hash='#/etiquetas';};
window.confirmClear=function(){modal('<div class="modal"><div class="modal-ttl">⚠️ Limpar cache local?</div><div class="modal-txt">Dados do Firebase permanecem.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doClear()">Limpar</button></div></div>');};
window.doClear=function(){window.closeModal();ST.registros=[];saveData();toast('Cache limpo','ok');location.hash='#/';};
window.doSearch=function(v){ST.fSearch=v;renderListEtiquetas();};
window.fSt=function(v){ST.fStatus=v;pgEtiquetas(g('app-main'));};
window.fGal=function(v){ST.fGalpao=v;pgEtiquetas(g('app-main'));};
window.pickGalpao=function(k){var hi=g('fg');if(hi)hi.value=k;document.querySelectorAll('.galpao-chip').forEach(function(c){c.classList.toggle('on',c.dataset.gv===k);});};
window.exportData=function(){var b=new Blob([JSON.stringify(ST.registros,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='speedlog-'+today()+'.json';a.click();URL.revokeObjectURL(u);};

function modal(html){var o=g('modal-overlay');if(o){o.classList.remove('hidden');o.innerHTML=html;}}
window.closeModal=function(){var o=g('modal-overlay');if(o)o.classList.add('hidden');};
function toast(msg,type){var c=g('toast-container');if(!c)return;var t=document.createElement('div');t.className='toast '+(type||'');t.textContent=msg;c.appendChild(t);setTimeout(function(){try{t.remove();}catch(e){}},3200);}

document.addEventListener('DOMContentLoaded',function(){
  try{
    loadData();initFirebase();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
    window.addEventListener('hashchange',function(){try{go();}catch(e){}});
    var ov=g('modal-overlay');if(ov)ov.addEventListener('click',function(e){if(e.target===this)window.closeModal();});
    try{go();}catch(e){var m=g('app-main');if(m)m.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao iniciar</h3><p>'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';}
  }catch(e){document.body.innerHTML='<div style="padding:2rem;text-align:center"><h2>Erro crítico</h2><p>'+e.message+'</p><button onclick="location.reload()">Recarregar</button></div>';}
});
