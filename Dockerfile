FROM node:20-slim

# Instala dependências necessárias para o Chrome/Puppeteer no Linux/Render
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libnss3 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configura o caminho do Chromium para o Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=3340

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3340

CMD ["node", "server.js"]
