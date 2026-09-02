import { handleSalesConversation, getAdminPhone, saveAdminPhone } from './salesAgentService.js';

// Configura um telefone de teste para o admin
saveAdminPhone('62999998888');

async function runTestScenario(title, messages) {
  console.log(`\n======================================================`);
  console.log(`🧪 TESTE: ${title}`);
  console.log(`======================================================`);

  const fakePhone = `5562999${Math.floor(Math.random() * 899999 + 100000)}`;

  for (const userMsg of messages) {
    console.log(`\n👤 [CLIENTE]: "${userMsg}"`);
    
    await new Promise((resolve) => {
      handleSalesConversation({
        phone: fakePhone,
        incomingText: userMsg,
        senderJid: `${fakePhone}@s.whatsapp.net`,
        sendReply: async (replyText) => {
          console.log(`💬 [IA INVISÍVEL]: "${replyText}"`);
          resolve();
        },
        sendAdminAlert: async (adminPhone, alertText) => {
          console.log(`\n🚨🚨 [ALERTA RECEBIDO NO WHATSAPP DO VINICIUS (${adminPhone})]:`);
          console.log(alertText);
          console.log(`------------------------------------------------------`);
        }
      });
    });
  }
}

async function runAllTests() {
  // Cenário 1: Fluxo ideal até o fechamento
  await runTestScenario('Cenário 1: Cliente interessado que quer saber o preço e fechar', [
    'Opa, tudo bem? Quem é?',
    'Nossa, sim, a gente perde muito tempo marcando horário na mão aqui no salão.',
    'Gostei! Qual o valor e quanto custa pra colocar no ar?'
  ]);

  // Cenário 2: Cliente que já tem sistema
  await runTestScenario('Cenário 2: Cliente que diz que já tem agendamento', [
    'Olá, pode falar.',
    'A gente já tem um sistema aqui pra agendamento, não preciso.',
    'Quanto custa um site novo?'
  ]);

  // Cenário 3: Cliente direto ao ponto
  await runTestScenario('Cenário 3: Cliente direto querendo proposta e fechar', [
    'Opa, quero fechar um site institucional pra minha empresa de logística, como a gente faz?'
  ]);
}

runAllTests();
