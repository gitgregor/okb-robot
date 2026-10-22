const IS_DEV = Boolean(import.meta.env?.DEV);

// Note: In production (GitHub Pages static SPA), only www.okx.com sends
// Access-Control-Allow-Origin headers for browser CORS requests; eea.okx.com
// and us.okx.com omit CORS headers and trigger "Failed to fetch" in browsers.
const REGION_PROXY_MAP = IS_DEV
  ? {
      global: '/okx-global',
      eea: '/okx-eea',
      us: '/okx-us',
    }
  : {
      global: 'https://www.okx.com',
      eea: 'https://www.okx.com',
      us: 'https://www.okx.com',
    };

export const OKX_REGIONS = [
  { id: 'global', label: 'Global (www.okx.com)' },
  { id: 'eea', label: 'EEA / Europe (eea.okx.com)' },
  { id: 'us', label: 'US (us.okx.com)' },
];

export const MARKET_CATEGORIES = [
  { id: 'SPOT', label: 'Spot', desc: 'Wszystkie pary Spot oraz tokenizowane akcje i surowce' },
  { id: 'SWAP', label: 'Perpetual (SWAP)', desc: 'Kontrakty bezterminowe Krypto, Akcje, Surowce i Pre-Market' },
  { id: 'PREMARKET', label: '🔥 Pre-Market & Pre-IPO', desc: 'Anthropic, OpenAI, SpaceX, Moonshot, Oura, Unitree, MiniMax...' },
  { id: 'STOCKS', label: '📈 Tokenizowane Akcje', desc: 'Tokenizowane akcje Spot (xStocks) oraz kontrakty Swap na akcje' },
  { id: 'COMMODITIES', label: '🛢️ Surowce / Commodities', desc: 'Złoto (PAXG, XAUT, XAU), Srebro (XAG), Ropa (CL, XUSO), Gaz (NG), Uran (XURNM), Ziemie Rzadkie...' },
  { id: 'FUTURES', label: 'Futures / XPERP', desc: 'Kontrakty terminowe Futures oraz XPERP' },
  { id: 'MARGIN', label: 'Spot Margin', desc: 'Handel Spot z pożyczką i dźwignią' },
];

// Non-stock crypto tickers that happen to start with 'X' on Spot
const CRYPTO_X_EXCLUSIONS = new Set([
  'XRP',
  'XLM',
  'XTZ',
  'XCH',
  'XAUT',
  'XPL',
  'XDP',
  'XEM',
  'XMR',
  'XEC',
  'XDC',
  'XVG',
  'XVS',
  'XAI',
  'XNO',
  'XCN',
  'XPRT',
  'XETA',
]);

// Known Commodity / Precious Metal / Energy / Raw Material bases on OKX
export const COMMODITY_LABELS = {
  PAXG: 'Złoto Tokenizowane (PAX Gold)',
  XAUT: 'Złoto Tokenizowane (Tether Gold)',
  XAU: 'Złoto (Gold Spot / Perp)',
  XAG: 'Srebro (Silver Spot / Perp)',
  CL: 'Ropa WTI (Crude Oil)',
  XUSO: 'Ropa ETF Tokenizowany (USO)',
  USO: 'Ropa ETF (United States Oil)',
  NG: 'Gaz Ziemny (Natural Gas)',
  XXLE: 'Energia ETF Tokenizowany (XLE)',
  XLE: 'Energia Sekt. ETF (XLE)',
  XURNM: 'Uran Tokenizowany (Sprott Uranium)',
  URNM: 'Uran ETF (Sprott Uranium)',
  XUSAR: 'Metale Ziem Rzadkich (USA Rare Earth)',
  USAR: 'Metale Ziem Rzadkich (USA Rare Earth)',
  SLX: 'Stal i Rudy (VanEck Steel ETF)',
  XDRAM: 'Pamięć DRAM Indeks Tokenizowany',
  DRAM: 'Pamięć DRAM Kontrakt',
  XRAM: 'Pamięć RAM Tokenizowany',
};

const COMMODITY_BASES = new Set(Object.keys(COMMODITY_LABELS));

// Known equity / stock / ETF / pre-IPO underlying tickers on OKX SWAP & FUTURES
const EQUITY_AND_PREIPO_BASES = new Set([
  'ANTHROPIC',
  'OPENAI',
  'MOONSHOT',
  'OURA',
  'SPCX',
  'SHEIN',
  'UNITREE',
  'MINIMAX',
  'ZHIPU',
  'CXMT',
  'AAPL',
  'MSFT',
  'NVDA',
  'TSLA',
  'GOOGL',
  'AMZN',
  'META',
  'MSTR',
  'COIN',
  'PLTR',
  'AMD',
  'INTC',
  'NFLX',
  'ORCL',
  'QCOM',
  'SMCI',
  'TSM',
  'ARM',
  'ASML',
  'AVGO',
  'MU',
  'MRVL',
  'DELL',
  'HOOD',
  'CRWD',
  'SNOW',
  'CRM',
  'ADBE',
  'CSCO',
  'IBM',
  'NOW',
  'OKTA',
  'SHOP',
  'TWLO',
  'UBER',
  'ABNB',
  'DKNG',
  'RBLX',
  'RDDT',
  'RKLB',
  'IONQ',
  'IREN',
  'NBIS',
  'CRWV',
  'CRCL',
  'CORZ',
  'MARA',
  'RIOT',
  'CLSK',
  'HUT',
  'WULF',
  'GME',
  'AMC',
  'RIVN',
  'LCID',
  'BABA',
  'JD',
  'PDD',
  'BIDU',
  'NIO',
  'XPEV',
  'LI',
  'XIAOMI',
  'SAMSUNG',
  'SKHYNIX',
  'SKHY',
  'SOFTBANK',
  'SONY',
  'BRKB',
  'JPM',
  'V',
  'MA',
  'BAC',
  'GS',
  'MS',
  'BLK',
  'BX',
  'KO',
  'PEP',
  'MCD',
  'SBUX',
  'NKE',
  'DIS',
  'WMT',
  'COST',
  'HD',
  'LLY',
  'UNH',
  'JNJ',
  'PFE',
  'MRNA',
  'ISRG',
  'BA',
  'CAT',
  'GE',
  'GEV',
  'LMT',
  'RTX',
  'XOM',
  'CVX',
  'SPY',
  'QQQ',
  'TQQQ',
  'SQQQ',
  'SOXL',
  'SOXS',
  'IWM',
  'SMH',
  'TLT',
  'TMF',
  'EWY',
  'EWJ',
  'EWZ',
  'EWT',
  'UVXY',
  'US100',
]);

