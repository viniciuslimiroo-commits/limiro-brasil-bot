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

  // Desembrulha mensagens aninhadas (mensagens temporárias / ephemeral, viewOnce, etc.)
  let msgContent: any = message.message;
  if (msgContent?.ephemeralMessage?.message) {
    msgContent = msgContent.ephemeralMessage.message;
  }
  if (msgContent?.viewOnceMessage?.message) {
    msgContent = msgContent.viewOnceMessage.message;
  }
  if (msgContent?.viewOnceMessageV2?.message) {
    msgContent = msgContent.viewOnceMessageV2.message;
  }
  if (msgContent?.documentWithCaptionMessage?.message) {
    msgContent = msgContent.documentWithCaptionMessage.message;
  }

  // Extrai o texto ou o clique de botão da mensagem
  let selectedButtonId =
    msgContent?.buttonsResponseMessage?.selectedButtonId ||
    msgContent?.templateButtonReplyMessage?.selectedId ||
    msgContent?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    '';

  // Trata botões interativos modernos (nativeFlowResponseMessage e interactiveResponseMessage)
  if (msgContent?.interactiveResponseMessage) {
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
    msgContent?.conversation ||
    msgContent?.extendedTextMessage?.text ||
    msgContent?.imageMessage?.caption ||
    msgContent?.videoMessage?.caption ||
    msgContent?.documentMessage?.caption ||
    msgContent?.buttonsResponseMessage?.selectedDisplayText ||
    msgContent?.listResponseMessage?.title ||
    msgContent?.listResponseMessage?.description ||
    '';

  const cleanText = rawText.trim();
  const lowerText = cleanText.toLowerCase();

  const session = storage.getSession(jid);

  // --- IGNORAR MENSAGENS ENVIADAS PELO PRÓPRIO BOT / CONTA (fromMe) ---
  if (message.key.fromMe) {
    // Permite apenas comandos de administração iniciados com '!' se digitados no próprio aparelho
    if (lowerText === `${config.adminPrefix}reset` || lowerText === '!reset' || lowerText === `${config.adminPrefix}menu` || lowerText === '!menu') {
      storage.resetSession(jid);
      console.log(`🔄 [${session.phone}] Você resetou a sessão via comando administrativo.`);
      await sendWelcomeMenu(sock, jid);
      return;
    }
    if (lowerText === `${config.adminPrefix}ia` || lowerText === '!ia') {
      storage.setSessionStatus(jid, 'AI_ATTENDANT');
      console.log(`🤖 [${session.phone}] Você ativou o modo IA via comando administrativo.`);
      await sendAiWelcome(sock, jid);
      return;
    }
    if (lowerText === `${config.adminPrefix}humano` || lowerText === '!humano') {
      storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
      console.log(`👤 [${session.phone}] Você pausou a IA para atendimento humano.`);
      return;
    }

    // Ignora todas as outras mensagens enviadas pela própria conta para não entrar em loop consigo mesma
    return;
  }

  console.log(`📩 [${session.phone}] Mensagem do Cliente: "${cleanText}" (Status: ${session.status})`);

  // --- 1. COMANDOS GLOBAIS DE RESET E MENU ---
  if (
    lowerText === `${config.adminPrefix}reset` ||
    lowerText === '!reset' ||
    lowerText === `${config.adminPrefix}menu` ||
    lowerText === '!menu' ||
    lowerText === 'reset' ||
    lowerText === 'menu' ||
    lowerText === 'menu principal'
  ) {
    storage.resetSession(jid);
    console.log(`🔄 [${session.phone}] Sessão resetada para menu inicial.`);
    await sendWelcomeMenu(sock, jid);
    return;
  }

  if (lowerText === `${config.adminPrefix}ia` || lowerText === '!ia') {
    storage.setSessionStatus(jid, 'AI_ATTENDANT');
    console.log(`🤖 [${session.phone}] Modo IA ativado.`);
    await sendAiWelcome(sock, jid);
    return;
  }

  if (lowerText === `${config.adminPrefix}humano` || lowerText === '!humano') {
    storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
    console.log(`👤 [${session.phone}] Modo Atendimento Humano ativado.`);
    await sendHumanHandoff(sock, jid);
    return;
  }

  // --- 2. VERIFICAÇÃO DE ESCOLHA DE OPÇÕES DO MENU (1 ou 2) ---
  const isOptionOne =
    selectedButtonId === 'btn_atendimento_ia' ||
    lowerText === '1' ||
    lowerText === '1️⃣' ||
    lowerText === 'opcao 1' ||
    lowerText === 'opção 1' ||
    lowerText === 'ia';

  const isOptionTwo =
    selectedButtonId === 'btn_falar_atendente' ||
    lowerText === '2' ||
    lowerText === '2️⃣' ||
    lowerText === 'opcao 2' ||
    lowerText === 'opção 2' ||
    lowerText === 'falar com atendente' ||
    lowerText === 'falar com humano' ||
    lowerText === 'atendente humano';

  if (isOptionOne) {
    storage.setSessionStatus(jid, 'AI_ATTENDANT');
    console.log(`🤖 [${session.phone}] Cliente escolheu Opção 1 (Atendimento com IA).`);
    await sendAiWelcome(sock, jid);
    return;
  }

  if (isOptionTwo) {
    storage.setSessionStatus(jid, 'HUMAN_ATTENDANT');
    console.log(`👤 [${session.phone}] Cliente escolheu Opção 2 (Atendente Humano).`);
    await sendHumanHandoff(sock, jid);
    return;
  }

  // --- 3. ESTADO: MENU INICIAL ---
  if (session.status === 'INITIAL_MENU') {
    // Se enviou qualquer outra mensagem inicial (ex: "Olá", "Boa tarde"), envia o menu
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
