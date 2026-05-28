// SpeedLog v12 — core (dados, firebase, scanner, rota, shell)
var DATA_KEY='sl_data';
var FB_DEFAULT={apiKey:"AIzaSyDL8c28T9Q-IAK9JihzEXtT-OPiYOx24Jg",authDomain:"speedboy-3c1c6.firebaseapp.com",projectId:"speedboy-3c1c6",storageBucket:"speedboy-3c1c6.firebasestorage.app",messagingSenderId:"702743802978",appId:"1:702743802978:web:7b99217bebcc89f9bc8d3b",databaseURL:"https://speedboy-3c1c6-default-rtdb.firebaseio.com"};
var SM={recebido:{label:'Recebido',icon:'📥',next:'separacao',nxt:'Iniciar Separação'},separacao:{label:'Separação',icon:'🔍',next:'expedicao',nxt:'Marcar Expedição'},expedicao:{label:'Expedição',icon:'📦',next:'finalizado',nxt:'Despachar ✅'},finalizado:{label:'Despachado',icon:'✅',next:null,nxt:null}};
var SO=['recebido','separacao','expedicao','finalizado'];
var GALPOES={real:'Real',comdip:'Comdip',bressan:'Bressan',sama:'Sama',pellegrino:'Pellegrino',eletropar:'Eletropar Nal.'};
var ST={registros:[],estoque:[],fStatus:null,fGalpao:null,fSearch:''};
var fbDb=null,qrScanner=null,qrScanner2=null,PREFILL=null,_pendingNF=null;

