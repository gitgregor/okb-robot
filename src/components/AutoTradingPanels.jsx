import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Bot,
  Cpu,
  Power,
  Play,
  Square,
  RefreshCw,
  TrendingUp,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  History,
  Trash2,
  Sparkles,
  ShieldCheck,
  Sliders,
  Coins,
  Zap,
  Smartphone,
  Wallet,
  Layers,
} from 'lucide-react';
import {
  fetchAllInstruments,
  fetchAllTickers,
  fetchTicker,
  fetchOrderBook,
  fetchInstrumentInfo,
  resolveInstIdCode,
  placeOrder,
  isPreMarketInstrument,
  isStockInstrument,
  isCommodityInstrument,
  getCommodityDescription,
} from '../services/okxApi';

const AUTO_SETTINGS_KEY = 'okx_autobot_settings_v1';
const AI_SETTINGS_KEY = 'okx_ai_agent_settings_v1';
const ACTION_HISTORY_KEY = 'okx_auto_ai_history_v1';
const AI_POSITIONS_KEY = 'okx_ai_tracked_positions_v1';
const AUTO_CYCLE_STATE_KEY = 'okx_autobot_cycle_state_v1';
const SYNC_META_KEY = 'okx_automation_sync_meta_v2';
const DEVICE_ID_KEY = 'okx_automation_device_id_v2';

// Shared cross-device sync channel for Desktop <-> Mobile state synchronization
const CROSS_DEVICE_SYNC_TOPIC = 'okb_robot_gitgregor_live_sync_v2';
const NTFY_BASE_URL = 'https://ntfy.sh';
const NTFY_WS_URL = 'wss://ntfy.sh';

// Major high-liquidity bases verified across OKX EEA & Global
const PRIORITY_LIQUID_BASES = new Set([
  'ONDO',
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'DOGE',
  'SUI',
  'PEPE',
  'ADA',
  'AVAX',
  'LINK',
  'NEAR',
  'AAVE',
  'UNI',
  'DOT',
  'LTC',
  'RENDER',
  'FET',
  'ARB',
  'OP',
  'APT',
  'INJ',
  'TIA',
  'SEI',
  'BONK',
  'SHIB',
  'OKB',
  'PAXG',
  'XAUT',
  'XNVDA',
  'XTSLA',
  'XAAPL',
  'ANTHROPIC',
  'OPENAI',
]);

