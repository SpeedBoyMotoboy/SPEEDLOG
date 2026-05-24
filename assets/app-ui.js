// SpeedLog v11 — UI (telas e handlers)
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
  var pendentes=ets.filter(function(r){return r.status!=='finalizado';}).slice(0,5);
  var semEstoque=[];
  ST.estoque.forEach(function(item){var info=getEstoqueInfo(item.codigo);if(info.disponivel<=0&&info.total>0)semEstoque.push(item.nome||item.codigo);});
  var h='<div class="page">';
  h+='<div class="stats-grid">';
  h+=sCard('s-nf','📋',nfsHoje,'NFs hoje');
  h+=sCard('s-rec','📥',c.recebido,'Recebidos');
  h+=sCard('s-sep','🔍',c.separacao,'Separação');
  h+=sCard('s-fin','✅',c.finalizado,'Despachados');
  h+='</div>';
  if(semEstoque.length){
    h+='<div style="background:var(--red-bg);border-radius:var(--r);padding:.75rem;border-left:4px solid var(--red)">';
    h+='<div style="font-weight:700;color:var(--red);font-size:.85rem;margin-bottom:.25rem">🔴 Sem estoque</div>';
    h+='<div style="font-size:.78rem;color:var(--text)">'+semEstoque.slice(0,3).map(function(n){return esc(n);}).join(', ')+(semEstoque.length>3?' +'+(semEstoque.length-3)+' outros':'')+'</div>';
    h+='</div>';
  }
  if(pendentes.length){
    h+='<div><div class="sec-hdr"><span class="sec-ttl">Pendentes</span><a href="#/etiquetas" style="font-size:.8rem;color:var(--blue);font-weight:600">Ver todas →</a></div>';
    h+='<div style="display:flex;flex-direction:column;gap:.75rem">';
    pendentes.forEach(function(r){h+=etiquetaCard(r);});
    h+='</div></div>';
  }else{
    h+='<div class="empty"><span class="empty-ico">🎉</span><h3>Tudo em dia!</h3><p>Nenhuma etiqueta pendente.</p></div>';
  }
  if(ST.registros.length===0&&ST.estoque.length===0){
    h+='<div style="background:var(--blue);border-radius:var(--r);padding:1.25rem;color:#fff;text-align:center">';
    h+='<div style="font-size:1.8rem;margin-bottom:.5rem">🚚</div>';
    h+='<p style="font-size:.9rem;opacity:.9;margin-bottom:.75rem"><strong>Como começar:</strong><br>1. Configure Firebase em ⚙️ Config<br>2. Estoque: registre entradas de produtos<br>3. NFs: bipe as notas nos galpões<br>4. Etiquetas: cole WhatsApp e bipe</p>';
    h+='<div style="display:flex;gap:.75rem;flex-direction:column">';
    h+='<a href="#/entrada" class="btn btn-o btn-bl">📦 Registrar Entrada</a>';
    h+='<a href="#/nova-nf" class="btn btn-bl" style="background:rgba(255,255,255,.2);color:#fff">📋 Registrar NF</a>';
    h+='</div></div>';
  }
  main.innerHTML=h+'</div>';
}
function sCard(cls,ico,num,lbl){return '<div class="stat-card '+cls+'"><span class="stat-ico">'+ico+'</span><span class="stat-num">'+num+'</span><span class="stat-lbl">'+lbl+'</span></div>';}

function pgNFs(main){
  var gchips='<span class="chip'+(!ST.fGalpao?' on':'')+'" onclick="window.fGalNF(null)">Todos</span>';
  Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip'+(ST.fGalpao===k?' on':'')+'" onclick="window.fGalNF(\''+k+'\')">'+GALPOES[k]+'</span>';});
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
window.confirmDelNF=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir NF?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDelNF(\''+id+'\')">Excluir</button></div></div>');};
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
  toast('NF registrada! ✅','ok');_pendingNF=null;location.hash='#/nfs';
};

