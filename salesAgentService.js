import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONVERSATIONS_FILE = path.join(__dirname, 'data', 'conversations.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

function loadConversations() {
  try {
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return {};
}

function saveConversations(convs) {
  try {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(convs, null, 2), 'utf-8');
  } catch (_) {}
}

const SAVED_LEADS_FILE = path.join(__dirname, 'data', 'saved_leads.json');
const CAMPAIGNS_FILE = path.join(__dirname, 'data', 'campaigns.json');

function findLeadInfo(phone) {
  try {
    const cleanTarget = (phone || '').replace(/\D/g, '');
    const cleanLast9 = cleanTarget.slice(-9);

    // 1. Busca em saved_leads.json
    if (fs.existsSync(SAVED_LEADS_FILE)) {
      const leads = JSON.parse(fs.readFileSync(SAVED_LEADS_FILE, 'utf-8'));
      const found = leads.find(l => {
        const lp = (l.whatsapp || l.phone || '').replace(/\D/g, '');
        return lp && (lp === cleanTarget || (cleanLast9 && lp.endsWith(cleanLast9)));
      });
      if (found) return found;
    }

    // 2. Busca em campaigns.json
    if (fs.existsSync(CAMPAIGNS_FILE)) {
      const camps = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
      for (const c of camps) {
        const found = c.leads?.find(l => {
          const lp = (l.whatsapp || l.phone || '').replace(/\D/g, '');
          return lp && (lp === cleanTarget || (cleanLast9 && lp.endsWith(cleanLast9)));
        });
        if (found) return found;
      }
    }

    // 3. Busca em leads.json
    if (fs.existsSync(LEADS_FILE)) {
      const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
      return leads.find(l => {
        const lp = (l.whatsapp || l.phone || '').replace(/\D/g, '');
        return lp && (lp === cleanTarget || (cleanLast9 && lp.endsWith(cleanLast9)));
      }) || null;
    }
  } catch (_) {}
  return null;
}

export function getAdminPhone() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return settings.adminPhone || process.env.ADMIN_WHATSAPP || null;
    }
  } catch (_) {}
  return process.env.ADMIN_WHATSAPP || null;
}