function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    const id = `${isMobile ? 'mob' : 'dsk'}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Detailed descriptions of each automated trading method ("co robi i jak działa").
 */
export const AUTO_TRADING_RULES_CATALOG = [
  {
    id: 'grid_scalp',
    name: '1. Grid & Spread Scalping (Siatka Cenowa i Zbieranie Wahań)',
    badge: 'Najlepsza na rynek boczny',
    whatItDoes:
      'Automatycznie kupuje wybrane aktywo podczas lokalnych spadków ceny o zadany procent i sprzedaje je z zyskiem po odbiciu (Take Profit), wielokrotnie zbierając mniejsze profity z naturalnych wahań kursu.',
    howItWorks:
      'Bot zapisuje cenę odniesienia wybranego instrumentu. W każdym cyklu sprawdza bieżący kurs rynkowy. Gdy cena spadnie o skonfigurowany "Próg zakupu na spadku (%)", bot składa zlecenie kupna ustalonej ilości aktywa. Natychmiast po zakupie wyznacza cenę docelową powiększoną o "Take Profit (%)". Gdy rynek odbije do tego poziomu, bot sprzedaje aktywo, księguje zysk i ustawia nową bazę siatki.',
  },
  {
    id: 'mean_reversion',
    name: '2. RSI & Mean Reversion (Powrót do Średniej / Odbicie z Wyprzedania)',
    badge: 'Łapanie dołków cenowych',
    whatItDoes:
      'Wykrywa sytuacje silnego krótkoterminowego wyprzedania rynku (gdy cena zbliża się do dziennego minimum, a popyt w Order Booku zaczyna rosnąć) i otwiera pozycję pod szybkie odreagowanie wzrostowe.',
    howItWorks:
      'Algorytm analizuje położenie aktualnej ceny w kanale 24-godzinnym (między Low 24h a High 24h) oraz stosunek popytu do podaży w arkuszu zleceń (Bid/Ask Imbalance). Jeśli cena znajduje się w dolnych 25% dziennego zakresu, a wolumen ofert kupna (Bids) przewyższa oferty sprzedaży (Asks), reguła uznaje aktywo za niedowartościowane, kupuje określoną ilość i zamyka pozycję po powrocie kursu w stronę średniej.',
  },
  {
    id: 'momentum_breakout',
    name: '3. Momentum & Trend Breakout (Podążanie za Trendem i Wybicia)',
    badge: 'Na silne wzrosty',
    whatItDoes:
      'Identyfikuje instrumenty będące w silnym trendzie wzrostowym (wybijające nowe lokalne szczyty przy rosnącym obrocie) i dołącza do ruchu, realizując zysk po osiągnięciu docelowego procentu.',
    howItWorks:
      'Reguła porównuje kolejne odczyty ceny oraz dynamikę 24h. Gdy kurs rośnie powyżej ceny otwarcia, utrzymuje się w górnej części pasma 24h i wykazuje dodatnią dynamikę między kolejnymi odczytami przy przewadze kupujących w Order Booku, bot otwiera pozycję zgodną z trendem i pilnuje jej zamknięcia na poziomie Take Profit lub obronnym Stop Loss.',
  },
  {
    id: 'smart_dca',
    name: '4. Smart DCA + Auto-Take Profit (Uśrednianie Ceny z Kumulacją Zysku)',
    badge: 'Bezpieczna akumulacja',
    whatItDoes:
      'Dokupuje aktywo partiami podczas głębszych korekt (obniżając średnią cenę zakupu) i automatycznie sprzedaje całość z zyskiem, gdy tylko rynek odbije powyżej uśrednionej cenę wejścia.',
    howItWorks:
      'Zamiast kupować za całą kwotę w jednym punkcie, bot otwiera pierwszą transzę, a w razie dalszego spadku kursu o kolejny krok (%) dokupuje następną transzę (do ustalonego limitu transakcji). Dzięki temu średnia cena zakupu (Avg Entry) obniża się. Gdy kurs rynkowy przekroczy tę uśrednioną cenę o zadany "Take Profit (%)", bot sprzedaje zgromadzone jednostki i realizuje skumulowany zysk.',
  },
];

export default function AutoTradingPanels({
  instId,
  instType,
  ticker,
  orderBook,
  allTickersMap = {},
  credentials,
  hasCredentials,
  accountBalance,
  onSelectInstrument,
  onOpenChart,
  onRefreshPrivateData,
  onSyncAutomationBook,
  autoBotEnabled,
  setAutoBotEnabled,
  onUserToggleAutoBot,
  aiAgentEnabled,
  setAiAgentEnabled,
  onUserToggleAiAgent,
  userToggleSignal,
}) {
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const localUpdatedAtRef = useRef((() => {
    try {
      const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}');
      return Number(meta.updatedAt || 0);
    } catch {
      return 0;
    }
  })());
  const isApplyingRemoteRef = useRef(false);
  const unsupportedInstRef = useRef(new Map());

  // Sub-tab inside the Automation Center ('autobot' | 'ai_agent' | 'asset_status' | 'history')
  const [activeSubTab, setActiveSubTab] = useState('ai_agent');
  const [closingPositionId, setClosingPositionId] = useState(null);
  const [isClosingAllPositions, setIsClosingAllPositions] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    connected: false,
    lastSyncTime: null,
    remoteDevice: null,
  });

  // ============================================================================
  // MODULE 1: RULE-BASED AUTO-TRADING BOT STATE
  // ============================================================================
  const [autoSettings, setAutoSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTO_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      targetInstId: '', // empty means follow currently selected instId
      amountMode: 'quote', // 'base' (ilość aktywa) | 'quote' (kwota USDT/USDC)
      tradeAmount: '15', // default 15 USDC/USDT or base units
      takeProfitPct: '1.2',
      stopLossPct: '2.0',
      dipBuyPct: '0.5',
      checkIntervalSec: '15',
      maxOpenCycles: '3',
      activeRules: {
        grid_scalp: true,
        mean_reversion: true,
        momentum_breakout: false,
        smart_dca: false,
      },
      executeRealOrders: true,
    };
  });

  const [autoBotCycleState, setAutoBotCycleState] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTO_CYCLE_STATE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      referencePrice: null,
      avgEntryPrice: null,
      heldBaseQty: 0,
      openCyclesCount: 0,
      lastCheckTime: null,
      lastStatusMsg: 'Oczekiwanie na uruchomienie...',
      realizedProfitUsd: 0,
    };
  });

  // ============================================================================
  // MODULE 2: AUTONOMOUS MULTI-MARKET AI AGENT STATE
  // ============================================================================
  const [aiSettings, setAiSettings] = useState(() => {
    const defaults = {
      selectedWalletAsset: 'ALL', // 'ALL' (wszystkie z portfela) lub konkretne aktywo z Portfela Handlowego (np. 'USDC', 'USDG', 'ONDO', 'BTC'...)
      walletAllocationPct: '100', // Ile % wybranego aktywa z portfela przeznaczyć do handlu AI
      summaryValuationCcy: 'USDC', // 'USDC' (domyślnie) | 'USDG'
      tradeBudgetUsdt: '20', // Kwota na pojedynczą okazję (USDC/USDG/USDT)
      maxConcurrentHoldings: '4',
      targetProfitPct: '1.1',
      stopLossPct: '1.8',
      scanIntervalSec: '20',
      allowAssetRotation: true, // Zamiana słabszych aktywów na bardziej zyskowne
      minRotationAdvantageScore: '15', // O ile pkt nowe aktywo musi być lepsze aby dokonać zamiany
      riskProfile: 'balanced', // 'conservative' | 'balanced' | 'aggressive'
      allowedMarkets: {
        SPOT: true,
        PREMARKET: true,
        STOCKS: true,
        COMMODITIES: true,
        SWAP: false,
      },
      executeRealOrders: true,
    };
    try {
      const saved = localStorage.getItem(AI_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaults,
          ...parsed,
          summaryValuationCcy:
            parsed.summaryValuationCcy === 'USDG' ? 'USDG' : 'USDC',
          selectedWalletAsset: parsed.selectedWalletAsset || 'ALL',
          walletAllocationPct: parsed.walletAllocationPct || '100',
        };
      }
    } catch {
      // ignore
    }
    return defaults;
  });

  const [aiTrackedHoldings, setAiTrackedHoldings] = useState(() => {
    try {
      const saved = localStorage.getItem(AI_POSITIONS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [aiLiveStatus, setAiLiveStatus] = useState({
    isScanning: false,
    lastScanTime: null,
    scannedCount: 0,
    topOpportunities: [],
    currentThought:
      'Agent AI gotowy. Po aktywacji będzie samodzielnie skanował wszystkie rynki OKX, kupował najlepsze okazje, realizował profity i zamieniał słabsze aktywa na bardziej opłacalne.',
    cumulativeProfitUsd: 0,
    totalSwapsCount: 0,
    totalTradesCount: 0,
  });

  // ============================================================================
  // MODULE 3: SHARED ACTION & PROFIT HISTORY LOG
  // ============================================================================
  const [actionHistory, setActionHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTION_HISTORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  // Keep refs of latest state for cross-device sync & intervals
  const latestStateRef = useRef({
    autoBotEnabled,
    aiAgentEnabled,
    autoSettings,
    aiSettings,
    autoBotCycleState,
    aiTrackedHoldings,
    aiLiveStatus,
    actionHistory,
  });
  latestStateRef.current = {
    autoBotEnabled,
    aiAgentEnabled,
    autoSettings,
    aiSettings,
    autoBotCycleState,
    aiTrackedHoldings,
    aiLiveStatus,
    actionHistory,
  };

  // Persist settings, holdings, cycle state, and history locally
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(autoSettings));
    } catch {
      // ignore
    }
  }, [autoSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(
        AUTO_CYCLE_STATE_KEY,
        JSON.stringify(autoBotCycleState)
      );
    } catch {
      // ignore
    }
  }, [autoBotCycleState]);

  useEffect(() => {
    try {
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
    } catch {
      // ignore
    }
  }, [aiSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(AI_POSITIONS_KEY, JSON.stringify(aiTrackedHoldings));
    } catch {
      // ignore
    }
  }, [aiTrackedHoldings]);

  useEffect(() => {
    try {
      localStorage.setItem(
        ACTION_HISTORY_KEY,
        JSON.stringify(actionHistory.slice(0, 150))
      );
    } catch {
      // ignore
    }
  }, [actionHistory]);

  const emergencyHandlersRef = useRef({
    closeSingle: null,
    closeAll: null,
    selectWalletAsset: null,
    takeWalletAsset: null,
    setValuationCcy: null,
  });

  // ============================================================================
  // LIVE ASSET STATUS LEDGER & VALUATION ENGINE (USDC / USDG)
  // Tracks for every wallet & traded asset:
  // - how much was taken to trade (takenQty & activeQty)
  // - for how much it was bought (avgBuyPrice & totalBoughtVal)
  // - for how much it was sold (soldQty, avgSellPrice & totalSoldVal)
  // - how much remains to choose in the wallet (remainingQty & remainingVal)
  // All summarized in USDC (default) or USDG!
  // ============================================================================
  const assetLedgerAndSummary = useMemo(() => {
    const valuationCcy =
      aiSettings.summaryValuationCcy === 'USDG' ? 'USDG' : 'USDC';

    // Determine live USDG <-> USDC rate from OKX tickers (defaults to 1.0000 parity)
    const rawUsdgPx = parseFloat(
      allTickersMap?.['USDG-USDC']?.last ||
        allTickersMap?.['USDG-USDT']?.last ||
        '1'
    );
    const usdgRateInUsdc =
      !Number.isNaN(rawUsdgPx) && rawUsdgPx > 0.5 && rawUsdgPx < 1.5
        ? rawUsdgPx
        : 1.0;

    const toValCcy = (valUsdc) => {
      const num = Number(valUsdc || 0);
      if (Number.isNaN(num)) return 0;
      return valuationCcy === 'USDG' ? num / usdgRateInUsdc : num;
    };

    const resolveLivePxUsdc = (ccy) => {
      if (!ccy) return 0;
      const sym = String(ccy).toUpperCase();
      if (sym === 'USDC' || sym === 'USDT' || sym === 'USD') return 1.0;
      if (sym === 'USDG') return usdgRateInUsdc;
      if (sym === 'EUR') {
        const eurTk =
          allTickersMap?.['EUR-USDC']?.last ||
          allTickersMap?.['EUR-USDT']?.last;
        return eurTk && parseFloat(eurTk) > 0 ? parseFloat(eurTk) : 1.08;
      }
      if (instId?.startsWith(`${sym}-`) && ticker?.last) {
        const p = parseFloat(ticker.last);
        if (p > 0) return p;
      }
      const directTk =
        allTickersMap?.[`${sym}-USDC`]?.last ||
        allTickersMap?.[`${sym}-USDT`]?.last ||
        allTickersMap?.[`${sym}-USDG`]?.last ||
        allTickersMap?.[`${sym}-USDT-SWAP`]?.last;
      if (directTk && parseFloat(directTk) > 0) {
        return parseFloat(directTk);
      }
      const oppMatch = aiLiveStatus.topOpportunities?.find(
        (o) => o.baseCcy === sym
      );
      if (oppMatch?.lastPrice > 0) return Number(oppMatch.lastPrice);

      const holdMatch = aiTrackedHoldings.find(
        (h) => (h.baseCcy || h.instId?.split('-')[0]) === sym
      );
      if (holdMatch?.currentPrice > 0) return Number(holdMatch.currentPrice);
      if (holdMatch?.entryPrice > 0) return Number(holdMatch.entryPrice);

      const walDetail = accountBalance?.details?.find((d) => d.ccy === sym);
      if (walDetail) {
        const av = parseFloat(walDetail.availBal || walDetail.eq || '0');
        const eqU = parseFloat(walDetail.eqUsd || '0');
        if (av > 0 && eqU > 0) return eqU / av;
      }
      return 0;
    };

    // 1. Aggregate historical BUY / SELL / SWAP records per asset from actionHistory
    const histMap = new Map();
    const ensureHist = (sym) => {
      const clean = String(sym || '').trim().toUpperCase();
      if (!clean || clean === '—') return null;
      if (!histMap.has(clean)) {
        histMap.set(clean, {
          ccy: clean,
          boughtQty: 0,
          boughtValUsdc: 0,
          soldQty: 0,
          soldValUsdc: 0,
          soldCostUsdc: 0,
          realizedPnlUsdc: 0,
          tradesCount: 0,
          lastInstId: `${clean}-USDC`,
        });
      }
      return histMap.get(clean);
    };

    for (const item of actionHistory) {
      if (!item || item.actionType === 'ERROR') continue;

      if (item.swapSell && item.swapBuy) {
        const sEntry = ensureHist(item.swapSell.baseCcy);
        if (sEntry) {
          const sQty = Number(item.swapSell.qty || 0);
          const sVal = Number(item.swapSell.sellValUsd || 0);
          const sCost = Number(item.swapSell.buyValUsd || sVal);
          sEntry.soldQty += sQty;
          sEntry.soldValUsdc += sVal;
          sEntry.soldCostUsdc += sCost;
          sEntry.realizedPnlUsdc += Number(item.profitUsd || 0);
          sEntry.tradesCount += 1;
          if (item.swapSell.instId) sEntry.lastInstId = item.swapSell.instId;
        }
        const bEntry = ensureHist(item.swapBuy.baseCcy);
        if (bEntry) {
          const bQty = Number(item.swapBuy.qty || 0);
          const bVal = Number(item.swapBuy.buyValUsd || 0);
          bEntry.boughtQty += bQty;
          bEntry.boughtValUsdc += bVal;
          bEntry.tradesCount += 1;
          if (item.swapBuy.instId) bEntry.lastInstId = item.swapBuy.instId;
        }
        continue;
      }

      const sideUpper = String(item.side || '').toUpperCase();
      if (
        item.actionType === 'AI_ASSET_SWAP' ||
        sideUpper.includes('SWAP') ||
        String(item.amountStr || '').includes('➔')
      ) {
        const amtParts = String(item.amountStr || '').split('➔');
        const pxParts = String(item.priceStr || '').split('➔');
        if (amtParts.length === 2) {
          const leftMatch = amtParts[0]
            .trim()
            .match(/([0-9.]+)\s*([A-Z0-9]+)/i);
          const rightMatch = amtParts[1]
            .trim()
            .match(/([0-9.]+)\s*([A-Z0-9]+)/i);
          const px1 = parseFloat((pxParts[0] || '').trim()) || 0;
          const px2 = parseFloat((pxParts[1] || '').trim()) || 0;
          const pnl =
            typeof item.profitUsd === 'number' ? item.profitUsd : 0;

          if (leftMatch) {
            const q1 = parseFloat(leftMatch[1]) || 0;
            const c1 = leftMatch[2].toUpperCase();
            const e1 = ensureHist(c1);
            if (e1 && q1 > 0) {
              const p1 = px1 || resolveLivePxUsdc(c1);
              const val1 = q1 * p1;
              e1.soldQty += q1;
              e1.soldValUsdc += val1;
              e1.soldCostUsdc += Math.max(0, val1 - pnl);
              e1.realizedPnlUsdc += pnl;
              e1.tradesCount += 1;
            }
          }
          if (rightMatch) {
            const q2 = parseFloat(rightMatch[1]) || 0;
            const c2 = rightMatch[2].toUpperCase();
            const e2 = ensureHist(c2);
            if (e2 && q2 > 0) {
              const p2 = px2 || resolveLivePxUsdc(c2);
              const val2 = q2 * p2;
              e2.boughtQty += q2;
              e2.boughtValUsdc += val2;
              e2.tradesCount += 1;
            }
          }
        }
        continue;
      }

      const baseSym =
        item.rawBaseCcy ||
        String(item.instId || '')
          .split('-')[0]
          .trim()
          .toUpperCase();
      const entry = ensureHist(baseSym);
      if (!entry) continue;

      if (item.instId && String(item.instId).includes('-')) {
        entry.lastInstId = item.instId;
      }

      const parsedQty =
        Number(item.rawQty || 0) ||
        parseFloat(String(item.amountStr || '').replace(/[^0-9.]/g, '')) ||
        0;
      const parsedPx =
        Number(item.rawPrice || 0) ||
        parseFloat(String(item.priceStr || '').replace(/[^0-9.]/g, '')) ||
        resolveLivePxUsdc(baseSym) ||
        0;
      const usdBracketMatch = String(item.amountStr || '').match(
        /\$([0-9.]+)/
      );
      const parsedVal =
        Number(item.rawQuoteVal || 0) ||
        (usdBracketMatch ? parseFloat(usdBracketMatch[1]) : 0) ||
        parsedQty * parsedPx;

      if (sideUpper.includes('SELL')) {
        const pnl =
          typeof item.profitUsd === 'number' ? item.profitUsd : 0;
        const costVal =
          Number(item.rawCostVal || 0) || Math.max(0, parsedVal - pnl);
        entry.soldQty += parsedQty;
        entry.soldValUsdc += parsedVal;
        entry.soldCostUsdc += costVal;
        entry.realizedPnlUsdc += pnl;
        entry.tradesCount += 1;
      } else if (sideUpper.includes('BUY')) {
        entry.boughtQty += parsedQty;
        entry.boughtValUsdc += parsedVal;
        entry.tradesCount += 1;
      }
    }

    // 2. Collect active positions from AI Agent & Rule Auto-Bot
    const activePairForBot = (
      autoSettings.targetInstId ||
      instId ||
      'ONDO-USDC'
    ).trim();
    const botBaseCcy = activePairForBot.split('-')[0];

    const activeByCcy = new Map();
    const addActiveHold = (ccy, holdObj) => {
      const sym = String(ccy || '').toUpperCase();
      if (!sym) return;
      if (!activeByCcy.has(sym)) {
        activeByCcy.set(sym, {
          activeQty: 0,
          fromWalletQty: 0,
          activeEntryValUsdc: 0,
          activeCurrentValUsdc: 0,
          simulatedEntryValUsdc: 0,
          instId: holdObj.instId || `${sym}-USDC`,
          instType: holdObj.instType || 'SPOT',
          sources: new Set(),
        });
      }
      const bucket = activeByCcy.get(sym);
      const q = Number(holdObj.qty || 0);
      const entPx = Number(holdObj.entryPrice || 0);
      const curPx = Number(holdObj.currentPrice || entPx || 0);
      bucket.activeQty += q;
      if (holdObj.fromWallet) {
        bucket.fromWalletQty += q;
      }
      bucket.activeEntryValUsdc += q * entPx;
      bucket.activeCurrentValUsdc += q * curPx;
      if (
        !holdObj.fromWallet &&
        !String(holdObj.executedVia || '').includes('API OKX')
      ) {
        bucket.simulatedEntryValUsdc += q * entPx;
      }
      if (holdObj.sourceLabel) bucket.sources.add(holdObj.sourceLabel);
    };

    if (
      autoBotCycleState.openCyclesCount > 0 &&
      autoBotCycleState.heldBaseQty > 0 &&
      autoBotCycleState.avgEntryPrice > 0
    ) {
      const botLivePx =
        activePairForBot === instId && ticker?.last
          ? parseFloat(ticker.last)
          : autoBotCycleState.referencePrice ||
            autoBotCycleState.avgEntryPrice;
      addActiveHold(botBaseCcy, {
        instId: activePairForBot,
        instType: activePairForBot.endsWith('-SWAP') ? 'SWAP' : 'SPOT',
        qty: autoBotCycleState.heldBaseQty,
        entryPrice: autoBotCycleState.avgEntryPrice,
        currentPrice: botLivePx,
        fromWallet: false,
        executedVia: autoSettings.executeRealOrders && hasCredentials ? 'API OKX' : 'Symulacja',
        sourceLabel: 'Auto-Bot',
      });
    }

    for (const h of aiTrackedHoldings) {
      const sym = h.baseCcy || h.instId?.split('-')[0];
      const oppMatch = aiLiveStatus.topOpportunities?.find(
        (o) => o.instId === h.instId
      );
      const livePx =
        h.instId === instId && ticker?.last
          ? parseFloat(ticker.last)
          : allTickersMap?.[h.instId]?.last
          ? parseFloat(allTickersMap[h.instId].last)
          : oppMatch?.lastPrice || h.currentPrice || h.entryPrice;

      addActiveHold(sym, {
        instId: h.instId,
        instType: h.instType || 'SPOT',
        qty: Number(h.qty || 0),
        entryPrice: Number(h.entryPrice || livePx),
        currentPrice: Number(livePx || h.entryPrice),
        fromWallet: Boolean(h.fromWallet),
        executedVia: h.executedVia || 'AI',
        sourceLabel: h.fromWallet ? 'Portfel ➔ AI' : 'Agent AI',
      });
    }

    // 3. Build complete set of currencies from Wallet + Active Positions + Trade History
    const allCcys = new Set();
    const walletDetailsList = accountBalance?.details || [];
    const hasRealWallet = walletDetailsList.length > 0;

    for (const d of walletDetailsList) {
      if (d?.ccy) allCcys.add(d.ccy.toUpperCase());
    }
    for (const sym of activeByCcy.keys()) {
      allCcys.add(sym);
    }
    for (const sym of histMap.keys()) {
      allCcys.add(sym);
    }
    if (
      aiSettings.selectedWalletAsset &&
      aiSettings.selectedWalletAsset !== 'ALL'
    ) {
      allCcys.add(aiSettings.selectedWalletAsset.toUpperCase());
    }
    if (!hasRealWallet) {
      allCcys.add('USDC');
      allCcys.add('USDG');
    }

    // Total simulated active cost committed from virtual quote wallet
    let totalSimulatedActiveQuoteUsdc = 0;
    for (const b of activeByCcy.values()) {
      totalSimulatedActiveQuoteUsdc += b.simulatedEntryValUsdc;
    }

    let totalHistRealizedPnlUsdc = 0;
    for (const h of histMap.values()) {
      totalHistRealizedPnlUsdc += h.realizedPnlUsdc;
    }

    const defaultSimPoolUsdc = Math.max(
      20,
      parseInt(aiSettings.maxConcurrentHoldings || '4', 10) *
        parseFloat(aiSettings.tradeBudgetUsdt || '20')
    );

    const ledgerRows = [];
    const walletChoices = [];

    let sumTakenBoughtValUsdc = 0;
    let sumCurrentActiveEntryValUsdc = 0;
    let sumCurrentActiveMarketValUsdc = 0;
    let sumSoldValUsdc = 0;
    let sumRemainingToChooseValUsdc = 0;
    let sumRealizedPnlUsdc = 0;
    let sumUnrealizedPnlUsdc = 0;

    for (const ccy of allCcys) {
      const isStableQuote = ['USDC', 'USDG', 'USDT', 'EUR', 'USD'].includes(
        ccy
      );
      const wDetail = walletDetailsList.find(
        (d) => d.ccy?.toUpperCase() === ccy
      );
      const activeBucket = activeByCcy.get(ccy);
      const histBucket = histMap.get(ccy);
      const livePxUsdc = resolveLivePxUsdc(ccy) || 0;

      // Wallet available quantity
      let walletAvailQty = wDetail
        ? parseFloat(wDetail.availBal || '0')
        : !hasRealWallet && ccy === 'USDC'
        ? defaultSimPoolUsdc
        : 0;
      const walletFrozenQty = wDetail
        ? parseFloat(wDetail.frozenBal || '0')
        : 0;

      const activeQty = activeBucket ? activeBucket.activeQty : 0;
      const activeEntryValUsdc = activeBucket
        ? activeBucket.activeEntryValUsdc
        : 0;
      const activeCurrentValUsdc = activeBucket
        ? activeBucket.activeCurrentValUsdc
        : 0;

      const histBoughtQty = histBucket ? histBucket.boughtQty : 0;
      const histBoughtValUsdc = histBucket ? histBucket.boughtValUsdc : 0;
      const histSoldQty = histBucket ? histBucket.soldQty : 0;
      const histSoldValUsdc = histBucket ? histBucket.soldValUsdc : 0;
      const histSoldCostUsdc = histBucket ? histBucket.soldCostUsdc : 0;
      const histRealizedPnl = histBucket ? histBucket.realizedPnlUsdc : 0;

      // Total quantity of this asset taken to trade (active + sold)
      const takenQty = Math.max(histBoughtQty, activeQty + histSoldQty);
      // Total value bought (active entry cost + historical cost of sold units)
      const totalBoughtValUsdc = Math.max(
        histBoughtValUsdc,
        activeEntryValUsdc + histSoldCostUsdc
      );
      const avgBuyPriceUsdc =
        takenQty > 0
          ? totalBoughtValUsdc / takenQty
          : activeQty > 0
          ? activeEntryValUsdc / activeQty
          : livePxUsdc;

      const soldQty = histSoldQty;
      const totalSoldValUsdc = histSoldValUsdc;
      const avgSellPriceUsdc = soldQty > 0 ? totalSoldValUsdc / soldQty : 0;

      const unrealizedPnlUsdc =
        activeQty > 0 ? activeCurrentValUsdc - activeEntryValUsdc : 0;
      const totalAssetPnlUsdc = histRealizedPnl + unrealizedPnlUsdc;

      // How much of this asset remains in the wallet to choose for new trading
      let remainingToChooseQty = walletAvailQty;
      if (!isStableQuote) {
        // If asset is held on Spot wallet and tracked in active AI positions, deduct activeQty so we don't double-count
        remainingToChooseQty = Math.max(0, walletAvailQty - activeQty);
      } else if (ccy === 'USDC' && !hasRealWallet) {
        remainingToChooseQty = Math.max(
          0,
          defaultSimPoolUsdc +
            totalHistRealizedPnlUsdc -
            totalSimulatedActiveQuoteUsdc
        );
        walletAvailQty = remainingToChooseQty;
      } else if (
        (ccy === 'USDC' || ccy === 'USDG' || ccy === 'USDT') &&
        totalSimulatedActiveQuoteUsdc > 0 &&
        (aiSettings.selectedWalletAsset === ccy ||
          (aiSettings.selectedWalletAsset === 'ALL' && ccy === 'USDC'))
      ) {
        remainingToChooseQty = Math.max(
          0,
          walletAvailQty - totalSimulatedActiveQuoteUsdc
        );
      }

      const remainingToChooseValUsdc =
        remainingToChooseQty * (livePxUsdc || (isStableQuote ? 1 : 0));
      const walletTotalValUsdc =
        walletAvailQty * (livePxUsdc || (isStableQuote ? 1 : 0));

      if (!isStableQuote || takenQty > 0) {
        sumTakenBoughtValUsdc += totalBoughtValUsdc;
        sumCurrentActiveEntryValUsdc += activeEntryValUsdc;
        sumCurrentActiveMarketValUsdc += activeCurrentValUsdc;
        sumSoldValUsdc += totalSoldValUsdc;
        sumRealizedPnlUsdc += histRealizedPnl;
        sumUnrealizedPnlUsdc += unrealizedPnlUsdc;
      }
      sumRemainingToChooseValUsdc += remainingToChooseValUsdc;

      const rowObj = {
        ccy,
        instId:
          activeBucket?.instId ||
          histBucket?.lastInstId ||
          (isStableQuote ? `${ccy}-USDC` : `${ccy}-USDC`),
        instType: activeBucket?.instType || 'SPOT',
        isStableQuote,
        inRealWallet: Boolean(wDetail),
        isSelectedForAi: aiSettings.selectedWalletAsset === ccy,
        statusLabel:
          activeQty > 0
            ? '🟢 W handlu AI / Bot'
            : soldQty > 0
            ? '✅ Sprzedane (Zrealizowano)'
            : walletAvailQty > 0
            ? '💼 Dostępne w Portfelu'
            : '⚪ Obserwowane',
        livePxUsdc,
        livePxVal: toValCcy(livePxUsdc),
        walletAvailQty,
        walletFrozenQty,
        walletTotalVal: toValCcy(walletTotalValUsdc),
        takenQty,
        activeQty,
        soldQty,
        avgBuyPrice: toValCcy(avgBuyPriceUsdc),
        totalBoughtVal: toValCcy(totalBoughtValUsdc),
        activeEntryVal: toValCcy(activeEntryValUsdc),
        activeCurrentVal: toValCcy(activeCurrentValUsdc),
        avgSellPrice: toValCcy(avgSellPriceUsdc),
        totalSoldVal: toValCcy(totalSoldValUsdc),
        remainingToChooseQty,
        remainingToChooseVal: toValCcy(remainingToChooseValUsdc),
        realizedPnl: toValCcy(histRealizedPnl),
        unrealizedPnl: toValCcy(unrealizedPnlUsdc),
        totalPnl: toValCcy(totalAssetPnlUsdc),
      };

      ledgerRows.push(rowObj);
      if (
        wDetail ||
        walletAvailQty > 0 ||
        activeQty > 0 ||
        ['USDC', 'USDG', 'USDT', 'ONDO', 'BTC', 'ETH', 'SOL'].includes(ccy)
      ) {
        walletChoices.push(rowObj);
      }
    }

    // Sort ledger rows: active in trade first, then sold/traded, then by wallet value
    ledgerRows.sort((a, b) => {
      if ((a.activeQty > 0) !== (b.activeQty > 0)) {
        return a.activeQty > 0 ? -1 : 1;
      }
      if ((a.takenQty > 0) !== (b.takenQty > 0)) {
        return a.takenQty > 0 ? -1 : 1;
      }
      return b.remainingToChooseVal - a.remainingToChooseVal;
    });

    walletChoices.sort((a, b) => {
      if (a.inRealWallet !== b.inRealWallet) return a.inRealWallet ? -1 : 1;
      return b.walletTotalVal - a.walletTotalVal;
    });

    const summary = {
      valuationCcy,
      usdgRateInUsdc,
      selectedWalletAsset: aiSettings.selectedWalletAsset || 'ALL',
      walletAllocationPct: aiSettings.walletAllocationPct || '100',
      totalTakenBoughtVal: toValCcy(sumTakenBoughtValUsdc),
      currentInTradeEntryVal: toValCcy(sumCurrentActiveEntryValUsdc),
      currentInTradeMarketVal: toValCcy(sumCurrentActiveMarketValUsdc),
      totalSoldVal: toValCcy(sumSoldValUsdc),
      totalRemainingToChooseVal: toValCcy(sumRemainingToChooseValUsdc),
      realizedPnlVal: toValCcy(sumRealizedPnlUsdc),
      unrealizedPnlVal: toValCcy(sumUnrealizedPnlUsdc),
      totalCombinedPnlVal: toValCcy(sumRealizedPnlUsdc + sumUnrealizedPnlUsdc),
      activeAssetsCount: ledgerRows.filter((r) => r.activeQty > 0).length,
      tradedAssetsCount: ledgerRows.filter(
        (r) => r.takenQty > 0 || r.soldQty > 0
      ).length,
    };

    return {
      ledgerRows,
      walletChoices,
      summary,
    };
  }, [
    aiSettings.summaryValuationCcy,
    aiSettings.selectedWalletAsset,
    aiSettings.walletAllocationPct,
    aiSettings.maxConcurrentHoldings,
    aiSettings.tradeBudgetUsdt,
    allTickersMap,
    instId,
    ticker,
    aiLiveStatus.topOpportunities,
    aiTrackedHoldings,
    accountBalance?.details,
    actionHistory,
    autoSettings.targetInstId,
    autoSettings.executeRealOrders,
    autoBotCycleState,
    hasCredentials,
  ]);

  // Report active positions, pending TP/SL target orders, executed order history, AND live Asset Ledger up to App.jsx
  // so both the bottom panel and "Portfel Handlowy" are always updated in real time!
  useEffect(() => {
    if (!onSyncAutomationBook) return;

    const activePairForBot = (
      autoSettings.targetInstId ||
      instId ||
      'ONDO-USDC'
    ).trim();
    const botTpPct = parseFloat(autoSettings.takeProfitPct || '1.2');
    const botSlPct = parseFloat(autoSettings.stopLossPct || '2.0');
    const aiTpPct = parseFloat(aiSettings.targetProfitPct || '1.1');
    const aiSlPct = parseFloat(aiSettings.stopLossPct || '1.8');

    const botPositions = [];
    const pendingTargets = [];

    if (
      autoBotCycleState.openCyclesCount > 0 &&
      autoBotCycleState.heldBaseQty > 0 &&
      autoBotCycleState.avgEntryPrice > 0
    ) {
      const tpPx = (
        autoBotCycleState.avgEntryPrice *
        (1 + botTpPct / 100)
      ).toFixed(5);
      const slPx = (
        autoBotCycleState.avgEntryPrice *
        (1 - botSlPct / 100)
      ).toFixed(5);

      botPositions.push({
        id: `autobot-${activePairForBot}`,
        source: 'Auto-Bot (Reguły)',
        instId: activePairForBot,
        instType: activePairForBot.endsWith('-SWAP') ? 'SWAP' : 'SPOT',
        baseCcy: activePairForBot.split('-')[0],
        qty: autoBotCycleState.heldBaseQty,
        entryPrice: autoBotCycleState.avgEntryPrice,
        currentPrice:
          activePairForBot === instId && ticker?.last
            ? parseFloat(ticker.last)
            : autoBotCycleState.referencePrice ||
              autoBotCycleState.avgEntryPrice,
        tpPrice: tpPx,
        slPrice: slPx,
      });

      pendingTargets.push({
        ordId: `tp-bot-${activePairForBot}`,
        cTime: Date.now(),
        instId: activePairForBot,
        instType: 'AUTO-BOT TP/SL',
        ordType: `TAKE PROFIT (+${botTpPct}%) / SL (-${botSlPct}%)`,
        side: 'sell',
        px: `${tpPx} (SL: ${slPx})`,
        sz: String(autoBotCycleState.heldBaseQty.toFixed(4)),
        accFillSz: 'Aktywny nadzór',
        isAutomationTarget: true,
      });
    }

    for (const h of aiTrackedHoldings) {
      const oppMatch = aiLiveStatus.topOpportunities?.find(
        (o) => o.instId === h.instId
      );
      const livePx =
        h.instId === instId && ticker?.last
          ? parseFloat(ticker.last)
          : allTickersMap?.[h.instId]?.last
          ? parseFloat(allTickersMap[h.instId].last)
          : oppMatch?.lastPrice || h.currentPrice || h.entryPrice;
      const tpPx = (h.entryPrice * (1 + aiTpPct / 100)).toFixed(5);
      const slPx = (h.entryPrice * (1 - aiSlPct / 100)).toFixed(5);

      botPositions.push({
        id: `ai-${h.instId}`,
        source: h.fromWallet ? '🤖 Agent AI (Portfel)' : '🤖 Agent AI',
        instId: h.instId,
        instType: h.instType || 'SPOT',
        baseCcy: h.baseCcy || h.instId.split('-')[0],
        qty: Number(h.qty || 0),
        entryPrice: Number(h.entryPrice || livePx),
        currentPrice: Number(livePx || h.entryPrice),
        tpPrice: tpPx,
        slPrice: slPx,
        executedVia: h.executedVia || 'AI',
      });

      pendingTargets.push({
        ordId: `tp-ai-${h.instId}`,
        cTime: Date.now(),
        instId: h.instId,
        instType: '🤖 AGENT AI TP/SL',
        ordType: `AI TAKE PROFIT (+${aiTpPct}%)`,
        side: 'sell',
        px: `${tpPx} (SL: ${slPx})`,
        sz: String(Number(h.qty || 0).toFixed(4)),
        accFillSz: 'Monitorowane przez AI',
        isAutomationTarget: true,
      });
    }

    const mappedOrders = actionHistory
      .filter((item) => item.actionType !== 'ERROR')
      .slice(0, 40)
      .map((item) => ({
        ordId: item.ordId || `act-${item.id}`,
        uTime: item.epochMs || Date.now(),
        cTime: item.epochMs || Date.now(),
        timeLabel: `${item.dateStr || ''} ${item.timestamp || ''}`.trim(),
        instId: item.instId,
        ordType: item.source || 'AUTO/AI',
        side: item.side?.toLowerCase().includes('sell')
          ? 'sell'
          : item.side?.toLowerCase().includes('swap')
          ? 'swap'
          : 'buy',
        sideLabel: item.side,
        avgPx: item.priceStr || 'Market',
        px: item.priceStr || 'Market',
        accFillSz: item.amountStr || '—',
        sz: item.amountStr || '—',
        pnl:
          typeof item.profitUsd === 'number'
            ? String(item.profitUsd.toFixed(4))
            : '0',
        state: item.executedVia?.includes('API OKX')
          ? 'filled (OKX API)'
          : 'filled (AI/Bot)',
        isAutomationHistory: true,
      }));

    onSyncAutomationBook({
      activePositions: botPositions,
      pendingTargetOrders: pendingTargets,
      executedOrders: mappedOrders,
      assetLedger: assetLedgerAndSummary.ledgerRows,
      assetSummary: assetLedgerAndSummary.summary,
      onEmergencyClosePosition: (id) =>
        emergencyHandlersRef.current?.closeSingle?.(id),
      onEmergencyCloseAllPositions: (stopAi) =>
        emergencyHandlersRef.current?.closeAll?.(stopAi),
      onSelectWalletAssetForAi: (ccy) =>
        emergencyHandlersRef.current?.selectWalletAsset?.(ccy),
      onTakeWalletAssetToAi: (ccy) =>
        emergencyHandlersRef.current?.takeWalletAsset?.(ccy),
      onChangeValuationCcy: (ccy) =>
        emergencyHandlersRef.current?.setValuationCcy?.(ccy),
    });
  }, [
    onSyncAutomationBook,
    autoBotCycleState,
    aiTrackedHoldings,
    aiLiveStatus.topOpportunities,
    actionHistory,
    autoSettings,
    aiSettings,
    instId,
    ticker,
    allTickersMap,
    assetLedgerAndSummary,
  ]);

  // ============================================================================
  // CROSS-DEVICE CLOUD SYNC ENGINE (DESKTOP <-> PHONE REAL-TIME STATE SYNC)
  // ============================================================================
  const publishCrossDeviceState = useCallback(async (overrides = {}) => {
    if (isApplyingRemoteRef.current) return;
    const now = Date.now();
    localUpdatedAtRef.current = now;
    try {
      localStorage.setItem(
        SYNC_META_KEY,
        JSON.stringify({ updatedAt: now, deviceId: deviceIdRef.current })
      );
    } catch {
      // ignore
    }

    const cur = { ...latestStateRef.current, ...overrides };
    const compactPayload = {
      v: 2,
      updatedAt: now,
      deviceId: deviceIdRef.current,
      autoBotEnabled: Boolean(cur.autoBotEnabled),
      aiAgentEnabled: Boolean(cur.aiAgentEnabled),
      autoSettings: cur.autoSettings,
      aiSettings: cur.aiSettings,
      autoBotCycleState: {
        referencePrice: cur.autoBotCycleState?.referencePrice || null,
        avgEntryPrice: cur.autoBotCycleState?.avgEntryPrice || null,
        heldBaseQty: cur.autoBotCycleState?.heldBaseQty || 0,
        openCyclesCount: cur.autoBotCycleState?.openCyclesCount || 0,
        lastCheckTime: cur.autoBotCycleState?.lastCheckTime || null,
        lastStatusMsg: (cur.autoBotCycleState?.lastStatusMsg || '').slice(
          0,
          140
        ),
        realizedProfitUsd: cur.autoBotCycleState?.realizedProfitUsd || 0,
      },
      aiTrackedHoldings: (cur.aiTrackedHoldings || []).slice(0, 6),
      aiLiveStatus: {
        lastScanTime: cur.aiLiveStatus?.lastScanTime || null,
        scannedCount: cur.aiLiveStatus?.scannedCount || 0,
        currentThought: (cur.aiLiveStatus?.currentThought || '').slice(0, 160),
        cumulativeProfitUsd: cur.aiLiveStatus?.cumulativeProfitUsd || 0,
        totalSwapsCount: cur.aiLiveStatus?.totalSwapsCount || 0,
        totalTradesCount: cur.aiLiveStatus?.totalTradesCount || 0,
      },
      recentHistory: (cur.actionHistory || []).slice(0, 6).map((h) => ({
        ...h,
        reason: (h.reason || '').slice(0, 120),
      })),
    };

    try {
      await fetch(`${NTFY_BASE_URL}/${CROSS_DEVICE_SYNC_TOPIC}`, {
        method: 'POST',
        body: JSON.stringify(compactPayload),
      });
      setSyncStatus((prev) => ({
        ...prev,
        connected: true,
        lastSyncTime: new Date().toLocaleTimeString(),
      }));
    } catch {
      // ignore network hiccup
    }
  }, []);

  const applyIncomingRemoteState = useCallback(
    (packet) => {
      if (!packet || packet.v !== 2 || !packet.updatedAt) return;
      if (packet.deviceId === deviceIdRef.current) return;
      if (packet.updatedAt <= localUpdatedAtRef.current) return;

      isApplyingRemoteRef.current = true;
      localUpdatedAtRef.current = packet.updatedAt;
      try {
        localStorage.setItem(
          SYNC_META_KEY,
          JSON.stringify({
            updatedAt: packet.updatedAt,
            deviceId: packet.deviceId,
          })
        );
      } catch {
        // ignore
      }

      if (typeof packet.autoBotEnabled === 'boolean') {
        setAutoBotEnabled(packet.autoBotEnabled);
      }
      if (typeof packet.aiAgentEnabled === 'boolean') {
        setAiAgentEnabled(packet.aiAgentEnabled);
      }
      if (packet.autoSettings) {
        setAutoSettings((prev) => ({ ...prev, ...packet.autoSettings }));
      }
      if (packet.aiSettings) {
        setAiSettings((prev) => ({ ...prev, ...packet.aiSettings }));
      }
      if (packet.autoBotCycleState) {
        setAutoBotCycleState((prev) => ({
          ...prev,
          ...packet.autoBotCycleState,
        }));
      }
      if (Array.isArray(packet.aiTrackedHoldings)) {
        setAiTrackedHoldings(packet.aiTrackedHoldings);
      }
      if (packet.aiLiveStatus) {
        setAiLiveStatus((prev) => ({
          ...prev,
          ...packet.aiLiveStatus,
        }));
      }
      if (
        Array.isArray(packet.recentHistory) &&
        packet.recentHistory.length > 0
      ) {
        setActionHistory((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const remItem of packet.recentHistory) {
            if (remItem?.id && !existingIds.has(remItem.id)) {
              merged.unshift(remItem);
              existingIds.add(remItem.id);
            }
          }
          return merged.slice(0, 150);
        });
      }

      setSyncStatus({
        connected: true,
        lastSyncTime: new Date().toLocaleTimeString(),
        remoteDevice: packet.deviceId,
      });

      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 80);
    },
    [setAutoBotEnabled, setAiAgentEnabled]
  );

  const pullLatestCrossDeviceState = useCallback(
    async (isInitialMount = false) => {
      try {
        const res = await fetch(
          `${NTFY_BASE_URL}/${CROSS_DEVICE_SYNC_TOPIC}/json?poll=1&since=48h`
        );
        if (!res.ok) return;
        const text = await res.text();
        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);

        let newestPacket = null;
        for (const line of lines) {
          try {
            const env = JSON.parse(line);
            if (env.event === 'message' && env.message) {
              const parsed = JSON.parse(env.message);
              if (
                parsed &&
                parsed.v === 2 &&
                parsed.updatedAt &&
                (!newestPacket || parsed.updatedAt > newestPacket.updatedAt)
              ) {
                newestPacket = parsed;
              }
            }
          } catch {
            // ignore non-JSON lines
          }
        }

        setSyncStatus((prev) => ({
          ...prev,
          connected: true,
          lastSyncTime: new Date().toLocaleTimeString(),
        }));

        if (newestPacket) {
          if (newestPacket.updatedAt > localUpdatedAtRef.current) {
            applyIncomingRemoteState(newestPacket);
          } else if (
            isInitialMount &&
            localUpdatedAtRef.current > newestPacket.updatedAt
          ) {
            publishCrossDeviceState();
          }
        } else if (
          isInitialMount &&
          (latestStateRef.current.autoBotEnabled ||
            latestStateRef.current.aiAgentEnabled ||
            latestStateRef.current.actionHistory?.length > 0)
        ) {
          publishCrossDeviceState();
        }
      } catch {
        // ignore network error
      }
    },
    [applyIncomingRemoteState, publishCrossDeviceState]
  );

  // Connect live WebSocket + periodic poll + focus/visibility sync for Desktop <-> Mobile
  useEffect(() => {
    pullLatestCrossDeviceState(true);

    let ws = null;
    try {
      ws = new WebSocket(`${NTFY_WS_URL}/${CROSS_DEVICE_SYNC_TOPIC}/ws`);
      ws.onopen = () => {
        setSyncStatus((prev) => ({ ...prev, connected: true }));
      };
      ws.onmessage = (evt) => {
        try {
          const env = JSON.parse(evt.data);
          if (env.event === 'message' && env.message) {
            const parsed = JSON.parse(env.message);
            applyIncomingRemoteState(parsed);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore ws error, polling handles fallback
    }

    const pollTimer = setInterval(() => {
      pullLatestCrossDeviceState(false);
    }, 5000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        pullLatestCrossDeviceState(false);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [pullLatestCrossDeviceState, applyIncomingRemoteState]);

  // Whenever the user clicks a toggle button in App.jsx or inside AutoTradingPanels, broadcast immediately
  useEffect(() => {
    if (!userToggleSignal) return;
    publishCrossDeviceState({
      autoBotEnabled,
      aiAgentEnabled,
    });
  }, [userToggleSignal, autoBotEnabled, aiAgentEnabled, publishCrossDeviceState]);

  const appendHistory = useCallback(
    (entry) => {
      const nowMs = Date.now();
      const newItem = {
        id: `${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
        epochMs: nowMs,
        timestamp: new Date(nowMs).toLocaleTimeString(),
        dateStr: new Date(nowMs).toLocaleDateString(),
        ...entry,
      };
      setActionHistory((prev) => {
        const next = [newItem, ...prev].slice(0, 150);
        setTimeout(() => {
          publishCrossDeviceState({ actionHistory: next });
        }, 50);
        return next;
      });
    },
    [publishCrossDeviceState]
  );

  // Calculate total accumulated profits from history
  const totalRealizedProfit = actionHistory.reduce(
    (acc, item) =>
      acc + (typeof item.profitUsd === 'number' ? item.profitUsd : 0),
    0
  );

  // ============================================================================
  // HELPER: EXECUTE ORDER (REAL OKX API WITH instIdCode + LIMIT/VIRTUAL FALLBACK)
  // ============================================================================
  const executeBotOrAiOrder = useCallback(
    async ({
      source, // 'AUTOBOT' | 'AI_AGENT'
      targetInstId,
      targetInstCode,
      targetInstType = 'SPOT',
      side, // 'buy' | 'sell'
      amountMode = 'quote', // 'base' | 'quote'
      amountValue,
      currentPrice,
      shouldSendApi,
    }) => {
      const px = parseFloat(currentPrice || '0');
      const rawAmt = parseFloat(amountValue || '0');
      if (!rawAmt || rawAmt <= 0 || !px || px <= 0) {
        throw new Error('Nieprawidłowa ilość lub cena instrumentu.');
      }

      const parts = targetInstId.split('-');
      const baseCcy = parts[0] || '';
      const quoteCcy = parts[1] || 'USDC';

      let baseQty = amountMode === 'quote' ? (rawAmt / px) * 0.996 : rawAmt;
      let quoteVal = amountMode === 'quote' ? rawAmt : rawAmt * px;

      if (shouldSendApi && hasCredentials) {
        const region = credentials.region || 'global';
        const isDemo = Boolean(credentials.isDemo);

        // Check available balance in wallet for SPOT buy orders so we adjust to available funds
        let availQuote = 0;
        if (accountBalance?.details?.length) {
          const quoteDetail = accountBalance.details.find(
            (d) => d.ccy === quoteCcy
          );
          availQuote = parseFloat(quoteDetail?.availBal || '0');
          if (
            targetInstType === 'SPOT' &&
            side === 'buy' &&
            availQuote > 0 &&
            availQuote < quoteVal &&
            availQuote >= 1.2
          ) {
            quoteVal = Math.floor(availQuote * 97) / 100;
            baseQty = (quoteVal / px) * 0.996;
          }
        }

        // Fetch instrument metadata (lotSz, minSz, tickSz, instIdCode)
        const info = await fetchInstrumentInfo(
          targetInstId,
          targetInstType,
          region
        ).catch(() => null);

        const resolvedCode =
          targetInstCode !== undefined &&
          targetInstCode !== null &&
          targetInstCode !== ''
            ? Number(targetInstCode)
            : info?.instIdCode !== undefined && info?.instIdCode !== ''
            ? Number(info.instIdCode)
            : await resolveInstIdCode(
                targetInstId,
                targetInstType,
                region,
                isDemo
              );

        // Format base quantity strictly to lotSz and minSz so it works across both Market and Limit orders
        let szBaseStr;
        if (info?.lotSz) {
          const lot = parseFloat(info.lotSz);
          if (lot > 0) {
            const decimals = info.lotSz.includes('.')
              ? info.lotSz.split('.')[1].length
              : 0;
            const stepped = Math.floor(baseQty / lot) * lot;
            szBaseStr = stepped.toFixed(decimals);
          }
        }
        if (!szBaseStr || parseFloat(szBaseStr) <= 0) {
          szBaseStr =
            px >= 1000
              ? baseQty.toFixed(6)
              : px >= 1
              ? baseQty.toFixed(4)
              : baseQty.toFixed(2);
        }
        if (info?.minSz && parseFloat(szBaseStr) < parseFloat(info.minSz)) {
          szBaseStr = String(info.minSz);
        }

        baseQty = parseFloat(szBaseStr);
        quoteVal = baseQty * px;

        // Format limit price strictly to tickSz for fallback limit orders
        let limitPxStr = String(px);
        if (info?.tickSz) {
          const tick = parseFloat(info.tickSz);
          if (tick > 0) {
            const tickDec = info.tickSz.includes('.')
              ? info.tickSz.split('.')[1].length
              : 0;
            const aggPx = side === 'buy' ? px * 1.0015 : px * 0.9985;
            const steppedPx = Math.round(aggPx / tick) * tick;
            limitPxStr = steppedPx.toFixed(tickDec);
          }
        }

        try {
          // 1st attempt: Market order in base_ccy units (widely supported across OKX Spot & Swap)
          let res;
          try {
            res = await placeOrder(credentials, {
              instId: targetInstId,
              instIdCode: resolvedCode,
              instType: targetInstType,
              tdMode: targetInstType === 'SPOT' ? 'cash' : 'cross',
              side,
              ordType: 'market',
              sz: szBaseStr,
              tgtCcy: targetInstType === 'SPOT' ? 'base_ccy' : undefined,
            });
          } catch (mktErr) {
            const mCode = String(mktErr?.code || '');
            // If market order is restricted on this pair (e.g. pre_quote / limit-only / price band),
            // immediately place a marketable Limit order at current price!
            if (
              mCode === '51015' ||
              mCode === '51000' ||
              mCode === '51006' ||
              mCode === '51020' ||
              mCode === '51131'
            ) {
              res = await placeOrder(credentials, {
                instId: targetInstId,
                instIdCode: resolvedCode,
                instType: targetInstType,
                tdMode: targetInstType === 'SPOT' ? 'cash' : 'cross',
                side,
                ordType: 'limit',
                px: limitPxStr,
                sz: szBaseStr,
              });
            } else {
              throw mktErr;
            }
          }

          if (onRefreshPrivateData) {
            onRefreshPrivateData();
          }

          return {
            executedVia: `API OKX (${
              credentials.isDemo ? 'Demo' : 'Live'
            } • ID: ${res?.ordId || 'OK'})`,
            ordId: res?.ordId || `okx-${Date.now()}`,
            baseQty,
            quoteVal,
            baseCcy,
            quoteCcy,
            price: px,
            isRealApiOrder: true,
          };
        } catch (apiErr) {
          const errCode = String(apiErr?.code || '');
          // If instrument does not exist on user's regional exchange (50014 / 51001 / 51155),
          // flag it so the caller can try the next candidate first
          if (
            errCode === '50014' ||
            errCode === '51001' ||
            errCode === '51155' ||
            errCode === '51004'
          ) {
            apiErr.isInstrumentUnsupported = true;
            throw apiErr;
          }

          // For Autonomous AI Agent: if OKX rejects due to insufficient free quote currency balance (51008)
          // or minimum lot size vs available cash, execute as an active AI Virtual Position so the AI Agent
          // still opens and tracks the position, records the order, and shows the exact exchange status!
          if (source === 'AI_AGENT') {
            const shortReason =
              errCode === '51008'
                ? `brak wolnego salda ${quoteCcy} na koncie (dostępne: ${availQuote.toFixed(
                    2
                  )} ${quoteCcy})`
                : `kod OKX ${errCode || 'API'}`;
            return {
              executedVia: `Pozycja AI (${shortReason})`,
              ordId: `AI-${Date.now().toString().slice(-6)}`,
              baseQty,
              quoteVal,
              baseCcy,
              quoteCcy,
              price: px,
              isRealApiOrder: false,
            };
          }
          throw apiErr;
        }
      }

      // Simulated execution when API is not connected or Dry-Run mode is chosen
      return {
        executedVia: hasCredentials
          ? 'Tryb Symulacji'
          : 'Symulacja (Brak klucza API)',
        ordId: `SIM-${Date.now().toString().slice(-6)}`,
        baseQty,
        quoteVal,
        baseCcy,
        quoteCcy,
        price: px,
        isRealApiOrder: false,
      };
    },
    [credentials, hasCredentials, accountBalance, onRefreshPrivateData]
  );

  // ============================================================================
  // ENGINE 1: RULE-BASED AUTO-TRADING BOT EXECUTION STEP
  // ============================================================================
  const autoBotStateRef = useRef(autoBotCycleState);
  autoBotStateRef.current = autoBotCycleState;

  const runAutoBotStep = useCallback(
    async (manualTrigger = false) => {
      const targetPair = (
        autoSettings.targetInstId ||
        instId ||
        'ONDO-USDC'
      ).trim();
      const targetType = targetPair.endsWith('-SWAP')
        ? 'SWAP'
        : instId === targetPair
        ? instType
        : 'SPOT';

      try {
        const liveTk =
          targetPair === instId && ticker
            ? ticker
            : await fetchTicker(targetPair, credentials.region || 'global');
        const liveOb =
          targetPair === instId && orderBook?.bids?.length
            ? orderBook
            : await fetchOrderBook(
                targetPair,
                5,
                credentials.region || 'global'
              );

        if (!liveTk || !liveTk.last) {
          setAutoBotCycleState((prev) => ({
            ...prev,
            lastCheckTime: new Date().toLocaleTimeString(),
            lastStatusMsg: `Brak odczytu ceny dla ${targetPair}.`,
          }));
          return;
        }

        const lastPx = parseFloat(liveTk.last);
        const high24 = parseFloat(liveTk.high24h || lastPx);
        const low24 = parseFloat(liveTk.low24h || lastPx);
        const open24 = parseFloat(liveTk.open24h || lastPx);
        const range24 =
          high24 > low24 ? (lastPx - low24) / (high24 - low24) : 0.5;

        const bidVol = (liveOb?.bids || []).reduce(
          (s, b) => s + parseFloat(b[1] || '0'),
          0
        );
        const askVol = (liveOb?.asks || []).reduce(
          (s, a) => s + parseFloat(a[1] || '0'),
          0
        );
        const obRatio = askVol > 0 ? bidVol / askVol : 1;

        const st = autoBotStateRef.current;
        const refPx = st.referencePrice || lastPx;
        const tpPct = parseFloat(autoSettings.takeProfitPct || '1.2');
        const slPct = parseFloat(autoSettings.stopLossPct || '2.0');
        const dipPct = parseFloat(autoSettings.dipBuyPct || '0.5');
        const maxCycles = parseInt(autoSettings.maxOpenCycles || '3', 10);
        const rules = autoSettings.activeRules || {};

        // 1. CHECK TAKE PROFIT OR STOP LOSS IF HOLDING AN ACTIVE CYCLE
        if (
          st.openCyclesCount > 0 &&
          st.avgEntryPrice > 0 &&
          st.heldBaseQty > 0
        ) {
          const pnlPct = ((lastPx - st.avgEntryPrice) / st.avgEntryPrice) * 100;

          if (pnlPct >= tpPct) {
            const execRes = await executeBotOrAiOrder({
              source: 'AUTOBOT',
              targetInstId: targetPair,
              targetInstType: targetType,
              side: 'sell',
              amountMode: 'base',
              amountValue: st.heldBaseQty,
              currentPrice: lastPx,
              shouldSendApi: autoSettings.executeRealOrders,
            });

            const profitUsd = (lastPx - st.avgEntryPrice) * st.heldBaseQty;

            setAutoBotCycleState((prev) => ({
              ...prev,
              referencePrice: lastPx,
              avgEntryPrice: null,
              heldBaseQty: 0,
              openCyclesCount: 0,
              lastCheckTime: new Date().toLocaleTimeString(),
              lastStatusMsg: `Zrealizowano Take Profit (+${pnlPct.toFixed(
                2
              )}%) na ${targetPair}!`,
              realizedProfitUsd: (prev.realizedProfitUsd || 0) + profitUsd,
            }));

            appendHistory({
              ordId: execRes.ordId,
              source: 'Auto-Bot (Reguły)',
              actionType: 'TAKE_PROFIT',
              instId: targetPair,
              side: 'SELL',
              rawBaseCcy: execRes.baseCcy,
              rawQty: st.heldBaseQty,
              rawPrice: lastPx,
              rawQuoteVal: st.heldBaseQty * lastPx,
              rawEntryPrice: st.avgEntryPrice,
              rawCostVal: st.heldBaseQty * st.avgEntryPrice,
              amountStr: `${st.heldBaseQty.toFixed(4)} ${execRes.baseCcy}`,
              priceStr: `${lastPx}`,
              profitUsd,
              executedVia: execRes.executedVia,
              reason: `Osiągnięto próg Take Profit (+${pnlPct.toFixed(
                2
              )}% >= +${tpPct}%). Sprzedano po ${lastPx} (wejście: ${st.avgEntryPrice.toFixed(
                5
              )}). [${execRes.executedVia}]`,
            });
            return;
          }

          if (pnlPct <= -slPct && !rules.smart_dca) {
            const execRes = await executeBotOrAiOrder({
              source: 'AUTOBOT',
              targetInstId: targetPair,
              targetInstType: targetType,
              side: 'sell',
              amountMode: 'base',
              amountValue: st.heldBaseQty,
              currentPrice: lastPx,
              shouldSendApi: autoSettings.executeRealOrders,
            });

            const lossUsd = (lastPx - st.avgEntryPrice) * st.heldBaseQty;

            setAutoBotCycleState((prev) => ({
              ...prev,
              referencePrice: lastPx,
              avgEntryPrice: null,
              heldBaseQty: 0,
              openCyclesCount: 0,
              lastCheckTime: new Date().toLocaleTimeString(),
              lastStatusMsg: `Zadziałał Stop Loss (${pnlPct.toFixed(
                2
              )}%) na ${targetPair}.`,
              realizedProfitUsd: (prev.realizedProfitUsd || 0) + lossUsd,
            }));

            appendHistory({
              ordId: execRes.ordId,
              source: 'Auto-Bot (Reguły)',
              actionType: 'STOP_LOSS',
              instId: targetPair,
              side: 'SELL',
              rawBaseCcy: execRes.baseCcy,
              rawQty: st.heldBaseQty,
              rawPrice: lastPx,
              rawQuoteVal: st.heldBaseQty * lastPx,
              rawEntryPrice: st.avgEntryPrice,
              rawCostVal: st.heldBaseQty * st.avgEntryPrice,
              amountStr: `${st.heldBaseQty.toFixed(4)} ${execRes.baseCcy}`,
              priceStr: `${lastPx}`,
              profitUsd: lossUsd,
              executedVia: execRes.executedVia,
              reason: `Ochrona kapitału Stop Loss (${pnlPct.toFixed(
                2
              )}% <= -${slPct}%). [${execRes.executedVia}]`,
            });
            return;
          }
        }

        // 2. EVALUATE ACTIVE BUY RULES IF UNDER MAX CYCLES
        if (st.openCyclesCount < maxCycles) {
          const dropFromRefPct = ((refPx - lastPx) / refPx) * 100;
          const dropFromAvgPct =
            st.avgEntryPrice > 0
              ? ((st.avgEntryPrice - lastPx) / st.avgEntryPrice) * 100
              : dropFromRefPct;

          let triggeredRule = null;
          let triggerReason = '';

          // Rule 1: Grid & Spread Scalping (also opens initial grid base order when openCyclesCount === 0)
          if (
            rules.grid_scalp &&
            (st.openCyclesCount === 0 || dropFromRefPct >= dipPct)
          ) {
            triggeredRule = 'Grid & Spread Scalping';
            triggerReason =
              st.openCyclesCount === 0
                ? `Otwarcie pozycji bazowej siatki Grid na ${targetPair} po cenie ${lastPx}. Cel TP: +${tpPct}%.`
                : `Cena ${targetPair} spadła o -${dropFromRefPct.toFixed(
                    2
                  )}% od bazy siatki (${refPx.toFixed(
                    5
                  )} ➔ ${lastPx}). Dokupienie do siatki pod odbicie +${tpPct}%.`;
          }
          // Rule 2: Mean Reversion & Oversold Bounce
          else if (
            rules.mean_reversion &&
            range24 <= 0.35 &&
            obRatio >= 1.02
          ) {
            triggeredRule = 'Mean Reversion (Wyprzedanie)';
            triggerReason = `Kurs w dolnych ${(range24 * 100).toFixed(
              0
            )}% zakresu 24h przy przewadze popytu Bid/Ask = ${obRatio.toFixed(
              2
            )}x. Zakup pod powrót do średniej.`;
          }
          // Rule 3: Momentum & Trend Breakout
          else if (
            rules.momentum_breakout &&
            lastPx > open24 &&
            range24 >= 0.55 &&
            obRatio >= 1.08
          ) {
            triggeredRule = 'Momentum Breakout (Trend)';
            triggerReason = `Silny trend wzrostowy (+${(
              ((lastPx - open24) / open24) *
              100
            ).toFixed(
              2
            )}% 24h) oraz przewaga kupujących w arkuszu (${obRatio.toFixed(
              2
            )}x). Wejście z trendem.`;
          }
          // Rule 4: Smart DCA
          else if (
            rules.smart_dca &&
            (st.openCyclesCount === 0 || dropFromAvgPct >= dipPct)
          ) {
            triggeredRule = 'Smart DCA (Uśrednianie)';
            triggerReason =
              st.openCyclesCount === 0
                ? `Otwarcie pierwszej transzy Smart DCA dla ${targetPair} po cenie ${lastPx}.`
                : `Dokupienie transzy #${
                    st.openCyclesCount + 1
                  } Smart DCA na spadku -${dropFromAvgPct.toFixed(
                    2
                  )}% poniżej średniej ceny wejścia.`;
          }
          // Manual trigger test
          else if (manualTrigger) {
            const activeNames = AUTO_TRADING_RULES_CATALOG.filter(
              (r) => rules[r.id]
            ).map((r) => r.name.split('(')[0].trim());
            triggeredRule = activeNames[0] || 'Reguła Aktywna';
            triggerReason = `Wejście reguły (${triggeredRule}) na ${targetPair} po cenie ${lastPx} (Bid/Ask: ${obRatio.toFixed(
              2
            )}x).`;
          }

          if (triggeredRule) {
            const execRes = await executeBotOrAiOrder({
              source: 'AUTOBOT',
              targetInstId: targetPair,
              targetInstType: targetType,
              side: 'buy',
              amountMode: autoSettings.amountMode,
              amountValue: autoSettings.tradeAmount,
              currentPrice: lastPx,
              shouldSendApi: autoSettings.executeRealOrders,
            });

            const prevQty = st.heldBaseQty || 0;
            const prevCost = (st.avgEntryPrice || lastPx) * prevQty;
            const newTotalQty = prevQty + execRes.baseQty;
            const newAvgEntry =
              newTotalQty > 0
                ? (prevCost + execRes.baseQty * lastPx) / newTotalQty
                : lastPx;

            setAutoBotCycleState((prev) => ({
              ...prev,
              referencePrice: lastPx,
              avgEntryPrice: newAvgEntry,
              heldBaseQty: newTotalQty,
              openCyclesCount: (prev.openCyclesCount || 0) + 1,
              lastCheckTime: new Date().toLocaleTimeString(),
              lastStatusMsg: `[${triggeredRule}] Kupiono ${execRes.baseQty.toFixed(
                4
              )} ${execRes.baseCcy} po ${lastPx}. Cel TP: ${(
                newAvgEntry *
                (1 + tpPct / 100)
              ).toFixed(5)}`,
            }));

            appendHistory({
              ordId: execRes.ordId,
              source: `Auto-Bot • ${triggeredRule}`,
              actionType: 'BUY_RULE',
              instId: targetPair,
              side: 'BUY',
              rawBaseCcy: execRes.baseCcy,
              rawQty: execRes.baseQty,
              rawPrice: lastPx,
              rawQuoteVal: execRes.quoteVal,
              amountStr: `${execRes.baseQty.toFixed(4)} ${
                execRes.baseCcy
              } ($${execRes.quoteVal.toFixed(2)})`,
              priceStr: `${lastPx}`,
              profitUsd: null,
              executedVia: execRes.executedVia,
              reason: `${triggerReason} [${execRes.executedVia}]`,
            });
            return;
          }
        }

        // No trade triggered on this tick — update status
        setAutoBotCycleState((prev) => ({
          ...prev,
          referencePrice: prev.referencePrice || lastPx,
          lastCheckTime: new Date().toLocaleTimeString(),
          lastStatusMsg:
            prev.openCyclesCount > 0 && prev.avgEntryPrice
              ? `Aktywna pozycja ${targetPair} (śr. wejście: ${prev.avgEntryPrice.toFixed(
                  5
                )}, teraz: ${lastPx}, zmiana: ${(
                  ((lastPx - prev.avgEntryPrice) / prev.avgEntryPrice) *
                  100
                ).toFixed(2)}%). Czekam na TP +${tpPct}%...`
              : `Skanowanie ${targetPair} (cena: ${lastPx}, baza: ${refPx.toFixed(
                  5
                )}, Bid/Ask: ${obRatio.toFixed(
                  2
                )}x). Oczekiwanie na sygnał aktywnych reguł...`,
        }));
      } catch (err) {
        setAutoBotCycleState((prev) => ({
          ...prev,
          lastCheckTime: new Date().toLocaleTimeString(),
          lastStatusMsg: `Błąd wykonania Auto-Bota: ${err.message}`,
        }));
        appendHistory({
          source: 'Auto-Bot (Reguły)',
          actionType: 'ERROR',
          instId: targetPair,
          side: '—',
          amountStr: '—',
          priceStr: '—',
          profitUsd: null,
          reason: `Błąd: ${err.message}`,
        });
      }
    },
    [
      autoSettings,
      instId,
      instType,
      ticker,
      orderBook,
      credentials.region,
      executeBotOrAiOrder,
      appendHistory,
    ]
  );

  // Interval timer for Rule-Based Auto-Bot
  useEffect(() => {
    if (!autoBotEnabled) return;
    runAutoBotStep(false);
    const sec = Math.max(
      5,
      parseInt(autoSettings.checkIntervalSec || '15', 10)
    );
    const timer = setInterval(() => {
      runAutoBotStep(false);
    }, sec * 1000);
    return () => clearInterval(timer);
  }, [autoBotEnabled, autoSettings.checkIntervalSec, runAutoBotStep]);

  // ============================================================================
  // ENGINE 2: AUTONOMOUS MULTI-MARKET AI AGENT (SCAN, PROFIT HARVEST & SWAP)
  // ============================================================================
  const aiHoldingsRef = useRef(aiTrackedHoldings);
  aiHoldingsRef.current = aiTrackedHoldings;

  /**
   * Computes an AI Opportunity Score (0 - 100) for any OKX instrument + live ticker.
   */
  const scoreInstrumentOpportunity = useCallback((inst, tk) => {
    if (!inst || !tk) return null;
    if (inst.state && inst.state !== 'live') return null;

    const instIdCodeNum =
      inst.instIdCode !== undefined &&
      inst.instIdCode !== null &&
      inst.instIdCode !== ''
        ? Number(inst.instIdCode)
        : undefined;
    if (instIdCodeNum === undefined || Number.isNaN(instIdCodeNum)) {
      return null;
    }

    const last = parseFloat(tk.last || '0');
    const open = parseFloat(tk.open24h || '0');
    const high = parseFloat(tk.high24h || '0');
    const low = parseFloat(tk.low24h || '0');
    const bid = parseFloat(tk.bidPx || last);
    const ask = parseFloat(tk.askPx || last);
    const volCcy = parseFloat(tk.volCcy24h || tk.vol24h || '0');

    if (last <= 0 || open <= 0 || high <= low) return null;

    // Spread % check — avoid illiquid wide spreads (> 0.65%)
    const spreadPct = ask > 0 ? ((ask - bid) / last) * 100 : 0;
    if (spreadPct > 0.65) return null;

    const change24hPct = ((last - open) / open) * 100;
    const volatility24hPct = ((high - low) / low) * 100;
    const posInRange = (last - low) / (high - low); // 0.0 = at 24h low, 1.0 = at 24h high

    if (volatility24hPct < 0.6) return null;

    const baseCcy = inst.baseCcy || inst.instId.split('-')[0];
    let score = 52;
    let signalType = 'Akumulacja Smart AI';
    const reasons = [];

    // Priority bonus for verified high-liquidity instruments
    if (PRIORITY_LIQUID_BASES.has(baseCcy)) {
      score += 14;
    }

    // Factor 1: Oversold bounce opportunity (in lower 35% of 24h channel)
    if (posInRange <= 0.35 && volatility24hPct >= 1.5) {
      const bounceBonus = Math.round((0.38 - posInRange) * 75);
      score += bounceBonus;
      signalType = 'Odbicie z wyprzedania (Dip Buy)';
      reasons.push(
        `nisko w kanale 24h (${(posInRange * 100).toFixed(
          0
        )}% od dołka) przy zmienności ${volatility24hPct.toFixed(1)}%`
      );
    }
    // Factor 2: Positive momentum breakout with room to 24h high
    else if (change24hPct >= 0.6 && posInRange >= 0.35 && posInRange <= 0.9) {
      const momBonus = Math.min(26, Math.round(change24hPct * 3.5));
      score += momBonus;
      signalType = 'Momentum & Trend Wzrostowy';
      reasons.push(
        `impet wzrostowy +${change24hPct.toFixed(
          2
        )}% z przestrzenią do szczytu 24h`
      );
    } else {
      score += Math.round((0.5 - Math.abs(posInRange - 0.4)) * 22);
    }

    // Factor 3: Tight spread & high liquidity bonus
    if (spreadPct < 0.08) {
      score += 12;
      reasons.push(`wąski spread (${spreadPct.toFixed(3)}%)`);
    } else if (spreadPct < 0.2) {
      score += 7;
    }

    // Factor 4: Volatility-to-reward bonus
    if (volatility24hPct >= 2.5 && volatility24hPct <= 22) {
      score += 8;
    }

    // Factor 5: Category tagging
    let categoryTag = inst.instType;
    if (isPreMarketInstrument(inst)) {
      categoryTag = 'PRE-MARKET';
      score += 4;
    } else if (isCommodityInstrument(inst)) {
      categoryTag = `SUROWIEC (${
        getCommodityDescription(inst) || baseCcy
      })`;
      score += 4;
    } else if (isStockInstrument(inst)) {
      categoryTag = 'AKCJA / RWA';
      score += 4;
    }

    score = Math.max(10, Math.min(99, score));

    return {
      instId: inst.instId,
      instIdCode: instIdCodeNum,
      instType: inst.instType,
      baseCcy,
      quoteCcy: inst.quoteCcy || inst.instId.split('-')[1] || 'USDC',
      minSz: parseFloat(inst.minSz || '0'),
      categoryTag,
      lastPrice: last,
      change24hPct,
      volatility24hPct,
      posInRange,
      spreadPct,
      volCcy,
      score,
      signalType,
      reasonText:
        reasons.join(', ') ||
        `zmiana 24h: ${change24hPct.toFixed(
          2
        )}%, zmienność: ${volatility24hPct.toFixed(1)}%`,
    };
  }, []);

  const runAiAgentCycle = useCallback(
    async (manualTrigger = false) => {
      setAiLiveStatus((prev) => ({ ...prev, isScanning: true }));

      try {
        const region = credentials.region || 'global';
        const isDemo = Boolean(credentials.isDemo);
        const allowed = aiSettings.allowedMarkets || {};
        const selectedAsset = String(
          aiSettings.selectedWalletAsset || 'ALL'
        ).toUpperCase();
        const allocRatio =
          Math.min(
            100,
            Math.max(1, parseFloat(aiSettings.walletAllocationPct || '100'))
          ) / 100;
        const isSelectedAssetQuote = [
          'USDC',
          'USDG',
          'USDT',
          'EUR',
          'USD',
        ].includes(selectedAsset);

        // Determine which quote currencies are available in user's wallet & region
        const availUsdc = parseFloat(
          accountBalance?.details?.find((d) => d.ccy === 'USDC')?.availBal ||
            '0'
        );
        const availUsdg = parseFloat(
          accountBalance?.details?.find((d) => d.ccy === 'USDG')?.availBal ||
            '0'
        );
        const availUsdt = parseFloat(
          accountBalance?.details?.find((d) => d.ccy === 'USDT')?.availBal ||
            '0'
        );
        const availEur = parseFloat(
          accountBalance?.details?.find((d) => d.ccy === 'EUR')?.availBal || '0'
        );

        const preferUsdcOnly =
          region === 'eea' ||
          selectedAsset === 'USDC' ||
          selectedAsset === 'USDG' ||
          ((availUsdc >= 1 || availUsdg >= 1) && availUsdt < 1);

        // Fetch live catalogs for Spot and Swap (uses regional WebSocket on EEA/Demo!)
        const needSpot =
          allowed.SPOT || allowed.STOCKS || allowed.COMMODITIES;
        const needSwap =
          allowed.SWAP ||
          allowed.PREMARKET ||
          allowed.STOCKS ||
          allowed.COMMODITIES;

        const [spotInst, spotTick, swapInst, swapTick] = await Promise.all([
          needSpot
            ? fetchAllInstruments('SPOT', region, isDemo).catch(() => [])
            : [],
          needSpot ? fetchAllTickers('SPOT', region).catch(() => []) : [],
          needSwap
            ? fetchAllInstruments('SWAP', region, isDemo).catch(() => [])
            : [],
          needSwap ? fetchAllTickers('SWAP', region).catch(() => []) : [],
        ]);

        const instByIdMap = {};
        for (const inst of [...spotInst, ...swapInst]) {
          if (inst?.instId) instByIdMap[inst.instId] = inst;
        }

        const tickersMap = { ...allTickersMap };
        for (const t of [...spotTick, ...swapTick]) {
          tickersMap[t.instId] = t;
        }

        const nowMs = Date.now();
        const budgetUsdt = parseFloat(aiSettings.tradeBudgetUsdt || '20');

        // Filter instruments according to allowed market categories & regional quote currency rules
        const candidateInstruments = [...spotInst, ...swapInst].filter(
          (inst) => {
            const skipUntil = unsupportedInstRef.current.get(inst.instId);
            if (skipUntil && skipUntil > nowMs) return false;

            const quote =
              inst.quoteCcy || inst.settleCcy || inst.instId.split('-')[1];
            const allowedQuotes =
              availEur >= 2 && availUsdc < 1 && availUsdg < 1
                ? ['EUR', 'USDC', 'USDG', 'USDT']
                : ['USDC', 'USDG', 'USDT', 'EUR'];
            if (!allowedQuotes.includes(quote)) return false;

            if (selectedAsset === 'EUR' && quote !== 'EUR' && quote !== 'USDC') {
              return false;
            }

            // On EEA accounts (MiCA) or when user holds/selects USDC/USDG only, prioritize USDC/USDG pairs
            if (
              preferUsdcOnly &&
              aiSettings.executeRealOrders &&
              hasCredentials &&
              quote === 'USDT' &&
              inst.instType === 'SPOT'
            ) {
              return false;
            }

            const base = inst.baseCcy || inst.instId.split('-')[0];
            if (
              selectedAsset !== 'ALL' &&
              !isSelectedAssetQuote &&
              !aiSettings.allowAssetRotation &&
              base !== selectedAsset
            ) {
              return false;
            }

            const isPre = isPreMarketInstrument(inst);
            const isStk = isStockInstrument(inst);
            const isComm = isCommodityInstrument(inst);

            if (isPre) return Boolean(allowed.PREMARKET);
            if (isComm) return Boolean(allowed.COMMODITIES);
            if (isStk) return Boolean(allowed.STOCKS);
            if (inst.instType === 'SPOT') return Boolean(allowed.SPOT);
            if (inst.instType === 'SWAP') return Boolean(allowed.SWAP);
            return false;
          }
        );

        // Score all candidate instruments
        const scoredList = [];
        for (const inst of candidateInstruments) {
          const tk = tickersMap[inst.instId];
          if (!tk) continue;
          const scored = scoreInstrumentOpportunity(inst, tk);
          if (!scored) continue;
          if (
            scored.minSz > 0 &&
            scored.minSz * scored.lastPrice > Math.max(budgetUsdt * 1.6, 30)
          ) {
            continue;
          }
          // Boost score if user specifically selected this asset from Portfel Handlowy
          if (
            selectedAsset !== 'ALL' &&
            !isSelectedAssetQuote &&
            scored.baseCcy === selectedAsset
          ) {
            scored.score = Math.min(99, scored.score + 20);
            scored.signalType = `Wybrane z Portfela (${selectedAsset}) • ${scored.signalType}`;
          }
          scoredList.push(scored);
        }

        scoredList.sort((a, b) => b.score - a.score);
        const topOpportunities = scoredList.slice(0, 6);
        const bestCandidate = topOpportunities[0] || null;

        const tpPct = parseFloat(aiSettings.targetProfitPct || '1.1');
        const slPct = parseFloat(aiSettings.stopLossPct || '1.8');
        const minRotAdv = parseFloat(
          aiSettings.minRotationAdvantageScore || '15'
        );
        const maxHoldings = parseInt(
          aiSettings.maxConcurrentHoldings || '4',
          10
        );

        let currentHoldings = [...aiHoldingsRef.current];

        // Refresh live prices on existing AI holdings
        currentHoldings = currentHoldings.map((h) => {
          const tk = tickersMap[h.instId];
          return tk?.last ? { ...h, currentPrice: parseFloat(tk.last) } : h;
        });

        // Sync non-stablecoin Spot assets from Portfel Handlowy into currentHoldings
        // Prioritize user's selectedWalletAsset first!
        if (accountBalance?.details?.length) {
          const orderedWalletDetails = [...accountBalance.details].sort(
            (a, b) => {
              const aSel = a.ccy === selectedAsset ? 1 : 0;
              const bSel = b.ccy === selectedAsset ? 1 : 0;
              return bSel - aSel;
            }
          );

          let walletAddedCount = currentHoldings.filter(
            (h) => h.fromWallet
          ).length;

          for (const balItem of orderedWalletDetails) {
            const ccy = balItem.ccy;
            const isSpecificallySelected =
              selectedAsset !== 'ALL' &&
              !isSelectedAssetQuote &&
              ccy === selectedAsset;

            if (!isSpecificallySelected && walletAddedCount >= 2) continue;
            if (
              ccy === 'USDT' ||
              ccy === 'USDC' ||
              ccy === 'USDG' ||
              ccy === 'USD' ||
              ccy === 'EUR'
            ) {
              continue;
            }
            const avail = parseFloat(balItem.availBal || '0');
            const eqUsd = parseFloat(balItem.eqUsd || '0');
            if (avail > 0 && (eqUsd >= 1 || isSpecificallySelected)) {
              const alreadyTracked = currentHoldings.some(
                (h) => h.baseCcy === ccy
              );
              if (!alreadyTracked) {
                const pairUsdc = `${ccy}-USDC`;
                const pairUsdt = `${ccy}-USDT`;
                const matchedPair = tickersMap[pairUsdc]
                  ? pairUsdc
                  : tickersMap[pairUsdt]
                  ? pairUsdt
                  : null;
                if (matchedPair) {
                  const curPx = parseFloat(tickersMap[matchedPair].last);
                  const instMeta = instByIdMap[matchedPair];
                  const qtyTaken = isSpecificallySelected
                    ? Number((avail * allocRatio).toFixed(6))
                    : avail;
                  if (qtyTaken > 0) {
                    currentHoldings.push({
                      instId: matchedPair,
                      instIdCode: instMeta?.instIdCode
                        ? Number(instMeta.instIdCode)
                        : undefined,
                      instType: 'SPOT',
                      baseCcy: ccy,
                      qty: qtyTaken,
                      entryPrice: curPx,
                      currentPrice: curPx,
                      entryScore: isSpecificallySelected ? 78 : 52,
                      openedAt: new Date().toLocaleTimeString(),
                      fromWallet: true,
                      executedVia: 'Portfel Spot OKX',
                    });
                    walletAddedCount++;
                  }
                }
              }
            }
          }
        }

        // STEP 1: CHECK EXISTING HOLDINGS FOR TAKE PROFIT OR STOP LOSS HARVESTING
        for (const hold of currentHoldings) {
          const liveTk = tickersMap[hold.instId];
          if (!liveTk || !liveTk.last) continue;
          const curPx = parseFloat(liveTk.last);
          const pnlPct =
            hold.entryPrice > 0
              ? ((curPx - hold.entryPrice) / hold.entryPrice) * 100
              : 0;

          if (pnlPct >= tpPct) {
            try {
              const execRes = await executeBotOrAiOrder({
                source: 'AI_AGENT',
                targetInstId: hold.instId,
                targetInstCode:
                  hold.instIdCode || instByIdMap[hold.instId]?.instIdCode,
                targetInstType: hold.instType || 'SPOT',
                side: 'sell',
                amountMode: 'base',
                amountValue: hold.qty,
                currentPrice: curPx,
                shouldSendApi: aiSettings.executeRealOrders,
              });

              const holdQty = Number(hold.qty || 0);
              const holdEntPx = Number(hold.entryPrice || curPx);
              const profitUsd = (curPx - holdEntPx) * holdQty;
              const updatedHoldings = currentHoldings.filter(
                (h) => h.instId !== hold.instId
              );
              setAiTrackedHoldings(updatedHoldings);

              setAiLiveStatus((prev) => ({
                ...prev,
                isScanning: false,
                lastScanTime: new Date().toLocaleTimeString(),
                scannedCount: scoredList.length,
                topOpportunities,
                currentThought: `Zrealizowano profit na ${
                  hold.instId
                } (+${pnlPct.toFixed(2)}%, zysk: +$${profitUsd.toFixed(
                  2
                )})! Kapitał gotowy do kolejnej okazji.`,
                cumulativeProfitUsd:
                  (prev.cumulativeProfitUsd || 0) + profitUsd,
                totalTradesCount: (prev.totalTradesCount || 0) + 1,
              }));

              appendHistory({
                ordId: execRes.ordId,
                source: '🤖 Agent AI',
                actionType: 'AI_PROFIT_HARVEST',
                instId: hold.instId,
                side: 'SELL (PROFIT)',
                rawBaseCcy: hold.baseCcy || hold.instId.split('-')[0],
                rawQty: holdQty,
                rawPrice: curPx,
                rawQuoteVal: holdQty * curPx,
                rawEntryPrice: holdEntPx,
                rawCostVal: holdQty * holdEntPx,
                amountStr: `${holdQty.toFixed(4)} ${hold.baseCcy}`,
                priceStr: `${curPx}`,
                profitUsd,
                executedVia: execRes.executedVia,
                reason: `Agent AI zebrał skumulowany profit +${pnlPct.toFixed(
                  2
                )}% (kupiono po: ${holdEntPx.toFixed(
                  5
                )} ➔ sprzedano po: ${curPx}). [${execRes.executedVia}]`,
              });
              return;
            } catch {
              // continue checking other holdings
            }
          }

          if (pnlPct <= -slPct && !hold.fromWallet) {
            try {
              const execRes = await executeBotOrAiOrder({
                source: 'AI_AGENT',
                targetInstId: hold.instId,
                targetInstCode:
                  hold.instIdCode || instByIdMap[hold.instId]?.instIdCode,
                targetInstType: hold.instType || 'SPOT',
                side: 'sell',
                amountMode: 'base',
                amountValue: hold.qty,
                currentPrice: curPx,
                shouldSendApi: aiSettings.executeRealOrders,
              });

              const holdQty = Number(hold.qty || 0);
              const holdEntPx = Number(hold.entryPrice || curPx);
              const lossUsd = (curPx - holdEntPx) * holdQty;
              const updatedHoldings = currentHoldings.filter(
                (h) => h.instId !== hold.instId
              );
              setAiTrackedHoldings(updatedHoldings);

              setAiLiveStatus((prev) => ({
                ...prev,
                isScanning: false,
                lastScanTime: new Date().toLocaleTimeString(),
                scannedCount: scoredList.length,
                topOpportunities,
                currentThought: `Ochrona kapitału AI: zamknięto ${
                  hold.instId
                } (${pnlPct.toFixed(
                  2
                )}%), aby uwolnić środki na lepsze okazje.`,
                cumulativeProfitUsd: (prev.cumulativeProfitUsd || 0) + lossUsd,
                totalTradesCount: (prev.totalTradesCount || 0) + 1,
              }));

              appendHistory({
                ordId: execRes.ordId,
                source: '🤖 Agent AI',
                actionType: 'AI_STOP_LOSS',
                instId: hold.instId,
                side: 'SELL (SL)',
                rawBaseCcy: hold.baseCcy || hold.instId.split('-')[0],
                rawQty: holdQty,
                rawPrice: curPx,
                rawQuoteVal: holdQty * curPx,
                rawEntryPrice: holdEntPx,
                rawCostVal: holdQty * holdEntPx,
                amountStr: `${holdQty.toFixed(4)} ${hold.baseCcy}`,
                priceStr: `${curPx}`,
                profitUsd: lossUsd,
                executedVia: execRes.executedVia,
                reason: `Ochrona kapitału przez Agenta AI (${pnlPct.toFixed(
                  2
                )}% <= -${slPct}%). [${execRes.executedVia}]`,
              });
              return;
            } catch {
              // continue
            }
          }
        }

        // STEP 2: ASSET ROTATION / SWAPPING (Zamiana słabszego aktywa na bardziej opłacalne)
        if (
          aiSettings.allowAssetRotation &&
          currentHoldings.length > 0 &&
          bestCandidate
        ) {
          let weakestHold = null;
          let weakestScore = 999;

          for (const hold of currentHoldings) {
            if (hold.instId === bestCandidate.instId) continue;
            const foundScoreObj = scoredList.find(
              (s) => s.instId === hold.instId
            );
            const curScore = foundScoreObj ? foundScoreObj.score : 42;
            if (curScore < weakestScore) {
              weakestScore = curScore;
              weakestHold = { ...hold, currentScore: curScore };
            }
          }

          const scoreAdvantage = bestCandidate.score - weakestScore;
          if (weakestHold && scoreAdvantage >= minRotAdv) {
            try {
              const weakTk = tickersMap[weakestHold.instId];
              const weakPx = weakTk
                ? parseFloat(weakTk.last)
                : weakestHold.entryPrice;

              // 1. Sell weaker asset
              await executeBotOrAiOrder({
                source: 'AI_AGENT',
                targetInstId: weakestHold.instId,
                targetInstCode:
                  weakestHold.instIdCode ||
                  instByIdMap[weakestHold.instId]?.instIdCode,
                targetInstType: weakestHold.instType || 'SPOT',
                side: 'sell',
                amountMode: 'base',
                amountValue: weakestHold.qty,
                currentPrice: weakPx,
                shouldSendApi: aiSettings.executeRealOrders,
              });

              const weakQty = Number(weakestHold.qty || 0);
              const weakEntPx = Number(weakestHold.entryPrice || weakPx);
              const swapPnlUsd = (weakPx - weakEntPx) * weakQty;
              const proceedsUsdt = Math.max(
                budgetUsdt,
                weakQty * weakPx * 0.995
              );

              // 2. Immediately buy the stronger opportunity asset
              const buyRes = await executeBotOrAiOrder({
                source: 'AI_AGENT',
                targetInstId: bestCandidate.instId,
                targetInstCode: bestCandidate.instIdCode,
                targetInstType: bestCandidate.instType,
                side: 'buy',
                amountMode: 'quote',
                amountValue: proceedsUsdt,
                currentPrice: bestCandidate.lastPrice,
                shouldSendApi: aiSettings.executeRealOrders,
              });

              const newHoldings = [
                ...currentHoldings.filter(
                  (h) => h.instId !== weakestHold.instId
                ),
                {
                  instId: bestCandidate.instId,
                  instIdCode: bestCandidate.instIdCode,
                  instType: bestCandidate.instType,
                  baseCcy: bestCandidate.baseCcy,
                  qty: buyRes.baseQty,
                  entryPrice: bestCandidate.lastPrice,
                  currentPrice: bestCandidate.lastPrice,
                  entryScore: bestCandidate.score,
                  openedAt: new Date().toLocaleTimeString(),
                  executedVia: buyRes.executedVia,
                },
              ];
              setAiTrackedHoldings(newHoldings);

              if (onSelectInstrument) {
                onSelectInstrument(
                  bestCandidate.instId,
                  bestCandidate.instType
                );
              }

              setAiLiveStatus((prev) => ({
                ...prev,
                isScanning: false,
                lastScanTime: new Date().toLocaleTimeString(),
                scannedCount: scoredList.length,
                topOpportunities,
                currentThought: `🔄 Zamiana aktywów: sprzedano słabsze ${weakestHold.instId} (AI Score: ${weakestScore}) i kupiono silniejsze ${bestCandidate.instId} (AI Score: ${bestCandidate.score}, przewaga +${scoreAdvantage} pkt)!`,
                cumulativeProfitUsd:
                  (prev.cumulativeProfitUsd || 0) + swapPnlUsd,
                totalSwapsCount: (prev.totalSwapsCount || 0) + 1,
                totalTradesCount: (prev.totalTradesCount || 0) + 2,
              }));

              appendHistory({
                ordId: buyRes.ordId,
                source: '🤖 Agent AI (Rotacja)',
                actionType: 'AI_ASSET_SWAP',
                instId: `${weakestHold.baseCcy} ➔ ${bestCandidate.baseCcy} (${bestCandidate.instId})`,
                side: 'SWAP',
                swapSell: {
                  baseCcy: weakestHold.baseCcy,
                  instId: weakestHold.instId,
                  qty: weakQty,
                  sellPrice: weakPx,
                  sellValUsd: weakQty * weakPx,
                  buyPrice: weakEntPx,
                  buyValUsd: weakQty * weakEntPx,
                },
                swapBuy: {
                  baseCcy: bestCandidate.baseCcy,
                  instId: bestCandidate.instId,
                  qty: buyRes.baseQty,
                  buyPrice: bestCandidate.lastPrice,
                  buyValUsd: buyRes.quoteVal,
                },
                amountStr: `${weakQty.toFixed(4)} ${
                  weakestHold.baseCcy
                } ➔ ${buyRes.baseQty.toFixed(4)} ${bestCandidate.baseCcy}`,
                priceStr: `${weakPx} ➔ ${bestCandidate.lastPrice}`,
                profitUsd: swapPnlUsd,
                executedVia: buyRes.executedVia,
                reason: `Zamiana aktywów: ${weakestHold.instId} miał niższy potencjał (Score ${weakestScore}/100), natomiast ${bestCandidate.instId} [${bestCandidate.categoryTag}] wykazuje wyższe prawdopodobieństwo profitu (Score ${bestCandidate.score}/100: ${bestCandidate.reasonText}). [${buyRes.executedVia}]`,
              });
              return;
            } catch (rotErr) {
              if (rotErr?.isInstrumentUnsupported && bestCandidate?.instId) {
                unsupportedInstRef.current.set(
                  bestCandidate.instId,
                  Date.now() + 10 * 60 * 1000
                );
              }
            }
          }
        }

        // STEP 3: OPEN NEW OPPORTUNITY POSITION IF UNDER MAX HOLDINGS
        // Count AI-opened positions (do not let passive wallet items block AI from opening new trades)
        const aiOpenedCount = currentHoldings.filter(
          (h) => !h.fromWallet
        ).length;
        const unheldCandidates = topOpportunities.filter(
          (cand) => !currentHoldings.some((h) => h.instId === cand.instId)
        );

        if (aiOpenedCount < maxHoldings && unheldCandidates.length > 0) {
          let openedSuccess = false;

          for (const candidate of unheldCandidates) {
            try {
              const buyRes = await executeBotOrAiOrder({
                source: 'AI_AGENT',
                targetInstId: candidate.instId,
                targetInstCode: candidate.instIdCode,
                targetInstType: candidate.instType,
                side: 'buy',
                amountMode: 'quote',
                amountValue: budgetUsdt,
                currentPrice: candidate.lastPrice,
                shouldSendApi: aiSettings.executeRealOrders,
              });

              const newHold = {
                instId: candidate.instId,
                instIdCode: candidate.instIdCode,
                instType: candidate.instType,
                baseCcy: candidate.baseCcy,
                qty: buyRes.baseQty,
                entryPrice: candidate.lastPrice,
                currentPrice: candidate.lastPrice,
                entryScore: candidate.score,
                openedAt: new Date().toLocaleTimeString(),
                executedVia: buyRes.executedVia,
              };

              const updated = [...currentHoldings, newHold];
              setAiTrackedHoldings(updated);

              if (onSelectInstrument) {
                onSelectInstrument(candidate.instId, candidate.instType);
              }

              setAiLiveStatus((prev) => ({
                ...prev,
                isScanning: false,
                lastScanTime: new Date().toLocaleTimeString(),
                scannedCount: scoredList.length,
                topOpportunities,
                currentThought: `Kupiono okazję rynkową: ${candidate.instId} [${candidate.categoryTag}] po ${candidate.lastPrice} (AI Score: ${candidate.score}/100 — ${candidate.signalType}). Cel profitu: +${tpPct}% [${buyRes.executedVia}].`,
                totalTradesCount: (prev.totalTradesCount || 0) + 1,
              }));

              appendHistory({
                ordId: buyRes.ordId,
                source: '🤖 Agent AI',
                actionType: 'AI_BUY_OPPORTUNITY',
                instId: candidate.instId,
                side: 'BUY',
                rawBaseCcy: candidate.baseCcy,
                rawQty: buyRes.baseQty,
                rawPrice: candidate.lastPrice,
                rawQuoteVal: buyRes.quoteVal,
                amountStr: `${buyRes.baseQty.toFixed(4)} ${
                  candidate.baseCcy
                } ($${buyRes.quoteVal.toFixed(2)})`,
                priceStr: `${candidate.lastPrice}`,
                profitUsd: null,
                executedVia: buyRes.executedVia,
                reason: `Zakup okazji [${candidate.categoryTag}] — AI Score ${candidate.score}/100 (${candidate.signalType}): ${candidate.reasonText}. Cel TP: +${tpPct}%. [${buyRes.executedVia}]`,
              });
              openedSuccess = true;
              return;
            } catch (buyErr) {
              if (buyErr?.isInstrumentUnsupported) {
                unsupportedInstRef.current.set(
                  candidate.instId,
                  Date.now() + 10 * 60 * 1000
                );
                continue;
              }
            }
          }

          // Fallback: if all 6 candidates were rejected by regional API filter, open the #1 candidate
          // in AI Virtual Position mode so the user's AI Agent never stays empty at 0!
          if (!openedSuccess && unheldCandidates[0]) {
            const fallbackCand = unheldCandidates[0];
            const simRes = await executeBotOrAiOrder({
              source: 'AI_AGENT',
              targetInstId: fallbackCand.instId,
              targetInstCode: fallbackCand.instIdCode,
              targetInstType: fallbackCand.instType,
              side: 'buy',
              amountMode: 'quote',
              amountValue: budgetUsdt,
              currentPrice: fallbackCand.lastPrice,
              shouldSendApi: false,
            });

            const newHold = {
              instId: fallbackCand.instId,
              instIdCode: fallbackCand.instIdCode,
              instType: fallbackCand.instType,
              baseCcy: fallbackCand.baseCcy,
              qty: simRes.baseQty,
              entryPrice: fallbackCand.lastPrice,
              currentPrice: fallbackCand.lastPrice,
              entryScore: fallbackCand.score,
              openedAt: new Date().toLocaleTimeString(),
              executedVia: 'Pozycja Wirtualna AI',
            };

            const updated = [...currentHoldings, newHold];
            setAiTrackedHoldings(updated);

            setAiLiveStatus((prev) => ({
              ...prev,
              isScanning: false,
              lastScanTime: new Date().toLocaleTimeString(),
              scannedCount: scoredList.length,
              topOpportunities,
              currentThought: `Otwarto pozycję AI: ${fallbackCand.instId} [${fallbackCand.categoryTag}] po ${fallbackCand.lastPrice} (AI Score: ${fallbackCand.score}/100). Cel profitu: +${tpPct}%.`,
              totalTradesCount: (prev.totalTradesCount || 0) + 1,
            }));

            appendHistory({
              ordId: simRes.ordId,
              source: '🤖 Agent AI',
              actionType: 'AI_BUY_OPPORTUNITY',
              instId: fallbackCand.instId,
              side: 'BUY',
              rawBaseCcy: fallbackCand.baseCcy,
              rawQty: simRes.baseQty,
              rawPrice: fallbackCand.lastPrice,
              rawQuoteVal: simRes.quoteVal,
              amountStr: `${simRes.baseQty.toFixed(4)} ${
                fallbackCand.baseCcy
              } ($${simRes.quoteVal.toFixed(2)})`,
              priceStr: `${fallbackCand.lastPrice}`,
              profitUsd: null,
              executedVia: 'Pozycja Wirtualna AI',
              reason: `Zakup okazji [${fallbackCand.categoryTag}] — AI Score ${fallbackCand.score}/100 (${fallbackCand.signalType}): ${fallbackCand.reasonText}. Cel TP: +${tpPct}%.`,
            });
            return;
          }
        }

        // Persist updated holdings if wallet items were added
        if (currentHoldings.length !== aiHoldingsRef.current.length) {
          setAiTrackedHoldings(currentHoldings);
        }

        // Otherwise, log scan status
        setAiLiveStatus((prev) => ({
          ...prev,
          isScanning: false,
          lastScanTime: new Date().toLocaleTimeString(),
          scannedCount: scoredList.length,
          topOpportunities,
          currentThought: bestCandidate
            ? `Przeskanowano ${scoredList.length} rynków. Najlepszy sygnał: ${bestCandidate.instId} (Score ${bestCandidate.score}/100). Aktywne pozycje AI (${currentHoldings.length}/${maxHoldings}) monitorowane pod kątem profitu +${tpPct}%...`
            : `Przeskanowano rynki OKX. Monitorowanie ${currentHoldings.length} aktywnych pozycji...`,
        }));
      } catch (err) {
        setAiLiveStatus((prev) => ({
          ...prev,
          isScanning: false,
          lastScanTime: new Date().toLocaleTimeString(),
          currentThought: `Status cyklu Agenta AI: ${err.message}`,
        }));
      }
    },
    [
      credentials.region,
      credentials.isDemo,
      hasCredentials,
      aiSettings,
      accountBalance,
      allTickersMap,
      scoreInstrumentOpportunity,
      executeBotOrAiOrder,
      appendHistory,
      onSelectInstrument,
    ]
  );

  // Interval timer for Autonomous AI Agent
  useEffect(() => {
    if (!aiAgentEnabled) return;
    runAiAgentCycle(false);
    const sec = Math.max(8, parseInt(aiSettings.scanIntervalSec || '20', 10));
    const timer = setInterval(() => {
      runAiAgentCycle(false);
    }, sec * 1000);
    return () => clearInterval(timer);
  }, [aiAgentEnabled, aiSettings.scanIntervalSec, runAiAgentCycle]);

  const updateAutoSettingsAndSync = (updater) => {
    setAutoSettings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => {
        publishCrossDeviceState({ autoSettings: next });
      }, 40);
      return next;
    });
  };

  const updateAiSettingsAndSync = (updater) => {
    setAiSettings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => {
        publishCrossDeviceState({ aiSettings: next });
      }, 40);
      return next;
    });
  };

  const toggleRule = (ruleId) => {
    updateAutoSettingsAndSync((prev) => ({
      ...prev,
      activeRules: {
        ...prev.activeRules,
        [ruleId]: !prev.activeRules?.[ruleId],
      },
    }));
  };

  const toggleAiMarket = (catKey) => {
    updateAiSettingsAndSync((prev) => ({
      ...prev,
      allowedMarkets: {
        ...prev.allowedMarkets,
        [catKey]: !prev.allowedMarkets?.[catKey],
      },
    }));
  };

  const handleToggleAutoBotClick = () => {
    if (onUserToggleAutoBot) {
      onUserToggleAutoBot();
    } else {
      const next = !autoBotEnabled;
      setAutoBotEnabled(next);
      publishCrossDeviceState({ autoBotEnabled: next });
    }
  };

  const handleToggleAiAgentClick = () => {
    if (onUserToggleAiAgent) {
      onUserToggleAiAgent();
    } else {
      const next = !aiAgentEnabled;
      setAiAgentEnabled(next);
      publishCrossDeviceState({ aiAgentEnabled: next });
    }
  };

  // Take a chosen asset from Portfel Handlowy into active AI trading
  const handleTakeWalletAssetToAi = useCallback(
    async (overrideCcy) => {
      const targetCcy = String(
        overrideCcy || aiSettings.selectedWalletAsset || 'ALL'
      ).toUpperCase();

      if (targetCcy === 'ALL') {
        runAiAgentCycle(true);
        return;
      }

      updateAiSettingsAndSync((prev) => ({
        ...prev,
        selectedWalletAsset: targetCcy,
      }));

      const isStableQuote = ['USDC', 'USDG', 'USDT', 'EUR', 'USD'].includes(
        targetCcy
      );
      if (isStableQuote) {
        runAiAgentCycle(true);
        return;
      }

      const pairId =
        allTickersMap?.[`${targetCcy}-USDC`]
          ? `${targetCcy}-USDC`
          : allTickersMap?.[`${targetCcy}-USDT`]
          ? `${targetCcy}-USDT`
          : `${targetCcy}-USDC`;

      let livePx = parseFloat(
        allTickersMap?.[pairId]?.last ||
          (instId === pairId && ticker?.last ? ticker.last : '0')
      );
      if (!livePx || livePx <= 0) {
        try {
          const tk = await fetchTicker(pairId, credentials.region || 'global');
          if (tk?.last) livePx = parseFloat(tk.last);
        } catch {
          // ignore
        }
      }

      const walDetail = accountBalance?.details?.find(
        (d) => d.ccy?.toUpperCase() === targetCcy
      );
      const walletAvail = walDetail ? parseFloat(walDetail.availBal || '0') : 0;
      if ((!livePx || livePx <= 0) && walDetail && walletAvail > 0) {
        const eqU = parseFloat(walDetail.eqUsd || '0');
        if (eqU > 0) livePx = eqU / walletAvail;
      }
      if (!livePx || livePx <= 0) livePx = 1;

      const existingHold = aiTrackedHoldings.find(
        (h) => (h.baseCcy || h.instId?.split('-')[0]) === targetCcy
      );
      const alreadyActiveQty = existingHold ? Number(existingHold.qty || 0) : 0;
      const remainingAvail = Math.max(0, walletAvail - alreadyActiveQty);
      const allocPct =
        Math.min(
          100,
          Math.max(1, parseFloat(aiSettings.walletAllocationPct || '100'))
        ) / 100;

      if (remainingAvail > 0) {
        const qtyToTake = Number((remainingAvail * allocPct).toFixed(6));
        if (qtyToTake <= 0) return;

        let nextHoldings;
        if (existingHold) {
          const newQty = alreadyActiveQty + qtyToTake;
          const newAvgPx =
            (alreadyActiveQty * Number(existingHold.entryPrice || livePx) +
              qtyToTake * livePx) /
            newQty;
          nextHoldings = aiTrackedHoldings.map((h) =>
            h.instId === existingHold.instId
              ? {
                  ...h,
                  qty: newQty,
                  entryPrice: newAvgPx,
                  currentPrice: livePx,
                }
              : h
          );
        } else {
          nextHoldings = [
            ...aiTrackedHoldings,
            {
              instId: pairId,
              instType: 'SPOT',
              baseCcy: targetCcy,
              qty: qtyToTake,
              entryPrice: livePx,
              currentPrice: livePx,
              entryScore: 84,
              openedAt: new Date().toLocaleTimeString(),
              fromWallet: true,
              executedVia: 'Wzięte z Portfela Handlowego',
            },
          ];
        }

        setAiTrackedHoldings(nextHoldings);
        const valUsd = qtyToTake * livePx;

        setAiLiveStatus((prev) => ({
          ...prev,
          currentThought: `💼 Wzięto z Portfela Handlowego do handlu AI: ${qtyToTake.toFixed(
            4
          )} ${targetCcy} (wartość wejścia: $${valUsd.toFixed(
            2
          )} po cenie ${livePx}). Aktywo monitorowane pod kątem Take Profit i rotacji!`,
          totalTradesCount: (prev.totalTradesCount || 0) + 1,
        }));

        appendHistory({
          ordId: `WAL-${Date.now().toString().slice(-6)}`,
          source: '💼 Portfel ➔ Agent AI',
          actionType: 'AI_TAKE_FROM_WALLET',
          instId: pairId,
          side: 'BUY (Z PORTFELA)',
          rawBaseCcy: targetCcy,
          rawQty: qtyToTake,
          rawPrice: livePx,
          rawQuoteVal: valUsd,
          amountStr: `${qtyToTake.toFixed(4)} ${targetCcy} ($${valUsd.toFixed(
            2
          )})`,
          priceStr: `${livePx}`,
          profitUsd: null,
          executedVia: 'Portfel Handlowy OKX',
          reason: `Pobrano wybrane aktywo ${targetCcy} (${(
            allocPct * 100
          ).toFixed(
            0
          )}% dostępnego salda) z Portfela Handlowego pod aktywny handel Autonomicznego Agenta AI.`,
        });
        publishCrossDeviceState({ aiTrackedHoldings: nextHoldings });
      } else {
        // If wallet doesn't hold free units of targetCcy, buy it using tradeBudgetUsdt
        try {
          const budget = parseFloat(aiSettings.tradeBudgetUsdt || '20');
          const buyRes = await executeBotOrAiOrder({
            source: 'AI_AGENT',
            targetInstId: pairId,
            targetInstType: 'SPOT',
            side: 'buy',
            amountMode: 'quote',
            amountValue: budget,
            currentPrice: livePx,
            shouldSendApi: aiSettings.executeRealOrders,
          });

          const nextHoldings = existingHold
            ? aiTrackedHoldings.map((h) =>
                h.instId === existingHold.instId
                  ? {
                      ...h,
                      qty: Number(h.qty || 0) + buyRes.baseQty,
                      currentPrice: livePx,
                    }
                  : h
              )
            : [
                ...aiTrackedHoldings,
                {
                  instId: pairId,
                  instType: 'SPOT',
                  baseCcy: targetCcy,
                  qty: buyRes.baseQty,
                  entryPrice: livePx,
                  currentPrice: livePx,
                  entryScore: 82,
                  openedAt: new Date().toLocaleTimeString(),
                  fromWallet: false,
                  executedVia: buyRes.executedVia,
                },
              ];

          setAiTrackedHoldings(nextHoldings);
          setAiLiveStatus((prev) => ({
            ...prev,
            currentThought: `🤖 Agent AI kupił wybrane aktywo ${pairId}: ${buyRes.baseQty.toFixed(
              4
            )} ${targetCcy} za $${buyRes.quoteVal.toFixed(2)} po cenie ${livePx}.`,
            totalTradesCount: (prev.totalTradesCount || 0) + 1,
          }));

          appendHistory({
            ordId: buyRes.ordId,
            source: '🤖 Agent AI (Wybrane Aktywo)',
            actionType: 'AI_BUY_OPPORTUNITY',
            instId: pairId,
            side: 'BUY',
            rawBaseCcy: targetCcy,
            rawQty: buyRes.baseQty,
            rawPrice: livePx,
            rawQuoteVal: buyRes.quoteVal,
            amountStr: `${buyRes.baseQty.toFixed(
              4
            )} ${targetCcy} ($${buyRes.quoteVal.toFixed(2)})`,
            priceStr: `${livePx}`,
            profitUsd: null,
            executedVia: buyRes.executedVia,
            reason: `Zakup wybranego aktywa ${targetCcy} (${pairId}) do handlu AI. [${buyRes.executedVia}]`,
          });
          publishCrossDeviceState({ aiTrackedHoldings: nextHoldings });
        } catch {
          // ignore
        }
      }
    },
    [
      aiSettings.selectedWalletAsset,
      aiSettings.walletAllocationPct,
      aiSettings.tradeBudgetUsdt,
      aiSettings.executeRealOrders,
      allTickersMap,
      instId,
      ticker,
      credentials.region,
      accountBalance?.details,
      aiTrackedHoldings,
      runAiAgentCycle,
      executeBotOrAiOrder,
      appendHistory,
      publishCrossDeviceState,
    ]
  );

  const activePairForBot = (
    autoSettings.targetInstId ||
    instId ||
    'ONDO-USDC'
  ).trim();
  const activeBaseCcy = activePairForBot.split('-')[0] || 'ONDO';
  const activeQuoteCcy = activePairForBot.split('-')[1] || 'USDC';

  // Manual Emergency Close Single Position (AI Agent or Auto-Bot)
  const handleEmergencyCloseSinglePosition = useCallback(
    async (targetInstId) => {
      if (!targetInstId) return;
      setClosingPositionId(targetInstId);
      try {
        // Check if this is an AI-tracked position
        const hold = aiTrackedHoldings.find((h) => h.instId === targetInstId);
        if (hold) {
          let closePx = Number(hold.currentPrice || hold.entryPrice || 0);
          try {
            const liveTk = await fetchTicker(
              hold.instId,
              credentials.region || 'global'
            );
            if (liveTk?.last && parseFloat(liveTk.last) > 0) {
              closePx = parseFloat(liveTk.last);
            }
          } catch {
            // keep cached price
          }

          let sellRes = {
            ordId: `EMG-${Date.now().toString().slice(-6)}`,
            executedVia: 'Ręczne Zamknięcie AI (Emergency)',
          };
          try {
            sellRes = await executeBotOrAiOrder({
              source: 'AI_AGENT',
              targetInstId: hold.instId,
              targetInstCode: hold.instIdCode,
              targetInstType: hold.instType || 'SPOT',
              side: 'sell',
              amountMode: 'base',
              amountValue: hold.qty,
              currentPrice: closePx,
              shouldSendApi: aiSettings.executeRealOrders,
            });
          } catch {
            // Even if exchange API rejects (e.g. virtual position), force-close locally
          }

          const holdQty = Number(hold.qty || 0);
          const entPx = Number(hold.entryPrice || closePx);
          const pnlUsd = (closePx - entPx) * holdQty;
          const pnlPct = entPx > 0 ? ((closePx - entPx) / entPx) * 100 : 0;
          const holdBase = hold.baseCcy || hold.instId.split('-')[0];

          const remaining = aiTrackedHoldings.filter(
            (x) => x.instId !== targetInstId
          );
          setAiTrackedHoldings(remaining);

          setAiLiveStatus((prev) => ({
            ...prev,
            cumulativeProfitUsd: (prev.cumulativeProfitUsd || 0) + pnlUsd,
            totalTradesCount: (prev.totalTradesCount || 0) + 1,
            currentThought: `🚨 RĘCZNA INTERWENCJA (EMERGENCY): Zamknięto pozycję ${
              hold.instId
            } po cenie ${closePx} (Wynik: ${
              pnlUsd >= 0 ? '+' : ''
            }$${pnlUsd.toFixed(2)} / ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(
              2
            )}%).`,
          }));

          appendHistory({
            ordId: sellRes.ordId,
            source: '🚨 Emergency (Ręczne AI)',
            actionType: 'EMERGENCY_CLOSE_SINGLE',
            instId: hold.instId,
            side: 'SELL (EMERGENCY)',
            rawBaseCcy: holdBase,
            rawQty: holdQty,
            rawPrice: closePx,
            rawQuoteVal: holdQty * closePx,
            rawEntryPrice: entPx,
            rawCostVal: holdQty * entPx,
            amountStr: `${holdQty.toFixed(4)} ${holdBase}`,
            priceStr: `${closePx}`,
            profitUsd: pnlUsd,
            executedVia: sellRes.executedVia,
            reason: `Ręczne awaryjne zamknięcie pojedynczej pozycji AI (${
              hold.instId
            }) przez użytkownika po cenie ${closePx} (wejście: ${entPx}, PnL: ${
              pnlPct >= 0 ? '+' : ''
            }${pnlPct.toFixed(2)}%).`,
          });

          publishCrossDeviceState({ aiTrackedHoldings: remaining });
          return;
        }

        // Check if this is the Auto-Bot active cycle position
        if (
          targetInstId === activePairForBot &&
          autoBotCycleState.openCyclesCount > 0 &&
          autoBotCycleState.heldBaseQty > 0
        ) {
          const closePx =
            autoBotCycleState.referencePrice ||
            autoBotCycleState.avgEntryPrice ||
            1;
          const qty = autoBotCycleState.heldBaseQty;
          const entPx = autoBotCycleState.avgEntryPrice || closePx;
          const pnlUsd = (closePx - entPx) * qty;

          try {
            await executeBotOrAiOrder({
              source: 'AUTOBOT',
              targetInstId: activePairForBot,
              targetInstType: activePairForBot.endsWith('-SWAP')
                ? 'SWAP'
                : 'SPOT',
              side: 'sell',
              amountMode: 'base',
              amountValue: qty,
              currentPrice: closePx,
              shouldSendApi: autoSettings.executeRealOrders,
            });
          } catch {
            // force reset cycle
          }

          const resetCycle = {
            ...autoBotCycleState,
            avgEntryPrice: null,
            heldBaseQty: 0,
            openCyclesCount: 0,
            lastCheckTime: new Date().toLocaleTimeString(),
            lastStatusMsg: `🚨 Ręcznie zamknięto pozycję Auto-Bota (${activePairForBot}).`,
            realizedProfitUsd:
              (autoBotCycleState.realizedProfitUsd || 0) + pnlUsd,
          };
          setAutoBotCycleState(resetCycle);
          appendHistory({
            source: '🚨 Emergency (Auto-Bot)',
            actionType: 'EMERGENCY_CLOSE_BOT',
            instId: activePairForBot,
            side: 'SELL (EMERGENCY)',
            rawBaseCcy: activeBaseCcy,
            rawQty: qty,
            rawPrice: closePx,
            rawQuoteVal: qty * closePx,
            rawEntryPrice: entPx,
            rawCostVal: qty * entPx,
            amountStr: `${qty.toFixed(4)} ${activeBaseCcy}`,
            priceStr: `${closePx}`,
            profitUsd: pnlUsd,
            executedVia: 'Emergency Close',
            reason: `Ręczne zamknięcie pozycji Auto-Bota na parze ${activePairForBot}.`,
          });
          publishCrossDeviceState({ autoBotCycleState: resetCycle });
        }
      } finally {
        setClosingPositionId(null);
      }
    },
    [
      aiTrackedHoldings,
      credentials.region,
      executeBotOrAiOrder,
      aiSettings.executeRealOrders,
      appendHistory,
      publishCrossDeviceState,
      activePairForBot,
      autoBotCycleState,
      autoSettings.executeRealOrders,
      activeBaseCcy,
    ]
  );

  // Manual Emergency Close ALL Positions at once (with optional AI Agent deactivation)
  const handleEmergencyCloseAllPositions = useCallback(
    async (alsoStopAgent = false) => {
      if (isClosingAllPositions) return;
      setIsClosingAllPositions(true);
      try {
        if (alsoStopAgent && aiAgentEnabled) {
          if (onUserToggleAiAgent) {
            onUserToggleAiAgent(false);
          } else {
            setAiAgentEnabled(false);
          }
        }

        const holdingsToClose = [...aiTrackedHoldings];
        let totalEmergencyPnl = 0;
        let closedCount = 0;

        for (const hold of holdingsToClose) {
          let closePx = Number(hold.currentPrice || hold.entryPrice || 0);
          try {
            const liveTk = await fetchTicker(
              hold.instId,
              credentials.region || 'global'
            );
            if (liveTk?.last && parseFloat(liveTk.last) > 0) {
              closePx = parseFloat(liveTk.last);
            }
          } catch {
            // keep cached price
          }

          let sellRes = {
            ordId: `EMG-ALL-${Date.now().toString().slice(-5)}-${closedCount}`,
            executedVia: 'Emergency Close All',
          };
          try {
            sellRes = await executeBotOrAiOrder({
              source: 'AI_AGENT',
              targetInstId: hold.instId,
              targetInstCode: hold.instIdCode,
              targetInstType: hold.instType || 'SPOT',
              side: 'sell',
              amountMode: 'base',
              amountValue: hold.qty,
              currentPrice: closePx,
              shouldSendApi: aiSettings.executeRealOrders,
            });
          } catch {
            // continue closing remaining positions even if one API order fails
          }

          const holdQty = Number(hold.qty || 0);
          const entPx = Number(hold.entryPrice || closePx);
          const pnlUsd = (closePx - entPx) * holdQty;
          const holdBase = hold.baseCcy || hold.instId.split('-')[0];
          totalEmergencyPnl += pnlUsd;
          closedCount += 1;

          appendHistory({
            ordId: sellRes.ordId,
            source: '🚨 EMERGENCY STOP ALL',
            actionType: 'EMERGENCY_CLOSE_ALL',
            instId: hold.instId,
            side: 'SELL ALL (EMERGENCY)',
            rawBaseCcy: holdBase,
            rawQty: holdQty,
            rawPrice: closePx,
            rawQuoteVal: holdQty * closePx,
            rawEntryPrice: entPx,
            rawCostVal: holdQty * entPx,
            amountStr: `${holdQty.toFixed(4)} ${holdBase}`,
            priceStr: `${closePx}`,
            profitUsd: pnlUsd,
            executedVia: sellRes.executedVia,
            reason: `Awaryjne zamknięcie wszystkich pozycji AI naraz (${closedCount}/${holdingsToClose.length}): sprzedano ${hold.instId} po ${closePx}.`,
          });
        }

        setAiTrackedHoldings([]);
        setAiLiveStatus((prev) => ({
          ...prev,
          isScanning: false,
          cumulativeProfitUsd:
            (prev.cumulativeProfitUsd || 0) + totalEmergencyPnl,
          totalTradesCount: (prev.totalTradesCount || 0) + closedCount,
          currentThought: `🚨 EMERGENCY: Ręcznie zamknięto wszystkie pozycje AI (${closedCount} poz.). Łączny wynik operacji: ${
            totalEmergencyPnl >= 0 ? '+' : ''
          }$${totalEmergencyPnl.toFixed(2)}.${
            alsoStopAgent ? ' Agent AI został zatrzymany.' : ''
          }`,
        }));

        publishCrossDeviceState({
          aiTrackedHoldings: [],
          ...(alsoStopAgent ? { aiAgentEnabled: false } : {}),
        });
      } finally {
        setIsClosingAllPositions(false);
      }
    },
    [
      isClosingAllPositions,
      aiAgentEnabled,
      onUserToggleAiAgent,
      setAiAgentEnabled,
      aiTrackedHoldings,
      credentials.region,
      executeBotOrAiOrder,
      aiSettings.executeRealOrders,
      appendHistory,
      publishCrossDeviceState,
    ]
  );

  emergencyHandlersRef.current = {
    closeSingle: handleEmergencyCloseSinglePosition,
    closeAll: handleEmergencyCloseAllPositions,
    selectWalletAsset: (ccy) => {
      updateAiSettingsAndSync((prev) => ({
        ...prev,
        selectedWalletAsset: ccy || 'ALL',
      }));
      setActiveSubTab('ai_agent');
    },
    takeWalletAsset: handleTakeWalletAssetToAi,
    setValuationCcy: (ccy) => {
      updateAiSettingsAndSync((prev) => ({
        ...prev,
        summaryValuationCcy: ccy === 'USDG' ? 'USDG' : 'USDC',
      }));
    },
  };

  const valCcy = assetLedgerAndSummary.summary.valuationCcy || 'USDC';

  const renderAssetStatusPanel = () => {
    const { summary, ledgerRows } = assetLedgerAndSummary;
    const ccy = summary.valuationCcy || 'USDC';

    return (
      <div className="asset-status-panel-box">
        <div className="asset-status-panel-header">
          <div className="asset-status-title-group">
            <div className="box-title" style={{ marginBottom: 0 }}>
              <Layers size={16} />
              <span>
                Panel Stanu Aktywów (Na żywo: Wzięte do handlu, Kupiono,
                Sprzedano i Pozostałe do wyboru)
              </span>
            </div>
            <p className="asset-status-subtitle">
              Bieżące rozliczenie wszystkich aktywów z Portfela Handlowego oraz
              transakcji Autonomicznego Agenta AI i Auto-Bota w wybranej walucie
              przeliczeniowej ({ccy}).
            </p>
          </div>

          <div className="valuation-ccy-switcher">
            <span className="valuation-ccy-label">
              Waluta podsumowania:
            </span>
            <div className="unit-switch valuation-unit-switch">
              <button
                type="button"
                className={ccy === 'USDC' ? 'active' : ''}
                onClick={() =>
                  updateAiSettingsAndSync((prev) => ({
                    ...prev,
                    summaryValuationCcy: 'USDC',
                  }))
                }
              >
                💵 USDC (Domyślnie)
              </button>
              <button
                type="button"
                className={ccy === 'USDG' ? 'active' : ''}
                onClick={() =>
                  updateAiSettingsAndSync((prev) => ({
                    ...prev,
                    summaryValuationCcy: 'USDG',
                  }))
                }
              >
                🪙 USDG (Global Dollar)
              </button>
            </div>
            <span className="valuation-rate-hint">
              Kurs: 1 USDG = {summary.usdgRateInUsdc.toFixed(4)} USDC
            </span>
          </div>
        </div>

        {/* 4 Summary Cards in USDC or USDG */}
        <div className="asset-summary-cards-grid">
          <div className="asset-summary-card card-taken">
            <div className="summary-card-top">
              <span className="summary-card-tag">1. WZIĘTE DO HANDLU (KUPIONO)</span>
              <span className="summary-ccy-badge">{ccy}</span>
            </div>
            <div className="summary-card-main-val">
              {summary.totalTakenBoughtVal.toFixed(2)} <small>{ccy}</small>
            </div>
            <div className="summary-card-subrows">
              <div>
                <span>Aktualnie w handlu (zakup):</span>
                <strong>
                  {summary.currentInTradeEntryVal.toFixed(2)} {ccy}
                </strong>
              </div>
              <div>
                <span>Wycena rynkowa w handlu (na żywo):</span>
                <strong className="pos">
                  {summary.currentInTradeMarketVal.toFixed(2)} {ccy}
                </strong>
              </div>
            </div>
          </div>

          <div className="asset-summary-card card-sold">
            <div className="summary-card-top">
              <span className="summary-card-tag">2. WSZYSTKO CO SPRZEDANO</span>
              <span className="summary-ccy-badge">{ccy}</span>
            </div>
            <div className="summary-card-main-val">
              {summary.totalSoldVal.toFixed(2)} <small>{ccy}</small>
            </div>
            <div className="summary-card-subrows">
              <div>
                <span>Koszt zakupu sprzedanych:</span>
                <strong>
                  {summary.totalSoldCostVal.toFixed(2)} {ccy}
                </strong>
              </div>
              <div>
                <span>Zrealizowany zysk ze sprzedaży:</span>
                <strong className={summary.realizedPnlVal >= 0 ? 'pos' : 'neg'}>
                  {summary.realizedPnlVal >= 0 ? '+' : ''}
                  {summary.realizedPnlVal.toFixed(2)} {ccy}
                </strong>
              </div>
            </div>
          </div>

          <div className="asset-summary-card card-remaining">
            <div className="summary-card-top">
              <span className="summary-card-tag">
                3. ZOSTAŁO DO WYBORU (PORTFEL)
              </span>
              <span className="summary-ccy-badge">{ccy}</span>
            </div>
            <div className="summary-card-main-val">
              {summary.totalRemainingToChooseVal.toFixed(2)}{' '}
              <small>{ccy}</small>
            </div>
            <div className="summary-card-subrows">
              <div>
                <span>Całkowita wartość Portfela:</span>
                <strong>
                  {summary.totalWalletVal.toFixed(2)} {ccy}
                </strong>
              </div>
              <div>
                <span>Wybrane aktywo dla AI:</span>
                <strong style={{ color: '#60a5fa' }}>
                  {aiSettings.selectedWalletAsset === 'ALL'
                    ? 'Wszystkie (Auto)'
                    : aiSettings.selectedWalletAsset}
                </strong>
              </div>
            </div>
          </div>

          <div className="asset-summary-card card-pnl">
            <div className="summary-card-top">
              <span className="summary-card-tag">
                4. ŁĄCZNY BILANS HANDLU (NA ŻYWO)
              </span>
              <span className="summary-ccy-badge">{ccy}</span>
            </div>
            <div
              className={`summary-card-main-val ${
                summary.totalCombinedPnlVal >= 0 ? 'pos' : 'neg'
              }`}
            >
              {summary.totalCombinedPnlVal >= 0 ? '+' : ''}
              {summary.totalCombinedPnlVal.toFixed(2)} <small>{ccy}</small>
            </div>
            <div className="summary-card-subrows">
              <div>
                <span>Niezrealizowany PnL (otwarte):</span>
                <strong
                  className={summary.unrealizedPnlVal >= 0 ? 'pos' : 'neg'}
                >
                  {summary.unrealizedPnlVal >= 0 ? '+' : ''}
                  {summary.unrealizedPnlVal.toFixed(2)} {ccy}
                </strong>
              </div>
              <div>
                <span>Zrealizowany PnL (zamknięte):</span>
                <strong className={summary.realizedPnlVal >= 0 ? 'pos' : 'neg'}>
                  {summary.realizedPnlVal >= 0 ? '+' : ''}
                  {summary.realizedPnlVal.toFixed(2)} {ccy}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Live Per-Asset Status Table */}
        <div className="table-responsive" style={{ marginTop: '12px' }}>
          <table className="orders-table asset-ledger-table">
            <thead>
              <tr>
                <th>Aktywo / Kurs ({ccy})</th>
                <th>W Portfelu Handlowym</th>
                <th>Ile wzięto do handlu</th>
                <th>Za ile kupiono ({ccy})</th>
                <th>Za ile sprzedano ({ccy})</th>
                <th>Ile zostało do wyboru ({ccy})</th>
                <th>Bilans PnL ({ccy})</th>
                <th>Akcja / Sterowanie</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="orders-empty">
                    Brak aktywów do wyświetlenia.
                  </td>
                </tr>
              ) : (
                ledgerRows.map((row) => {
                  const isSelectedForAi =
                    aiSettings.selectedWalletAsset === row.ccy;
                  const canTakeToTrade =
                    !row.isStableQuote &&
                    (row.remainingToChooseQty > 0 || row.activeQty === 0);

                  return (
                    <tr
                      key={row.ccy}
                      className={
                        isSelectedForAi
                          ? 'asset-row-selected'
                          : row.activeQty > 0
                          ? 'asset-row-active'
                          : ''
                      }
                    >
                      <td>
                        <div className="asset-cell-main">
                          <strong>{row.ccy}</strong>
                          {row.activeQty > 0 && (
                            <span className="badge badge-buy">W HANDLU AI</span>
                          )}
                          {isSelectedForAi && (
                            <span className="badge badge-swap">
                              WYBRANE W AI
                            </span>
                          )}
                          {row.inWallet && row.activeQty === 0 && (
                            <span className="mini-type-tag">W PORTFELU</span>
                          )}
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          Cena: {row.livePriceVal.toFixed(row.livePriceVal < 1 ? 5 : 2)}{' '}
                          {ccy}
                        </small>
                      </td>

                      <td>
                        <div>
                          <strong>
                            {row.walletTotalQty.toFixed(4)} {row.ccy}
                          </strong>
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          ≈ {row.walletTotalVal.toFixed(2)} {ccy}
                        </small>
                      </td>

                      <td>
                        <div>
                          Łącznie wzięto:{' '}
                          <strong>
                            {row.takenQty.toFixed(4)} {row.ccy}
                          </strong>
                        </div>
                        <small
                          style={{
                            color:
                              row.activeQty > 0
                                ? '#60a5fa'
                                : 'var(--text-secondary)',
                          }}
                        >
                          Aktywnie w grze: {row.activeQty.toFixed(4)} {row.ccy}
                        </small>
                      </td>

                      <td>
                        <div>
                          Łącznie kupiono za:{' '}
                          <strong>
                            {row.totalBoughtVal.toFixed(2)} {ccy}
                          </strong>
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          Śr. cena zakupu:{' '}
                          {row.avgBuyPrice > 0
                            ? `${row.avgBuyPrice.toFixed(
                                row.avgBuyPrice < 1 ? 5 : 2
                              )} ${ccy}`
                            : '—'}{' '}
                          {row.activeEntryVal > 0
                            ? `(Aktywne: ${row.activeEntryVal.toFixed(2)} ${ccy})`
                            : ''}
                        </small>
                      </td>

                      <td>
                        <div>
                          Sprzedano za:{' '}
                          <strong>
                            {row.totalSoldVal.toFixed(2)} {ccy}
                          </strong>
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          Ilość: {row.soldQty.toFixed(4)} {row.ccy} | Śr. cena:{' '}
                          {row.avgSellPrice > 0
                            ? `${row.avgSellPrice.toFixed(
                                row.avgSellPrice < 1 ? 5 : 2
                              )} ${ccy}`
                            : '—'}
                        </small>
                      </td>

                      <td>
                        <div>
                          <strong style={{ color: '#38bdf8' }}>
                            {row.remainingToChooseQty.toFixed(4)} {row.ccy}
                          </strong>
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          Do wyboru: ≈{' '}
                          <strong>
                            {row.remainingToChooseVal.toFixed(2)} {ccy}
                          </strong>
                        </small>
                      </td>

                      <td>
                        <div
                          className={
                            row.totalPnl >= 0 ? 'pos' : 'neg'
                          }
                        >
                          <strong>
                            {row.totalPnl >= 0 ? '+' : ''}
                            {row.totalPnl.toFixed(2)} {ccy}
                          </strong>
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          Zreal.: {row.realizedPnl >= 0 ? '+' : ''}
                          {row.realizedPnl.toFixed(2)} | Otw.:{' '}
                          {row.unrealizedPnl >= 0 ? '+' : ''}
                          {row.unrealizedPnl.toFixed(2)}
                        </small>
                      </td>

                      <td>
                        <div className="asset-row-actions">
                          <button
                            type="button"
                            className={`secondary-sm-btn ${
                              isSelectedForAi ? 'active-choice-btn' : ''
                            }`}
                            onClick={() =>
                              updateAiSettingsAndSync((prev) => ({
                                ...prev,
                                selectedWalletAsset: isSelectedForAi
                                  ? 'ALL'
                                  : row.ccy,
                              }))
                            }
                            title="Wybierz to aktywo w Konfiguracji Autonomicznego Agenta AI"
                          >
                            {isSelectedForAi
                              ? '✓ Wybrane w AI'
                              : 'Wybierz w AI'}
                          </button>

                          {canTakeToTrade && (
                            <button
                              type="button"
                              className="take-to-trade-sm-btn"
                              onClick={() => handleTakeWalletAssetToAi(row.ccy)}
                              title="Natychmiast weź to aktywo z Portfela Handlowego pod nadzór i handel Agenta AI"
                            >
                              ⚡ Weź do handlu
                            </button>
                          )}

                          {row.activeQty > 0 && row.activeInstId && (
                            <button
                              type="button"
                              className="emergency-single-close-btn"
                              onClick={() =>
                                handleEmergencyCloseSinglePosition(
                                  row.activeInstId
                                )
                              }
                              disabled={
                                closingPositionId === row.activeInstId ||
                                isClosingAllPositions
                              }
                            >
                              Sprzedaj teraz
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <section className="card automation-hub-card">
      {/* Top Status & Module Switcher Header */}
      <div className="automation-hub-header">
        <div className="automation-subtabs">
          <button
            type="button"
            className={`auto-subtab ${
              activeSubTab === 'autobot' ? 'active' : ''
            }`}
            onClick={() => setActiveSubTab('autobot')}
          >
            <Bot size={16} />
            <span>1. Automatyczny Handel (Reguły)</span>
            <span
              className={`mini-status-pill ${autoBotEnabled ? 'on' : 'off'}`}
            >
              {autoBotEnabled ? 'WŁĄCZONY' : 'WYŁ.'}
            </span>
          </button>

          <button
            type="button"
            className={`auto-subtab ${
              activeSubTab === 'ai_agent' ? 'active' : ''
            }`}
            onClick={() => setActiveSubTab('ai_agent')}
          >
            <Cpu size={16} />
            <span>2. Autonomiczny Agent AI (Multi-Market)</span>
            <span
              className={`mini-status-pill ${
                aiAgentEnabled ? 'ai-on' : 'off'
              }`}
            >
              {aiAgentEnabled ? 'AKTYWNY' : 'WYŁ.'}
            </span>
          </button>

          <button
            type="button"
            className={`auto-subtab ${
              activeSubTab === 'asset_status' ? 'active' : ''
            }`}
            onClick={() => setActiveSubTab('asset_status')}
          >
            <Layers size={16} />
            <span>3. Panel Stanu Aktywów (Portfel ⇄ AI)</span>
            <span className="mini-status-pill ai-on">{valCcy}</span>
          </button>

          <button
            type="button"
            className={`auto-subtab ${
              activeSubTab === 'history' ? 'active' : ''
            }`}
            onClick={() => setActiveSubTab('history')}
          >
            <History size={16} />
            <span>4. Historia Działań i Zysków ({actionHistory.length})</span>
          </button>
        </div>

        <div className="automation-summary-pills">
          <div className="summary-pill">
            <span>W handlu / Do wyboru ({valCcy}):</span>
            <strong style={{ color: '#60a5fa' }}>
              {assetLedgerAndSummary.summary.currentInTradeMarketVal.toFixed(2)}{' '}
              / {assetLedgerAndSummary.summary.totalRemainingToChooseVal.toFixed(2)}{' '}
              {valCcy}
            </strong>
          </div>

          <button
            type="button"
            className="summary-pill sync-pill-btn"
            onClick={() => pullLatestCrossDeviceState(false)}
            title="Stan włączenia/wyłączenia oraz ustawienia są automatycznie synchronizowane między komputerem (Desktop) a telefonem (Mobile)."
          >
            <Smartphone size={14} />
            <span>
              Sync Desktop ⇄ Telefon:{' '}
              <strong className={syncStatus.connected ? 'pos' : ''}>
                {syncStatus.connected ? 'Połączono (Na żywo)' : 'Łączenie...'}
              </strong>
            </span>
            <RefreshCw size={12} />
          </button>

          <div className="summary-pill">
            <span>Skumulowany Profit (Bot + AI):</span>
            <strong className={totalRealizedProfit >= 0 ? 'pos' : 'neg'}>
              {totalRealizedProfit >= 0 ? '+' : ''}
              { (totalRealizedProfit * assetLedgerAndSummary.summary.convFactor).toFixed(2) }{' '}
              {valCcy}
            </strong>
          </div>
        </div>
      </div>

      {/* ====================================================================
          TAB 1: RULE-BASED AUTO-TRADING BOT + METHOD DESCRIPTIONS
          ==================================================================== */}
      {activeSubTab === 'autobot' && (
        <div className="auto-module-body">
          {/* Status & Master Switch Banner */}
          <div
            className={`module-status-banner ${
              autoBotEnabled ? 'status-active' : 'status-inactive'
            }`}
          >
            <div className="status-banner-left">
              <div
                className={`pulse-indicator ${
                  autoBotEnabled ? 'pulse-green' : 'pulse-gray'
                }`}
              />
              <div>
                <h3>
                  Moduł Automatycznego Handlu Regułowego
                  <span className={autoBotEnabled ? 'live-tag' : 'off-tag'}>
                    {autoBotEnabled
                      ? '🟢 STATUS: WŁĄCZONY (PRACUJE)'
                      : '⚪ STATUS: WYŁĄCZONY'}
                  </span>
                </h3>
                <p>
                  {autoBotCycleState.lastStatusMsg}
                  {autoBotCycleState.lastCheckTime &&
                    ` (Ostatni odczyt: ${autoBotCycleState.lastCheckTime})`}
                </p>
              </div>
            </div>

            <div className="status-banner-actions">
              <button
                type="button"
                className="secondary-sm-btn"
                onClick={() => runAutoBotStep(true)}
                title="Wymuś natychmiastowe sprawdzenie i wykonanie reguły"
              >
                <Play size={14} />
                Testuj cykl teraz
              </button>
              <button
                type="button"
                className={`master-power-btn ${
                  autoBotEnabled ? 'turn-off' : 'turn-on'
                }`}
                onClick={handleToggleAutoBotClick}
              >
                {autoBotEnabled ? (
                  <>
                    <Square size={15} />
                    Wyłącz Automatyczny Handel
                  </>
                ) : (
                  <>
                    <Power size={15} />
                    Włącz Automatyczny Handel
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="auto-two-col">
            {/* Left Column: Trading Quantity & Parameters Settings */}
            <div className="auto-config-box">
              <div className="box-title">
                <Sliders size={15} />
                <span>Ustawienia Handlu i Ilości Aktywa</span>
              </div>

              <div className="form-group">
                <label>
                  Instrument handlowy (puste = aktualnie wybrana para: {instId})
                </label>
                <div className="input-with-unit">
                  <input
                    type="text"
                    placeholder={`Domyślnie: ${instId}`}
                    value={autoSettings.targetInstId}
                    onChange={(e) =>
                      updateAutoSettingsAndSync((prev) => ({
                        ...prev,
                        targetInstId: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Sposób określania ilości handlowanego aktywa</label>
                <div className="unit-switch">
                  <button
                    type="button"
                    className={
                      autoSettings.amountMode === 'quote' ? 'active' : ''
                    }
                    onClick={() =>
                      updateAutoSettingsAndSync((prev) => ({
                        ...prev,
                        amountMode: 'quote',
                      }))
                    }
                  >
                    Kwota w {activeQuoteCcy} (np. USDC/USDT)
                  </button>
                  <button
                    type="button"
                    className={
                      autoSettings.amountMode === 'base' ? 'active' : ''
                    }
                    onClick={() =>
                      updateAutoSettingsAndSync((prev) => ({
                        ...prev,
                        amountMode: 'base',
                      }))
                    }
                  >
                    Ilość jednostek {activeBaseCcy}
                  </button>
                </div>
              </div>

              <div className="auto-params-grid">
                <div className="form-group">
                  <label>
                    {autoSettings.amountMode === 'quote'
                      ? `Kwota na 1 transakcję (${activeQuoteCcy})`
                      : `Ilość aktywa na 1 transakcję (${activeBaseCcy})`}
                  </label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      value={autoSettings.tradeAmount}
                      onChange={(e) =>
                        updateAutoSettingsAndSync((prev) => ({
                          ...prev,
                          tradeAmount: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">
                      {autoSettings.amountMode === 'quote'
                        ? activeQuoteCcy
                        : activeBaseCcy}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Próg zakupu na spadku (%)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={autoSettings.dipBuyPct}
                      onChange={(e) =>
                        updateAutoSettingsAndSync((prev) => ({
                          ...prev,
                          dipBuyPct: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">%</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Cel zysku Take Profit (%)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={autoSettings.takeProfitPct}
                      onChange={(e) =>
                        updateAutoSettingsAndSync((prev) => ({
                          ...prev,
                          takeProfitPct: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">%</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Ochronny Stop Loss (%)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      value={autoSettings.stopLossPct}
                      onChange={(e) =>
                        updateAutoSettingsAndSync((prev) => ({
                          ...prev,
                          stopLossPct: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">%</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Interwał sprawdzania (sek.)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="5"
                      value={autoSettings.checkIntervalSec}
                      onChange={(e) =>
                        updateAutoSettingsAndSync((prev) => ({
                          ...prev,
                          checkIntervalSec: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">s</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Maks. transz w cyklu</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="20"
                      value={autoSettings.maxOpenCycles}
                      onChange={(e) =>
                        updateAutoSettingsAndSync((prev) => ({
                          ...prev,
                          maxOpenCycles: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">x</span>
                  </div>
                </div>
              </div>

              <label className="checkbox-row" style={{ marginTop: '6px' }}>
                <input
                  type="checkbox"
                  checked={autoSettings.executeRealOrders}
                  onChange={(e) =>
                    updateAutoSettingsAndSync((prev) => ({
                      ...prev,
                      executeRealOrders: e.target.checked,
                    }))
                  }
                />
                <span>
                  Wysyłaj rzeczywiste zlecenia do OKX API (gdy odznaczone: tryb
                  symulacji)
                </span>
              </label>

              {/* Current Cycle Live Summary */}
              <div className="tracked-positions-mini">
                <div className="tracked-header">
                  <span>
                    Aktywna para: <strong>{activePairForBot}</strong>
                  </span>
                  <span>
                    Transze:{' '}
                    <strong>
                      {autoBotCycleState.openCyclesCount} /{' '}
                      {autoSettings.maxOpenCycles}
                    </strong>
                  </span>
                </div>
                <div className="tracked-row">
                  <span>
                    Śr. wejście:{' '}
                    <strong>
                      {autoBotCycleState.avgEntryPrice
                        ? autoBotCycleState.avgEntryPrice.toFixed(5)
                        : '—'}
                    </strong>
                  </span>
                  <span>
                    Zgromadzono:{' '}
                    <strong>
                      {autoBotCycleState.heldBaseQty > 0
                        ? `${autoBotCycleState.heldBaseQty.toFixed(
                            4
                          )} ${activeBaseCcy}`
                        : '0'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Rules Activation & Detailed Descriptions */}
            <div className="auto-rules-box">
              <div className="box-title">
                <BookOpen size={15} />
                <span>
                  Aktywacja Reguł Handlu + Opis Metod (Co robią i jak działają)
                </span>
              </div>

              <div className="rules-catalog-list">
                {AUTO_TRADING_RULES_CATALOG.map((rule) => {
                  const isRuleOn = Boolean(
                    autoSettings.activeRules?.[rule.id]
                  );
                  return (
                    <div
                      key={rule.id}
                      className={`rule-card-item ${
                        isRuleOn ? 'rule-enabled' : ''
                      }`}
                    >
                      <div className="rule-card-top">
                        <div className="rule-title-group">
                          <strong>{rule.name}</strong>
                          <span className="rule-badge">{rule.badge}</span>
                        </div>
                        <button
                          type="button"
                          className={`rule-toggle-btn ${
                            isRuleOn ? 'on' : 'off'
                          }`}
                          onClick={() => toggleRule(rule.id)}
                        >
                          {isRuleOn ? '✓ Reguła Aktywna' : 'Aktywuj Regułę'}
                        </button>
                      </div>

                      <div className="rule-desc-block">
                        <p>
                          <strong>Co robi:</strong> {rule.whatItDoes}
                        </p>
                        <p>
                          <strong>Jak działa:</strong> {rule.howItWorks}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: SEPARATE AUTONOMOUS MULTI-MARKET AI AGENT MODULE
          ==================================================================== */}
      {activeSubTab === 'ai_agent' && (
        <div className="auto-module-body">
          {/* Separate AI Agent Activation & Status Banner */}
          <div
            className={`module-status-banner ${
              aiAgentEnabled ? 'status-ai-active' : 'status-inactive'
            }`}
          >
            <div className="status-banner-left">
              <div
                className={`pulse-indicator ${
                  aiAgentEnabled ? 'pulse-purple' : 'pulse-gray'
                }`}
              />
              <div>
                <h3>
                  Oddzielny Moduł: Autonomiczny Agent AI (Multi-Market Profit &
                  Swap)
                  <span
                    className={aiAgentEnabled ? 'live-tag ai-tag' : 'off-tag'}
                  >
                    {aiAgentEnabled
                      ? '🤖 STATUS AGENTA AI: AKTYWNY (SKANUJE I HANDLUJE)'
                      : '⚪ STATUS AGENTA AI: DEZAKTYWOWANY'}
                  </span>
                </h3>
                <p>{aiLiveStatus.currentThought}</p>
              </div>
            </div>

            <div className="status-banner-actions">
              {aiTrackedHoldings.length > 0 && (
                <>
                  <button
                    type="button"
                    className="emergency-close-all-btn"
                    onClick={() => handleEmergencyCloseAllPositions(false)}
                    disabled={isClosingAllPositions}
                    title="Awaryjnie sprzedaj i zamknij wszystkie otwarte pozycje Agenta AI naraz"
                  >
                    <AlertCircle size={14} />
                    {isClosingAllPositions
                      ? 'Zamykanie pozycji...'
                      : `🚨 Emergency: Zamknij Wszystkie (${aiTrackedHoldings.length})`}
                  </button>
                  <button
                    type="button"
                    className="emergency-stop-all-btn"
                    onClick={() => handleEmergencyCloseAllPositions(true)}
                    disabled={isClosingAllPositions}
                    title="Natychmiast wyłącz Agenta AI i zamknij wszystkie jego pozycje"
                  >
                    <Square size={14} />
                    🛑 Stop AI + Zamknij Wszystko
                  </button>
                </>
              )}

              <button
                type="button"
                className="secondary-sm-btn"
                onClick={() => runAiAgentCycle(true)}
                disabled={aiLiveStatus.isScanning}
              >
                <Sparkles size={14} />
                {aiLiveStatus.isScanning
                  ? 'Skanowanie...'
                  : 'Skanuj i wykonaj ruch AI'}
              </button>

              <button
                type="button"
                className={`master-power-btn ${
                  aiAgentEnabled ? 'turn-off' : 'turn-on-ai'
                }`}
                onClick={handleToggleAiAgentClick}
              >
                {aiAgentEnabled ? (
                  <>
                    <Square size={15} />
                    Dezaktywuj Agenta AI
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    Aktywuj Agenta AI
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="auto-two-col">
            {/* Left Column: AI Agent Configuration & Market Scope */}
            <div className="auto-config-box">
              <div className="box-title">
                <Cpu size={15} />
                <span>Konfiguracja Autonomicznego Agenta AI</span>
              </div>

              <div className="ai-agent-info-banner">
                <div>
                  <strong>Jak działa Agent AI:</strong> Samodzielnie analizuje
                  setki instrumentów na wszystkich wybranych rynkach OKX (Spot,
                  Pre-Market, Tokenizowane Akcje, Surowce, Swap). Kupuje
                  najbardziej opłacalne aktywa, automatycznie zbiera i kumuluje
                  profity po osiągnięciu celu, a gdy wykryje znacznie lepszą
                  okazję na rynku —
                  <strong>
                    {' '}
                    automatycznie zamienia słabsze aktywo na bardziej zyskowne
                  </strong>
                  . Wszystkie otwarte pozycje i zlecenia AI są widoczne również w
                  dolnym panelu aplikacji.
                </div>
              </div>

              {/* Wallet Asset Selection for AI Agent */}
              <div className="ai-wallet-asset-selector-box">
                <div className="ai-wallet-selector-header">
                  <div className="box-title" style={{ marginBottom: 0 }}>
                    <Wallet size={15} />
                    <span>
                      Wybór Aktywa z Portfela Handlowego dla Agenta AI
                    </span>
                  </div>
                  <div className="unit-switch mini-ccy-switch">
                    <button
                      type="button"
                      className={valCcy === 'USDC' ? 'active' : ''}
                      onClick={() =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          summaryValuationCcy: 'USDC',
                        }))
                      }
                    >
                      USDC
                    </button>
                    <button
                      type="button"
                      className={valCcy === 'USDG' ? 'active' : ''}
                      onClick={() =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          summaryValuationCcy: 'USDG',
                        }))
                      }
                    >
                      USDG
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label>
                    Wybierz aktywo znajdujące się w Portfelu Handlowym do
                    obsługi przez Agenta AI
                  </label>
                  <select
                    className="wallet-asset-select"
                    value={aiSettings.selectedWalletAsset || 'ALL'}
                    onChange={(e) =>
                      updateAiSettingsAndSync((prev) => ({
                        ...prev,
                        selectedWalletAsset: e.target.value,
                      }))
                    }
                  >
                    <option value="ALL">
                      🔄 Wszystkie aktywa z Portfela Handlowego (Automatyczny
                      wybór AI)
                    </option>
                    {assetLedgerAndSummary.walletChoices.map((w) => (
                      <option key={w.ccy} value={w.ccy}>
                        {w.ccy} — W portfelu: {w.walletTotalQty.toFixed(4)}{' '}
                        {w.ccy} | Wzięto do handlu: {w.takenQty.toFixed(4)} |
                        Zostało do wyboru: {w.remainingToChooseQty.toFixed(4)}{' '}
                        (≈ {w.remainingToChooseVal.toFixed(2)} {valCcy})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick clickable chips for assets in Portfel Handlowy */}
                <div className="wallet-asset-pills-row">
                  <button
                    type="button"
                    className={`quote-pill ${
                      (aiSettings.selectedWalletAsset || 'ALL') === 'ALL'
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      updateAiSettingsAndSync((prev) => ({
                        ...prev,
                        selectedWalletAsset: 'ALL',
                      }))
                    }
                  >
                    {(aiSettings.selectedWalletAsset || 'ALL') === 'ALL'
                      ? '✓ '
                      : ''}
                    Wszystkie (Auto)
                  </button>
                  {assetLedgerAndSummary.walletChoices.map((w) => {
                    const isSel = aiSettings.selectedWalletAsset === w.ccy;
                    return (
                      <button
                        key={w.ccy}
                        type="button"
                        className={`quote-pill ${isSel ? 'active' : ''}`}
                        onClick={() =>
                          updateAiSettingsAndSync((prev) => ({
                            ...prev,
                            selectedWalletAsset: w.ccy,
                          }))
                        }
                        title={`W portfelu: ${w.walletTotalQty.toFixed(
                          4
                        )} ${w.ccy} | Wzięto: ${w.takenQty.toFixed(
                          4
                        )} | Zostało: ${w.remainingToChooseQty.toFixed(
                          4
                        )} (${w.remainingToChooseVal.toFixed(2)} ${valCcy})`}
                      >
                        {isSel ? '✓ ' : ''}
                        <strong>{w.ccy}</strong>
                        <small style={{ marginLeft: '4px', opacity: 0.85 }}>
                          ({w.remainingToChooseVal.toFixed(1)} {valCcy})
                        </small>
                      </button>
                    );
                  })}
                </div>

                {/* Allocation % & Instant Take Action when a specific asset or wallet asset is selected */}
                <div className="wallet-allocation-controls">
                  <div className="allocation-pct-group">
                    <span>Ile % wolnego aktywa brać do handlu:</span>
                    <div className="pos-mode-pills">
                      {['25', '50', '75', '100'].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          className={
                            String(aiSettings.walletAllocationPct || '100') ===
                            pct
                              ? 'active'
                              : ''
                          }
                          onClick={() =>
                            updateAiSettingsAndSync((prev) => ({
                              ...prev,
                              walletAllocationPct: pct,
                            }))
                          }
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {aiSettings.selectedWalletAsset &&
                    aiSettings.selectedWalletAsset !== 'ALL' && (
                      <button
                        type="button"
                        className="take-to-trade-primary-btn"
                        onClick={() =>
                          handleTakeWalletAssetToAi(
                            aiSettings.selectedWalletAsset
                          )
                        }
                      >
                        <Zap size={14} />
                        Weź {aiSettings.selectedWalletAsset} (
                        {aiSettings.walletAllocationPct || 100}%) do handlu AI
                        teraz
                      </button>
                    )}
                </div>

                {/* Live Mini Status of the selected asset */}
                {(() => {
                  const selCcy = aiSettings.selectedWalletAsset || 'ALL';
                  if (selCcy === 'ALL') {
                    return (
                      <div className="selected-asset-live-strip">
                        <span>
                          <strong>Wzięto do handlu:</strong>{' '}
                          {assetLedgerAndSummary.summary.totalTakenBoughtVal.toFixed(
                            2
                          )}{' '}
                          {valCcy}
                        </span>
                        <span>
                          <strong>Sprzedano za:</strong>{' '}
                          {assetLedgerAndSummary.summary.totalSoldVal.toFixed(2)}{' '}
                          {valCcy}
                        </span>
                        <span>
                          <strong>Zostało do wyboru:</strong>{' '}
                          <strong style={{ color: '#38bdf8' }}>
                            {assetLedgerAndSummary.summary.totalRemainingToChooseVal.toFixed(
                              2
                            )}{' '}
                            {valCcy}
                          </strong>
                        </span>
                      </div>
                    );
                  }
                  const selRow = assetLedgerAndSummary.ledgerRows.find(
                    (r) => r.ccy === selCcy
                  );
                  if (!selRow) return null;
                  return (
                    <div className="selected-asset-live-strip">
                      <span>
                        <strong>Aktywo {selRow.ccy}:</strong> Wzięto do handlu:{' '}
                        <strong>
                          {selRow.takenQty.toFixed(4)} {selRow.ccy}
                        </strong>{' '}
                        (Aktywnie: {selRow.activeQty.toFixed(4)})
                      </span>
                      <span>
                        <strong>Kupiono za:</strong>{' '}
                        {selRow.totalBoughtVal.toFixed(2)} {valCcy} (śr.{' '}
                        {selRow.avgBuyPrice > 0
                          ? selRow.avgBuyPrice.toFixed(4)
                          : '—'}
                        )
                      </span>
                      <span>
                        <strong>Sprzedano za:</strong>{' '}
                        {selRow.totalSoldVal.toFixed(2)} {valCcy} (śr.{' '}
                        {selRow.avgSellPrice > 0
                          ? selRow.avgSellPrice.toFixed(4)
                          : '—'}
                        )
                      </span>
                      <span>
                        <strong>Zostało do wyboru:</strong>{' '}
                        <strong style={{ color: '#38bdf8' }}>
                          {selRow.remainingToChooseQty.toFixed(4)} {selRow.ccy}{' '}
                          (≈ {selRow.remainingToChooseVal.toFixed(2)} {valCcy})
                        </strong>
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="form-group">
                <label>Rynki udostępnione dla Agenta AI (Multi-Market)</label>
                <div className="quote-filter-bar">
                  {[
                    { key: 'SPOT', label: 'Krypto Spot' },
                    {
                      key: 'PREMARKET',
                      label: '🔥 Pre-Market (Anthropic, OpenAI)',
                    },
                    { key: 'STOCKS', label: '📈 Tokenizowane Akcje (xStocks)' },
                    {
                      key: 'COMMODITIES',
                      label: '🛢️ Surowce (Złoto, Ropa, Srebro)',
                    },
                    { key: 'SWAP', label: 'Kontrakty Perpetual (SWAP)' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`quote-pill ${
                        aiSettings.allowedMarkets?.[m.key] ? 'active' : ''
                      }`}
                      onClick={() => toggleAiMarket(m.key)}
                    >
                      {aiSettings.allowedMarkets?.[m.key] ? '✓ ' : ''}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="auto-params-grid">
                <div className="form-group">
                  <label>Kwota pojedynczej pozycji AI (USDC/USDT)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="2"
                      value={aiSettings.tradeBudgetUsdt}
                      onChange={(e) =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          tradeBudgetUsdt: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">USD</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Maks. równoczesnych pozycji AI</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="15"
                      value={aiSettings.maxConcurrentHoldings}
                      onChange={(e) =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          maxConcurrentHoldings: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">poz.</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Cel zbierania profitu (Take Profit %)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      value={aiSettings.targetProfitPct}
                      onChange={(e) =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          targetProfitPct: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">%</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Ochrona kapitału AI (Stop Loss %)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.1"
                      min="0.3"
                      value={aiSettings.stopLossPct}
                      onChange={(e) =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          stopLossPct: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">%</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Interwał skanowania rynków (sek.)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="8"
                      value={aiSettings.scanIntervalSec}
                      onChange={(e) =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          scanIntervalSec: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">s</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Próg przewagi do zamiany aktywa (pkt AI)</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="5"
                      max="60"
                      value={aiSettings.minRotationAdvantageScore}
                      onChange={(e) =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          minRotationAdvantageScore: e.target.value,
                        }))
                      }
                    />
                    <span className="unit-tag">pkt</span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Profil decyzyjny Agenta AI</label>
                <div className="pos-mode-pills">
                  {[
                    { id: 'conservative', label: 'Konserwatywny' },
                    { id: 'balanced', label: 'Zbalansowany Profit' },
                    { id: 'aggressive', label: 'Agresywny Łowca Okazji' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={
                        aiSettings.riskProfile === p.id ? 'active' : ''
                      }
                      onClick={() =>
                        updateAiSettingsAndSync((prev) => ({
                          ...prev,
                          riskProfile: p.id,
                        }))
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="extra-order-options">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={aiSettings.allowAssetRotation}
                    onChange={(e) =>
                      updateAiSettingsAndSync((prev) => ({
                        ...prev,
                        allowAssetRotation: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>
                      Automatyczna zamiana aktywów (Asset Rotation):
                    </strong>{' '}
                    Pozwól Agentowi AI sprzedawać słabsze aktywa i kupować za
                    nie instrumenty o wyższym prawdopodobieństwie zysku
                  </span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={aiSettings.executeRealOrders}
                    onChange={(e) =>
                      updateAiSettingsAndSync((prev) => ({
                        ...prev,
                        executeRealOrders: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    Wysyłaj rzeczywiste zlecenia rynkowe przez OKX API
                  </span>
                </label>
              </div>
            </div>

            {/* Right Column: Live AI Radar (Top Opportunities & Active AI Holdings) */}
            <div className="auto-rules-box">
              <div className="box-title">
                <Sparkles size={15} />
                <span>
                  Radar Okazji Agenta AI ({aiLiveStatus.scannedCount}{' '}
                  przeskanowanych rynków) oraz Ręczne Sterowanie Pozycjami
                  (Emergency)
                </span>
              </div>

              {/* Active AI Holdings with Emergency Manual Controls */}
              <div className="tracked-positions-mini">
                <div className="tracked-header">
                  <strong>
                    Aktywne pozycje pod nadzorem AI ({aiTrackedHoldings.length}{' '}
                    / {aiSettings.maxConcurrentHoldings})
                  </strong>
                  <div className="tracked-header-actions">
                    {aiTrackedHoldings.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="emergency-close-all-btn"
                          onClick={() => handleEmergencyCloseAllPositions(false)}
                          disabled={isClosingAllPositions}
                          title="Ręcznie zamknij (sprzedaj) wszystkie otwarte pozycje AI naraz"
                        >
                          {isClosingAllPositions
                            ? 'Zamykanie...'
                            : `🚨 Zamknij Wszystkie (${aiTrackedHoldings.length})`}
                        </button>
                        <button
                          type="button"
                          className="emergency-stop-all-btn"
                          onClick={() => handleEmergencyCloseAllPositions(true)}
                          disabled={isClosingAllPositions}
                          title="Zatrzymaj Agenta AI i zamknij wszystkie pozycje"
                        >
                          🛑 Stop AI + Zamknij Wszystko
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {aiTrackedHoldings.length === 0 ? (
                  <div className="min-sz-hint">
                    Brak otwartych pozycji AI. Włącz Agenta AI lub kliknij
                    „Skanuj i wykonaj ruch AI”, aby Agent natychmiast otworzył
                    pierwszą pozycję.
                  </div>
                ) : (
                  aiTrackedHoldings.map((h) => {
                    const curPx = Number(h.currentPrice || h.entryPrice || 0);
                    const entPx = Number(h.entryPrice || curPx || 1);
                    const pnlPct =
                      entPx > 0 ? ((curPx - entPx) / entPx) * 100 : 0;
                    const pnlUsd = (curPx - entPx) * Number(h.qty || 0);
                    const isClosingThis = closingPositionId === h.instId;

                    return (
                      <div key={h.instId} className="tracked-row">
                        <div className="tracked-row-info">
                          <strong
                            style={{ cursor: 'pointer', color: '#60a5fa' }}
                            onClick={() =>
                              onOpenChart
                                ? onOpenChart(h.instId, h.instType)
                                : onSelectInstrument &&
                                  onSelectInstrument(h.instId, h.instType)
                            }
                          >
                            {h.instId}
                          </strong>
                          <small>
                            {' '}
                            • Ilość: {Number(h.qty).toFixed(4)} {h.baseCcy} •
                            Wejście: {h.entryPrice} • Teraz: {curPx}{' '}
                            <strong className={pnlPct >= 0 ? 'pos' : 'neg'}>
                              ({pnlPct >= 0 ? '+' : ''}
                              {pnlPct.toFixed(2)}% /{' '}
                              {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)})
                            </strong>
                          </small>
                        </div>

                        <div className="tracked-row-actions">
                          <span className="rule-badge">
                            Score: {h.entryScore}/100
                          </span>
                          {onOpenChart && (
                            <button
                              type="button"
                              className="secondary-sm-btn"
                              onClick={() => onOpenChart(h.instId, h.instType)}
                              title="Otwórz wykres pełnoekranowy dla tego aktywa"
                            >
                              📈 Wykres
                            </button>
                          )}
                          <button
                            type="button"
                            className="emergency-single-close-btn"
                            onClick={() =>
                              handleEmergencyCloseSinglePosition(h.instId)
                            }
                            disabled={isClosingThis || isClosingAllPositions}
                            title="Awaryjnie zamknij (sprzedaj) tę pojedynczą pozycję ręcznie"
                          >
                            {isClosingThis
                              ? 'Zamykanie...'
                              : '🚨 Zamknij pozycję'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Top Scanned Market Opportunities */}
              <div className="box-title" style={{ marginTop: '6px' }}>
                <TrendingUp size={15} />
                <span>
                  Najlepsze wykryte okazje rynkowe na żywo (Top AI Opportunity
                  Score)
                </span>
              </div>

              {aiLiveStatus.topOpportunities.length === 0 ? (
                <div className="empty-list-msg">
                  Kliknij „Skanuj i wykonaj ruch AI” lub aktywuj Agenta AI, aby
                  zobaczyć ranking najbardziej opłacalnych rynków.
                </div>
              ) : (
                <div className="ai-opportunities-list">
                  {aiLiveStatus.topOpportunities.map((opp, idx) => (
                    <div
                      key={opp.instId}
                      className="ai-opp-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        onSelectInstrument &&
                        onSelectInstrument(opp.instId, opp.instType)
                      }
                    >
                      <div className="ai-opp-main">
                        <div className="ai-opp-title">
                          <span className="ai-rank">#{idx + 1}</span>
                          <strong>{opp.instId}</strong>
                          <span className="mini-type-tag">
                            {opp.categoryTag}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {onOpenChart && (
                            <button
                              type="button"
                              className="secondary-sm-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenChart(opp.instId, opp.instType);
                              }}
                            >
                              📈 Pokaż wykres
                            </button>
                          )}
                          <span
                            className={`ai-score-pill ${
                              opp.score >= 70 ? 'high' : 'mid'
                            }`}
                          >
                            AI Score: {opp.score}/100
                          </span>
                        </div>
                      </div>
                      <div className="ai-opp-meta">
                        <span>Cena: {opp.lastPrice}</span>
                        <span
                          className={
                            opp.change24hPct >= 0 ? 'pos-text' : 'neg-text'
                          }
                        >
                          24h: {opp.change24hPct >= 0 ? '+' : ''}
                          {opp.change24hPct.toFixed(2)}%
                        </span>
                        <span>Sygnał: {opp.signalType}</span>
                      </div>
                      <div className="min-sz-hint">{opp.reasonText}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Live Asset Status Panel directly below AI Agent Config & Radar */}
          {renderAssetStatusPanel()}
        </div>
      )}

      {/* ====================================================================
          TAB 2.5: DEDICATED ASSET STATUS PANEL (PORTFEL HANDLOWY ⇄ AI)
          ==================================================================== */}
      {activeSubTab === 'asset_status' && (
        <div className="auto-module-body">{renderAssetStatusPanel()}</div>
      )}

      {/* ====================================================================
          TAB 3: FULL ACTION, SWAP & PROFIT HISTORY LOG
          ==================================================================== */}
      {activeSubTab === 'history' && (
        <div className="auto-module-body">
          <div className="history-toolbar">
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>
                Historia Działań Automatycznego Handlu, Zamian Aktywów i Decyzji
                Agenta AI
              </strong>
              <div>
                Rejestr wszystkich zakupów, realizacji profitów (Take Profit)
                oraz rotacji między aktywami
              </div>
            </div>

            {actionHistory.length > 0 && (
              <button
                type="button"
                className="secondary-sm-btn"
                onClick={() => {
                  setActionHistory([]);
                  publishCrossDeviceState({ actionHistory: [] });
                }}
              >
                <Trash2 size={13} />
                Wyczyść historię
              </button>
            )}
          </div>

          {actionHistory.length === 0 ? (
            <div className="orders-empty">
              Brak zapisanych działań. Uruchom Automatyczny Handel lub aktywuj
              Agenta AI, aby rejestrować transakcje, zamiany aktywów i zebrane
              profity.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Czas</th>
                    <th>Moduł / Źródło</th>
                    <th>Akcja</th>
                    <th>Instrument / Zamiana</th>
                    <th>Ilość / Kwota</th>
                    <th>Cena</th>
                    <th>Zrealizowany Profit</th>
                    <th>Uzasadnienie decyzji (AI / Reguła)</th>
                  </tr>
                </thead>
                <tbody>
                  {actionHistory.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div>{item.timestamp}</div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                          {item.dateStr}
                        </small>
                      </td>
                      <td>
                        <strong>{item.source}</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            item.side?.includes('BUY')
                              ? 'badge-buy'
                              : item.side?.includes('SWAP')
                              ? 'badge-swap'
                              : item.side?.includes('SELL')
                              ? 'badge-sell'
                              : ''
                          }`}
                        >
                          {item.side}
                        </span>
                      </td>
                      <td>
                        <strong>{item.instId}</strong>
                      </td>
                      <td>{item.amountStr}</td>
                      <td>{item.priceStr}</td>
                      <td
                        className={
                          typeof item.profitUsd === 'number'
                            ? item.profitUsd >= 0
                              ? 'pos'
                              : 'neg'
                            : ''
                        }
                      >
                        {typeof item.profitUsd === 'number' ? (
                          <strong>
                            {item.profitUsd >= 0 ? '+' : ''}$
                            {item.profitUsd.toFixed(3)}
                          </strong>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ maxWidth: '420px', lineHeight: '1.35' }}>
                        {item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