function g(id){return document.getElementById(id);}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function today(){return new Date().toISOString().slice(0,10);}
function uid(){try{return crypto.randomUUID();}catch(e){return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function fmtDateTime(s){if(!s)return'';try{var d=new Date(s);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch(e){return s;}}

function loadData(){
  try{var raw=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');ST.registros=raw.map(function(r){if(!r.tipo)r.tipo='etiqueta';return r;});}catch(e){ST.registros=[];}
}
function saveData(){try{localStorage.setItem(DATA_KEY,JSON.stringify(ST.registros));}catch(e){}}
function loadEstoque(){try{ST.estoque=JSON.parse(localStorage.getItem('sl_estq')||'[]');}catch(e){ST.estoque=[];}}
function saveEstoque(){try{localStorage.setItem('sl_estq',JSON.stringify(ST.estoque));}catch(e){}}
var _fbListening=false;
function initFirebase(){
  if(!window.firebase){toast('Firebase SDK não carregou','err');return;}
  try{
    if(firebase.apps.length)firebase.apps[0].delete().catch(function(){});
    firebase.initializeApp(FB_DEFAULT);
    fbDb=firebase.database();
    attachFbListeners();
  }catch(e){fbDb=null;toast('Erro Firebase: '+e.message,'err');}
}

function attachFbListeners(){
  if(_fbListening||!fbDb)return;
  _fbListening=true;
  // sobe o cache local antes de escutar, pra não perder registros bipados offline
  ST.registros.forEach(function(r){if(r&&r.id)fbDb.ref('registros/'+r.id).update(r).catch(function(){});});
  ST.estoque.forEach(function(e){if(e&&e.id)fbDb.ref('estoque/'+e.id).update(e).catch(function(){});});
  fbDb.ref('registros').on('value',function(snap){
    var raw=snap.val()||{};
    var arr=Object.values(raw).map(function(r){if(!r.tipo)r.tipo='etiqueta';return r;});
    arr.sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
    ST.registros=arr;saveData();
    var page=routeParse().page;var main=g('app-main');
    if(page==='home'&&main)renderHome(main);
    else if(page==='nfs'&&main)renderNFList();
    else if(page==='etiquetas'&&main)renderListEtiquetas();
    else if(page==='estoque'&&main)renderEstoqueLista('');
  });
  fbDb.ref('estoque').on('value',function(snap){
    var raw=snap.val()||{};
    if(Object.keys(raw).length)ST.estoque=Object.values(raw);
    saveEstoque();
    if(routeParse().page==='estoque'){var m=g('app-main');if(m)renderEstoqueLista('');}
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
}

function pushFB(r){if(!fbDb)return;fbDb.ref('registros/'+r.id).set(r).catch(function(){});}
function delFB(id){if(!fbDb)return;fbDb.ref('registros/'+id).remove().catch(function(){});}
function pushEstoqueFB(e){if(!fbDb)return;fbDb.ref('estoque/'+e.id).set(e).catch(function(){});}
function delEstoqueFB(id){if(!fbDb)return;fbDb.ref('estoque/'+id).remove().catch(function(){});}

function getEstoqueInfo(codigo){
  if(!codigo)return{total:0,reservado:0,disponivel:0,nome:'',marca:'',item:null};
  var cu=codigo.toUpperCase();
  var item=null;
  for(var i=0;i<ST.estoque.length;i++){if((ST.estoque[i].codigo||'').toUpperCase()===cu){item=ST.estoque[i];break;}}
  var reservado=0;
  ST.registros.forEach(function(r){
    if(r.tipo==='etiqueta'&&r.codigo_produto&&r.codigo_produto.toUpperCase()===cu&&['separacao','expedicao','finalizado'].indexOf(r.status)>=0){
      reservado+=parseInt(r.quantidade)||1;
    }
  });
  var total=item?(item.qtd_entrada||0):0;
  return{total:total,reservado:reservado,disponivel:total-reservado,nome:item?item.nome:'',marca:item?item.marca:'',item:item};
}
function addEntradaEstoque(codigo,nome,marca,qtd){
  var cu=codigo.toUpperCase();
  var existing=null;
  for(var i=0;i<ST.estoque.length;i++){if((ST.estoque[i].codigo||'').toUpperCase()===cu){existing=ST.estoque[i];break;}}
  var now=new Date().toISOString();
  if(existing){
    existing.qtd_entrada=(existing.qtd_entrada||0)+qtd;existing.updated_at=now;
    if(nome)existing.nome=nome;if(marca)existing.marca=marca;
    saveEstoque();pushEstoqueFB(existing);
  }else{
    var e={id:uid(),codigo:cu,nome:nome||cu,marca:marca||'',qtd_entrada:qtd,created_at:now,updated_at:now};
    ST.estoque.push(e);saveEstoque();pushEstoqueFB(e);
  }
}

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
    var w=Math.min((reader.offsetWidth||window.innerWidth||320),420);
    var cfg={fps:15,qrbox:{width:Math.floor(w*0.88),height:Math.min(120,Math.floor(w*0.32))}};
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
    var w=Math.min((reader.offsetWidth||window.innerWidth||320),420);
    var cfg={fps:15,qrbox:{width:Math.floor(w*0.88),height:Math.min(110,Math.floor(w*0.32))}};
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
  if(p[0]==='estoque')return{page:'estoque',id:null};
  if(p[0]==='entrada')return{page:'entrada',id:null};
  if(p[0]==='config')return{page:'config',id:null};
  return{page:'home',id:null};
}

var PLUS_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>';
var EDIT_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
var DEL_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
var GEAR_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';

function go(){
  stopAllScanners();
  var route=routeParse();var page=route.page,id=route.id;
  var main=g('app-main'),back=g('btn-back'),ttl=g('page-title'),acts=g('header-actions');
  if(!main)return;
  document.querySelectorAll('.nav-item').forEach(function(el){
    var dp=el.dataset.page;
    el.classList.toggle('active',dp===page||(page==='nova-nf'&&dp==='nfs')||(page==='novo'&&dp==='etiquetas')||(page==='editar'&&dp==='etiquetas')||(page==='detalhe'&&dp==='etiquetas')||(page==='entrada'&&dp==='estoque'));
  });
  if(acts)acts.innerHTML='';
  if(back){back.classList.add('hidden');back.onclick=null;}
  main.innerHTML='<div class="loader"><div class="spin"></div></div>';
  try{
    if(page==='home'){
      if(ttl)ttl.textContent='SpeedLog';
      if(acts)acts.innerHTML='<a href="#/config" class="btn-icon" title="Config">'+GEAR_SVG+'</a>';
      renderHome(main);
    }
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
    else if(page==='estoque'){
      if(ttl)ttl.textContent='Estoque';
      if(acts)acts.innerHTML='<a href="#/entrada" class="btn-icon" title="Entrada">'+PLUS_SVG+'</a>';
      pgEstoque(main);
    }
    else if(page==='entrada'){
      if(ttl)ttl.textContent='Entrada de Estoque';
      if(back){back.classList.remove('hidden');back.onclick=function(){history.back();};}
      pgEntrada(main);
    }
    else if(page==='config'){if(ttl)ttl.textContent='Configurações';pgConfig(main);}
  }catch(e){
    main.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao carregar</h3><p style="color:var(--red);font-size:.8rem">'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';
  }
}

function modal(html){var o=g('modal-overlay');if(o){o.classList.remove('hidden');o.innerHTML=html;}}
window.closeModal=function(){var o=g('modal-overlay');if(o)o.classList.add('hidden');};
function toast(msg,type){var c=g('toast-container');if(!c)return;var t=document.createElement('div');t.className='toast '+(type||'');t.textContent=msg;c.appendChild(t);setTimeout(function(){try{t.remove();}catch(e){}},3200);}

document.addEventListener('DOMContentLoaded',function(){
  try{
    loadData();loadEstoque();initFirebase();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
    window.addEventListener('hashchange',function(){try{go();}catch(e){}});
    var ov=g('modal-overlay');if(ov)ov.addEventListener('click',function(e){if(e.target===this)window.closeModal();});
    try{go();}catch(e){var m=g('app-main');if(m)m.innerHTML='<div class="page"><div class="empty"><span class="empty-ico">⚠️</span><h3>Erro ao iniciar</h3><p>'+esc(e.message)+'</p><button class="btn btn-p btn-bl mt" onclick="location.reload()">Recarregar</button></div></div>';}
  }catch(e){document.body.innerHTML='<div style="padding:2rem;text-align:center"><h2>Erro crítico</h2><p>'+e.message+'</p><button onclick="location.reload()">Recarregar</button></div>';}
});
