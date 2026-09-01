import { validateConfig } from './config/env.js';
import { startWhatsAppClient } from './whatsapp/client.js';
import { storage } from './services/storage.js';

async function main() {
  console.log('========================================================');
  console.log('🚀 LIMIRO BRASIL - AGENTE INTELIGENTE PARA WHATSAPP');
  console.log('🤖 Powered by Google Gemini AI & Baileys');
  console.log('========================================================');

  // Valida variáveis de ambiente
  validateConfig();

  // Inicia conexão do WhatsApp
  try {
    await startWhatsAppClient();
  } catch (error) {
    console.error('❌ Falha ao iniciar o cliente WhatsApp:', error);
  }

  // Tratamento de encerramento gracioso
  const shutdown = () => {
    console.log('\n🛑 Encerrando aplicação e salvando dados...');
    storage.saveSessionsNow();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
});
