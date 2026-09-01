import { WASocket } from '@whiskeysockets/baileys';
import { sendTextWithTyping } from './messageSender.js';

export const WELCOME_TEXT = `Olá! 👋 Seja muito bem-vindo(a) à *Limiro Brasil*.
Como podemos ajudar você hoje?

Escolha uma das opções abaixo para iniciar seu atendimento:

1️⃣ *Atendimento Ágil com IA 🤖*
_Atendimento imediato e sem espera! Nossa IA entende sua necessidade, tira dúvidas e organiza tudo para o especialista humano dar continuidade com total agilidade._

2️⃣ *Falar com atendente 👤*
_Falar diretamente com a nossa equipe humana._

👉 _Digite *1* ou *2* para responder._`;

export const HUMAN_HANDOFF_MESSAGE = `Perfeito! 👤 Encaminhei sua solicitação para a nossa equipe humana.

Em instantes um especialista do nosso time entrará em contato aqui no WhatsApp com todas as suas informações já em mãos para te atender com agilidade e máxima atenção! 🚀`;

export const AI_START_MESSAGE = `Perfeito! 🤖 Sou a IA da *Limiro Brasil*.

Vou adiantar seu atendimento para nosso especialista entrar em contato rapidinho.

Para começar: qual é o seu *nome* e qual solução você busca hoje (ex: *IA para WhatsApp*, *Criação de Sites*, *Aplicativos*, *Automações* ou outro serviço que precise)?`;

export async function sendWelcomeMenu(sock: WASocket, jid: string) {
  try {
    await sendTextWithTyping(sock, jid, WELCOME_TEXT);
  } catch (error) {
    console.error('Erro ao enviar menu de boas-vindas:', error);
  }
}

export async function sendHumanHandoff(sock: WASocket, jid: string) {
  await sendTextWithTyping(sock, jid, HUMAN_HANDOFF_MESSAGE);
}

export async function sendAiWelcome(sock: WASocket, jid: string) {
  await sendTextWithTyping(sock, jid, AI_START_MESSAGE);
}
