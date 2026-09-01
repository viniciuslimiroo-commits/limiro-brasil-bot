import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { LeadData, SessionStatus } from './storage.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Conectado ao banco de dados na nuvem (Supabase)!');
  } catch (err) {
    console.error('⚠️ Erro ao inicializar cliente Supabase:', err);
  }
} else {
  console.log('ℹ️ Supabase não configurado no .env. Utilizando armazenamento local com alta performance.');
}

export const supabaseService = {
  isAvailable(): boolean {
    return !!supabase;
  },

  async upsertSession(jid: string, phone: string, status: SessionStatus) {
    if (!supabase) return;
    try {
      await supabase
        .from('sessions')
        .upsert(
          {
            jid,
            phone,
            status,
            last_interaction: new Date().toISOString(),
          },
          { onConflict: 'jid' }
        );
    } catch (error) {
      console.error('Erro ao sincronizar sessão no Supabase:', error);
    }
  },

  async insertMessage(jid: string, role: 'user' | 'model', text: string) {
    if (!supabase) return;
    try {
      await supabase.from('messages').insert({
        jid,
        role,
        text,
      });
    } catch (error) {
      console.error('Erro ao sincronizar mensagem no Supabase:', error);
    }
  },

  async upsertLead(phone: string, lead: Partial<LeadData>) {
    if (!supabase) return;
    try {
      await supabase
        .from('leads')
        .upsert(
          {
            phone,
            name: lead.name || null,
            company: lead.company || null,
            city: lead.city || null,
            business_type: lead.businessType || null,
            service_interest: lead.service || null,
            notes: lead.notes || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'phone' }
        );
    } catch (error) {
      console.error('Erro ao sincronizar lead no Supabase:', error);
    }
  },

  async saveAuthState(authData: Record<string, string>) {
    if (!supabase) return;
    try {
      await supabase
        .from('bot_auth')
        .upsert(
          {
            id: 'limiro_brasil_session',
            data: authData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
    } catch (err) {
      console.error('Erro ao salvar estado de autenticação no Supabase:', err);
    }
  },

  async loadAuthState(): Promise<Record<string, string> | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('bot_auth')
        .select('data')
        .eq('id', 'limiro_brasil_session')
        .maybeSingle();

      if (error || !data) return null;
      return data.data as Record<string, string>;
    } catch (err) {
      console.error('Erro ao carregar estado de autenticação do Supabase:', err);
      return null;
    }
  },
};
