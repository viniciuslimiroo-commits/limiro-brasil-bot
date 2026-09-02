import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAMPAIGNS_FILE = path.join(__dirname, 'data', 'campaigns.json');

// Lista de todas as campanhas em memória
let campaigns = [];
let executionInterval = null;

function saveCampaignsToFile() {
  try {
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2), 'utf-8');
  } catch (e) {
    console.error('[SCHEDULER] Erro ao salvar campanhas:', e);
  }
}

function loadCampaignsFromFile() {
  try {
    if (fs.existsSync(CAMPAIGNS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        campaigns = data;
      }
    }
  } catch (e) {
    console.error('[SCHEDULER] Erro ao carregar campanhas:', e);
    campaigns = [];
  }
}

/**
 * Agenda uma nova campanha sem apagar as anteriores
 */
export function scheduleCampaign({ name, niche, city, leads, scheduledAt, intervalSeconds = 60, strategy = 'step1' }) {
  const validLeads = leads.filter(l => l.whatsapp || l.phone);

  const campaignTitle = name || `${niche || 'Empresas'} em ${city || 'Senador Canedo'}`;

  const newCampaign = {
    id: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: campaignTitle,
    niche: niche || 'Geral',
    city: city || 'Senador Canedo',
    status: 'SCHEDULED', // SCHEDULED, RUNNING, PAUSED, COMPLETED, CANCELLED
    createdAt: new Date().toISOString(),
    scheduledAt: new Date(scheduledAt).toISOString(),
    intervalSeconds: Math.max(30, parseInt(intervalSeconds, 10) || 60),
    strategy,
    leads: validLeads,
    currentIndex: 0,
    sentCount: 0,
    failedCount: 0,
    lastDispatchedAt: null,
    logs: [`Campanha criada para ${validLeads.length} leads de "${niche || 'Empresas'}" em "${city}". Agendada para ${new Date(scheduledAt).toLocaleString('pt-BR')}.`]
  };

  campaigns.unshift(newCampaign);
  saveCampaignsToFile();
  console.log(`[SCHEDULER] Nova campanha agendada: "${newCampaign.name}" para ${new Date(scheduledAt).toLocaleString('pt-BR')} com ${validLeads.length} leads.`);

  return newCampaign;
}

/**
 * Motor central de execução das campanhas
 */
function processCampaignsQueue() {
  const now = Date.now();

  for (const camp of campaigns) {
    if (camp.status === 'SCHEDULED') {
      const targetTime = new Date(camp.scheduledAt).getTime();
      if (now >= targetTime) {
        camp.status = 'RUNNING';
        camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] Início do disparo automático para "${camp.name}".`);
        saveCampaignsToFile();
        console.log(`[SCHEDULER] Iniciando disparos da campanha "${camp.name}"...`);
      }
    }

    if (camp.status === 'RUNNING') {
      // Verifica se é hora do próximo envio com base no intervalo
      const lastSent = camp.lastDispatchedAt ? new Date(camp.lastDispatchedAt).getTime() : 0;
      const intervalMs = camp.intervalSeconds * 1000;

      if (now - lastSent >= intervalMs) {
        dispatchNextLead(camp);
      }
    }
  }
}

import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsappService.js';

async function dispatchNextLead(camp) {
  if (camp.currentIndex >= camp.leads.length) {
    camp.status = 'COMPLETED';
    camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ Campanha "${camp.name}" finalizada! Total enviado: ${camp.sentCount}`);
    saveCampaignsToFile();
    console.log(`[SCHEDULER] Campanha "${camp.name}" concluída com sucesso!`);
    return;
  }

  const currentLead = camp.leads[camp.currentIndex];
  const phone = currentLead.whatsapp || currentLead.phone;
  const messageText = currentLead.variations?.step1 || currentLead.suggestedPitch || `Opa, tudo bem? Encontrei o contato da ${currentLead.name} aqui em ${camp.city || 'Senador Canedo'}, posso tirar uma dúvida rápida com vocês?`;

  try {
    const wsStatus = getWhatsAppStatus();
    if (wsStatus.status === 'CONNECTED' && phone) {
      await sendWhatsAppMessage(phone, messageText);
      camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] 🚀 Enviado via WhatsApp para ${currentLead.name} (${phone})`);
    } else {
      camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] Lead processado para ${currentLead.name} (${phone})`);
    }

    currentLead.status = 'CONTATADO';
    currentLead.dispatchedAt = new Date().toISOString();
    camp.sentCount++;
    camp.lastDispatchedAt = new Date().toISOString();
    console.log(`[SCHEDULER] [${camp.name}] [${camp.currentIndex + 1}/${camp.leads.length}] Enviado com sucesso para ${currentLead.name}`);
  } catch (err) {
    camp.failedCount++;
    camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] Falha ao enviar para ${currentLead.name}: ${err.message}`);
    console.error(`[SCHEDULER] Erro ao enviar mensagem para ${currentLead.name}:`, err.message);
  }

  camp.currentIndex++;
  saveCampaignsToFile();
}

export function pauseCampaign(campaignId) {
  const camp = campaigns.find(c => c.id === campaignId);
  if (camp && camp.status === 'RUNNING') {
    camp.status = 'PAUSED';
    camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] Campanha pausada.`);
    saveCampaignsToFile();
  }
  return camp;
}

export function resumeCampaign(campaignId) {
  const camp = campaigns.find(c => c.id === campaignId);
  if (camp && camp.status === 'PAUSED') {
    camp.status = 'RUNNING';
    camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] Campanha retomada.`);
    saveCampaignsToFile();
  }
  return camp;
}

export function cancelCampaign(campaignId) {
  const camp = campaigns.find(c => c.id === campaignId);
  if (camp) {
    camp.status = 'CANCELLED';
    camp.logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] Campanha cancelada.`);
    saveCampaignsToFile();
  }
  return camp;
}

export function deleteCampaign(campaignId) {
  campaigns = campaigns.filter(c => c.id !== campaignId);
  saveCampaignsToFile();
  return { success: true };
}

export function getAllCampaigns() {
  return campaigns;
}

// Carrega campanhas e inicia o timer do motor
loadCampaignsFromFile();
if (executionInterval) clearInterval(executionInterval);
executionInterval = setInterval(processCampaignsQueue, 3000);
