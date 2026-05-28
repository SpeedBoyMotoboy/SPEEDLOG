# SpeedLog WhatsApp Bot

Lê mensagens do grupo de etiquetas no WhatsApp e cria registros no Firebase do SpeedLog automaticamente, sem precisar copiar/colar.

## Como funciona

1. Conecta no WhatsApp via QR code (igual WhatsApp Web).
2. Escuta apenas o grupo configurado em `GROUP_JID`.
3. Para cada mensagem nova:
   - Faz parse híbrido (regex rotulados → sem rótulo → heurística posicional).
   - Se vier PDF anexo, baixa e sobe no Firebase Storage.
   - Cria registro em `/registros/{id}` do Realtime DB.
   - Se faltar algum campo essencial (cliente, venda, produto), marca `status: 'revisao'`.

## Instalação no Termux (Android)

> Instale o Termux pela **F-Droid**, não pela Play Store (a da Play está desatualizada).

```bash
pkg update && pkg upgrade
pkg install nodejs git
termux-setup-storage

git clone https://github.com/SpeedBoyMotoboy/SPEEDLOG.git
cd SPEEDLOG/whatsapp-bot
npm install
```

## Configuração do Firebase (uma vez)

1. No console do Firebase do projeto `speedboy-3c1c6`:
   - Ativar **Storage** (Build → Storage → Get started).
   - Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
2. Baixe o JSON gerado e mande pro celular (por exemplo `~/storage/downloads/service-account.json`).
3. Copie a config:

```bash
cp config.example.json config.json
```

4. Edite `config.json`:
   - `FIREBASE_SERVICE_ACCOUNT_PATH`: caminho do JSON baixado (ex.: `/data/data/com.termux/files/home/storage/downloads/service-account.json`).
   - `GROUP_JID`: deixe em branco por enquanto (próximo passo).
   - `GALPAO_PADRAO`: opcional. Se todas as etiquetas do grupo são do mesmo galpão, coloque o código (`real`, `comdip`, `bressan`, `sama`, `pellegrino`, `eletropar`).

## Descobrir o JID do grupo

```bash
node index.js --list-groups
```

- Vai aparecer o QR. Escaneie em **WhatsApp → Aparelhos conectados → Conectar um aparelho**.
- Em ~5 segundos a lista de grupos com nome + JID é impressa.
- Copie o JID do grupo de etiquetas e cole em `config.json` no campo `GROUP_JID`.

## Rodar em produção

```bash
node index.js
```

A sessão fica salva em `./auth_info` — não precisa escanear QR de novo nas próximas execuções.

### Manter rodando em background

```bash
termux-wake-lock          # impede o Android de matar o processo
node index.js &           # ou use tmux/screen pra reconectar
```

### Auto-start no boot do celular

1. Instale o app **Termux:Boot** pela F-Droid.
2. Crie `~/.termux/boot/speedlog-bot.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/SPEEDLOG/whatsapp-bot
node index.js > ~/speedlog-bot.log 2>&1
```

3. `chmod +x ~/.termux/boot/speedlog-bot.sh`.
4. Abra o app Termux:Boot uma vez (para o Android registrar a permissão).

## Logs

Saída padrão imprime cada etiqueta criada com `id`, `cliente`, `venda` e se teve PDF. Para debug detalhado:

```bash
LOG_LEVEL=debug node index.js
```

## Testes rápidos do parser (sem WhatsApp)

```bash
node -e "console.log(JSON.stringify(require('./parser').parse('VENDA: 2000016525848304\nClaudio oliveira\nKit Embreagem Hb20 1.0 2013\n3000001240 - 1 UNIDADE\nMARCA: SACHS'), null, 2))"
```

## O que NÃO faz

- Não responde mensagens no grupo (só lê).
- Não faz OCR/extração de dados de dentro do PDF (só anexa o arquivo).
- Não conecta a múltiplos grupos simultaneamente.
