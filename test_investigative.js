import { handleSalesConversation, saveAdminPhone } from './salesAgentService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

const mockLeads = [
  {
    id: 'lead_inv_1',
    name: 'Espaço Nails & Cabelo',
    category: 'Salão de Beleza e Manicure',
    city: 'Senador Canedo, GO',
    phone: '5562992220001',
    whatsapp: '5562992220001'
  },
  {
    id: 'lead_inv_2',
    name: 'Barbearia Vintage Canedo',
    category: 'Barbearia',
    city: 'Senador Canedo, GO',
    phone: '5562992220002',
    whatsapp: '5562992220002'
  },
  {
    id: 'lead_inv_3',
    name: 'Pet Canedo Rações & Banho',
    category: 'Pet Shop',
    city: 'Senador Canedo, GO',
    phone: '5562992220003',
    whatsapp: '5562992220003'
  }
];

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
          console.log(`💬 [CONSULTOR LIMIRO]: "${replyText}"`);
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

async function runTest() {
  // Teste 1: Salão diz que SÓ faz no zap manual (Não tem site nem app)
  await simulateConversation(mockLeads[0], [
    'Oi! Pode falar sim.',
    'Aqui a gente só atende no WhatsApp manual mesmo, não temos site nem aplicativo.',
    'Um site de agendamento online seria perfeito! Quanto custa pra fazer?'
  ]);

  // Teste 2: Barbearia diz que JÁ TEM sistema de agendamento
  await simulateConversation(mockLeads[1], [
    'Opa, boa tarde! Pode perguntar.',
    'A gente já usa um sistema de agendamento aqui na barbearia.',
    'Não temos site oficial no Google ainda, quanto custa um site moderno?'
  ]);
}

runTest();
