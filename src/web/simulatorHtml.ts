export const SIMULATOR_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simulador WhatsApp - Limiro Brasil</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    }

    body {
      background: #0c1317;
      color: #e9edef;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .app-container {
      display: flex;
      width: 100%;
      max-width: 1200px;
      height: 90vh;
      background: #111b21;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.75);
      border: 1px solid #222e35;
    }

    /* Painel Lateral de Controle & Leads */
    .sidebar {
      width: 380px;
      background: #111b21;
      border-right: 1px solid #222e35;
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 16px 20px;
      background: #202c33;
      border-bottom: 1px solid #222e35;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sidebar-header h2 {
      font-size: 16px;
      color: #00a884;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sidebar-content {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .control-card {
      background: #182229;
      border-radius: 12px;
      padding: 16px;
      border: 1px solid #222e35;
    }

    .control-card h3 {
      font-size: 14px;
      color: #8696a0;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .phone-input-group {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }

    .phone-input-group input {
      flex: 1;
      background: #111b21;
      border: 1px solid #2a3942;
      border-radius: 8px;
      padding: 10px 12px;
      color: #e9edef;
      font-size: 14px;
      outline: none;
    }

    .phone-input-group input:focus {
      border-color: #00a884;
    }

    .btn {
      background: #00a884;
      color: #111b21;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn:hover {
      background: #06cf9c;
    }

    .btn-secondary {
      background: #202c33;
      color: #e9edef;
      border: 1px solid #2a3942;
      width: 100%;
      margin-top: 8px;
    }

    .btn-secondary:hover {
      background: #2a3942;
    }

    .quick-tests {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .quick-btn {
      background: #202c33;
      border: 1px solid #2a3942;
      color: #cbd5e1;
      padding: 10px 12px;
      border-radius: 8px;
      text-align: left;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-btn:hover {
      background: #2a3942;
      border-color: #00a884;
      color: #fff;
    }

    .lead-info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #202c33;
      font-size: 13px;
    }

    .lead-info-item:last-child {
      border-bottom: none;
    }

    .lead-info-item .label {
      color: #8696a0;
    }

    .lead-info-item .value {
      color: #e9edef;
      font-weight: 500;
    }

    .badge-status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: #00a884;
      color: #111b21;
    }

    /* Área Principal de Chat (WhatsApp Web Clone) */
    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #0b141a;
      position: relative;
    }

    .chat-header {
      padding: 12px 20px;
      background: #202c33;
      display: flex;
      align-items: center;
      gap: 15px;
      border-bottom: 1px solid #222e35;
      z-index: 10;
    }

    .avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00a884, #06cf9c);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: bold;
      color: #111b21;
    }

    .chat-header-info h1 {
      font-size: 16px;
      color: #e9edef;
      font-weight: 600;
    }

    .chat-header-info p {
      font-size: 12px;
      color: #8696a0;
    }

    .chat-header-info p.typing {
      color: #00a884;
      font-weight: 600;
    }

    /* Mensagens */
    .messages-container {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background-color: #0b141a;
      background-image: radial-gradient(#182229 1px, transparent 1px);
      background-size: 24px 24px;
    }

    .message-row {
      display: flex;
      flex-direction: column;
      max-width: 75%;
    }

    .message-row.user {
      align-self: flex-end;
    }

    .message-row.bot {
      align-self: flex-start;
    }

    .bubble {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14.5px;
      line-height: 1.45;
      position: relative;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .message-row.user .bubble {
      background: #005c4b;
      color: #e9edef;
      border-top-right-radius: 0;
    }

    .message-row.bot .bubble {
      background: #202c33;
      color: #e9edef;
      border-top-left-radius: 0;
    }

    .bubble-time {
      font-size: 11px;
      color: #8696a0;
      float: right;
      margin-left: 12px;
      margin-top: 4px;
    }

    /* Botões Interativos do WhatsApp */
    .button-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }

    .interactive-btn {
      background: #111b21;
      border: 1px solid #00a884;
      color: #00a884;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    }

    .interactive-btn:hover {
      background: #00a884;
      color: #111b21;
    }

    /* Digitando Indicator */
    .typing-indicator {
      display: none;
      align-self: flex-start;
      background: #202c33;
      padding: 10px 16px;
      border-radius: 18px;
      margin-bottom: 8px;
    }

    .typing-indicator span {
      height: 8px;
      width: 8px;
      float: left;
      margin: 0 2px;
      background-color: #8696a0;
      display: block;
      border-radius: 50%;
      opacity: 0.4;
      animation: wave 1.3s infinite ease-in-out;
    }

    .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes wave {
      0%, 60%, 100% { transform: initial; }
      30% { transform: translateY(-7px); }
    }

    /* Barra de Digitação */
    .chat-footer {
      padding: 12px 16px;
      background: #202c33;
      display: flex;
      align-items: center;
      gap: 12px;
      border-top: 1px solid #222e35;
    }

    .chat-input {
      flex: 1;
      background: #2a3942;
      border: none;
      border-radius: 8px;
      padding: 12px 16px;
      color: #e9edef;
      font-size: 15px;
      outline: none;
    }

    .chat-input::placeholder {
      color: #8696a0;
    }

    .send-btn {
      background: #00a884;
      border: none;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #111b21;
      transition: background 0.2s, transform 0.1s;
    }

    .send-btn:hover {
      background: #06cf9c;
    }

    .send-btn:active {
      transform: scale(0.95);
    }
  </style>
</head>
<body>

  <div class="app-container">
    <!-- Barra Lateral -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>🧪 Simulador Limiro Brasil</h2>
        <span class="badge-status" id="dbStatus">Supabase Conectado</span>
      </div>

      <div class="sidebar-content">
        <!-- Controle de Contato -->
        <div class="control-card">
          <h3>📱 Número do Cliente Fictício</h3>
          <div class="phone-input-group">
            <input type="text" id="phoneInput" value="5511999998888" placeholder="Ex: 5511999998888" />
            <button class="btn" onclick="changePhone()">Trocar</button>
          </div>
          <button class="btn btn-secondary" onclick="resetChat()">🔄 Reiniciar Conversa (!reset)</button>
        </div>

        <!-- Atalhos Rápidos para Testes -->
        <div class="control-card">
          <h3>⚡ Cenários Prontos de Teste</h3>
          <div class="quick-tests">
            <button class="quick-btn" onclick="sendQuickMessage('Olá, boa tarde!')">1. "Olá, boa tarde!" (Ver Menu)</button>
            <button class="quick-btn" onclick="sendQuickMessage('1')">2. Escolher Opção 1 (Atendimento IA)</button>
            <button class="quick-btn" onclick="sendQuickMessage('Quanto custa para criar um agente de IA?')">3. Pergunta de Preço (Agente IA)</button>
            <button class="quick-btn" onclick="sendQuickMessage('Meu nome é Carlos, sou da Academia Fit de Goiânia e quero automação')">4. Passar dados da empresa</button>
            <button class="quick-btn" onclick="sendQuickMessage('2')">5. Escolher Opção 2 (Falar com Humano)</button>
          </div>
        </div>

        <!-- Informações do Lead Capturado -->
        <div class="control-card">
          <h3>📊 Dados Coletados pela IA</h3>
          <div class="lead-info-item">
            <span class="label">Status Conversa:</span>
            <span class="value" id="leadStatus">INITIAL_MENU</span>
          </div>
          <div class="lead-info-item">
            <span class="label">Nome:</span>
            <span class="value" id="leadName">-</span>
          </div>
          <div class="lead-info-item">
            <span class="label">Empresa:</span>
            <span class="value" id="leadCompany">-</span>
          </div>
          <div class="lead-info-item">
            <span class="label">Cidade:</span>
            <span class="value" id="leadCity">-</span>
          </div>
          <div class="lead-info-item">
            <span class="label">Serviço:</span>
            <span class="value" id="leadService">-</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Área de Chat -->
    <div class="chat-area">
      <div class="chat-header">
        <div class="avatar">🤖</div>
        <div class="chat-header-info">
          <h1>Limiro Brasil</h1>
          <p id="botStatusText">Online • Atendente Inteligente</p>
        </div>
      </div>

      <div class="messages-container" id="messagesContainer">
        <!-- Mensagem de boas-vindas inicial do simulador -->
        <div class="message-row bot">
          <div class="bubble">
            👋 Olá! Este é o <b>Simulador Visual de WhatsApp da Limiro Brasil</b>.
            
Envie uma mensagem abaixo (ex: <i>"Olá"</i>) ou clique em um dos testes rápidos na barra lateral para começar a interagir com a IA!
            <span class="bubble-time" id="initTime">Agora</span>
          </div>
        </div>
      </div>

      <!-- Indicador digitando -->
      <div class="typing-indicator" id="typingIndicator">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <!-- Barra de Envio -->
      <div class="chat-footer">
        <input 
          type="text" 
          id="messageInput" 
          class="chat-input" 
          placeholder="Digite uma mensagem como cliente..." 
          autocomplete="off"
          onkeypress="handleKeyPress(event)"
        />
        <button class="send-btn" onclick="sendMessage()">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M1.101 21.757L23.8 12.028 1.101 2.3 1 9.948l15.5 2.08L1 14.11z"></path>
          </svg>
        </button>
      </div>
    </div>
  </div>

  <script>
    let currentPhone = '5511999998888';

    function getTime() {
      const now = new Date();
      return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    }

    document.getElementById('initTime').textContent = getTime();

    function scrollToBottom() {
      const container = document.getElementById('messagesContainer');
      container.scrollTop = container.scrollHeight;
    }

    function addMessage(text, isUser = true, buttons = []) {
      const container = document.getElementById('messagesContainer');
      const row = document.createElement('div');
      row.className = 'message-row ' + (isUser ? 'user' : 'bot');

      let buttonsHtml = '';
      if (buttons && buttons.length > 0) {
        buttonsHtml = '<div class="button-group">' + buttons.map(b => 
          \`<button class="interactive-btn" onclick="sendButtonReply('\${b.buttonId || b.id}', '\${b.buttonText?.displayText || b.text}')">\${b.buttonText?.displayText || b.text}</button>\`
        ).join('') + '</div>';
      }

      row.innerHTML = \`
        <div class="bubble">
          \${escapeHtml(text)}
          \${buttonsHtml}
          <span class="bubble-time">\${getTime()}</span>
        </div>
      \`;

      container.appendChild(row);
      scrollToBottom();
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\\n/g, "<br>");
    }

    function handleKeyPress(e) {
      if (e.key === 'Enter') {
        sendMessage();
      }
    }

    function sendQuickMessage(text) {
      document.getElementById('messageInput').value = text;
      sendMessage();
    }

    function sendButtonReply(buttonId, text) {
      addMessage(text, true);
      processSimulation(text, buttonId);
    }

    async function sendMessage() {
      const input = document.getElementById('messageInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      addMessage(text, true);
      await processSimulation(text);
    }

    async function processSimulation(text, buttonId = '') {
      const typing = document.getElementById('typingIndicator');
      const botStatus = document.getElementById('botStatusText');

      typing.style.display = 'block';
      botStatus.textContent = 'digitando...';
      botStatus.className = 'typing';
      scrollToBottom();

      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: currentPhone,
            text: text,
            buttonId: buttonId
          })
        });

        const data = await response.json();

        typing.style.display = 'none';
        botStatus.textContent = 'Online • Atendente Inteligente';
        botStatus.className = '';

        if (data.responses && data.responses.length > 0) {
          for (const res of data.responses) {
            addMessage(res.text || '', false, res.buttons || []);
          }
        }

        // Atualiza painel de Lead
        if (data.session) {
          document.getElementById('leadStatus').textContent = data.session.status || 'INITIAL_MENU';
        }
        if (data.lead) {
          document.getElementById('leadName').textContent = data.lead.name || '-';
          document.getElementById('leadCompany').textContent = data.lead.company || '-';
          document.getElementById('leadCity').textContent = data.lead.city || '-';
          document.getElementById('leadService').textContent = data.lead.service || '-';
        }
      } catch (err) {
        typing.style.display = 'none';
        botStatus.textContent = 'Online';
        botStatus.className = '';
        addMessage('❌ Erro de comunicação com o servidor.', false);
      }
    }

    async function resetChat() {
      document.getElementById('messageInput').value = '!reset';
      sendMessage();
    }

    function changePhone() {
      const newPhone = document.getElementById('phoneInput').value.trim();
      if (!newPhone) return;
      currentPhone = newPhone;
      document.getElementById('messagesContainer').innerHTML = '';
      addMessage('📱 Conectado como novo cliente: +' + currentPhone, false);
      document.getElementById('leadStatus').textContent = 'INITIAL_MENU';
      document.getElementById('leadName').textContent = '-';
      document.getElementById('leadCompany').textContent = '-';
      document.getElementById('leadCity').textContent = '-';
      document.getElementById('leadService').textContent = '-';
    }
  </script>
</body>
</html>
`;
