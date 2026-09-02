import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { handleSalesConversation } from './salesAgentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.join(__dirname, 'data', 'auth_info_baileys');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let qrCodeDataUrl = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, QR_READY, CONNECTED
let connectedUser = null;
let isInitializing = false;
const jidToPhoneMap = {};

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qrCode: qrCodeDataUrl,
    user: connectedUser
  };
}

export async function connectToWhatsApp(forceFresh = false) {
  if (isInitializing) {
    return { status: connectionStatus, qrCode: qrCodeDataUrl };
  }

  if (forceFresh) {
    console.log('[WHATSAPP] Limpando credenciais antigas para gerar novo QR Code...');
    try {
      if (sock) {
        sock.ev.removeAllListeners();
        sock.end();
        sock = null;
      }
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    } catch (e) {
      console.error('[WHATSAPP] Erro ao limpar auth:', e);
    }
  }

  isInitializing = true;
  connectionStatus = 'CONNECTING';
  qrCodeDataUrl = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      printQRInTerminal: false,
      browser: ['Limiro Prospector', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'QR_READY';
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
          console.log('[WHATSAPP] ✅ Novo QR Code gerado com sucesso!');
        } catch (err) {
          console.error('[WHATSAPP] Erro ao gerar QRCode DataURL:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[WHATSAPP] Conexão encerrada com status code: ${statusCode}`);

        connectionStatus = 'DISCONNECTED';
        qrCodeDataUrl = null;
        connectedUser = null;
        isInitializing = false;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log('[WHATSAPP] Sessão deslogada/expirada. Limpando credenciais...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (_) {}
          setTimeout(() => connectToWhatsApp(true), 2000);
        } else {
          // Tenta reconectar após falha de rede
          setTimeout(() => connectToWhatsApp(false), 4000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'CONNECTED';
        qrCodeDataUrl = null;
        connectedUser = sock.user?.id || 'Conectado';
        isInitializing = false;
        console.log(`[WHATSAPP] ✅ WhatsApp conectado com sucesso! (${connectedUser})`);
      }
    });

    // 🤖 Ouvinte de Mensagens Recebidas (IA Vendedora da Limiro Brasil)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe || !msg.message || msg.key.remoteJid.includes('@g.us') || msg.key.remoteJid === 'status@broadcast') {
          continue;
        }

        const senderJid = msg.key.remoteJid;
        let senderPhone = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '');
        
        // Mapeia JID se existir no mapa
        if (jidToPhoneMap[senderJid]) {
          senderPhone = jidToPhoneMap[senderJid];
        }

        const messageText = msg.message.conversation || 
                            msg.message.extendedTextMessage?.text || 
                            msg.message.imageMessage?.caption || '';

        if (!messageText.trim()) continue;

        console.log(`[WHATSAPP IA] 📩 Mensagem recebida de ${senderPhone} (JID: ${senderJid}): "${messageText}"`);

        await handleSalesConversation({
          phone: senderPhone,
          incomingText: messageText,
          senderJid,
          sendReply: async (replyText) => {
            console.log(`[WHATSAPP IA] 📤 Respondendo diretamente para ${senderJid}...`);
            await sock.sendMessage(senderJid, { text: replyText });
          },
          sendAdminAlert: async (adminPhone, alertText) => {
            await sendWhatsAppMessage(adminPhone, alertText);
          }
        });
      }
    });

    isInitializing = false;
    return { status: connectionStatus, qrCode: qrCodeDataUrl };
  } catch (err) {
    console.error('[WHATSAPP] Erro ao iniciar Baileys:', err);
    connectionStatus = 'DISCONNECTED';
    isInitializing = false;
    return { status: 'DISCONNECTED', error: err.message };
  }
}

export async function sendWhatsAppMessage(phone, text) {
  if (!sock || connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp não está conectado. Escaneie o QR Code no painel.');
  }

  let clean = phone.replace(/\D/g, '');
  if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
    clean = '55' + clean;
  }

  // Gera variações com e sem o 9º dígito (padrão Brasil)
  const numbersToCheck = [clean];
  if (clean.length === 13 && clean.startsWith('55') && clean[4] === '9') {
    const withoutNine = clean.slice(0, 4) + clean.slice(5);
    numbersToCheck.push(withoutNine);
  } else if (clean.length === 12 && clean.startsWith('55')) {
    const withNine = clean.slice(0, 4) + '9' + clean.slice(4);
    numbersToCheck.push(withNine);
  }

  let targetJid = `${clean}@s.whatsapp.net`;

  try {
    const results = await sock.onWhatsApp(...numbersToCheck);
    if (results && results.length > 0) {
      const valid = results.find(r => r.exists);
      if (valid) {
        targetJid = valid.jid;
        console.log(`[WHATSAPP AUTOPILOT] 🎯 JID verificado no servidor WhatsApp: ${targetJid}`);
      }
    }
  } catch (err) {
    console.warn('[WHATSAPP] Falha ao verificar JID com onWhatsApp, usando JID padrão:', err.message);
  }

  console.log(`[WHATSAPP AUTOPILOT] 🚀 Enviando mensagem real para ${targetJid}...`);
  jidToPhoneMap[targetJid] = clean;
  return await sock.sendMessage(targetJid, { text });
}

export async function disconnectWhatsApp() {
  if (sock) {
    try {
      await sock.logout();
    } catch (_) {}
    sock = null;
  }
  connectionStatus = 'DISCONNECTED';
  qrCodeDataUrl = null;
  connectedUser = null;
  isInitializing = false;
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (_) {}
  return { success: true };
}

// Inicia mantendo sessão salva se existir
connectToWhatsApp(false);
