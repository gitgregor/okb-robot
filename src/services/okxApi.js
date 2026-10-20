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

/**
 * Fetch all available instruments for a given instType ('SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN').
 */
export async function fetchAllInstruments(instType = 'SPOT', region = 'global') {
  return okxRequest({
    method: 'GET',
    requestPath: `/api/v5/public/instruments?instType=${encodeURIComponent(instType)}`,
    regionOverride: region,
  });
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
 * Fetch single instrument metadata (minSz, lotSz, tickSz, ctVal, lever, etc.).
 */
export async function fetchInstrumentInfo(instId, instType = 'SPOT', region = 'global') {
  const data = await okxRequest({
    method: 'GET',
    requestPath: `/api/v5/public/instruments?instType=${encodeURIComponent(
      instType
    )}&instId=${encodeURIComponent(instId)}`,
    regionOverride: region,
  });
  return data[0] || null;
}

/**
 * Fetch Trading Account balances (requires API credentials).
 */
export async function fetchAccountBalance(credentials) {
  const data = await okxRequest({
    method: 'GET',
    requestPath: '/api/v5/account/balance',
    credentials,
  });
  return data[0] || { totalEq: '0', details: [] };
}

/**
 * Fetch Account Configuration (e.g. posMode: 'net_mode' | 'long_short_mode', acctLv).
 */
export async function fetchAccountConfig(credentials) {
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

  const data = await okxRequest({
    method: 'POST',
    requestPath: '/api/v5/trade/order',
    body: payload,
    credentials,
  });

  return data[0];
}

/**
 * Close an entire open position at Market price (SWAP, FUTURES, MARGIN).
 */
export async function closePositionMarket(
  credentials,
  { instId, mgnMode, posSide, ccy }
) {
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
  return okxRequest({
    method: 'GET',
    requestPath: `/api/v5/trade/orders-history?instType=${encodeURIComponent(
      instType
    )}&limit=20`,
    credentials,
  });
}
