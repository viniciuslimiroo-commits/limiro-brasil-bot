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

  try {
    const ai = getAIClient();
    const model = ai.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: LIMIRO_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
      },
    });

    // Formata o histórico anterior para o formato do chat
    const chatHistory = history.map((msg: ChatMessage) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    const chat = model.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessage(incomingUserText);
    const response = await result.response;
    const replyText =
      response.text()?.trim() ||
      'Desculpe, não consegui processar a resposta no momento. Como posso te ajudar?';

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
  } catch (error: any) {
    console.error('Erro na chamada da API Gemini:', error?.message || error);
    return {
      replyText:
        'Tivemos uma oscilação momentânea na conexão, mas nossa equipe já foi avisada! Em instantes uma pessoa da nossa equipe poderá te atender 😊',
    };
  }
}