const PREIPO_BASES = new Set([
  'ANTHROPIC',
  'OPENAI',
  'MOONSHOT',
  'OURA',
  'SPCX',
  'XSPCX',
  'SHEIN',
  'XSHEIN',
  'UNITREE',
  'MINIMAX',
  'ZHIPU',
  'CXMT',
]);

function extractBaseSymbol(inst) {
  if (!inst) return '';
  return (
    inst.baseCcy ||
    inst.ctValCcy ||
    inst.instId?.split('-')[0] ||
    ''
  ).toUpperCase();
}

/**
 * Helper to get human-readable Polish description for a commodity instrument if applicable.
 */
export function getCommodityDescription(inst) {
  const base = extractBaseSymbol(inst);
  return COMMODITY_LABELS[base] || null;
}

/**
 * Helper to classify whether an OKX instrument is a Tokenized Commodity / Precious Metal / Energy.
 */
export function isCommodityInstrument(inst) {
  if (!inst) return false;
  const base = extractBaseSymbol(inst);
  return COMMODITY_BASES.has(base);
}

/**
 * Helper to classify whether an OKX instrument is Pre-Market / Pre-IPO.
 */
export function isPreMarketInstrument(inst) {
  if (!inst) return false;
  if (inst.ruleType === 'pre_market') return true;
  const base = extractBaseSymbol(inst);
  return PREIPO_BASES.has(base);
}

/**
 * Helper to classify whether an OKX instrument is a Tokenized Stock / Equity / ETF.
 */
export function isStockInstrument(inst) {
  if (!inst) return false;
  const base = extractBaseSymbol(inst);

  if (inst.instType === 'SPOT') {
    if (
      base.startsWith('X') &&
      base.length >= 3 &&
      base.length <= 6 &&
      !CRYPTO_X_EXCLUSIONS.has(base) &&
      !COMMODITY_BASES.has(base)
    ) {
      return true;
    }
    return false;
  }

  if (EQUITY_AND_PREIPO_BASES.has(base)) {
    return true;
  }
  return false;
}

/**
 * Generates an ISO 8601 UTC timestamp string
 * required by the OK-ACCESS-TIMESTAMP header.
 */
function getIsoTimestamp() {
  return new Date().toISOString();
}

function sanitizeKeyToken(str) {
  return String(str || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
}

/**
 * Computes the Base64-encoded HMAC-SHA256 signature required by OKX V5 API.
 */
async function signOkxPayload(message, secretKey) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(sanitizeKeyToken(secretKey));
  const msgData = encoder.encode(message);

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const signatureBytes = new Uint8Array(signatureBuffer);
  let binary = '';
  for (let i = 0; i < signatureBytes.byteLength; i++) {
    binary += String.fromCharCode(signatureBytes[i]);
  }
  return window.btoa(binary);
}

/**
 * WebSocket fallback cache & helper for public market data (tickers & books5)
 * in case a browser extension, ISP, or CORS preflight blocks REST fetch.
 */
const wsMarketCache = {
  tickers: {},
  books: {},
};
let publicWs = null;
let publicWsReady = false;
const subscribedChannels = new Set();

function ensurePublicWebSocket(instId) {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
  const subKey = `tickers:${instId}`;

  const sendSub = (ws, id) => {
    try {
      ws.send(
        JSON.stringify({
          op: 'subscribe',
          args: [
            { channel: 'tickers', instId: id },
            { channel: 'books5', instId: id },
          ],
        })
      );
      subscribedChannels.add(`tickers:${id}`);
    } catch {
      // ignore
    }
  };

  if (publicWs && publicWs.readyState === WebSocket.OPEN) {
    if (!subscribedChannels.has(subKey)) {
      sendSub(publicWs, instId);
    }
    return;
  }

  if (publicWs && publicWs.readyState === WebSocket.CONNECTING) {
    return;
  }

  try {
    publicWs = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    publicWs.onopen = () => {
      publicWsReady = true;
      sendSub(publicWs, instId);
    };
    publicWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.arg?.channel === 'tickers' && msg.data?.[0]) {
          wsMarketCache.tickers[msg.arg.instId] = msg.data[0];
        } else if (msg.arg?.channel === 'books5' && msg.data?.[0]) {
          wsMarketCache.books[msg.arg.instId] = msg.data[0];
        }
      } catch {
        // ignore parse errors
      }
    };
    publicWs.onerror = () => {
      publicWsReady = false;
    };
    publicWs.onclose = () => {
      publicWsReady = false;
      publicWs = null;
      subscribedChannels.clear();
    };
  } catch {
    // ignore WebSocket creation errors
  }
}

