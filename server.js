import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { scrapeGoogleMaps, formatPhoneForWhatsApp } from './scraper.js';
import { refinePitchWithGemini, generateDiagnostic } from './geminiService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Garante existência da pasta de dados
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'saved_leads.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSavedLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Erro ao ler leads salvos:', e);
  }
  return [];
}

function saveLeadsToFile(leads) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar leads:', e);
  }
}

function enrichLeadWithStatus(lead) {
  try {
    const savedLeads = loadSavedLeads();
    const allCampaigns = getAllCampaigns ? getAllCampaigns() : [];
    
    const leadPhoneClean = (lead.whatsapp || lead.phone || '').replace(/\D/g, '');
    const cleanLast9 = leadPhoneClean.slice(-9);

    let contactStatus = 'NOVO';
    let contactDate = null;
    let campaignRef = null;

    if (leadPhoneClean && leadPhoneClean.length >= 8) {
      // 1. Verifica nas campanhas ativas e finalizadas
      for (const camp of allCampaigns) {
        const foundInCamp = camp.leads?.find(l => {
          const p = (l.whatsapp || l.phone || '').replace(/\D/g, '');
          return p && (p === leadPhoneClean || (cleanLast9 && p.endsWith(cleanLast9)));
        });

        if (foundInCamp) {
          if (foundInCamp.status === 'CONTATADO' || foundInCamp.dispatchedAt) {
            contactStatus = 'CONTATADO';
            contactDate = foundInCamp.dispatchedAt || camp.lastDispatchedAt || camp.scheduledAt;
            campaignRef = camp.name;
            break;
          } else if (camp.status === 'SCHEDULED' || camp.status === 'RUNNING') {
            contactStatus = 'AGENDADO';
            contactDate = camp.scheduledAt;
            campaignRef = camp.name;
          }
        }
      }

      // 2. Verifica no histórico de leads salvos
      if (contactStatus === 'NOVO') {
        const foundInSaved = savedLeads.find(l => {
          const p = (l.whatsapp || l.phone || '').replace(/\D/g, '');
          return p && (p === leadPhoneClean || (cleanLast9 && p.endsWith(cleanLast9)));
        });
        if (foundInSaved && (foundInSaved.status === 'CONTATADO' || foundInSaved.dispatchedAt)) {
          contactStatus = 'CONTATADO';
          contactDate = foundInSaved.dispatchedAt;
        }
      }
    }

    lead.contactStatus = contactStatus; // 'NOVO' | 'AGENDADO' | 'CONTATADO'
    lead.contactDate = contactDate;
    lead.campaignRef = campaignRef;
  } catch (e) {
    lead.contactStatus = 'NOVO';
  }
  return lead;
}

// 1. Rota de Busca com Streaming em Tempo Real (Server-Sent Events)
app.get('/api/search/stream', async (req, res) => {
  const searchTerm = req.query.query || req.query.niche || 'Empresas';
  const city = req.query.city || 'Senador Canedo, GO';
  const maxResults = parseInt(req.query.max || req.query.limit, 10) || 25;

  // Headers para SSE (Server-Sent Events)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  sendEvent('START', { query: searchTerm, city, total: maxResults });

  try {
    const leads = await scrapeGoogleMaps({
      query: searchTerm,
      city,
      maxResults,
      onLeadFound: (lead, current, total) => {
        enrichLeadWithStatus(lead);
        sendEvent('LEAD', { lead, current, total });
      }
    });

    // Enriquecimento final
    leads.forEach(enrichLeadWithStatus);

    // Salva automaticamente no histórico mantendo status anterior se existir
    const existing = loadSavedLeads();
    const existingMap = new Map(existing.map(l => [(l.whatsapp || l.phone || l.name), l]));
    
    leads.forEach(l => {
      const key = l.whatsapp || l.phone || l.name;
      if (existingMap.has(key)) {
        const old = existingMap.get(key);
        if (old.status === 'CONTATADO' || old.dispatchedAt) {
          l.contactStatus = 'CONTATADO';
          l.dispatchedAt = old.dispatchedAt;
          l.status = 'CONTATADO';
        }
      }
      existingMap.set(key, l);
    });

    saveLeadsToFile(Array.from(existingMap.values()));

    sendEvent('COMPLETE', { totalFound: leads.length, leads });
    res.end();
  } catch (err) {
    console.error('Erro na busca streaming:', err);
    sendEvent('ERROR', { message: err.message || 'Erro ao realizar busca no Google Maps.' });
    res.end();
  }
});