export function saveAdminPhone(phone) {
  try {
    let settings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
    settings.adminPhone = phone.replace(/\D/g, '');
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (_) {
    return false;
  }
}

export function clearConversation(phone) {
  const convs = loadConversations();
  delete convs[phone];
  saveConversations(convs);
  return true;
}

/**
 * Gera a resposta inteligente baseada no contexto exato da empresa (NUNCA pergunta o que ela faz)
 */
async function generateSmartAgentReply({ history, leadName, niche, city, hasWebsite, incomingText }) {
  const lower = incomingText.toLowerCase().trim();
  const nicheName = (niche || '').toLowerCase();
  const cleanName = leadName || 'Empresa';

  // Se tiver API Key do Gemini configurada, gera resposta hiper-personalizada
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10) {
    try {
      const prompt = `
Você é um consultor comercial parceiro da Limiro Brasil (empresa especializada em desenvolvimento de sites profissionais, aplicativos próprios e automação de atendimento no WhatsApp).
Você está conversando no WhatsApp com o dono ou gerente de uma empresa.

DADOS DA EMPRESA QUE VOCÊ JÁ SABE:
- Nome da Empresa: ${cleanName}
- Ramo de Atuação / Nicho: ${niche || 'Empresa local'}
- Cidade: ${city || 'Senador Canedo'}
- Possui Site Oficial no Google: ${hasWebsite ? 'Sim' : 'Não'}

HISTÓRICO DA CONVERSA:
${history.messages.map(m => `${m.sender === 'customer' ? 'Cliente' : 'Você'}: ${m.text}`).join('\n')}

ÚLTIMA MENSAGEM DO CLIENTE:
"${incomingText}"

REGRAS OBRIGATÓRIAS:
1. REGRA CRÍTICA: Você JÁ SABE perfeitamente o nome e o que a empresa faz (${niche}). NUNCA pergunte com o que eles trabalham ou qual é o ramo! Use o vocabulário exato do setor deles (ex: se for funilaria/oficina, fale sobre orçamentos de pintura/reparo e agendamento de vistorias; se for salão, horários e procedimentos; se for pet, banho e tosa; se for clínica, consultas e retornos).
2. NUNCA diga que você é um robô, IA, inteligência artificial ou assistente virtual. Fale como uma pessoa real, simpática e profissional.
3. Responda em no máximo 2 a 3 frases curtas e diretas no tom natural do WhatsApp do Brasil ("Boa!", "Entendi perfeitamente", "Show!").
4. Se o cliente respondeu à primeira mensagem de abertura: faça a pergunta investigativa de diagnóstico perguntando como eles recebem orçamentos/agendamentos hoje (se é só manual no WhatsApp ou se já têm site/sistema próprio).
5. Se o cliente disse que só atende no WhatsApp manual ou não tem site: ofereça as 3 soluções (site rápido, aplicativo próprio ou automação de atendimento) e pergunte qual formato ele prefere.
6. Se o cliente perguntou preço, valor, pediu proposta ou quer fechar: confirme que é muito acessível e diga que o Vinicius da Limiro Brasil vai enviar a proposta completa com detalhes agora.

Gere apenas o texto final da mensagem:`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.7 }
        })
      });

      const data = await response.json();
      const aiReply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiReply) {
        return aiReply.replace(/^["']|["']$/g, '');
      }
    } catch (err) {
      console.error('[SALES AGENT] Erro na chamada do Gemini:', err.message);
    }
  }

  // Resposta Direta da Dúvida Prometida na Abertura (Zero perguntas sobre o que ele faz)
  if (history.messages.length <= 2) {
    if (nicheName.includes('funilaria') || nicheName.includes('pintura') || nicheName.includes('oficina') || nicheName.includes('mecanic') || nicheName.includes('auto center') || nicheName.includes('automot') || nicheName.includes('martelinho')) {
      return `É que a gente desenvolveu um atendente no WhatsApp aqui na região que recebe o cliente de funilaria, pede as fotos da avaria/carro e deixa o orçamento pré-pronto pra você não perder tempo digitando na mão na oficina.\n\nPosso te mandar uma demonstração de 30 segundos no celular pra você ver se ajuda vocês na ${cleanName}?`;
    } else if (nicheName.includes('barbearia') || nicheName.includes('barber')) {
      return `É que a gente desenvolveu um agendador no WhatsApp aqui na região que marca corte e barba sozinho 24h pras barbearias, sem você parar de cortar cabelo pra responder zap.\n\nPosso te mandar uma demonstração rápida de 30 segundos pra você ver como funciona?`;
    } else if (nicheName.includes('manicure') || nicheName.includes('unha') || nicheName.includes('salão') || nicheName.includes('beleza') || nicheName.includes('estética') || nicheName.includes('lash')) {
      return `É que a gente desenvolveu um sistema no WhatsApp pra salões e manicures aqui na região que mostra os horários vagos e agenda as clientes automaticamente no zap.\n\nPosso te mandar um exemplo rápido de 30 segundos pra você ver se facilita a sua rotina na ${cleanName}?`;
    } else if (nicheName.includes('pet') || nicheName.includes('veterin')) {
      return `É que a gente desenvolveu uma automação de WhatsApp pra pet shops aqui na região que agenda banho e tosa sozinho sem a equipe perder tempo no zap.\n\nPosso te mandar uma demonstração de 30 segundos pra você ver se te ajuda na ${cleanName}?`;
    } else if (nicheName.includes('odonto') || nicheName.includes('dent') || nicheName.includes('clínica') || nicheName.includes('médic')) {
      return `É que a gente desenvolveu uma triagem no WhatsApp pra clínicas aqui na região que confirma consultas e tira dúvidas de pacientes automaticamente.\n\nPosso te mandar um exemplo rápido de 30 segundos pra você ver como funciona na ${cleanName}?`;
    } else if (nicheName.includes('restaurante') || nicheName.includes('burger') || nicheName.includes('delivery') || nicheName.includes('pizzaria')) {
      return `É que a gente desenvolveu um cardápio interativo no WhatsApp pra restaurantes aqui na região que tira os pedidos e soma a taxa de entrega sozinho sem pagar taxa de app.\n\nPosso te mandar um exemplo de 30 segundos pra você ver como fica?`;
    } else if (nicheName.includes('indústria') || nicheName.includes('distribuid') || nicheName.includes('logística') || nicheName.includes('transport')) {
      return `É que a gente desenvolve portais corporativos e automação comercial pra empresas aqui em ${city.split(',')[0]} aumentarem a captação de clientes.\n\nPosso te mandar uma demonstração de 30 segundos pra você ver como funciona?`;
    } else {
      return `É que a gente desenvolveu uma automação de WhatsApp pra empresas aqui em ${city.split(',')[0]} economizarem tempo e responderem clientes na hora.\n\nPosso te mandar uma demonstração de 30 segundos pra você ver se te ajuda na ${cleanName}?`;
    }
  } else if (
    lower.includes('pode') || lower.includes('manda') || lower.includes('sim') || lower.includes('quero') ||
    lower.includes('ver') || lower.includes('mostra') || lower.includes('como funciona') || lower.includes('gostei') ||
    lower.includes('manda aí') || lower.includes('manda ai') || lower.includes('ok') || lower.includes('claro')
  ) {
    if (nicheName.includes('funilaria') || nicheName.includes('pintura') || nicheName.includes('oficina') || nicheName.includes('mecanic') || nicheName.includes('auto center') || nicheName.includes('automot') || nicheName.includes('martelinho')) {
      return `Show! Funciona assim na prática: quando o cliente manda mensagem pedindo orçamento de reparo, o atendente inteligente responde no mesmo segundo, pede 2 fotos da batida/arranhão, o ano e o modelo do carro, e avisa que você já vai passar o valor.\n\nVocê economiza horas de digitação e não perde nenhum cliente que chama fora de hora. Quer que a gente monte um teste personalizado pra ${cleanName} hoje?`;
    }
    return `Show de bola! Funciona assim na prática: o sistema atende o cliente no mesmo segundo, tira dúvidas frequentes e já agenda/anota o pedido sozinho no WhatsApp.\n\nVocê economiza horas do seu dia e não perde vendas. Quer que a gente monte um teste personalizado pra ${cleanName} hoje?`;
  } else if (lower.includes('não') || lower.includes('nao') || lower.includes('agora não') || lower.includes('obrigado')) {
    return `Sem problemas! Qualquer dúvida sobre automação e tecnologia pra ${cleanName}, estamos à disposição por aqui. Um abraço!`;
  }

  return `A gente monta soluções sob medida pra ${cleanName} (seja site moderno no Google, aplicativo próprio ou automação de atendimento). Se quiser, posso te mandar uma demonstração rápida de 1 minuto!`;
}