function waitForWsSnapshot(type, instId, timeoutMs = 2500) {
  ensurePublicWebSocket(instId);
  const store = type === 'ticker' ? wsMarketCache.tickers : wsMarketCache.books;
  if (store[instId]) {
    return Promise.resolve(store[instId]);
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (store[instId]) {
        clearInterval(timer);
        resolve(store[instId]);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 120);
  });
}

/**
 * Core helper for sending public or authenticated requests to OKX V5 API.
 * Uses CORS Simple Requests (no custom headers) for unauthenticated GET calls
 * so browsers do not trigger OPTIONS preflight requests.
 */
async function okxRequest({
  method = 'GET',
  requestPath,
  body = null,
  credentials = null,
  regionOverride = null,
}) {
  const upperMethod = method.toUpperCase();
  const bodyString = body ? JSON.stringify(body) : '';
  const headers = {};

  const regionKey = regionOverride || credentials?.region || 'global';
  const proxyPrefix = REGION_PROXY_MAP[regionKey] || REGION_PROXY_MAP.global;

  if (upperMethod === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  if (credentials) {
    const { apiKey, secretKey, passphrase, isDemo } = credentials;
    if (!apiKey || !secretKey || !passphrase) {
      throw new Error('Brak kluczy OKX API (API Key, Secret Key lub Passphrase).');
    }

    const timestamp = getIsoTimestamp();
    const prehash = `${timestamp}${upperMethod}${requestPath}${bodyString}`;
    const signature = await signOkxPayload(prehash, secretKey);

    headers['Content-Type'] = 'application/json';
    headers['OK-ACCESS-KEY'] = sanitizeKeyToken(apiKey);
    headers['OK-ACCESS-SIGN'] = signature;
    headers['OK-ACCESS-TIMESTAMP'] = timestamp;
    headers['OK-ACCESS-PASSPHRASE'] = String(passphrase).trim();

    if (isDemo) {
      headers['x-simulated-trading'] = '1';
    }
  }

  const hasHeaders = Object.keys(headers).length > 0;
  const fetchOptions = {
    method: upperMethod,
    ...(hasHeaders ? { headers } : {}),
    ...(upperMethod === 'POST' ? { body: bodyString } : {}),
  };

  let response;
  let lastNetworkErr;
  const maxAttempts = credentials ? 1 : 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      response = await fetch(`${proxyPrefix}${requestPath}`, fetchOptions);
      lastNetworkErr = null;
      break;
    } catch (err) {
      lastNetworkErr = err;
      if (attempt + 1 < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  if (lastNetworkErr) {
    throw lastNetworkErr;
  }

  const json = await response.json().catch(() => null);

  if (!response.ok && !json) {
    throw new Error(`HTTP Error ${response.status}`);
  }

  if (json && json.code !== '0') {
    const detailError =
      json.data?.[0]?.sMsg || json.msg || `OKX Error Code ${json.code}`;
    const error = new Error(`${detailError} (code: ${json.code})`);
    error.code = String(json.code);
    throw error;
  }

  return json?.data || [];
}

// Cache of numeric instIdCode & metadata per instId (required by OKX V5 WebSocket trade operations)
const instIdCodeCache = new Map();
const instInfoCache = new Map();
const regionalWsCatalogCache = new Map();

const PUBLIC_WS_URLS = {
  global_live: 'wss://ws.okx.com:8443/ws/v5/public',
  global_demo: 'wss://wspap.okx.com:8443/ws/v5/public',
  eea_live: 'wss://wseea.okx.com/ws/v5/public',
  eea_demo: 'wss://wseeapap.okx.com/ws/v5/public',
  us_live: 'wss://wsus.okx.com/ws/v5/public',
  us_demo: 'wss://wsuspap.okx.com/ws/v5/public',
};

function cacheInstrumentsMetadata(list) {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item?.instId) continue;
    instInfoCache.set(item.instId, item);
    if (item.instIdCode !== undefined && item.instIdCode !== null && item.instIdCode !== '') {
      const numCode = Number(item.instIdCode);
      if (!Number.isNaN(numCode)) {
        instIdCodeCache.set(item.instId, numCode);
      }
    }
  }
}

/**
 * Fetch exact regional & demo/live instrument catalog via OKX V5 Public WebSocket
 * (bypasses browser REST CORS on eea.okx.com and returns exact regional instId + instIdCode).
 */
export async function fetchRegionalInstrumentsViaWs(
  instType = 'SPOT',
  region = 'global',
  isDemo = false
) {
  const cacheKey = `${region || 'global'}_${isDemo ? 'demo' : 'live'}_${instType}`;
  const cached = regionalWsCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000 && cached.data?.length > 0) {
    return cached.data;
  }

  const wsUrlKey = `${region || 'global'}_${isDemo ? 'demo' : 'live'}`;
  const wsUrl = PUBLIC_WS_URLS[wsUrlKey] || PUBLIC_WS_URLS.global_live;

  return new Promise((resolve) => {
    let settled = false;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve(null);
      }
    }, 3200);

    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            op: 'subscribe',
            args: [{ channel: 'instruments', instType }],
          })
        );
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.arg?.channel === 'instruments' && Array.isArray(msg.data) && msg.data.length > 0) {
          cacheInstrumentsMetadata(msg.data);
          regionalWsCatalogCache.set(cacheKey, { ts: Date.now(), data: msg.data });
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try {
              ws.close();
            } catch {
              // ignore
            }
            resolve(msg.data);
          }
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };
  });
}

