import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { storage } from '../services/storage.js';
import { generateGeminiReply } from '../services/gemini.js';
import { sendWelcomeMenu, sendHumanHandoff, sendAiWelcome } from './menu.js';
import { sendTextWithTyping } from './messageSender.js';
import { config } from '../config/env.js';

export async function handleIncomingMessage(sock: WASocket, message: WAMessage): Promise<void> {
  // Ignora mensagens sem conteúdo
  if (!message.message) return;

  const jid = message.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') {
    return;
  }

  // Extrai o texto ou o clique de botão da mensagem
  const msgContent = message.message;
  let selectedButtonId =
    msgContent.buttonsResponseMessage?.selectedButtonId ||
    msgContent.templateButtonReplyMessage?.selectedId ||
    msgContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
    '';

  // Trata botões interativos modernos (nativeFlowResponseMessage e interactiveResponseMessage)
  if (msgContent.interactiveResponseMessage) {
    try {
      if (msgContent.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson) {
        const parsed = JSON.parse(msgContent.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
        if (parsed.id) selectedButtonId = parsed.id;
      }
      if (!selectedButtonId && msgContent.interactiveResponseMessage.body?.text) {
        selectedButtonId = msgContent.interactiveResponseMessage.body.text;
      }
    } catch (_) {}
  }

  const rawText =
    selectedButtonId ||
    msgContent.conversation ||
    msgContent.extendedTextMessage?.text ||
    msgContent.buttonsResponseMessage?.selectedDisplayText ||
    msgContent.listResponseMessage?.title ||
    msgContent.listResponseMessage?.description ||
    '';

  const cleanText = rawText.trim();
  const lowerText = cleanText.toLowerCase();

  // --- TRATAMENTO DE MENSAGENS ENVIADAS POR VOCÊ (PROSPECÇÃO ATIVA / RESPOSTA MANUAL) ---
  if (message.key.fromMe) {
    // Comandos de controle que você pode enviar direto no chat com o cliente
    if (lowerText === `${config.adminPrefix}ia`) {
      storage.setSessionStatus(jid, 'AI_ATTENDANT');
      console.log(`🤖 [${jid}] Você ativou o modo IA para este contato.`);
      await sendAiWelcome(sock, jid);
      return;
    }

    if (lowerText === `${config.adminPrefix}humano`) {
      storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
      console.log(`👤 [${jid}] Você forçou o modo humano para este contato.`);
      return;
    }

    if (lowerText === `${config.adminPrefix}reset` || lowerText === `${config.adminPrefix}menu`) {
      storage.resetSession(jid);
      console.log(`🔄 [${jid}] Sessão resetada para menu inicial.`);
      await sendWelcomeMenu(sock, jid);
      return;
    }

    // Se você enviou uma mensagem normal (prospecção/conversa manual),
    // define a conversa como ATENDIMENTO HUMANO para a IA não se intrometer
    const session = storage.getSession(jid);
    if (session.status !== 'HUMAN_ATTENDANT') {
      storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
      console.log(`👤 [${session.phone}] Mensagem enviada por você. IA pausada automaticamente para prospecção ativa / conversa manual.`);
    }
    return;
  }

  const session = storage.getSession(jid);

  console.log(`📩 [${session.phone}] Mensagem / Ação: "${cleanText}" (Status: ${session.status})`);

  // --- COMANDOS ADMINISTRATIVOS / ATALHOS ---
  if (lowerText === `${config.adminPrefix}reset` || lowerText === `${config.adminPrefix}menu` || lowerText === 'menu principal') {
    storage.resetSession(jid);
    await sendWelcomeMenu(sock, jid);
    return;
  }

  if (lowerText === `${config.adminPrefix}ia`) {
    storage.setSessionStatus(jid, 'AI_ATTENDANT');
    await sendTextWithTyping(sock, jid, '🤖 Modo de Atendimento com IA reativado para esta conversa.');
    return;
  }

  if (lowerText === `${config.adminPrefix}humano`) {
    storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
    await sendHumanHandoff(sock, jid);
    return;
  }

  // --- MÁQUINA DE ESTADOS DO ATENDIMENTO ---

  // 1. ESTADO: MENU INICIAL
  if (session.status === 'INITIAL_MENU') {
    // Opção 1: Clique no botão ou resposta de IA
    if (
      selectedButtonId === 'btn_atendimento_ia' ||
      lowerText === '1' ||
      lowerText === '1️⃣' ||
      lowerText.includes('atendimento com ia') ||
      lowerText === 'ia' ||
      lowerText === 'robô' ||
      lowerText === 'robo'
    ) {
      storage.setSessionStatus(jid, 'AI_ATTENDANT');
      await sendAiWelcome(sock, jid);
      return;
    }

    // Opção 2: Clique no botão ou resposta de Atendente Humano
    if (
      selectedButtonId === 'btn_falar_atendente' ||
      lowerText === '2' ||
      lowerText === '2️⃣' ||
      lowerText.includes('falar com atendente') ||
      lowerText.includes('atendente') ||
      lowerText.includes('humano') ||
      lowerText.includes('pessoa')
    ) {
      storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
      await sendHumanHandoff(sock, jid);
      return;
    }

    // Caso seja a primeira mensagem e não tenha clicado, envia o menu com botões
    await sendWelcomeMenu(sock, jid);
    return;
  }

  // 2. ESTADO: ATENDIMENTO COM IA (LIMIRO BRASIL)
  if (session.status === 'AI_ATTENDANT') {
    // Verifica se o usuário clicou ou pediu atendente humano durante o diálogo
    if (
      selectedButtonId === 'btn_falar_atendente' ||
      lowerText === '2' ||
      lowerText === 'falar com atendente' ||
      lowerText === 'atendente humano' ||
      lowerText === 'quero falar com atendente' ||
      lowerText === 'falar com humano' ||
      lowerText === 'falar com uma pessoa'
    ) {
      storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
      await sendHumanHandoff(sock, jid);
      return;
    }

    // Registra a mensagem do usuário no histórico
    storage.addMessage(jid, 'user', cleanText);

    // Gera a resposta inteligente com o Google Gemini
    const { replyText, requestHumanHandoff } = await generateGeminiReply(jid, cleanText);

    if (requestHumanHandoff) {
      storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
      await sendTextWithTyping(sock, jid, replyText);
      await sendHumanHandoff(sock, jid);
      storage.addMessage(jid, 'model', replyText);
      return;
    }

    // Envia a resposta da IA com efeito de digitação e salva no histórico
    await sendTextWithTyping(sock, jid, replyText);
    storage.addMessage(jid, 'model', replyText);
    return;
  }

  // 3. ESTADO: ATENDIMENTO HUMANO
  if (session.status === 'HUMAN_ATTENDANT') {
    // O bot fica em silêncio para a equipe humana conversar livremente
    console.log(`ℹ️ [${session.phone}] Cliente em atendimento humano. IA pausada.`);
    return;
  }
}