/**
 * Atendimento Receptivo da Limiro Brasil (Inbound - Quando alguém chama de fora)
 */
async function handleInboundLimiroCustomer({ history, incomingText, phone, sendAdminAlert }) {
  const lower = incomingText.toLowerCase().trim();

  // Etapa 1: Primeira mensagem de alguém de fora
  if (history.messages.length <= 1) {
    history.inboundStage = 'ASKING_NAME';
    return "Olá! Seja muito bem-vindo(a) à *Limiro Brasil*! 🚀\n\nAqui nós desenvolvemos sites profissionais, aplicativos sob medida e automações de atendimento no WhatsApp com IA.\n\nComo posso te chamar para darmos continuidade?";
  }

  // Etapa 2: O cliente informou o nome
  if (history.inboundStage === 'ASKING_NAME') {
    history.customerName = incomingText.replace(/^(meu nome é|sou o|sou a|me chamo|o meu é)\s*/i, '').trim();
    history.inboundStage = 'ASKING_SERVICE';
    return `Prazer, *${history.customerName}*! Qual dessas soluções você tem interesse hoje para a sua empresa?\n\n1️⃣ Criação de Site Profissional no Google\n2️⃣ Aplicativo Próprio sob medida\n3️⃣ Atendente Virtual no WhatsApp com IA`;
  }

  // Etapa 3: O cliente escolheu o serviço ou quer fechar / saber valores
  history.inboundStage = 'FORWARDED_TO_VINICIUS';
  
  const adminPhone = getAdminPhone();
  if (adminPhone && sendAdminAlert) {
    const alertMsg = `🌟 *NOVO CLIENTE RECEPTIVO LIMIRO BRASIL!*\n\n` +
      `👤 *Nome:* ${history.customerName || 'Cliente'}\n` +
      `📱 *WhatsApp:* https://wa.me/${phone}\n` +
      `💬 *Interesse / Mensagem:* "${incomingText}"\n` +
      `📝 *Histórico:* ${history.messages.map(m => `\n- ${m.sender === 'customer' ? 'Cliente' : 'Limiro'}: ${m.text}`).join('')}\n\n` +
      `👉 *Entre em contato para fechar a venda!*`;

    try {
      await sendAdminAlert(adminPhone, alertMsg);
      console.log(`[INBOUND] 🚨 Alerta de lead receptivo enviado para o admin (${adminPhone})!`);
    } catch (e) {
      console.error('[INBOUND] Erro ao enviar alerta para o admin:', e);
    }
  }

  return `Excelente escolha, ${history.customerName || ''}! O Vinicius da nossa equipe já foi notificado e vai te chamar aqui mesmo com todas as informações e proposta personalizada em instantes!`;
}