/**
 * Fetch all available instruments for a given instType ('SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN').
 */
export async function fetchAllInstruments(
  instType = 'SPOT',
  region = 'global',
  isDemo = false
) {
  if (!IS_DEV && (region === 'eea' || region === 'us' || isDemo)) {
    const wsData = await fetchRegionalInstrumentsViaWs(instType, region, isDemo);
    if (Array.isArray(wsData) && wsData.length > 0) {
      return wsData;
    }
  }
  const data = await okxRequest({
    method: 'GET',
    requestPath: `/api/v5/public/instruments?instType=${encodeURIComponent(instType)}`,
    regionOverride: region,
  });
  cacheInstrumentsMetadata(data);
  return data;
}

/**
 * Fetch all live market tickers for a given instType ('SPOT' | 'SWAP' | 'FUTURES').
 */
export async function fetchAllTickers(instType = 'SPOT', region = 'global') {
  const queryType = instType === 'MARGIN' ? 'SPOT' : instType;
  return okxRequest({
    method: 'GET',
    requestPath: `/api/v5/market/tickers?instType=${encodeURIComponent(queryType)}`,
    regionOverride: region,
  });
}

/**
 * Fetch combined catalog for special categories ('PREMARKET', 'STOCKS', or 'COMMODITIES')
 * across SPOT, SWAP, and FUTURES simultaneously.
 */
export async function fetchCategoryCatalog(category, region = 'global') {
  if (
    category === 'PREMARKET' ||
    category === 'STOCKS' ||
    category === 'COMMODITIES'
  ) {
    const [spotInst, swapInst, futInst, spotTick, swapTick, futTick] =
      await Promise.all([
        fetchAllInstruments('SPOT', region).catch(() => []),
        fetchAllInstruments('SWAP', region).catch(() => []),
        fetchAllInstruments('FUTURES', region).catch(() => []),
        fetchAllTickers('SPOT', region).catch(() => []),
        fetchAllTickers('SWAP', region).catch(() => []),
        fetchAllTickers('FUTURES', region).catch(() => []),
      ]);

    const combinedInst = [...spotInst, ...swapInst, ...futInst].filter((inst) => {
      if (category === 'PREMARKET') return isPreMarketInstrument(inst);
      if (category === 'STOCKS') return isStockInstrument(inst);
      return isCommodityInstrument(inst);
    });

    const tickersMap = {};
    for (const t of [...spotTick, ...swapTick, ...futTick]) {
      tickersMap[t.instId] = t;
    }

    return { instruments: combinedInst, tickersMap };
  }

  // Standard single instType category ('SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN')
  const [instList, tickersList] = await Promise.all([
    fetchAllInstruments(category, region).catch(() => []),
    fetchAllTickers(category, region).catch(() => []),
  ]);

  const tickersMap = {};
  for (const t of tickersList) {
    tickersMap[t.instId] = t;
  }

  return { instruments: instList, tickersMap };
}

/**
 * Fetch live ticker for a single instrument (with automatic WebSocket fallback).
 */
