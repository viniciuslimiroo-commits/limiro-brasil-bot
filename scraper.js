import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { generateDiagnostic } from './geminiService.js';

// Caminhos padrão do Google Chrome / Chromium no Windows, Linux e Docker
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

export function getChromeExecutablePath() {
  for (const path of CHROME_PATHS) {
    if (fs.existsSync(path)) {
      return path;
    }
  }
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

/**
 * Limpa e formata o número de telefone para WhatsApp com DDI 55
 */
export function formatPhoneForWhatsApp(phoneStr) {
  if (!phoneStr) return null;
  // Remove tudo que não for dígito
  let digits = phoneStr.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;

  // Se começar com 0, remove
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // Se já tiver o 55 (Brasil) e tiver 12 ou 13 dígitos
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Se tiver 10 dígitos (DDD + 8 dígitos) ou 11 dígitos (DDD + 9 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits.length >= 10 ? `55${digits}` : null;
}

/**
 * Executa a busca de empresas no Google Maps
 * @param {Object} options
 * @param {string} options.query - Termo de busca (ex: salão de beleza)
 * @param {string} options.city - Cidade (ex: Senador Canedo)
 * @param {number} options.maxResults - Quantidade máxima de resultados
 * @param {Function} options.onLeadFound - Callback chamado para cada lead encontrado
 */
export async function scrapeGoogleMaps({ query, city = 'Senador Canedo', maxResults = 25, onLeadFound = () => {} }) {
  const executablePath = getChromeExecutablePath();
  console.log(`[SCRAPER] Iniciando navegador com Chrome: ${executablePath}`);

  const searchQuery = `${query} em ${city}`;
  const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}?hl=pt-BR`;

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
      '--lang=pt-BR'
    ]
  });

  const leads = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    
    // Define User Agent moderno para evitar bloqueios
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log(`[SCRAPER] Acessando URL: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Aceita cookies ou modal do Google se aparecer
    try {
      const consentButton = await page.$('button[aria-label*="Aceitar tudo"], button[aria-label*="Concordo"], form[action*="consent"] button');
      if (consentButton) await consentButton.click();
    } catch (_) {}

    // Aguarda o container de resultados carregar
    await page.waitForSelector('div[role="feed"], div[aria-label*="Resultados para"], a[href*="/maps/place/"]', { timeout: 15000 }).catch(() => {});

    // Scroll no feed de resultados para carregar mais empresas
    console.log(`[SCRAPER] Rolando resultados para carregar até ${maxResults >= 999 ? 'todas disponíveis' : maxResults} empresas...`);
    let previousCount = 0;
    let attempts = 0;
    const maxScrollAttempts = maxResults >= 999 ? 80 : Math.max(15, Math.ceil(maxResults / 3));

    while (attempts < maxScrollAttempts) {
      const currentItems = await page.$$('a[href*="/maps/place/"]');
      if (currentItems.length >= maxResults) {
        break;
      }

      // Verifica se chegou ao fim da lista do Google Maps
      const reachedEnd = await page.evaluate(() => {
        const text = document.body.innerText || '';
        return text.includes('Você chegou ao final da lista') || text.includes('Chegou ao fim da lista') || text.includes('Fim dos resultados');
      });

      if (reachedEnd && currentItems.length === previousCount) {
        console.log('[SCRAPER] Google Maps atingiu o final da lista de resultados na região.');
        break;
      }

      if (currentItems.length > 0 && currentItems.length === previousCount && attempts > 8) {
        break;
      }
      previousCount = currentItems.length;

      // Executa scroll no feed
      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
        } else {
          window.scrollBy(0, 1200);
        }
      });

      await new Promise(r => setTimeout(r, 1200));
      attempts++;
    }

    // Coleta todos os links de locais
    const placeLinks = await page.evaluate((limit) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      const unique = [];
      const seen = new Set();

      for (const a of anchors) {
        const href = a.href;
        // Pega o card pai
        const container = a.closest('div[jsaction*="mouseover"]') || a.parentElement;
        const name = a.getAttribute('aria-label') || container?.querySelector('.qBF1Pd, .fontHeadlineSmall')?.textContent?.trim() || '';

        if (name && !seen.has(name) && href.includes('/maps/place/')) {
          seen.add(name);
          unique.push({ name, href });
          if (unique.length >= limit) break;
        }
      }
      return unique;
    }, maxResults);

    console.log(`[SCRAPER] Encontrados ${placeLinks.length} estabelecimentos. Extraindo detalhes de cada um...`);

    // Visita ou clica em cada local para extrair telefone, site, nota e endereço
    for (let i = 0; i < placeLinks.length; i++) {
      const item = placeLinks[i];
      try {
        await page.goto(item.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 1200));

        const details = await page.evaluate(() => {
          const nameElem = document.querySelector('h1.DUwDvf, .fontHeadlineLarge, h1');
          const name = nameElem ? nameElem.textContent.trim() : '';

          // Nota e avaliações
          const ratingElem = document.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf');
          const rating = ratingElem ? ratingElem.textContent.trim() : null;

          const reviewsElem = document.querySelector('div.F7nice span[aria-label*="avalia"], span[aria-label*="classifica"]');
          let reviewsCount = 0;
          if (reviewsElem) {
            const raw = reviewsElem.getAttribute('aria-label') || reviewsElem.textContent || '';
            const match = raw.replace(/\./g, '').match(/\d+/);
            if (match) reviewsCount = parseInt(match[0], 10);
          }

          // Categoria
          const categoryElem = document.querySelector('button.DkEaL, span.Y0A0hc, .fontBodyMedium');
          const category = categoryElem ? categoryElem.textContent.trim() : '';

          // Telefone
          let phone = null;
          const phoneBtn = document.querySelector('button[data-item-id*="phone:"], button[data-tooltip*="telefone" i], a[href^="tel:"]');
          if (phoneBtn) {
            const rawPhone = phoneBtn.getAttribute('data-item-id') || phoneBtn.getAttribute('aria-label') || phoneBtn.textContent || '';
            phone = rawPhone.replace('phone:tel:', '').replace('phone:', '').replace('Copiar número de telefone', '').trim();
          }

          // Website
          let website = null;
          const webBtn = document.querySelector('a[data-item-id*="authority"], a[data-tooltip*="site" i], a[aria-label*="site" i], a[aria-label*="Website" i]');
          if (webBtn) {
            website = webBtn.href;
          }

          // Endereço
          let address = null;
          const addrBtn = document.querySelector('button[data-item-id*="address"], button[data-tooltip*="endereço" i]');
          if (addrBtn) {
            address = (addrBtn.getAttribute('aria-label') || addrBtn.textContent || '').replace('Endereço: ', '').trim();
          }

          return { name, rating, reviewsCount, category, phone, website, address };
        });

        const finalName = details.name || item.name;
        const formattedWhatsApp = formatPhoneForWhatsApp(details.phone);

        const lead = {
          id: `lead_${Date.now()}_${i}`,
          name: finalName,
          category: details.category || query,
          city: city,
          phone: details.phone || 'Não informado',
          whatsapp: formattedWhatsApp,
          hasWhatsApp: !!formattedWhatsApp,
          website: details.website || '',
          hasWebsite: !!(details.website && !details.website.includes('google.com')),
          address: details.address || `${city} - GO`,
          rating: details.rating || 'N/A',
          reviewsCount: details.reviewsCount || 0,
          mapsUrl: item.href,
          searchedAt: new Date().toISOString(),
          status: 'NOVO'
        };

        // Gera diagnóstico da Limiro Brasil
        const diagnostic = generateDiagnostic(lead);
        lead.opportunities = diagnostic.opportunities;
        lead.suggestedPitch = diagnostic.suggestedPitch;

        leads.push(lead);
        onLeadFound(lead, i + 1, placeLinks.length);
        console.log(`[SCRAPER] [${i + 1}/${placeLinks.length}] Lead extraído: ${lead.name} | Tel: ${lead.phone} | Site: ${lead.hasWebsite ? 'Sim' : 'Não'}`);

      } catch (placeErr) {
        console.error(`[SCRAPER] Erro ao extrair dados de ${item.name}:`, placeErr.message);
      }
    }

  } catch (err) {
    console.error('[SCRAPER] Erro geral durante o scraping:', err);
    throw err;
  } finally {
    await browser.close();
    console.log(`[SCRAPER] Busca finalizada com ${leads.length} leads obtidos.`);
  }

  return leads;
}