function pgEtiquetas(main){
  var chips='<span class="chip'+(!ST.fStatus?' on':'')+'" onclick="window.fSt(null)">Todas</span>';
  SO.forEach(function(s){chips+='<span class="chip'+(ST.fStatus===s?' on '+s:'')+'" onclick="window.fSt(\''+s+'\')">'+SM[s].icon+' '+SM[s].label+'</span>';});
  var gchips='<span class="chip'+(!ST.fGalpao?' on':'')+'" onclick="window.fGal(null)">Todos</span>';
  Object.keys(GALPOES).forEach(function(k){gchips+='<span class="chip'+(ST.fGalpao===k?' on':'')+'" onclick="window.fGal(\''+k+'\')">'+GALPOES[k]+'</span>';});
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
  if(r.codigo_produto){
    var info=getEstoqueInfo(r.codigo_produto);
    meta+='<span class="meta">📊 '+esc(r.codigo_produto);
    if(info.item)meta+=' <span style="color:'+(info.disponivel<=0?'var(--red)':info.disponivel<=2?'var(--orange)':'var(--s-fin)')+'">▌'+info.disponivel+'</span>';
    meta+='</span>';
  }
  if(r.etiqueta_barcode)meta+='<span class="meta">▌▌ '+esc(r.etiqueta_barcode.slice(0,18))+'</span>';
  if(r.galpao&&GALPOES[r.galpao])meta+='<span class="meta">🏭 '+esc(GALPOES[r.galpao])+'</span>';
  if(r.nome_produto)meta+='<span class="meta">'+esc(r.nome_produto)+(r.marca?' — '+esc(r.marca):'')+'</span>';
  if(r.quantidade)meta+='<span class="meta">Qtd: '+esc(r.quantidade)+'</span>';
  if(dt)meta+='<span class="meta">📅 '+dt+'</span>';
  return '<a href="#/etiqueta/'+r.id+'" class="order-card '+r.status+'"><div class="oc-hdr"><span class="oc-ttl">'+esc(r.nome_cliente||'Cliente não informado')+'</span><span class="badge '+r.status+'">'+s.icon+' '+s.label+'</span></div><div class="oc-meta">'+meta+'</div></a>';
}

function pgEstoque(main){
  main.innerHTML='<div class="page"><div class="search-wrap">'+
    '<svg class="si" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>'+
    '<input type="search" id="si" placeholder="Produto, código..." oninput="window.doSearchEstq(this.value)" autocomplete="off"></div>'+
    '<div id="estq-lst"></div></div>';
  renderEstoqueLista('');
}
function renderEstoqueLista(q){
  var el=g('estq-lst');if(!el)return;
  var items=ST.estoque.slice();
  if(q){var ql=q.toLowerCase();items=items.filter(function(e){return(e.nome||'').toLowerCase().indexOf(ql)>=0||(e.codigo||'').toLowerCase().indexOf(ql)>=0;});}
  if(!items.length){el.innerHTML='<div class="empty"><span class="empty-ico">📦</span><h3>Estoque vazio</h3><p>Toque em + para registrar entrada.</p></div>';return;}
  var h='<div style="display:flex;flex-direction:column;gap:.75rem">';
  items.forEach(function(item){
    var info=getEstoqueInfo(item.codigo);
    var cor=info.disponivel<=0?'var(--red)':info.disponivel<=2?'var(--orange)':'var(--s-fin)';
    h+='<div class="nf-card" style="border-left-color:'+cor+'">';
    h+='<div style="display:flex;justify-content:space-between;align-items:flex-start">';
    h+='<div style="flex:1;padding-right:.5rem"><div class="nf-code" style="font-size:.95rem">'+esc(item.nome||item.codigo)+'</div>';
    h+='<div class="nf-meta">'+esc(item.codigo)+(item.marca?' · '+esc(item.marca):'')+'</div></div>';
    h+='<button class="btn-icon-sm" onclick="window.confirmDelEstq(\''+item.id+'\')" style="color:var(--red)">✕</button>';
    h+='</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-top:.5rem">';
    h+=esqCard('📦 Entrada',info.total,'var(--text)');
    h+=esqCard('📤 Reservado',info.reservado,'var(--orange)');
    h+=esqCard('✅ Disponível',info.disponivel,cor);
    h+='</div>';
    h+='<a href="#/entrada?c='+encodeURIComponent(item.codigo)+'" class="btn btn-n btn-bl" style="font-size:.8rem;padding:.5rem;margin-top:.25rem">+ Adicionar ao estoque</a>';
    h+='</div>';
  });
  el.innerHTML=h+'</div>';
}
function esqCard(lbl,num,cor){return '<div style="background:var(--bg);border-radius:var(--rs);padding:.5rem;text-align:center"><div style="font-size:1.4rem;font-weight:800;color:'+cor+'">'+num+'</div><div style="font-size:.63rem;color:var(--muted);font-weight:600;white-space:nowrap">'+lbl+'</div></div>';}
window.doSearchEstq=function(v){renderEstoqueLista(v);};
window.confirmDelEstq=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir do estoque?</div><div class="modal-txt">Não afeta etiquetas existentes.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDelEstq(\''+id+'\')">Excluir</button></div></div>');};
window.doDelEstq=function(id){window.closeModal();ST.estoque=ST.estoque.filter(function(e){return e.id!==id;});saveEstoque();delEstoqueFB(id);toast('Removido','ok');renderEstoqueLista('');};

