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
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  res.send('<h1>Limiro Brasil Prospector & Bot Ativo</h1>');
});

app.get('/simulator', (req, res) => {
  const simPath = path.join(__dirname, 'public', 'simulator.html');
  if (fs.existsSync(simPath)) {
    return res.sendFile(simPath);
  }
  res.sendFile(path.join(__dirname, 'simulator.html'));
});

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

// ==========================================
// ROTAS DO SIMULADOR DE ATENDIMENTO E PROSPECÇÃO
// ==========================================
app.post('/api/simulator/start-outbound', async (req, res) => {
  const { phone = '5562900000001', businessName = 'Auto Center Imperial', niche = 'Oficina Mecânica', city = 'Senador Canedo' } = req.body;
  const { handleSalesConversation } = await import('./salesAgentService.js');
  
  // Reseta o número fictício primeiro
  await handleSalesConversation({ phone, incomingText: '!reset' });

  // Dispara a mensagem de abertura de prospecção
  const openingText = `Opa, tudo bem? Encontrei o contato da ${businessName} aqui em ${city}, posso tirar uma dúvida rápida com vocês?`;
  
  // Registra no histórico como envio do bot
  const convsFile = path.join(__dirname, 'data', 'conversations.json');
  let convs = {};
  try { if (fs.existsSync(convsFile)) convs = JSON.parse(fs.readFileSync(convsFile, 'utf8')); } catch (_) {}
  
  convs[phone] = {
    phone,
    flowType: 'OUTBOUND',
    messages: [{ sender: 'limiro', text: openingText, timestamp: new Date().toISOString() }],
    stage: 'OPENING_SENT',
    leadName: businessName,
    niche,
    city,
    hasWebsite: false,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(convsFile, JSON.stringify(convs, null, 2), 'utf8');

  res.json({ success: true, phone, openingText, history: convs[phone] });
});

app.post('/api/simulator/chat', async (req, res) => {
  const { phone = '5562900000001', text, businessName, niche, city, flowType = 'INBOUND' } = req.body;
  const { handleSalesConversation } = await import('./salesAgentService.js');

  try {
    const result = await handleSalesConversation({
      phone,
      incomingText: text,
      name: businessName,
      niche,
      city
    });

    const convsFile = path.join(__dirname, 'data', 'conversations.json');
    let convs = {};
    try { if (fs.existsSync(convsFile)) convs = JSON.parse(fs.readFileSync(convsFile, 'utf8')); } catch (_) {}

    res.json({
      success: true,
      reply: result.reply,
      stage: result.stage || convs[phone]?.stage || 'QUALIFYING',
      history: convs[phone] || { messages: [] }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/test/dispatch-real', async (req, res) => {
  const { phone, businessName = 'Auto Center Imperial', niche = 'Oficina Mecânica e Troca de Óleo', city = 'Senador Canedo', flowType = 'OUTBOUND' } = req.body;
  
  if (!phone) {
    return res.status(400).json({ error: 'Informe o número do WhatsApp com DDD.' });
  }

  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone.startsWith('55') && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
    cleanPhone = '55' + cleanPhone;
  }

  try {
    const { sendWhatsAppMessage } = await import('./whatsappService.js');
    const { handleSalesConversation } = await import('./salesAgentService.js');

    // 1. Reseta o histórico deste número para começar do zero
    await handleSalesConversation({ phone: cleanPhone, incomingText: '!reset' });

    let messageToSend = '';

    if (customText) {
      messageToSend = customText;
    } else if (flowType === 'OUTBOUND') {
      messageToSend = `Opa, tudo bem? Encontrei o contato da ${businessName} aqui em ${city}, posso tirar uma dúvida rápida com vocês?`;
      
      // Registra no histórico como envio inicial de prospecção
      const convsFile = path.join(__dirname, 'data', 'conversations.json');
      let convs = {};
      try { if (fs.existsSync(convsFile)) convs = JSON.parse(fs.readFileSync(convsFile, 'utf8')); } catch (_) {}
      
      convs[cleanPhone] = {
        phone: cleanPhone,
        flowType: 'OUTBOUND',
        messages: [{ sender: 'limiro', text: messageToSend, timestamp: new Date().toISOString() }],
        stage: 'OPENING_SENT',
        leadName: businessName,
        niche,
        city,
        hasWebsite: false,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(convsFile, JSON.stringify(convs, null, 2), 'utf8');

    } else {
      // Inbound: envia o menu inicial
      messageToSend = "Olá! Seja muito bem-vindo(a) à *Limiro Brasil*! 🚀\n\nPara agilizarmos o seu atendimento, como você prefere continuar?\n\n1️⃣ *Atendimento Inteligente com IA* 🤖\n_(Recomendado: Você adianta os detalhes do seu projeto na hora sem esperar em filas!)_\n\n2️⃣ *Aguardar atendimento humano* 👤\n_(Aguardar na fila de atendimento)_\n\n👉 *Digite 1 ou 2 para escolher:*";
      
      const convsFile = path.join(__dirname, 'data', 'conversations.json');
      let convs = {};
      try { if (fs.existsSync(convsFile)) convs = JSON.parse(fs.readFileSync(convsFile, 'utf8')); } catch (_) {}
      
      convs[cleanPhone] = {
        phone: cleanPhone,
        flowType: 'INBOUND',
        inboundStage: 'CHOOSING_ATTENDANT',
        messages: [{ sender: 'limiro', text: messageToSend, timestamp: new Date().toISOString() }],
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(convsFile, JSON.stringify(convs, null, 2), 'utf8');
    }

    // 2. Dispara a mensagem no WhatsApp real
    await sendWhatsAppMessage(cleanPhone, messageToSend);
    console.log(`[DISPARO REAL] 🚀 Mensagem de teste enviada para ${cleanPhone}: "${messageToSend}"`);

    res.json({
      success: true,
      message: `Mensagem enviada com sucesso para o WhatsApp ${cleanPhone}! Responda agora pelo seu celular para ver a IA conversando com você.`,
      phone: cleanPhone,
      text: messageToSend
    });
  } catch (err) {
    console.error('[DISPARO REAL] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint direto para simulação de alerta de fechamento imediato
app.post('/api/test/send-direct-alert', async (req, res) => {
  const { phone } = req.body;
  const targetPhone = phone || '5562981340443';
  const alertText = 
`🚨 *CLIENTE PEDIU VALORES / QUER FECHAR!*

🏢 *Empresa:* Dra. Camila Vianna - Plantão 24h
📍 *Nicho:* Clínica Odontológica em Senador Canedo, GO
📱 *WhatsApp do Cliente:* https://wa.me/5562992421099
💬 *Última Mensagem dele:* "Gostei muito da ideia da triagem no WhatsApp! Qual o valor do investimento para implementar aqui na nossa clínica?"

📝 *Histórico do Atendimento pela IA:*
- Nós: "Opa, tudo bem? Encontrei o contato da Dra. Camila Vianna aqui em Senador Canedo, posso tirar uma dúvida rápida?"
- Cliente: "Pode falar, sobre o que seria?"
- Nós: "É que a gente desenvolveu uma triagem no WhatsApp pra clínicas aqui na região que confirma consultas e reduz faltas de pacientes."
- Cliente: "Gostei muito, qual o valor do investimento?"

👉 *Chame a Dra. Camila no WhatsApp pelo link acima para fechar a venda!*`;

  try {
    const { sendWhatsAppMessage } = await import('./whatsappService.js');
    await sendWhatsAppMessage(targetPhone, alertText);
    res.json({ success: true, message: 'Alerta disparado!', alertText });
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
