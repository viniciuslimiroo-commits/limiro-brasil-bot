import dotenv from 'dotenv';
dotenv.config();

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  adminPrefix: process.env.ADMIN_PREFIX || '!',
  typingDelayMinMs: Number(process.env.TYPING_DELAY_MIN_MS) || 1000,
  typingDelayMaxMs: Number(process.env.TYPING_DELAY_MAX_MS) || 2500,
  port: Number(process.env.PORT) || 3000,
};

export function validateConfig() {
  if (!config.geminiApiKey) {
    console.warn('\n⚠️ [ATENÇÃO] A variável GEMINI_API_KEY não foi configurada no arquivo .env.');
    console.warn('➡️ Para obter uma chave gratuita, acesse: https://aistudio.google.com/');
    console.warn('➡️ Em seguida, adicione GEMINI_API_KEY=sua_chave no arquivo .env\n');
  }
}
