import { sendWhatsAppMessage } from './whatsappService.js';

async function testDispatch() {
  const targetPhone = '5562981340443';
  const testMessage = `Opa, tudo bem? Encontrei o contato da Barbearia aqui em Senador Canedo, posso tirar uma dúvida rápida com vocês?`;

  console.log(`[TESTE AO VIVO] Disparando mensagem de abordagem para ${targetPhone}...`);
  try {
    const res = await sendWhatsAppMessage(targetPhone, testMessage);
    console.log(`[TESTE AO VIVO] ✅ Mensagem de disparo enviada com sucesso para ${targetPhone}!`);
  } catch (err) {
    console.error(`[TESTE AO VIVO] ❌ Erro ao enviar:`, err);
  }
}

testDispatch();
