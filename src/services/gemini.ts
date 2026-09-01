import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import { LIMIRO_SYSTEM_PROMPT } from '../config/prompt.js';
import { ChatMessage, storage } from './storage.js';

let genAI: GoogleGenerativeAI | null = null;

function getAIClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

export interface AIResponseResult {
  replyText: string;
  requestHumanHandoff?: boolean;
}

export async function generateGeminiReply(
  jid: string,
  incomingUserText: string
): Promise<AIResponseResult> {
  if (!config.geminiApiKey) {
    return {
      replyText:
        '⚠️ Olá! O assistente está em modo de configuração (Chave do Gemini ausente no .env). Por favor, configure a GEMINI_API_KEY no arquivo .env.',
    };
  }

  const session = storage.getSession(jid);
  const history = session.history;

  const candidateModels = [
    config.geminiModel,
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
  ].filter((v, i, a) => !!v && a.indexOf(v) === i);

  const ai = getAIClient();

  // Formata o histórico anterior para o formato do chat
  const chatHistory = history.map((msg: ChatMessage) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));

  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const model = ai.getGenerativeModel({
        model: modelName,
        systemInstruction: LIMIRO_SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.6,
        },
      });

      const chat = model.startChat({
        history: chatHistory,
      });

      const result = await chat.sendMessage(incomingUserText);
      const response = await result.response;
      const replyText = response.text()?.trim();

      if (replyText) {
        // Checagem se o cliente ou a resposta indicam transferência para atendente humano
        const lowerUser = incomingUserText.toLowerCase();
        const isRequestingHuman =
          lowerUser.includes('falar com atendente') ||
          lowerUser.includes('falar com humano') ||
          lowerUser.includes('atendente humano') ||
          lowerUser.includes('pessoa real') ||
          lowerUser.includes('falar com uma pessoa');

        return {
          replyText,
          requestHumanHandoff: isRequestingHuman,
        };
      }
    } catch (error: any) {
      lastError = error;
      console.warn(`⚠️ Modelo ${modelName} falhou (${error?.message?.substring(0, 80)}). Tentando próximo modelo...`);
    }
  }

  console.error('❌ Todos os modelos Gemini falharam:', lastError?.message || lastError);
  return {
    replyText:
      'Perfeito! Recebi sua mensagem. Para agilizarmos com nosso especialista, me passe seu nome e sua empresa 😊',
  };
}