function pgEntrada(main){
  var preCode='';
  try{var qs=location.hash.split('?')[1]||'';qs.split('&').forEach(function(p){var kv=p.split('=');if(kv[0]==='c')preCode=decodeURIComponent(kv[1]||'');});}catch(e){}
  main.innerHTML='<div class="page">'+
    '<div class="dcard">'+
    '<div class="fl" style="margin-bottom:.75rem">Código do produto *</div>'+
    '<div style="display:flex;gap:.5rem">'+
    '<input class="fc" id="entrada-codigo" type="text" placeholder="SKU / código de barras..." style="flex:1;text-transform:uppercase" value="'+esc(preCode)+'" oninput="window.checkEstqCodigo(this.value)">'+
    '<button class="btn btn-p" style="padding:.75rem" onclick="window.startEntradaScan()">📷</button>'+
    '</div>'+
    '<div id="estq-info" style="display:none;background:var(--bg);border-radius:var(--rs);padding:.75rem;margin-top:.5rem;font-size:.82rem"></div>'+
    '</div>'+
    '<div id="reader" style="display:none;border-radius:var(--r);overflow:hidden;min-height:220px;background:#000;position:relative"><div class="scan-laser"></div></div>'+
    '<div id="scan-status"></div>'+
    '<div class="dcard">'+
    '<div class="fg"><label class="fl">Nome do produto</label><input class="fc" id="entrada-nome" type="text" placeholder="Ex: Bobina Ignição Clio..."></div>'+
    '<div class="g2">'+
    '<div class="fg"><label class="fl">Marca</label><input class="fc" id="entrada-marca" type="text" placeholder="Magneti Marelli"></div>'+
    '<div class="fg"><label class="fl">Quantidade *</label><input class="fc" id="entrada-qtd" type="number" min="1" placeholder="0"></div>'+
    '</div>'+
    '</div>'+
    '<button class="btn btn-p btn-bl" onclick="window.salvarEntrada()">💾 Registrar Entrada</button>'+
    '</div>';
  if(preCode){setTimeout(function(){window.checkEstqCodigo(preCode);},50);}
}
window.startEntradaScan=function(){
  var rd=g('reader');if(rd)rd.style.display='';
  startScanner(function(code){
    var rd2=g('reader');if(rd2)rd2.style.display='none';
    var ci=g('entrada-codigo');if(ci){ci.value=code.toUpperCase();window.checkEstqCodigo(code);}
    toast('Código capturado ✅','ok');
  });
};
window.checkEstqCodigo=function(v){
  var el=g('estq-info');if(!el)return;
  var c=(v||'').trim().toUpperCase();if(!c){el.style.display='none';return;}
  var info=getEstoqueInfo(c);
  el.style.display='';
  if(info.item){
    el.innerHTML='<strong>'+esc(info.item.nome)+'</strong> · Entrada total: <strong>'+info.total+'</strong> · Disponível: <strong style="color:'+(info.disponivel<=0?'var(--red)':'var(--s-fin)')+'">'+info.disponivel+'</strong>';
    var nm=g('entrada-nome');if(nm&&!nm.value)nm.value=info.item.nome;
    var mk=g('entrada-marca');if(mk&&!mk.value)mk.value=info.item.marca||'';
  }else{
    el.innerHTML='<span style="color:var(--muted)">Produto novo — será criado no estoque.</span>';
  }
};
window.salvarEntrada=function(){
  stopScanner();
  var codigo=(g('entrada-codigo')?g('entrada-codigo').value.trim().toUpperCase():'');
  var nome=(g('entrada-nome')?g('entrada-nome').value.trim():'');
  var marca=(g('entrada-marca')?g('entrada-marca').value.trim():'');
  var qtd=parseInt(g('entrada-qtd')?g('entrada-qtd').value:'');
  if(!codigo){toast('Informe o código do produto','err');return;}
  if(!qtd||qtd<=0){toast('Informe a quantidade','err');return;}
  addEntradaEstoque(codigo,nome,marca,qtd);
  toast('Entrada registrada! +'+qtd+' un. ✅','ok');
  location.hash='#/estoque';
};

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
    '<button class="btn btn-p btn-bl mt2" onclick="window.saveEditar(\''+id+'\')">💾 Salvar Alterações</button>'+
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
  if(r.codigo_produto){var info=getEstoqueInfo(r.codigo_produto);h+=dfield('Estoque disponível',info.item?String(info.disponivel)+' un.':'—');}
  h+=dfield('Produto',r.nome_produto);
  h+=dfield('Marca',r.marca);
  h+=dfield('Quantidade',r.quantidade);
  if(r.etiqueta_barcode)h+=dfield('Cód. barras',r.etiqueta_barcode);
  if(r.galpao&&GALPOES[r.galpao])h+=dfield('Galpão','🏭 '+GALPOES[r.galpao]);
  if(r.created_at)h+=dfield('Cadastrado',new Date(r.created_at).toLocaleString('pt-BR'));
  h+='</div>';
  if(r.observacoes)h+='<div class="df"><span class="dl">Observações</span><span class="dv">'+esc(r.observacoes)+'</span></div>';
  h+='</div>';
  if(s.next){h+='<button class="act-btn '+s.next+'" onclick="window.advance(\''+r.id+'\',\''+s.next+'\')"><div class="act-ico '+s.next+'">'+SM[s.next].icon+'</div><div style="flex:1"><div style="font-weight:800;font-size:.95rem">'+esc(s.nxt)+'</div><div style="font-size:.75rem;color:var(--muted);margin-top:2px">→ '+SM[s.next].label+'</div></div><svg style="opacity:.4" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>';}
  else{h+='<div style="background:var(--s-fin-bg);border-radius:var(--r);padding:1rem;text-align:center;color:#2e7d32;font-weight:700">✅ Pedido Despachado</div>';}
  main.innerHTML=h+'</div>';
}
function dfield(l,v){if(v==null||v==='')return'';return'<div class="df"><span class="dl">'+l+'</span><span class="dv">'+esc(String(v))+'</span></div>';}

