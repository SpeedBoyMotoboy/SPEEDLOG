const admin = require('firebase-admin');
const path = require('path');
const crypto = require('crypto');

let initialized = false;
let bucket = null;
let db = null;
let cfg = null;

function init(config) {
  if (initialized) return;
  cfg = config;
  const saPath = path.resolve(config.FIREBASE_SERVICE_ACCOUNT_PATH);
  const serviceAccount = require(saPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.FIREBASE_DATABASE_URL,
    storageBucket: config.FIREBASE_STORAGE_BUCKET,
  });
  db = admin.database();
  bucket = admin.storage().bucket();
  initialized = true;
}

function uid() {
  return 'wa-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

function sanitizaNome(nome) {
  return String(nome || 'arquivo.pdf')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
}

async function uploadPdf(id, pdfBuffer, pdfNome) {
  if (!pdfBuffer || !pdfBuffer.length) return { pdf_url: null, pdf_nome: null };
  const nome = sanitizaNome(pdfNome);
  const destino = `etiquetas/${id}/${nome}`;
  const file = bucket.file(destino);
  await file.save(pdfBuffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: { metadata: { origem: 'whatsapp-bot' } },
  });
  const anos = cfg.PDF_SIGNED_URL_YEARS || 10;
  const expira = new Date();
  expira.setFullYear(expira.getFullYear() + anos);
  const [url] = await file.getSignedUrl({ action: 'read', expires: expira });
  return { pdf_url: url, pdf_nome: nome };
}

async function criarEtiqueta({ campos, faltando, textoOriginal, pdfBuffer, pdfNome, galpaoPadrao, remetente }) {
  const id = uid();
  const now = new Date().toISOString();
  const { pdf_url, pdf_nome } = await uploadPdf(id, pdfBuffer, pdfNome);

  const registro = {
    id,
    tipo: 'etiqueta',
    nome_cliente: campos.nome_cliente,
    numero_venda: campos.numero_venda,
    codigo_produto: campos.codigo_produto,
    nome_produto: campos.nome_produto,
    marca: campos.marca,
    quantidade: campos.quantidade,
    status: faltando.length ? 'revisao' : 'recebido',
    observacoes: null,
    galpao: galpaoPadrao || null,
    etiqueta_barcode: null,
    origem: 'whatsapp',
    texto_original: textoOriginal || null,
    pdf_url: pdf_url || null,
    pdf_nome: pdf_nome || null,
    remetente_whatsapp: remetente || null,
    parse_faltando: faltando.length ? faltando : null,
    created_at: now,
    updated_at: now,
  };

  await db.ref('registros/' + id).set(registro);
  return registro;
}

module.exports = { init, criarEtiqueta };
