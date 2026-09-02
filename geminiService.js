import dotenv from 'dotenv';
dotenv.config();

/**
 * Limpa o nome da empresa para parecer natural no WhatsApp
 */
function cleanBusinessName(rawName) {
  if (!rawName) return 'espaço de vocês';
  
  let name = rawName
    .replace(/em senador canedo/gi, '')
    .replace(/senador canedo/gi, '')
    .replace(/em goi[aâ]nia/gi, '')
    .replace(/goi[aâ]nia/gi, '')
    .replace(/aparecida de goi[aâ]nia/gi, '')
    .replace(/\|\s*sal[ãa]o.*/gi, '')
    .replace(/-\s*sal[ãa]o.*/gi, '')
    .replace(/-\s*espaço.*/gi, '')
    .replace(/\|\s*unhas.*/gi, '')
    .replace(/\|\s*matriz.*/gi, '')
    .replace(/-\s*filial.*/gi, '')
    .trim();

  const words = name.split(' ');
  if (words.length > 5) {
    name = words.slice(0, 4).join(' ');
  }

  return name || rawName;
}

/**
 * Gera diagnóstico inteligente com o Método Campeão de 2 Etapas (Soft Opening)
 */
export function generateDiagnostic(business) {
  const opportunities = [];
  const rawName = business.name || 'Empresa';
  const cleanName = cleanBusinessName(rawName);
  const category = (business.category || '').toLowerCase();
  const city = (business.city || 'Canedo').split(',')[0].trim();
  const hasWebsite = !!(business.website && business.website.trim().length > 0 && !business.website.includes('google.com') && !business.website.includes('instagram.com') && !business.website.includes('facebook.com'));

  // Badges
  if (!hasWebsite) {
    opportunities.push({
      type: 'SITE',
      badge: '🌐 Sem Site Oficial',
      description: 'Oportunidade para criação de site.',
      color: 'danger'
    });
  }

  opportunities.push({
    type: 'TAXA_RECORDE',
    badge: '🏆 Soft Opening (Taxa 70%+)',
    description: 'Abertura em 2 etapas com maior taxa de resposta do mercado.',
    color: 'success'
  });

  // 1. MÉTODO CAMPEÃO: PASSO 1 (ABERTURA - 70% A 80% DE RESPOSTA)
  const step1Pitch = `Opa, tudo bem? Encontrei o contato da ${cleanName} aqui em ${city}, posso tirar uma dúvida rápida com vocês?`;

  // PASSO 2 (O que mandar assim que a pessoa responder "Pode falar"):
  const step2Script = `Show! Me chamo Vinicius, da Limiro Brasil aqui na região 👋 Vi o trabalho de vocês e achei excelente!\n\nA gente cria soluções de tecnologia para empresas daqui (Sites profissionais, Agendamento automático e Atendimento no WhatsApp com IA).\n\nHoje vocês perdem muito tempo atendendo e agendando clientes manualmente no zap, ou já usam algum sistema?`;

  // 2. MÉTODO DIRETO: PERGUNTA DA DOR (3 LINHAS)
  const directPitch = `Opa, tudo bem? Vi o destaque da ${cleanName} aqui em ${city}!\n\nA gente cria sistemas onde o cliente tira dúvidas e agenda serviços direto no WhatsApp sozinho, com lembrete pra não furar.\n\nVocês já usam agendamento no Whats ou ainda marcam tudo manualmente na mão?`;

  // 3. MÉTODO CARDÁPIO: MENU COMPLETO DE SERVIÇOS
  const menuPitch = `Olá, tudo bem? Me chamo Vinicius, da Limiro Brasil aqui na região 👋\n\nNós desenvolvemos soluções de tecnologia para empresas em ${city}:\n1. 🌐 Sites Profissionais e Portais\n2. 🤖 Atendimento com IA no WhatsApp 24h\n3. 📅 Agendamento Online e Lembretes\n4. 📱 Aplicativos para Celulares\n5. ⚡ Automações e Integrações\n\nQual dessas áreas vocês mais têm interesse em melhorar hoje?`;

  return {
    opportunities,
    suggestedPitch: step1Pitch,
    step2Script,
    variations: {
      step1: step1Pitch,
      direct: directPitch,
      menu: menuPitch
    }
  };
}

export async function refinePitchWithGemini(business, apiKey) {
  return generateDiagnostic(business).suggestedPitch;
}