export async function fetchTicker(instId, region = 'global') {
  ensurePublicWebSocket(instId);
  try {
    const data = await okxRequest({
      method: 'GET',
      requestPath: `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
      regionOverride: region,
    });
    if (data[0]) {
      wsMarketCache.tickers[instId] = data[0];
      return data[0];
    }
  } catch (err) {
    const wsFallback = await waitForWsSnapshot('ticker', instId);
    if (wsFallback) return wsFallback;
    throw err;
  }
  return wsMarketCache.tickers[instId] || null;
}

/**
 * Fetch live order book depth for an instrument (with automatic WebSocket fallback).
 */
export async function fetchOrderBook(instId, sz = 8, region = 'global') {
  ensurePublicWebSocket(instId);
  try {
    const data = await okxRequest({
      method: 'GET',
      requestPath: `/api/v5/market/books?instId=${encodeURIComponent(instId)}&sz=${sz}`,
      regionOverride: region,
    });
    if (data[0]) {
      wsMarketCache.books[instId] = data[0];
      return data[0];
    }
  } catch {
    const wsFallback = await waitForWsSnapshot('books', instId);
    if (wsFallback) return wsFallback;
  }
  return wsMarketCache.books[instId] || { asks: [], bids: [] };
}

/**
 * Fetch single instrument metadata (minSz, lotSz, tickSz, ctVal, lever, instIdCode, etc.).
 */
export async function fetchInstrumentInfo(instId, instType = 'SPOT', region = 'global') {
  if (instInfoCache.has(instId)) {
    return instInfoCache.get(instId);
  }
  const inferredType =
    instType ||
    (instId?.endsWith('-SWAP')
      ? 'SWAP'
      : instId?.split('-').length > 2
      ? 'FUTURES'
      : 'SPOT');
  const data = await okxRequest({
    method: 'GET',
    requestPath: `/api/v5/public/instruments?instType=${encodeURIComponent(
      inferredType
    )}&instId=${encodeURIComponent(instId)}`,
    regionOverride: region,
  });
  cacheInstrumentsMetadata(data);
  return data[0] || null;
}

/**
 * Resolve numeric instIdCode for an instId (required by OKX V5 WebSocket op: 'order' / 'cancel-order').
 */
export async function resolveInstIdCode(
  instId,
  instType = 'SPOT',
  region = 'global',
  isDemo = false
) {
  if (!instId) return undefined;
  if (instIdCodeCache.has(instId)) {
    return instIdCodeCache.get(instId);
  }
  const inferredType =
    instType ||
    (instId?.endsWith('-SWAP')
      ? 'SWAP'
      : instId?.split('-').length > 2
      ? 'FUTURES'
      : 'SPOT');
  if (!IS_DEV && (region === 'eea' || region === 'us' || isDemo)) {
    await fetchRegionalInstrumentsViaWs(inferredType, region, isDemo).catch(
      () => null
    );
    if (instIdCodeCache.has(instId)) {
      return instIdCodeCache.get(instId);
    }
  }
  try {
    const info = await fetchInstrumentInfo(instId, inferredType, region);
    if (info?.instIdCode !== undefined && info?.instIdCode !== null && info?.instIdCode !== '') {
      const numCode = Number(info.instIdCode);
      if (!Number.isNaN(numCode)) {
        instIdCodeCache.set(instId, numCode);
        return numCode;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Official OKX V5 Private WebSocket endpoints (port 443).
 * Unlike eea.okx.com REST endpoints (which omit CORS headers in browsers),
 * OKX Private WebSockets accept direct browser connections from GitHub Pages
 * for EEA Live (wseea.okx.com), EEA Demo (wseeapap.okx.com), Global Live, and Global Demo.
 */
const PRIVATE_WS_URLS = {
  global_live: 'wss://ws.okx.com/ws/v5/private',
  global_demo: 'wss://wspap.okx.com/ws/v5/private',
  eea_live: 'wss://wseea.okx.com/ws/v5/private',
  eea_demo: 'wss://wseeapap.okx.com/ws/v5/private',
  us_live: 'wss://wsus.okx.com/ws/v5/private',
  us_demo: 'wss://wsuspap.okx.com/ws/v5/private',
};

let activePrivateSession = null;
let activePrivatePromise = null;
let activeSessionKey = '';

function getPrivateWsUrl(region = 'global', isDemo = false) {
  const key = `${region || 'global'}_${isDemo ? 'demo' : 'live'}`;
  return PRIVATE_WS_URLS[key] || PRIVATE_WS_URLS.global_live;
}

function closeActivePrivateSession() {
  if (activePrivateSession) {
    if (activePrivateSession.pingTimer) {
      clearInterval(activePrivateSession.pingTimer);
    }
    try {
      activePrivateSession.ws.close();
    } catch {
      // ignore
    }
    activePrivateSession = null;
  }
  activePrivatePromise = null;
  activeSessionKey = '';
}

/**
 * Connects and authenticates to a specific OKX Private WebSocket endpoint.
 */
function createPrivateWsSession(credentials, regionOverride = null, isDemoOverride = null) {
  const apiKey = sanitizeKeyToken(credentials?.apiKey);
  const secretKey = sanitizeKeyToken(credentials?.secretKey);
  const passphrase = String(credentials?.passphrase || '').trim();
  const region = regionOverride ?? (credentials?.region || 'global');
  const isDemo =
    typeof isDemoOverride === 'boolean'
      ? isDemoOverride
      : Boolean(credentials?.isDemo);

  if (!apiKey || !secretKey || !passphrase) {
    return Promise.reject(
      new Error('Brak kluczy OKX API (API Key, Secret Key lub Passphrase).')
    );
  }

  const wsUrl = getPrivateWsUrl(region, isDemo);

  return new Promise((resolve, reject) => {
    let settled = false;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      reject(err);
      return;
    }

    const session = {
      ws,
      region,
      isDemo,
      loggedIn: false,
      balance: { totalEq: '0', details: [] },
      positions: [],
      pendingOrdersMap: new Map(),
      orderHistoryList: [],
      pendingOps: new Map(),
      pingTimer: null,
      onInitialAccount: null,
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        const err = new Error('Przekroczono czas połączenia z OKX Private WebSocket.');
        err.code = 'TIMEOUT';
        reject(err);
      }
    }, 6500);

    ws.onopen = async () => {
      try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const prehash = `${timestamp}GET/users/self/verify`;
        const sign = await signOkxPayload(prehash, secretKey);

        ws.send(
          JSON.stringify({
            op: 'login',
            args: [
              {
                apiKey,
                passphrase,
                timestamp,
                sign,
              },
            ],
          })
        );
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      }
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.event === 'login') {
        if (String(msg.code) === '0') {
          session.loggedIn = true;
          session.pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send('ping');
              } catch {
                // ignore
              }
            }
          }, 20000);

          try {
            ws.send(
              JSON.stringify({
                op: 'subscribe',
                args: [
                  { channel: 'account' },
                  { channel: 'positions', instType: 'ANY' },
                  { channel: 'orders', instType: 'ANY' },
                ],
              })
            );
          } catch {
            // ignore
          }

          // Wait up to 900ms for the initial account snapshot before resolving
          const acctTimer = setTimeout(() => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(session);
            }
          }, 900);

          session.onInitialAccount = () => {
            if (!settled) {
              settled = true;
              clearTimeout(acctTimer);
              clearTimeout(timeout);
              resolve(session);
            }
          };
        } else {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            const err = new Error(
              `${msg.msg || 'Błąd autoryzacji klucza OKX'} (code: ${msg.code})`
            );
            err.code = String(msg.code);
            try {
              ws.close();
            } catch {
              // ignore
            }
            reject(err);
          }
        }
        return;
      }

      if (msg.event === 'error') {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          const err = new Error(
            `${msg.msg || 'Błąd autoryzacji klucza OKX'} (code: ${msg.code})`
          );
          err.code = String(msg.code);
          try {
            ws.close();
          } catch {
            // ignore
          }
          reject(err);
        }
        return;
      }

      if (msg.arg?.channel === 'account' && msg.data?.[0]) {
        session.balance = msg.data[0];
        if (session.onInitialAccount) {
          const cb = session.onInitialAccount;
          session.onInitialAccount = null;
          cb(session.balance);
        }
      } else if (msg.arg?.channel === 'positions' && Array.isArray(msg.data)) {
        session.positions = msg.data;
      } else if (msg.arg?.channel === 'orders' && Array.isArray(msg.data)) {
        for (const ord of msg.data) {
          if (ord.state === 'live' || ord.state === 'partially_filled') {
            session.pendingOrdersMap.set(ord.ordId, ord);
          } else {
            session.pendingOrdersMap.delete(ord.ordId);
            session.orderHistoryList = [
              ord,
              ...session.orderHistoryList.filter((o) => o.ordId !== ord.ordId),
            ].slice(0, 30);
          }
        }
      }

      if (msg.id && session.pendingOps.has(msg.id)) {
        const opWaiter = session.pendingOps.get(msg.id);
        session.pendingOps.delete(msg.id);
        clearTimeout(opWaiter.timer);

        const item = msg.data?.[0];
        if (
          String(msg.code) !== '0' ||
          (item?.sCode && String(item.sCode) !== '0')
        ) {
          const errMsg =
            item?.sMsg || msg.msg || `OKX Error (${item?.sCode || msg.code})`;
          const err = new Error(
            `${errMsg} (code: ${item?.sCode || msg.code})`
          );
          err.code = String(item?.sCode || msg.code);
          opWaiter.reject(err);
        } else {
          opWaiter.resolve(item || msg);
        }
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        const err = new Error('Błąd połączenia WebSocket z OKX.');
        err.code = 'WS_ERROR';
        reject(err);
      }
    };

    ws.onclose = () => {
      if (session.pingTimer) {
        clearInterval(session.pingTimer);
      }
      if (activePrivateSession === session) {
        activePrivateSession = null;
        activePrivatePromise = null;
        activeSessionKey = '';
      }
    };
  });
}

async function ensurePrivateWsSession(credentials) {
  const apiKey = sanitizeKeyToken(credentials?.apiKey);
  const region = credentials?.region || 'global';
  const isDemo = Boolean(credentials?.isDemo);
  const key = `${apiKey}:${region}:${isDemo ? 'demo' : 'live'}`;

  if (
    activePrivateSession &&
    activeSessionKey === key &&
    activePrivateSession.loggedIn &&
    activePrivateSession.ws.readyState === WebSocket.OPEN
  ) {
    return activePrivateSession;
  }

  if (activePrivatePromise && activeSessionKey === key) {
    return activePrivatePromise;
  }

  closeActivePrivateSession();
  activeSessionKey = key;
  activePrivatePromise = createPrivateWsSession(credentials, region, isDemo)
    .then((sess) => {
      activePrivateSession = sess;
      return sess;
    })
    .catch((err) => {
      if (activeSessionKey === key) {
        activePrivatePromise = null;
        activeSessionKey = '';
      }
      throw err;
    });

  return activePrivatePromise;
}

function sendPrivateWsOp(session, op, args) {
  return new Promise((resolve, reject) => {
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Połączenie WebSocket z OKX zostało zamknięte.'));
      return;
    }
    const id = `op${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const timer = setTimeout(() => {
      session.pendingOps.delete(id);
      reject(new Error('Przekroczono czas oczekiwania na odpowiedź zlecenia z OKX.'));
    }, 8000);

    session.pendingOps.set(id, { resolve, reject, timer });
    session.ws.send(JSON.stringify({ id, op, args }));
  });
}

/**
 * Automatically probes OKX Private WebSocket servers (EEA Live, EEA Demo, Global Live, Global Demo, US Live, US Demo)
 * when a key returns 50119 / 60012 (API key doesn't exist), so the app finds the exact cluster & mode
 * where the user's API key was created.
 */
export async function autoDiscoverKeyViaWebSocket(credentials) {
  const candidates = [
    { region: 'eea', isDemo: false },
    { region: 'eea', isDemo: true },
    { region: 'global', isDemo: false },
    { region: 'global', isDemo: true },
    { region: 'us', isDemo: false },
    { region: 'us', isDemo: true },
  ];

  // Put user's current region opposite mode first, then EEA Live/Demo, then Global Live/Demo
  const curRegion = credentials?.region || 'global';
  const curDemo = Boolean(credentials?.isDemo);
  candidates.sort((a, b) => {
    const aScore = a.region === curRegion ? 0 : a.region === 'eea' ? 1 : 2;
    const bScore = b.region === curRegion ? 0 : b.region === 'eea' ? 1 : 2;
    return aScore - bScore;
  });

  for (const cand of candidates) {
    if (cand.region === curRegion && cand.isDemo === curDemo) {
      continue;
    }
    try {
      const sess = await createPrivateWsSession(
        credentials,
        cand.region,
        cand.isDemo
      );
      closeActivePrivateSession();
      activePrivateSession = sess;
      activeSessionKey = `${sanitizeKeyToken(credentials.apiKey)}:${cand.region}:${
        cand.isDemo ? 'demo' : 'live'
      }`;
      activePrivatePromise = Promise.resolve(sess);
      return {
        region: cand.region,
        isDemo: cand.isDemo,
        balance: sess.balance,
      };
    } catch (err) {
      // Code 60008 or 50110 means IP whitelist mismatch -> the key DOES exist in this region/mode!
      const codeStr = String(err.code || '');
      if (codeStr === '60008' || codeStr === '50110') {
        return {
          region: cand.region,
          isDemo: cand.isDemo,
          ipError: err,
        };
      }
    }
  }
  return null;
}

function shouldUsePrivateWsDirect(credentials) {
  if (IS_DEV) return false;
  const reg = credentials?.region || 'global';
  // On GitHub Pages (!IS_DEV), eea.okx.com and us.okx.com block REST CORS preflight,
  // so EEA and US accounts always use the direct OKX V5 Private WebSocket!
  return reg === 'eea' || reg === 'us';
}

/**
 * Fetch Trading Account balances (requires API credentials).
 */
export async function fetchAccountBalance(credentials) {
  if (shouldUsePrivateWsDirect(credentials)) {
    const sess = await ensurePrivateWsSession(credentials);
    return sess.balance || { totalEq: '0', details: [] };
  }

  try {
    const data = await okxRequest({
      method: 'GET',
      requestPath: '/api/v5/account/balance',
      credentials,
    });
    return data[0] || { totalEq: '0', details: [] };
  } catch (err) {
    // Fallback to Private WebSocket if REST fails with CORS or 50119
    if (!IS_DEV) {
      const sess = await ensurePrivateWsSession(credentials);
      return sess.balance || { totalEq: '0', details: [] };
    }
    throw err;
  }
}

/**
 * Fetch Account Configuration (e.g. posMode: 'net_mode' | 'long_short_mode', acctLv).
 */
export async function fetchAccountConfig(credentials) {
  if (shouldUsePrivateWsDirect(credentials)) {
    return { posMode: 'net_mode' };
  }
  const data = await okxRequest({
    method: 'GET',
    requestPath: '/api/v5/account/config',
    credentials,
  });
  return data[0] || null;
}

/**
 * Fetch open positions for SWAP, FUTURES, MARGIN, OPTION.
 */
export async function fetchPositions(credentials) {
  if (shouldUsePrivateWsDirect(credentials)) {
    const sess = await ensurePrivateWsSession(credentials);
    return sess.positions || [];
  }
  return okxRequest({
    method: 'GET',
    requestPath: '/api/v5/account/positions',
    credentials,
  });
}

/**
 * Set leverage for MARGIN, SWAP, or FUTURES instrument.
 */
export async function setAccountLeverage(
  credentials,
  { instId, lever, mgnMode = 'cross', posSide }
) {
  if (shouldUsePrivateWsDirect(credentials)) {
    return { instId, lever: String(lever), mgnMode };
  }
  const body = {
    instId,
    lever: String(lever),
    mgnMode,
  };
  if (posSide && posSide !== 'net') {
    body.posSide = posSide;
  }
  const data = await okxRequest({
    method: 'POST',
    requestPath: '/api/v5/account/set-leverage',
    body,
    credentials,
  });
  return data[0];
}

/**
 * Place an order across any OKX instrument type (SPOT, MARGIN, SWAP, FUTURES).
 */
export async function placeOrder(
  credentials,
  {
    instId,
    instIdCode,
    instType = 'SPOT',
    tdMode = 'cash',
    ccy,
    side,
    posSide,
    ordType,
    sz,
    px,
    tgtCcy,
    reduceOnly = false,
    tpTriggerPx,
    tpOrdPx,
    slTriggerPx,
    slOrdPx,
  }
) {
  const payload = {
    instId,
    tdMode: instType === 'SPOT' ? 'cash' : tdMode || 'cross',
    side,
    ordType,
    sz: String(sz).trim(),
  };

  if (instType === 'MARGIN' && ccy) {
    payload.ccy = ccy;
  }

  if ((instType === 'SWAP' || instType === 'FUTURES') && posSide && posSide !== 'net') {
    payload.posSide = posSide;
  }

  if (reduceOnly && instType !== 'SPOT') {
    payload.reduceOnly = true;
  }

  if (ordType === 'limit') {
    payload.px = String(px).trim();
  } else if (ordType === 'market' && instType === 'SPOT' && tgtCcy) {
    payload.tgtCcy = tgtCcy;
  }

  if (tpTriggerPx || slTriggerPx) {
    const attachAlgo = {};
    if (tpTriggerPx) {
      attachAlgo.tpTriggerPx = String(tpTriggerPx).trim();
      attachAlgo.tpOrdPx = tpOrdPx ? String(tpOrdPx).trim() : '-1';
    }
    if (slTriggerPx) {
      attachAlgo.slTriggerPx = String(slTriggerPx).trim();
      attachAlgo.slOrdPx = slOrdPx ? String(slOrdPx).trim() : '-1';
    }
    payload.attachAlgoOrds = [attachAlgo];
  }

  const sendViaWs = async () => {
    const code =
      instIdCode !== undefined && instIdCode !== null && instIdCode !== ''
        ? Number(instIdCode)
        : await resolveInstIdCode(
            instId,
            instType,
            credentials?.region || 'global',
            Boolean(credentials?.isDemo)
          );
    const wsPayload = { ...payload };
    if (code !== undefined && !Number.isNaN(code)) {
      wsPayload.instIdCode = code;
    }
    const sess = await ensurePrivateWsSession(credentials);
    const wsRes = await sendPrivateWsOp(sess, 'order', [wsPayload]);
    const ordId = wsRes?.ordId || `ws-${Date.now()}`;
    const syntheticOrd = {
      ordId,
      instId,
      instType,
      ordType,
      side,
      px: px || '',
      avgPx: px || '',
      sz: String(sz).trim(),
      accFillSz: ordType === 'market' ? String(sz).trim() : '0',
      state: ordType === 'market' ? 'filled' : 'live',
      cTime: String(Date.now()),
      uTime: String(Date.now()),
      pnl: '0',
    };
    if (ordType === 'limit') {
      if (!sess.pendingOrdersMap.has(ordId)) {
        sess.pendingOrdersMap.set(ordId, syntheticOrd);
      }
    } else {
      if (!sess.orderHistoryList.some((o) => o.ordId === ordId)) {
        sess.orderHistoryList = [syntheticOrd, ...sess.orderHistoryList].slice(
          0,
          40
        );
      }
    }
    return wsRes;
  };

  if (shouldUsePrivateWsDirect(credentials)) {
    return sendViaWs();
  }

  try {
    const data = await okxRequest({
      method: 'POST',
      requestPath: '/api/v5/trade/order',
      body: payload,
      credentials,
    });
    return data[0];
  } catch (err) {
    if (!IS_DEV && !err.code) {
      return sendViaWs();
    }
    throw err;
  }
}

/**
 * Close an entire open position at Market price (SWAP, FUTURES, MARGIN).
 */
export async function closePositionMarket(
  credentials,
  { instId, mgnMode, posSide, ccy, pos }
) {
  if (shouldUsePrivateWsDirect(credentials) && pos) {
    const sess = await ensurePrivateWsSession(credentials);
    const posNum = parseFloat(pos);
    const isLong = posSide === 'long' || (posSide === 'net' && posNum > 0);
    const code = await resolveInstIdCode(
      instId,
      instId?.endsWith('-SWAP') ? 'SWAP' : 'FUTURES',
      credentials?.region || 'global'
    );
    const closePayload = {
      instId,
      ...(code !== undefined && !Number.isNaN(code) ? { instIdCode: code } : {}),
      tdMode: mgnMode || 'cross',
      side: isLong ? 'sell' : 'buy',
      ordType: 'market',
      sz: String(Math.abs(posNum)),
      reduceOnly: true,
    };
    if (posSide && posSide !== 'net') {
      closePayload.posSide = posSide;
    }
    if (ccy) {
      closePayload.ccy = ccy;
    }
    return sendPrivateWsOp(sess, 'order', [closePayload]);
  }

  const body = {
    instId,
    mgnMode: mgnMode || 'cross',
  };
  if (posSide && posSide !== 'net') {
    body.posSide = posSide;
  }
  if (ccy) {
    body.ccy = ccy;
  }
  const data = await okxRequest({
    method: 'POST',
    requestPath: '/api/v5/trade/close-position',
    body,
    credentials,
  });
  return data[0];
}

/**
 * Cancel an active order.
 */
export async function cancelOrder(credentials, { instId, ordId }) {
  if (shouldUsePrivateWsDirect(credentials)) {
    const code = await resolveInstIdCode(
      instId,
      instId?.endsWith('-SWAP') ? 'SWAP' : 'SPOT',
      credentials?.region || 'global'
    );
    const sess = await ensurePrivateWsSession(credentials);
    return sendPrivateWsOp(sess, 'cancel-order', [
      {
        instId,
        ...(code !== undefined && !Number.isNaN(code) ? { instIdCode: code } : {}),
        ordId,
      },
    ]);
  }

  const data = await okxRequest({
    method: 'POST',
    requestPath: '/api/v5/trade/cancel-order',
    body: { instId, ordId },
    credentials,
  });
  return data[0];
}

/**
 * Fetch currently open (pending) orders.
 */
export async function fetchPendingOrders(credentials, instType = '') {
  if (shouldUsePrivateWsDirect(credentials)) {
    const sess = await ensurePrivateWsSession(credentials);
    return Array.from(sess.pendingOrdersMap.values());
  }

  const query = instType ? `?instType=${encodeURIComponent(instType)}` : '';
  return okxRequest({
    method: 'GET',
    requestPath: `/api/v5/trade/orders-pending${query}`,
    credentials,
  });
}

/**
 * Fetch recent order history for a given instType ('SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN').
 */
export async function fetchOrderHistory(credentials, instType = 'SPOT') {
  if (shouldUsePrivateWsDirect(credentials)) {
    const sess = await ensurePrivateWsSession(credentials);
    return sess.orderHistoryList || [];
  }

  return okxRequest({
    method: 'GET',
    requestPath: `/api/v5/trade/orders-history?instType=${encodeURIComponent(
      instType
    )}&limit=20`,
    credentials,
  });
}
