import { handleSalesConversation, saveAdminPhone } from './salesAgentService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

// Mock de leads em diferentes nichos
const mockLeads = [
  {
    id: 'lead_test_1',
    name: 'Studio Bella Nails',
    category: 'Manicure e Salão de Beleza',
    city: 'Senador Canedo, GO',
    phone: '5562991110001',
    whatsapp: '5562991110001'
  },
  {
    id: 'lead_test_2',
    name: 'Rota 23 Barber Shop',
    category: 'Barbearia',
    city: 'Senador Canedo, GO',
    phone: '5562991110002',
    whatsapp: '5562991110002'
  },
  {
    id: 'lead_test_3',
    name: 'Anjos de Patas Pet & Vet',
    category: 'Pet Shop e Veterinária',
    city: 'Goiânia, GO',
    phone: '5562991110003',
    whatsapp: '5562991110003'
  },
  {
    id: 'lead_test_4',
    name: 'Odonto Excellence Canedo',
    category: 'Clínica Odontológica',
    city: 'Senador Canedo, GO',
    phone: '5562991110004',
    whatsapp: '5562991110004'
  },
  {
    id: 'lead_test_5',
    name: 'TransCanedo Logística & Distribuição',
    category: 'Indústria e Transportadora',
    city: 'Senador Canedo, GO',
    phone: '5562991110005',
    whatsapp: '5562991110005'
  }
];

// Salva temporariamente para busca de info
fs.writeFileSync(LEADS_FILE, JSON.stringify(mockLeads, null, 2), 'utf-8');
saveAdminPhone('62999998888');

async function simulateConversation(lead, userMessages) {
  console.log(`\n======================================================`);
  console.log(`🏢 NICHO: ${lead.category} | EMPRESA: ${lead.name} (${lead.city})`);
  console.log(`======================================================`);

  for (const msg of userMessages) {
    console.log(`\n👤 [${lead.name}]: "${msg}"`);

    await new Promise((resolve) => {
      handleSalesConversation({
        phone: lead.whatsapp,
        incomingText: msg,
        senderJid: `${lead.whatsapp}@s.whatsapp.net`,
        sendReply: async (replyText) => {
          console.log(`💬 [IA LIMIRO]: "${replyText}"`);
          resolve();
        },
        sendAdminAlert: async (adminPhone, alertText) => {
          console.log(`\n🚨🚨 [ALERTA DE FECHAMENTO ENVIADO PARA O VINICIUS]:`);
          console.log(alertText);
          console.log(`------------------------------------------------------`);
        }
      });
    });
  }
}

async function runAllNichesTest() {
  // Teste 1: Manicure
  await simulateConversation(mockLeads[0], [
    'Oi, quem é?',
    'Nossa sim, com a mão ocupada fazendo fibra de vidro é um sufoco responder zap e marcar horário.',
    'Acho que pelo WhatsApp ou por um link de site seria top! Quanto custa pra colocar?'
  ]);

  // Teste 2: Barbearia
  await simulateConversation(mockLeads[1], [
    'Opa, tudo bem! Pode falar.',
    'A gente faz tudo na mão no WhatsApp mesmo.',
    'Quero ver um modelo no WhatsApp ou Site, como faz pra contratar?'
  ]);

  // Teste 3: Pet Shop
  await simulateConversation(mockLeads[2], [
    'Olá! Pode tirar a dúvida sim.',
    'Aqui é tudo na mão, banho e tosa é uma loucura de agendamento.',
    'Qual o valor do aplicativo ou do agendamento no zap?'
  ]);

  // Teste 4: Clínica Odontológica
  await simulateConversation(mockLeads[3], [
    'Boa tarde! Sobre o que seria?',
    'A gente tem secretária mas ela fica sobrecarregada confirmando consultas no zap.',
    'Gostei da opção do site e WhatsApp, como funciona pra fechar?'
  ]);

  // Teste 5: Logística / Indústria
  await simulateConversation(mockLeads[4], [
    'Olá, setor comercial aqui.',
    'Nosso SAC e cotação de frete no WhatsApp é tudo manual hoje.',
    'Qual o valor para implantar essa triagem com IA?'
  ]);
}

runAllNichesTest();
