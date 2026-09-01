import readline from 'readline';
import { handleIncomingMessage } from './whatsapp/handler.js';
import { storage } from './services/storage.js';
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

console.log('========================================================');
console.log('🧪 SIMULADOR DE WHATSAPP - LIMIRO BRASIL');
console.log('🤖 Teste fluxos com números fictícios sem precisar de outro celular');
console.log('========================================================\n');

// Número fictício padrão para o teste
const FAKE_PHONE = '5511999998888';
const FAKE_JID = `${FAKE_PHONE}@s.whatsapp.net`;

// Mock do Socket do Baileys para interceptar e exibir mensagens enviadas pelo bot no terminal
const mockSocket = {
  sendPresenceUpdate: async (_type: string, _to: string) => {
    // Simula status digitando
  },
  sendMessage: async (_to: string, content: any) => {
    console.log('\n--------------------------------------------------------');
    if (content.text) {
      console.log(`🤖 [BOT LIMIRO BRASIL]:\n${content.text}`);
    } else {
      console.log(`🤖 [BOT LIMIRO BRASIL]:`, content);
    }
    console.log('--------------------------------------------------------\n');
    return {} as any;
  },
} as unknown as WASocket;

// Interface de entrada no terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(`📱 Cliente conectado: +${FAKE_PHONE}`);
console.log(`💡 Dica: Digite mensagens como se fosse o cliente (ex: "Olá", "1", "Quanto custa um agente de IA?", "!reset")`);
console.log(`🚪 Digite "sair" a qualquer momento para encerrar.\n`);

function askUser() {
  const session = storage.getSession(FAKE_JID);
  rl.question(`\n👤 [Cliente (${session.status})]: `, async (userInput) => {
    const text = userInput.trim();

    if (text.toLowerCase() === 'sair') {
      console.log('\n👋 Encerrando simulador...');
      rl.close();
      process.exit(0);
    }

    if (!text) {
      askUser();
      return;
    }

    // Cria mensagem simulada do Baileys
    const mockMessage: WAMessage = {
      key: {
        remoteJid: FAKE_JID,
        fromMe: false,
        id: `MOCK_${Date.now()}`,
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        conversation: text,
      },
    };

    try {
      await handleIncomingMessage(mockSocket, mockMessage);
    } catch (err) {
      console.error('❌ Erro no simulador:', err);
    }

    askUser();
  });
}

// Inicia o prompt interativo
askUser();
