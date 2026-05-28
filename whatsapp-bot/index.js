/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const parser = require('./parser');
const bridge = require('./firebase-bridge');

const CONFIG_PATH = path.resolve(__dirname, 'config.json');

function carregaConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json não encontrado. Copie config.example.json e edite GROUP_JID + caminho do service account.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function extraiTexto(msg) {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.documentWithCaptionMessage?.message?.documentMessage?.caption) {
    return m.documentWithCaptionMessage.message.documentMessage.caption;
  }
  return '';
}

function extraiDocumentoPdf(msg) {
  const m = msg.message || {};
  const doc = m.documentMessage || m.documentWithCaptionMessage?.message?.documentMessage;
  if (!doc) return null;
  if (!/pdf/i.test(doc.mimetype || '')) return null;
  return {
    nome: doc.fileName || `${Date.now()}.pdf`,
    raw: msg,
  };
}

async function processaMensagem({ sock, config, log, msg }) {
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid !== config.GROUP_JID) return;
  if (msg.key?.fromMe) return;

  const texto = extraiTexto(msg);
  const docPdf = extraiDocumentoPdf(msg);

  if (!texto.trim() && !docPdf) return;

  const resultado = parser.parse(texto);
  if (!resultado.ehEtiqueta && !docPdf) {
    log.info({ texto: texto.slice(0, 60) }, 'mensagem ignorada (não parece etiqueta)');
    return;
  }

  let pdfBuffer = null;
  let pdfNome = null;
  if (docPdf) {
    try {
      pdfBuffer = await downloadMediaMessage(docPdf.raw, 'buffer', {}, { logger: log, reuploadRequest: sock.updateMediaMessage });
      pdfNome = docPdf.nome;
    } catch (e) {
      log.error({ err: e.message }, 'falha ao baixar PDF');
    }
  }

  const remetente = msg.pushName || msg.key?.participant || null;

  try {
    const registro = await bridge.criarEtiqueta({
      campos: resultado.campos,
      faltando: resultado.faltando,
      textoOriginal: resultado.texto_original,
      pdfBuffer,
      pdfNome,
      galpaoPadrao: config.GALPAO_PADRAO,
      remetente,
    });
    log.info(
      { id: registro.id, cliente: registro.nome_cliente, venda: registro.numero_venda, status: registro.status, pdf: !!registro.pdf_url },
      'etiqueta criada'
    );
  } catch (e) {
    log.error({ err: e.message, stack: e.stack }, 'falha ao gravar no Firebase');
  }
}

async function listaGruposEEncerra(sock, log) {
  await new Promise((r) => setTimeout(r, 4000));
  const grupos = await sock.groupFetchAllParticipating();
  console.log('\n=== Grupos disponíveis (copie o JID do seu grupo de etiquetas para config.json) ===');
  Object.values(grupos).forEach((g) => {
    console.log(`  ${g.subject}\n    JID: ${g.id}`);
  });
  console.log('=================================================================================\n');
  process.exit(0);
}

async function main() {
  const config = carregaConfig();
  const log = pino({ level: process.env.LOG_LEVEL || 'info', transport: { target: 'pino/file', options: { destination: 1 } } });

  bridge.init(config);

  const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR || './auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['SpeedLog Bot', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  const listOnly = process.argv.includes('--list-groups');

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nEscaneie o QR abaixo com WhatsApp → Aparelhos conectados → Conectar um aparelho:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      log.info('conexão WhatsApp estabelecida');
      if (listOnly) listaGruposEEncerra(sock, log);
      else if (!config.GROUP_JID) {
        console.log('\nGROUP_JID não configurado. Rode "node index.js --list-groups" para descobrir o JID do grupo.\n');
      } else {
        console.log(`\nEscutando grupo ${config.GROUP_JID}\n`);
      }
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconectar = code !== DisconnectReason.loggedOut;
      log.warn({ code, reconectar }, 'conexão fechada');
      if (reconectar) setTimeout(main, 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await processaMensagem({ sock, config, log, msg });
      } catch (e) {
        log.error({ err: e.message }, 'erro ao processar mensagem');
      }
    }
  });
}

main().catch((e) => {
  console.error('Falha fatal:', e);
  process.exit(1);
});
