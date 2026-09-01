import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { handleIncomingMessage } from './handler.js';
import { storage } from '../services/storage.js';
import { supabaseService } from '../services/supabase.js';
import { config } from '../config/env.js';
import { SIMULATOR_HTML } from '../web/simulatorHtml.js';
import { WAMessage } from '@whiskeysockets/baileys';

const AUTH_DIR = path.resolve(process.cwd(), 'data', 'auth_info_baileys');

async function restoreAuthFromSupabase() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const credsFile = path.join(AUTH_DIR, 'creds.json');
  if (!fs.existsSync(credsFile)) {
    console.log('☁️ Verificando se existe sessão do WhatsApp salva no Supabase...');
    const saved = await supabaseService.loadAuthState();
    if (saved && Object.keys(saved).length > 0) {
      for (const [filename, content] of Object.entries(saved)) {
        fs.writeFileSync(path.join(AUTH_DIR, filename), Buffer.from(content, 'base64'));
      }
      console.log('✅ Sessão do WhatsApp restaurada com sucesso do Supabase na Nuvem!');
    }
  }
}

async function syncAuthToSupabase() {
  if (!fs.existsSync(AUTH_DIR)) return;
  try {
    const files = fs.readdirSync(AUTH_DIR);
    const authData: Record<string, string> = {};
    for (const file of files) {
      const filePath = path.join(AUTH_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        authData[file] = fs.readFileSync(filePath).toString('base64');
      }
    }
    if (Object.keys(authData).length > 0) {
      await supabaseService.saveAuthState(authData);
    }
  } catch (err) {
    console.error('Erro ao sincronizar credenciais com Supabase:', err);
  }
}

let currentQrDataUrl: string | null = null;
let connectionStatus: 'waiting_qr' | 'connected' | 'disconnected' = 'waiting_qr';
let serverStarted = false;

function startWebServer() {
  if (serverStarted) return;
  serverStarted = true;

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0] || '/';

    // ROTA DO SIMULADOR VISUAL (WHATSAPP WEB CLONE)
    if (url === '/simulador' || url === '/chat') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SIMULATOR_HTML);
      return;
    }

    // API PARA PROCESSAR MENSAGENS NO SIMULADOR
    if (url === '/api/simulate' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { phone = '5511999998888', text = '', buttonId = '' } = JSON.parse(body || '{}');
          const cleanPhone = phone.replace(/\D/g, '') || '5511999998888';
          const jid = `${cleanPhone}@s.whatsapp.net`;
          const responses: any[] = [];

          const mockSocket = {
            sendPresenceUpdate: async () => {},
            sendMessage: async (_to: string, content: any) => {
              responses.push(content);
              return {} as any;
            },
          } as unknown as WASocket;

          const mockMessage: WAMessage = {
            key: {
              remoteJid: jid,
              fromMe: false,
              id: `SIM_${Date.now()}`,
            },
            messageTimestamp: Math.floor(Date.now() / 1000),
            message: buttonId
              ? {
                  buttonsResponseMessage: {
                    selectedButtonId: buttonId,
                    selectedDisplayText: text,
                  },
                }
              : {
                  conversation: text,
                },
          };

          await handleIncomingMessage(mockSocket, mockMessage);

          const session = storage.getSession(jid);
          const lead = storage.getLeadData(jid);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, responses, session, lead }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

    let bodyContent = '';

    if (connectionStatus === 'connected') {
      bodyContent = `
        <div class="badge" style="background:#22c55e;color:#000;">✅ Conectado com Sucesso</div>
        <h1 style="color:#22c55e;">WhatsApp Conectado!</h1>
        <p>O atendente inteligente da <b>Limiro Brasil</b> está ativo e respondendo aos clientes.</p>
        <div style="margin-top:25px;">
          <a href="/simulador" style="display:inline-block;background:#00a884;color:#111b21;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(0,168,132,0.4);">🧪 Abrir Simulador de WhatsApp</a>
        </div>
      `;
    } else if (currentQrDataUrl) {
      bodyContent = `
        <div class="badge" style="background:#38bdf8;color:#000;">📱 Aguardando Leitura</div>
        <h1>Conectar WhatsApp - Limiro Brasil</h1>
        <p>Aponte a câmera do WhatsApp para a imagem abaixo:</p>
        <div class="qr-container">
          <img src="${currentQrDataUrl}" alt="QR Code WhatsApp" />
        </div>
        <div class="instructions">
          <b>Passo a passo no celular:</b>
          <ol>
            <li>Abra o WhatsApp no celular</li>
            <li>Acesse <b>Aparelhos Conectados</b></li>
            <li>Toque em <b>Conectar um aparelho</b></li>
            <li>Aponte a câmera para a imagem acima</li>
          </ol>
        </div>
        <div style="margin-top:20px;">
          <a href="/simulador" style="display:inline-block;background:#202c33;color:#38bdf8;border:1px solid #38bdf8;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">🧪 Ou testar no Simulador Visual</a>
        </div>
      `;
    } else {
      bodyContent = `
        <div class="badge" style="background:#f59e0b;color:#000;">⏳ Gerando QR Code...</div>
        <h1>Iniciando Conexão</h1>
        <p>Aguardando resposta dos servidores do WhatsApp...</p>
        <div style="margin-top:20px;">
          <a href="/simulador" style="display:inline-block;background:#00a884;color:#111b21;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">🧪 Abrir Simulador Visual</a>
        </div>
      `;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="4">
  <title>Limiro Brasil - Conexão WhatsApp</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #131d2f;
      padding: 35px 30px;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      text-align: center;
      max-width: 460px;
      width: 100%;
      border: 1px solid #1e293b;
    }
    h1 {
      color: #38bdf8;
      font-size: 22px;
      margin: 15px 0 10px 0;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.5;
    }
    .badge {
      padding: 6px 14px;
      border-radius: 50px;
      font-weight: 700;
      font-size: 12px;
      display: inline-block;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .qr-container {
      background: #ffffff;
      padding: 14px;
      border-radius: 16px;
      display: inline-block;
      margin: 15px 0;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.2);
    }
    .qr-container img {
      display: block;
      width: 250px;
      height: 250px;
    }
    .instructions {
      text-align: left;
      background: #0b1120;
      padding: 16px 20px;
      border-radius: 12px;
      margin-top: 15px;
      border: 1px solid #1e293b;
    }
    .instructions ol {
      margin: 8px 0 0 0;
      padding-left: 20px;
    }
    .instructions li {
      color: #cbd5e1;
      font-size: 13px;
      margin-bottom: 6px;
    }
  </style>
