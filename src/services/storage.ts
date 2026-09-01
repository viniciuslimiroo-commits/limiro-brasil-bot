import fs from 'fs';
import path from 'path';
import { supabaseService } from './supabase.js';

export type SessionStatus = 'INITIAL_MENU' | 'AI_ATTENDANT' | 'HUMAN_ATTENDANT';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface LeadData {
  name?: string;
  company?: string;
  city?: string;
  businessType?: string;
  service?: string;
  notes?: string;
  updatedAt: string;
}

export interface UserSession {
  jid: string;
  phone: string;
  status: SessionStatus;
  createdAt: number;
  lastInteraction: number;
  history: ChatMessage[];
  leadData: LeadData;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class StorageService {
  private sessions: Map<string, UserSession> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadSessions();
  }

  private loadSessions() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        const data: Record<string, UserSession> = JSON.parse(raw);
        for (const [key, val] of Object.entries(data)) {
          this.sessions.set(key, val);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar sessões salvas:', err);
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveSessionsNow();
      this.saveTimeout = null;
    }, 1000);
  }

  public saveSessionsNow() {
    try {
      const obj: Record<string, UserSession> = {};
      const leads: Record<string, LeadData & { phone: string }> = {};

      for (const [key, val] of this.sessions.entries()) {
        obj[key] = val;
        if (val.leadData && Object.keys(val.leadData).length > 1) {
          leads[key] = {
            phone: val.phone,
            ...val.leadData,
          };
        }
      }

      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
      fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
    } catch (err) {
      console.error('Erro ao salvar sessões em disco:', err);
    }
  }

  public getSession(jid: string): UserSession {
    const cleanPhone = jid.split('@')[0];
    let session = this.sessions.get(jid);

    if (!session) {
      session = {
        jid,
        phone: cleanPhone,
        status: 'INITIAL_MENU',
        createdAt: Date.now(),
        lastInteraction: Date.now(),
        history: [],
        leadData: {
          updatedAt: new Date().toISOString(),
        },
      };
      this.sessions.set(jid, session);
      this.scheduleSave();
      supabaseService.upsertSession(jid, cleanPhone, 'INITIAL_MENU');
    }

    return session;
  }

  public setSessionStatus(jid: string, status: SessionStatus) {
    const session = this.getSession(jid);
    session.status = status;
    session.lastInteraction = Date.now();
    this.scheduleSave();
    supabaseService.upsertSession(jid, session.phone, status);
  }

  public addMessage(jid: string, role: 'user' | 'model', text: string) {
    const session = this.getSession(jid);
    session.history.push({
      role,
      text,
      timestamp: Date.now(),
    });

    if (session.history.length > 30) {
      session.history = session.history.slice(-30);
    }

    session.lastInteraction = Date.now();
    this.scheduleSave();
    supabaseService.insertMessage(jid, role, text);
  }

  public resetSession(jid: string) {
    const session = this.getSession(jid);
    session.status = 'INITIAL_MENU';
    session.history = [];
    session.lastInteraction = Date.now();
    this.scheduleSave();
    supabaseService.upsertSession(jid, session.phone, 'INITIAL_MENU');
  }

  public updateLeadData(jid: string, data: Partial<LeadData>) {
    const session = this.getSession(jid);
    session.leadData = {
      ...session.leadData,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.scheduleSave();
    supabaseService.upsertLead(session.phone, session.leadData);
  }

  public getLeadData(jid: string): LeadData {
    return this.getSession(jid).leadData;
  }
}

export const storage = new StorageService();