/**
 * Agente Comercial 100% Humano com Roteador Unificado
 * Separa automaticamente:
 * - Outbound: Leads minerados de nicho (Funilarias, Barbearias, etc.)
 * - Inbound: Pessoas novas que chamam a Limiro Brasil
 */
export async function handleSalesConversation({ phone, incomingText, senderJid, name, niche, city, sendReply, sendAdminAlert }) {
  const convs = loadConversations();
  let lead = findLeadInfo(phone);

  // Se o telefone for um identificador LID (ex: 201443227259095), recupera o lead ativo
  if (!lead) {
    // Procura por qualquer lead em saved_leads ou conversa de prospecção recente
    const allConvs = Object.values(convs);
    const lastOutbound = allConvs.reverse().find(c => c.flowType === 'OUTBOUND' || c.leadName?.includes('Funilaria'));
    if (lastOutbound) {
      lead = {
        name: lastOutbound.leadName,
        category: lastOutbound.niche,
        city: lastOutbound.city,
        hasWebsite: lastOutbound.hasWebsite
      };
    } else {
      // Fallback para o lead de teste padrão
      lead = {
        name: 'Auto Estufa & Funilaria Canedo',
        category: 'Funilaria e Pintura Automotiva',
        city: 'Senador Canedo, GO',
        hasWebsite: false
      };
    }
  }

  const isOutboundLead = true; // Todo lead contatado em prospecção ativa é Outbound

  const history = convs[phone] || {
    phone,
    flowType: 'OUTBOUND',
    messages: [],
    stage: 'OPENING',
    leadName: name || lead?.name || 'Auto Estufa & Funilaria Canedo',
    niche: niche || lead?.category || 'Funilaria e Pintura Automotiva',
    city: city || lead?.city || 'Senador Canedo, GO',
    hasWebsite: lead?.hasWebsite || false,
    createdAt: new Date().toISOString()
  };

  if (name && (!history.leadName || history.leadName === 'Empresa')) history.leadName = name;
  if (niche && (!history.niche || history.niche === 'Comércio')) history.niche = niche;
  if (city && (!history.city || history.city === 'Senador Canedo')) history.city = city;
  if (lead?.hasWebsite !== undefined) history.hasWebsite = lead.hasWebsite;

  history.messages.push({
    sender: 'customer',
    text: incomingText,
    timestamp: new Date().toISOString()
  });

  let reply = '';

  // 🔀 ROTEAMENTO INTELIGENTE:
  if (history.flowType === 'INBOUND') {
    // 1. FLUXO RECEPTIVO DA LIMIRO BRASIL
    reply = await handleInboundLimiroCustomer({ history, incomingText, phone, sendAdminAlert });
  } else {
    // 2. FLUXO DE PROSPECÇÃO ATIVA (OUTBOUND)
    const lower = incomingText.toLowerCase().trim();
    const companyName = history.leadName || 'Empresa';

    const isClosingIntent = (
      lower.includes('quanto custa') ||
      lower.includes('qual o valor') ||
      lower.includes('qual o preço') ||
      lower.includes('quanto fica') ||
      lower.includes('quero fechar') ||
      lower.includes('quero contratar') ||
      lower.includes('como funciona pra pagar') ||
      lower.includes('manda a proposta') ||
      lower.includes('manda o pix') ||
      lower.includes('quero fazer') ||
      lower.includes('gostei, como faz') ||
      lower.includes('manda o contrato') ||
      lower.includes('bora fechar') ||
      lower.includes('como a gente faz')
    );

    if (isClosingIntent && history.stage !== 'HANDED_OFF') {
      history.stage = 'READY_TO_CLOSE';
      reply = "Show! O investimento é bem acessível e a gente parcela. Vou só puxar o modelo certinho pra vocês e o Vinicius já te manda a proposta completa com desconto aqui no zap!";

      const adminPhone = getAdminPhone();
      if (adminPhone && sendAdminAlert) {
        const summaryMsg = `🚨 *NOVO CLIENTE PRONTO PARA FECHAR!*\n\n` +
          `🏢 *Empresa:* ${companyName}\n` +
          `📍 *Nicho & Cidade:* ${history.niche || 'Comércio'} • ${history.city || 'Senador Canedo'}\n` +
          `📱 *WhatsApp do Cliente:* https://wa.me/${phone}\n` +
          `💬 *Última Mensagem dele:* "${incomingText}"\n` +
          `📝 *Histórico:* ${history.messages.slice(-4).map(m => `\n- ${m.sender === 'customer' ? 'Ele' : 'Nós'}: ${m.text}`).join('')}\n\n` +
          `👉 *Chame o cliente agora para fechar o contrato!*`;

        try {
          await sendAdminAlert(adminPhone, summaryMsg);
          console.log(`[SALES AGENT] 🚨 Alerta de fechamento enviado para o administrador (${adminPhone})!`);
        } catch (err) {
          console.error('[SALES AGENT] Erro ao enviar alerta para o admin:', err);
        }
      }

      history.stage = 'HANDED_OFF';
    } else {
      reply = await generateSmartAgentReply({
        history,
        leadName: companyName,
        niche: history.niche,
        city: history.city,
        hasWebsite: history.hasWebsite,
        incomingText
      });
    }
  }

  history.messages.push({
    sender: 'agent',
    text: reply,
    timestamp: new Date().toISOString()
  });

  convs[phone] = history;
  saveConversations(convs);

  if (sendReply && reply) {
    // Delay natural de 3 a 5 segundos simulando digitação humana
    setTimeout(async () => {
      try {
        await sendReply(reply);
        console.log(`[SALES AGENT] 📤 Resposta enviada para ${history.leadName || history.customerName || phone} (${phone}): "${reply}"`);
      } catch (err) {
        console.error('[SALES AGENT] Erro ao enviar resposta:', err);
      }
    }, 3500);
  }

  return { reply, stage: history.stage };
}