</head>
<body>
  <div class="card">
    ${bodyContent}
  </div>
</body>
</html>`;

    res.end(html);
  });

  let activePort = config.port;

  const tryListen = (portToTry: number) => {
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Porta ${portToTry} ocupada, tentando porta ${portToTry + 1}...`);
        tryListen(portToTry + 1);
      } else {
        console.error('Erro no servidor web do QR Code:', err);
      }
    });

    server.listen(portToTry, () => {
      activePort = portToTry;
      console.log(`\n🌐 Painel Visual do QR Code (Alta Nitidez) disponível em:`);
      console.log(`👉 http://localhost:${activePort}\n`);
    });
  };

  tryListen(activePort);
}

export async function startWhatsAppClient(): Promise<WASocket> {
  startWebServer();

  // Restaura sessão salva no Supabase caso esteja rodando em um servidor novo na nuvem
  await restoreAuthFromSupabase();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`\n🚀 Inicializando cliente WhatsApp (Baileys v${version.join('.')}, mais recente: ${isLatest})...`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    generateHighQualityLinkPreview: true,
    browser: ['Limiro Brasil Bot', 'Chrome', '1.0.0'],
    defaultQueryTimeoutMs: 60000,
  });

  // Salva credenciais localmente e sincroniza com o Supabase na nuvem
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await syncAuthToSupabase();
  });

  // Monitora alterações no status de conexão e exibe QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'waiting_qr';
      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      } catch (e) {
        console.error('Erro ao gerar DataURL do QR Code:', e);
      }

      console.log('\n======================================================');
      console.log('📱 ESCANEIE O QR CODE (OU ACESSE NO NAVEGADOR):');
      console.log(`👉 http://localhost:${config.port}`);
      console.log('======================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      currentQrDataUrl = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️ Conexão fechada. Motivo / Código: ${statusCode}. Reconectando? ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => {
          startWhatsAppClient();
        }, 3000);
      } else {
        console.log('❌ Sessão desconectada. Remova a pasta "data/auth_info_baileys" para novo login.');
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      currentQrDataUrl = null;
      console.log('\n======================================================');
      console.log('✅ LIMIRO BRASIL: Conexão com WhatsApp estabelecida com sucesso!');
      console.log('🤖 Atendente virtual com IA Google Gemini pronta para responder.');
      console.log('======================================================\n');
      await syncAuthToSupabase();
    }
  });

  // Listener para mensagens recebidas
  sock.ev.on('messages.upsert', async (m) => {
    for (const msg of m.messages) {
      // Ignora mensagens de broadcast de status
      if (msg.key.remoteJid === 'status@broadcast') continue;

      try {
        await handleIncomingMessage(sock, msg);
      } catch (error) {
        console.error('❌ Erro ao processar mensagem recebida:', error);
      }
    }
  });

  return sock;
}
