# 🤖 Limiro Brasil - Agente Inteligente para WhatsApp

Sistema de atendimento virtual e qualificação de clientes no WhatsApp para a **Limiro Brasil**, construído em **Node.js / TypeScript**, **Baileys** (conexão direta via QR Code sem custos de API) e **Google Gemini**.

---

## 🌟 Funcionalidades

- **Conexão Direta por QR Code**: Não precisa pagar mensalidades de APIs terceiras de WhatsApp.
- **Cérebro com Google Gemini**: Atendimento natural, acolhedor, rápido e com contexto conversacional contínuo.
- **Menu Inicial Interativo**:
  - `1️⃣ Atendimento com IA 🤖`: Tirar dúvidas, conhecer serviços, coletar informações e qualificar o cliente.
  - `2️⃣ Falar com atendente 👤`: Pausa automática da IA para que a equipe humana atenda diretamente no WhatsApp.
- **Regras Comerciais da Limiro Brasil**:
  - Nunca informa valores/preços fixos ou prazos automaticamente.
  - Apresenta os serviços: *Criação de Agentes de IA, Sites Profissionais, Aplicativos Mobile, Agendamento Online e Automações*.
  - Coleta progressiva e natural de dados (Nome, Empresa, Cidade, Segmento, Necessidade).
- **Simulação de Digitação Humana**: Envia o status de *"digitando..."* antes de responder para maior naturalidade.
- **Persistência de Sessões e Leads**: Salva o histórico e os contatos coletados na pasta `data/`.

---

## 🚀 Como Instalar e Rodar

### 1. Pré-requisitos
- **Node.js** (versão 18 ou superior instalada no computador)
- Uma chave da API do Google Gemini (gratuita)

### 2. Obter a Chave do Google Gemini
1. Acesse: [Google AI Studio](https://aistudio.google.com/)
2. Clique em **Get API key** e crie uma chave de API gratuita.
3. Copie a chave gerada.

### 3. Configurar as Variáveis de Ambiente
Abra o arquivo `.env` na raiz do projeto e insira sua chave:

```env
GEMINI_API_KEY=sua_chave_gemini_aqui
GEMINI_MODEL=gemini-2.5-flash
```

### 4. Instalar as Dependências
Abra o terminal na pasta do projeto e execute:

```bash
npm install
```

### 5. Iniciar o Atendente
Para rodar em modo de desenvolvimento:

```bash
npm run dev
```

Assim que o terminal iniciar, será exibido o **QR Code**. 
Basta abrir o WhatsApp no celular:
> **WhatsApp > Aparelhos Conectados > Conectar um Aparelho** e escanear o código no terminal.

---

## ⚙️ Comandos Especiais no Chat (WhatsApp)

- `!menu` ou `menu principal`: Reinicia a conversa e envia o menu inicial de opções.
- `!ia`: Força a reativação do modo de IA para a conversa atual.
- `!humano`: Pausa a IA e transfere para atendimento humano.

---

## 📁 Estrutura de Pastas

```
├── src/
│   ├── index.ts               # Ponto de entrada
│   ├── config/
│   │   ├── env.ts             # Configurações do .env
│   │   └── prompt.ts          # Persona e regras da Limiro Brasil
│   ├── services/
│   │   ├── gemini.ts          # Chamadas à API Gemini
│   │   └── storage.ts         # Memória e salvamento de leads
│   └── whatsapp/
│       ├── client.ts          # Conexão Baileys e QR Code
│       ├── handler.ts         # Lógica de fluxo de mensagens
│       ├── menu.ts            # Textos dos menus e boas-vindas
│       └── messageSender.ts   # Envio com efeito de digitação
├── data/                      # Sessões salvas e leads coletados
├── .env                       # Suas credenciais
└── package.json
```