function pgBipar(main){
  main.innerHTML='<div class="page"><div class="scan-area"><div id="reader"></div><div class="scan-laser"></div></div>'+
    '<div class="scan-hint">📷 Bipe código de barras da etiqueta, NF ou produto</div>'+
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
  var esqInfo=getEstoqueInfo(codeU);
  var esqHtml='';
  if(esqInfo.item){
    var cor=esqInfo.disponivel<=0?'var(--red)':esqInfo.disponivel<=2?'var(--orange)':'var(--s-fin)';
    esqHtml='<div style="background:var(--bg);border-radius:var(--rs);padding:.75rem;margin:.75rem .75rem 0">';
    esqHtml+='<div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:.4rem">📦 Estoque — '+esc(esqInfo.nome)+'</div>';
    esqHtml+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem">';
    esqHtml+=esqMiniCard('Entrada',esqInfo.total,'var(--text)');
    esqHtml+=esqMiniCard('Reservado',esqInfo.reservado,'var(--orange)');
    esqHtml+=esqMiniCard('Disponível',esqInfo.disponivel,cor);
    esqHtml+='</div></div>';
  }
  if(!matches.length){
    PREFILL={campo:/^\d{10,}$/.test(codeT)?'fv':'fc2',valor:/^\d{10,}$/.test(codeT)?codeT:codeU};
    r.innerHTML='<div class="scan-result">'+topBar+esqHtml+'<div class="scan-matches"><div class="no-match" style="padding:1.25rem;text-align:center"><div style="font-size:2.5rem;margin-bottom:.5rem">🤔</div><div style="font-weight:700;margin-bottom:.5rem">Não encontrado</div><p style="color:var(--muted);font-size:.85rem">Cadastre agora com o código já preenchido:</p><a href="#/novo" class="btn btn-p btn-bl" style="margin-top:.75rem">+ Cadastrar Etiqueta</a></div></div></div>';
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
    var ab=s.next?'<button class="btn btn-p btn-bl" style="margin-top:.75rem" onclick="window.advanceScan(\''+p.id+'\',\''+s.next+'\')">'+SM[s.next].icon+' '+s.nxt+'</button>':'';
    cards+='<div class="scan-match-card '+p.status+'"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem"><span class="badge '+p.status+'">'+s.icon+' '+s.label+'</span><a href="#/etiqueta/'+p.id+'" style="font-size:.78rem;color:var(--blue);font-weight:600">Ver detalhes →</a></div>'+details+ab+'</div>';
  });
  r.innerHTML='<div class="scan-result">'+topBar+esqHtml+'<div class="scan-matches">'+cards+'</div></div>';
}
function esqMiniCard(lbl,num,cor){return '<div style="background:var(--card);border-radius:var(--rs);padding:.4rem;text-align:center"><div style="font-size:1.2rem;font-weight:800;color:'+cor+'">'+num+'</div><div style="font-size:.62rem;color:var(--muted);font-weight:600">'+lbl+'</div></div>';}
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
window.confirmDel=function(id){modal('<div class="modal"><div class="modal-ttl">⚠️ Excluir etiqueta?</div><div class="modal-txt">Essa ação não pode ser desfeita.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doDel(\''+id+'\')">Excluir</button></div></div>');};
window.doDel=function(id){window.closeModal();deleteRegistro(id);toast('Excluído','ok');location.hash='#/etiquetas';};
window.confirmClear=function(){modal('<div class="modal"><div class="modal-ttl">⚠️ Limpar cache local?</div><div class="modal-txt">Dados do Firebase permanecem.</div><div class="modal-acts"><button class="btn btn-n" style="flex:1" onclick="window.closeModal()">Cancelar</button><button class="btn btn-d" style="flex:1" onclick="window.doClear()">Limpar</button></div></div>');};
window.doClear=function(){window.closeModal();ST.registros=[];ST.estoque=[];saveData();saveEstoque();toast('Cache limpo','ok');location.hash='#/';};
window.doSearch=function(v){ST.fSearch=v;renderListEtiquetas();};
window.fSt=function(v){ST.fStatus=v;pgEtiquetas(g('app-main'));};
window.fGal=function(v){ST.fGalpao=v;pgEtiquetas(g('app-main'));};
window.pickGalpao=function(k){var hi=g('fg');if(hi)hi.value=k;document.querySelectorAll('.galpao-chip').forEach(function(c){c.classList.toggle('on',c.dataset.gv===k);});};
window.exportData=function(){var all={registros:ST.registros,estoque:ST.estoque};var b=new Blob([JSON.stringify(all,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='speedlog-'+today()+'.json';a.click();URL.revokeObjectURL(u);};