// 2. Rota para gerar Copy com IA Gemini
app.post('/api/pitch/generate', async (req, res) => {
  try {
    const { lead, customInstruction } = req.body;
    if (!lead) return res.status(400).json({ error: 'Lead não fornecido.' });

    const pitch = await refinePitchWithGemini(lead, process.env.GEMINI_API_KEY);
    res.json({ pitch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Rota de Histórico de Leads Salvos
app.get('/api/leads', (req, res) => {
  const leads = loadSavedLeads();
  leads.forEach(enrichLeadWithStatus);
  res.json({ leads });
});

// 4. Rota para Atualizar Status do Lead
app.post('/api/leads/status', (req, res) => {
  const { id, status, notes } = req.body;
  const leads = loadSavedLeads();
  const leadIndex = leads.findIndex(l => l.id === id);

  if (leadIndex !== -1) {
    leads[leadIndex].status = status || leads[leadIndex].status;
    if (notes !== undefined) leads[leadIndex].notes = notes;
    leads[leadIndex].updatedAt = new Date().toISOString();
    saveLeadsToFile(leads);
    return res.json({ success: true, lead: leads[leadIndex] });
  }

  res.status(404).json({ error: 'Lead não encontrado.' });
});

// 5. Rota para Limpar Histórico de Leads
app.delete('/api/leads', (req, res) => {
  saveLeadsToFile([]);
  res.json({ success: true });
});

import { scheduleCampaign, getAllCampaigns, pauseCampaign, resumeCampaign, cancelCampaign, deleteCampaign } from './schedulerService.js';

// 6. Rotas de Campanhas Múltiplas Agendadas
app.post('/api/campaign/schedule', (req, res) => {
  const { name, niche, city, leads, scheduledAt, intervalSeconds, strategy } = req.body;
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Nenhum lead fornecido para a campanha.' });
  }

  const campaign = scheduleCampaign({
    name,
    niche: niche || 'Geral',
    city: city || 'Senador Canedo',
    leads,
    scheduledAt: scheduledAt || new Date().toISOString(),
    intervalSeconds: intervalSeconds || 60,
    strategy: strategy || 'step1'
  });

  res.json({ success: true, campaign });
});

app.get('/api/campaigns', (req, res) => {
  res.json({ campaigns: getAllCampaigns() });
});

app.post('/api/campaign/:id/pause', (req, res) => {
  res.json({ campaign: pauseCampaign(req.params.id) });
});

app.post('/api/campaign/:id/resume', (req, res) => {
  res.json({ campaign: resumeCampaign(req.params.id) });
});

app.post('/api/campaign/:id/cancel', (req, res) => {
  res.json({ campaign: cancelCampaign(req.params.id) });
});

import { getWhatsAppStatus, connectToWhatsApp, disconnectWhatsApp } from './whatsappService.js';
import { getAdminPhone, saveAdminPhone } from './salesAgentService.js';

// 7. Rotas do WhatsApp Autopilot & Alertas
app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post('/api/whatsapp/connect', async (req, res) => {
  const result = await connectToWhatsApp();
  res.json(result);
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  const result = await disconnectWhatsApp();
  res.json(result);
});

app.get('/api/settings', (req, res) => {
  res.json({ adminPhone: getAdminPhone() });
});

app.post('/api/settings/admin-phone', (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }
  const success = saveAdminPhone(phone);
  res.json({ success, adminPhone: getAdminPhone() });
});

app.post('/api/simulator/chat', async (req, res) => {
  const { phone, name, niche, city, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios.' });
  }

  const { handleSalesConversation } = await import('./salesAgentService.js');
  let replyText = '';
  let closingAlert = null;

  await handleSalesConversation({
    phone,
    incomingText: message,
    senderJid: `${phone}@s.whatsapp.net`,
    name,
    niche,
    city,
    sendReply: async (reply) => {
      replyText = reply;
    },
    sendAdminAlert: async (adminPhone, alertText) => {
      closingAlert = { adminPhone, alertText };
    }
  });

  res.json({ success: true, reply: replyText, closingAlert });
});

app.post('/api/simulator/reset', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone obrigatório.' });
  const { clearConversation } = await import('./salesAgentService.js');
  clearConversation(phone);
  res.json({ success: true });
});

// Endpoint para Benchmark de Desempenho dos Disparos da IA
app.post('/api/benchmark/dispatches', async (req, res) => {
  const { count = 10, niche = 'Geral', city = 'Senador Canedo, GO' } = req.body;
  const { generateDiagnostic } = await import('./geminiService.js');

  const testCompanies = [
    { name: 'Studio Bella Nails & Bronze', category: 'Manicure e Salão de Beleza', city, website: '' },
    { name: 'Barbearia Vintage & Navalha', category: 'Barbearia', city, website: 'https://barbeariavintage.com.br' },
    { name: 'Pet & Vet Anjos de Quatro Patas', category: 'Pet Shop e Veterinária', city, website: '' },
    { name: 'Odonto Excellence Implantes', category: 'Clínica Odontológica', city, website: 'https://odontoexcellence.com.br' },
    { name: 'TransCanedo Cargas & Logística', category: 'Indústria e Transportadora', city, website: '' },
    { name: 'Texas Burger & Chopp Artesanal', category: 'Restaurante e Delivery', city, website: '' },
    { name: 'Auto Center Goiás Pneus', category: 'Oficina Mecânica', city, website: '' },
    { name: 'Espaço VIP Estética Avançada', category: 'Clínica de Estética', city, website: 'https://espacovip.com' },
    { name: 'Academia Corpo & Movimento', category: 'Academia', city, website: '' },
    { name: 'Imobiliária Prime Canedo', category: 'Imobiliária', city, website: 'https://primecanedo.com.br' }
  ];

  const selected = testCompanies.slice(0, Math.min(count, testCompanies.length));
  const results = [];
  const startTimeTotal = Date.now();

  for (let i = 0; i < selected.length; i++) {
    const comp = selected[i];
    const t0 = Date.now();
    const diag = generateDiagnostic(comp);
    const generationTimeMs = Date.now() - t0;

    // Cálculo do delay inteligente anti-ban (ex: 45s a 75s)
    const recommendedAntiBanDelay = Math.floor(Math.random() * 30) + 45;

    results.push({
      index: i + 1,
      company: comp.name,
      niche: comp.category,
      city: comp.city,
      hasWebsite: !!comp.website,
      generatedPitch: diag.suggestedPitch,
      step2Script: diag.step2Script,
      generationTimeMs,
      recommendedAntiBanDelay: `${recommendedAntiBanDelay}s`,
      status: 'PRONTO PARA DISPARO'
    });
  }

  const totalTimeMs = Date.now() - startTimeTotal;
  const avgTimeMs = (totalTimeMs / results.length).toFixed(2);

  res.json({
    success: true,
    totalTested: results.length,
    totalTimeMs,
    avgTimeMs,
    throughputPerMinute: Math.round((60000 / (avgTimeMs || 1))),
    results
  });
});

app.post('/api/test/dispatch', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }

  const cleanPhone = phone.replace(/\D/g, '');
  const messageText = `Opa, tudo bem? Encontrei o contato da ${name || 'Empresa'} aqui em Senador Canedo, posso tirar uma dúvida rápida com vocês?`;

  try {
    const { sendWhatsAppMessage } = await import('./whatsappService.js');
    await sendWhatsAppMessage(cleanPhone, messageText);
    res.json({ success: true, message: 'Disparo enviado com sucesso!', phone: cleanPhone, text: messageText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 [LIMIRO PROSPECTOR] Servidor rodando com sucesso!`);
  console.log(`🌐 Acesse o painel em: http://localhost:${PORT}`);
  console.log(`📍 Região padrão: Senador Canedo e cidades vizinhas`);
  console.log(`⏰ Sistema de Agendamento e Piloto Automático Ativo!`);
  console.log(`======================================================\n`);
});
