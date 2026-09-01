import { WASocket, delay } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';

export async function sendTextWithTyping(
  sock: WASocket,
  jid: string,
  text: string
): Promise<void> {
  try {
    // Simula o status "digitando..." se suportado pelo socket
    if (typeof sock.presenceSubscribe === 'function') {
      try { await sock.presenceSubscribe(jid); } catch (_) {}
    }

    if (typeof sock.sendPresenceUpdate === 'function') {
      try { await sock.sendPresenceUpdate('composing', jid); } catch (_) {}
    }

    // Calcula um atraso proporcional e natural
    const randomDelay =
      Math.floor(
        Math.random() * (config.typingDelayMaxMs - config.typingDelayMinMs + 1)
      ) + config.typingDelayMinMs;

    await delay(randomDelay);

    // Pausa o "digitando..."
    if (typeof sock.sendPresenceUpdate === 'function') {
      try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
    }

    // Envia a mensagem
    await sock.sendMessage(jid, { text });
  } catch (error) {
    console.error(`Erro ao enviar mensagem com digitação para ${jid}:`, error);
    // Fallback de envio direto
    try {
      await sock.sendMessage(jid, { text });
    } catch (sendErr) {
      console.error(`Falha no fallback de envio para ${jid}:`, sendErr);
    }
  }
}
