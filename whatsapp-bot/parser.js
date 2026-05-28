// Parser híbrido de mensagens do grupo de etiquetas.
// Camada 1: regex com rótulo seguido de `:` (cobre o formato canônico).
// Camada 2: regex sem rótulo (cobre "VENDA 2000…" sem `:`, "3000... - 1 UNIDADE", etc.).
// Camada 3: heurística posicional (cliente curto, produto longo, marca em CAPS).

const CAMPOS_OBRIGATORIOS = ['nome_cliente', 'numero_venda', 'codigo_produto', 'nome_produto', 'marca', 'quantidade'];

function firstMatch(texto, patterns) {
  for (const re of patterns) {
    const m = texto.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function camada1Rotulados(texto) {
  return {
    nome_cliente: firstMatch(texto, [/CLIENTE\s*:\s*([^\n]+)/i]),
    numero_venda: firstMatch(texto, [/VENDA\s*:\s*([^\n]+)/i]),
    codigo_produto: firstMatch(texto, [/SKU\s*:\s*([^-\n(]+)/i, /C[ÓO]DIGO\s*:\s*([^\n]+)/i]),
    nome_produto: firstMatch(texto, [/PRODUTO\s*:\s*([^\n]+)/i]),
    marca: firstMatch(texto, [/MARCA\s*:\s*([^\n]+)/i]),
    quantidade: firstMatch(texto, [/UNIDADE\s*:\s*([^\n]+)/i, /QUANTIDADE\s*:\s*([^\n]+)/i]),
  };
}

function camada2SemRotulo(texto, atual) {
  const out = { ...atual };
  if (!out.numero_venda) {
    const m = texto.match(/VENDA[:\s]*(\d{10,20})/i);
    if (m) out.numero_venda = m[1].trim();
  }
  if (!out.codigo_produto) {
    let m = texto.match(/SKU[\s\-:]+([A-Z0-9]+)/i);
    if (m) out.codigo_produto = m[1].trim();
    else {
      m = texto.match(/^\s*([A-Z0-9]{6,})\s*-\s*\d+\s*UNIDADES?/im);
      if (m) out.codigo_produto = m[1].trim();
    }
  }
  if (!out.quantidade) {
    const m = texto.match(/(\d+)\s*UNIDADES?/i);
    if (m) out.quantidade = `${m[1]} UNIDADE${parseInt(m[1], 10) > 1 ? 'S' : ''}`;
  }
  return out;
}

function normalizaLinha(l) {
  return l.replace(/[*_~`]/g, '').trim();
}

function ehLinhaMetadado(linha) {
  if (/^(CLIENTE|VENDA|SKU|C[ÓO]DIGO|PRODUTO|MARCA|UNIDADE|QUANTIDADE)\b/i.test(linha)) return true;
  if (/^VENDA\s+\d+/i.test(linha)) return true;
  if (/^[A-Z0-9]{6,}\s*-\s*\d+\s*UNIDADES?/i.test(linha)) return true;
  if (/^\d+\s*UNIDADES?$/i.test(linha)) return true;
  return false;
}

function camada3Posicional(texto, atual) {
  const out = { ...atual };
  const linhas = texto
    .split('\n')
    .map(normalizaLinha)
    .filter((l) => l && !/^[\s\W]+$/.test(l));

  const restantes = linhas.filter((l) => !ehLinhaMetadado(l));

  if (!out.nome_cliente) {
    const clienteLinha = restantes.find((l) => {
      const tokens = l.split(/\s+/);
      if (tokens.length < 2 || tokens.length > 6) return false;
      if (/\d/.test(l)) return false;
      if (!/^[A-ZÁ-Úa-zá-ú]/.test(tokens[0])) return false;
      return true;
    });
    if (clienteLinha) out.nome_cliente = clienteLinha;
  }

  const semCliente = restantes.filter((l) => l !== out.nome_cliente);

  if (!out.marca) {
    const marcaLinha = semCliente.find((l) => {
      if (l.length < 3) return false;
      const tokens = l.split(/\s+/);
      if (tokens.length < 1 || tokens.length > 2) return false;
      if (/\d/.test(l)) return false;
      return l === l.toUpperCase() && /[A-Z]/.test(l);
    });
    if (marcaLinha) out.marca = marcaLinha;
  }

  if (!out.nome_produto) {
    const restoSemMarca = semCliente.filter((l) => l !== out.marca);
    const produtoLinha = restoSemMarca
      .filter((l) => l.split(/\s+/).length >= 3)
      .sort((a, b) => b.length - a.length)[0];
    if (produtoLinha) out.nome_produto = produtoLinha;
  }

  return out;
}

function limpaCampos(campos) {
  const out = {};
  for (const k of CAMPOS_OBRIGATORIOS) {
    const v = campos[k];
    if (v == null) {
      out[k] = null;
    } else {
      let s = String(v).trim();
      if (k === 'codigo_produto') s = s.replace(/[*()\s]/g, '').toUpperCase();
      out[k] = s || null;
    }
  }
  return out;
}

function calculaFaltando(campos) {
  const obrigatorios = ['nome_cliente', 'numero_venda', 'nome_produto'];
  return obrigatorios.filter((k) => !campos[k]);
}

function normalizaTexto(t) {
  return String(t || '').replace(/[*_~`]/g, '');
}

function parse(texto) {
  const textoOriginal = String(texto || '');
  if (!textoOriginal.trim()) {
    return {
      campos: limpaCampos({}),
      faltando: ['nome_cliente', 'numero_venda', 'nome_produto'],
      texto_original: textoOriginal,
      ehEtiqueta: false,
    };
  }

  const textoNorm = normalizaTexto(textoOriginal);
  let campos = camada1Rotulados(textoNorm);
  campos = camada2SemRotulo(textoNorm, campos);
  campos = camada3Posicional(textoNorm, campos);
  campos = limpaCampos(campos);

  const temVenda = !!campos.numero_venda;
  const temSku = !!campos.codigo_produto;
  const mencionaUnidade = /UNIDADES?/i.test(textoNorm);
  const ehEtiqueta = temVenda || temSku || mencionaUnidade;

  return {
    campos,
    faltando: calculaFaltando(campos),
    texto_original: textoOriginal,
    ehEtiqueta,
  };
}

module.exports = { parse, CAMPOS_OBRIGATORIOS };
