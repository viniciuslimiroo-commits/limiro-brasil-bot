-- ========================================================
-- BANCO DE DADOS LIMIRO BRASIL (SUPABASE / POSTGRESQL)
-- Execute este script no SQL Editor do seu projeto Supabase
-- ========================================================

-- 1. Tabela de Leads / Clientes Qualificados
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  company TEXT,
  city TEXT,
  business_type TEXT,
  service_interest TEXT,
  notes TEXT,
  status TEXT DEFAULT 'NOVO', -- 'NOVO', 'EM_ATENDIMENTO', 'PROPOSTA_ENVIADA', 'FECHADO'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Sessões de Atendimento
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  jid TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INITIAL_MENU', -- 'INITIAL_MENU', 'AI_ATTENDANT', 'HUMAN_ATTENDANT'
  last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Histórico de Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  jid TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' ou 'model'
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Autenticação do WhatsApp (Para persistência 24/7 na Nuvem)
CREATE TABLE IF NOT EXISTS bot_auth (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para consultas ultra-rápidas
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_jid ON sessions(jid);
CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages(jid);
