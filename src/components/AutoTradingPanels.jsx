import React, { useState, useEffect, useRef, useCallback } from 'react';
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
      'Dokupuje aktywo partiami podczas głębszych korekt (obniżając średnią cenę zakupu) i automatycznie sprzedaje całość z zyskiem, gdy tylko rynek odbije powyżej uśrednionej ceny wejścia.',
    howItWorks:
      'Zamiast kupować za całą kwotę w jednym punkcie, bot otwiera pierwszą transzę, a w razie dalszego spadku kursu o kolejny krok (%) dokupuje następną transzę (do ustalonego limitu transakcji). Dzięki temu średnia cena zakupu (Avg Entry) obniża się. Gdy kurs rynkowy przekroczy tę uśrednioną cenę o zadany "Take Profit (%)", bot sprzedaje zgromadzone jednostki i realizuje skumulowany zysk.',
  },
];

export default function AutoTradingPanels({
  instId,
  instType,
  ticker,
  orderBook,
  credentials,
  hasCredentials,
  accountBalance,
  onSelectInstrument,
  onRefreshPrivateData,
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

  // Sub-tab inside the Automation Center ('autobot' | 'ai_agent' | 'history')
  const [activeSubTab, setActiveSubTab] = useState('autobot');
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
    try {
      const saved = localStorage.getItem(AI_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      tradeBudgetUsdt: '20', // Kwota na pojedynczą okazję (USDT/USDC)
      maxConcurrentHoldings: '4',
      targetProfitPct: '1.1',
      stopLossPct: '1.8',
      scanIntervalSec: '20',
      allowAssetRotation: true, // Zamiana słabszych aktywów na bardziej zyskowne
      minRotationAdvantageScore: '22', // O ile pkt nowe aktywo musi być lepsze aby dokonać zamiany
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
      'Agent AI gotowy. Po aktywacji będzie samodzielnie skanował wszystkie rynki OKX, realizował profity i zamieniał słabsze aktywa na bardziej opłacalne.',
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

  // ============================================================================
  // CROSS-DEVICE CLOUD SYNC ENGINE (DESKTOP <-> PHONE REAL-TIME STATE SYNC)
  // ============================================================================
  const publishCrossDeviceState = useCallback(
    async (overrides = {}) => {
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
      // Keep payload compact (< 3KB) so ntfy.sh delivers it inline via JSON & WebSocket
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
          currentThought: (cur.aiLiveStatus?.currentThought || '').slice(
            0,
            160
          ),
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
    },
    []
  );

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
      if (Array.isArray(packet.recentHistory) && packet.recentHistory.length > 0) {
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
            // Our local device has newer state than the cloud — push it so other devices get it
            publishCrossDeviceState();
          }
        } else if (
          isInitialMount &&
          (latestStateRef.current.autoBotEnabled ||
            latestStateRef.current.aiAgentEnabled ||
            latestStateRef.current.actionHistory?.length > 0)
        ) {
          // Seed cloud channel if empty and this device already has active automation
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
      const newItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString(),
        dateStr: new Date().toLocaleDateString(),
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
    (acc, item) => acc + (typeof item.profitUsd === 'number' ? item.profitUsd : 0),
    0
  );

  // ============================================================================
  // HELPER: EXECUTE ORDER (REAL OKX API WITH instIdCode + SMART FALLBACK)
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
      const quoteCcy = parts[1] || 'USDT';

      let baseQty =
        amountMode === 'quote' ? (rawAmt / px) * 0.998 : rawAmt;
      let quoteVal =
        amountMode === 'quote' ? rawAmt : rawAmt * px;

      if (shouldSendApi && hasCredentials) {
        const region = credentials.region || 'global';

        // Check available balance in wallet for SPOT buy orders so we adjust to available funds
        if (targetInstType === 'SPOT' && side === 'buy' && accountBalance?.details) {
          const quoteDetail = accountBalance.details.find(
            (d) => d.ccy === quoteCcy
          );
          const availQuote = parseFloat(quoteDetail?.availBal || '0');
          if (availQuote > 0 && availQuote < quoteVal && availQuote >= 1.5) {
            quoteVal = Math.floor(availQuote * 98) / 100;
            baseQty = (quoteVal / px) * 0.998;
          }
        }

        // Fetch instrument metadata (lotSz, minSz, instIdCode)
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
            : await resolveInstIdCode(targetInstId, targetInstType, region);

        let szToSend;
        let tgtCcy;

        if (targetInstType === 'SPOT' && side === 'buy' && amountMode === 'quote') {
          szToSend = quoteVal.toFixed(2);
          tgtCcy = 'quote_ccy';
        } else {
          if (info?.lotSz) {
            const lot = parseFloat(info.lotSz);
            if (lot > 0) {
              const decimals = info.lotSz.includes('.')
                ? info.lotSz.split('.')[1].length
                : 0;
              const stepped = Math.floor(baseQty / lot) * lot;
              szToSend = stepped.toFixed(decimals);
            }
          }
          if (!szToSend || parseFloat(szToSend) <= 0) {
            szToSend = baseQty.toFixed(4);
          }
          if (info?.minSz && parseFloat(szToSend) < parseFloat(info.minSz)) {
            szToSend = String(info.minSz);
          }
          baseQty = parseFloat(szToSend);
          quoteVal = baseQty * px;
          tgtCcy = targetInstType === 'SPOT' ? 'base_ccy' : undefined;
        }

        try {
          const res = await placeOrder(credentials, {
            instId: targetInstId,
            instIdCode: resolvedCode,
            instType: targetInstType,
            tdMode: targetInstType === 'SPOT' ? 'cash' : 'cross',
            side,
            ordType: 'market',
            sz: szToSend,
            tgtCcy,
          });

          if (onRefreshPrivateData) {
            onRefreshPrivateData();
          }

          return {
            executedVia: `API OKX (${credentials.isDemo ? 'Demo' : 'Live'})`,
            ordId: res?.ordId || 'OK',
            baseQty,
            quoteVal,
            baseCcy,
            quoteCcy,
            price: px,
          };
        } catch (apiErr) {
          const errCode = String(apiErr?.code || '');
          // If instrument is restricted in user's region (e.g. MiCA / EEA / delisted), flag it so AI skips to next candidate
          if (
            errCode === '50014' ||
            errCode === '51001' ||
            errCode === '51155' ||
            errCode === '51004' ||
            errCode === '51006'
          ) {
            apiErr.isInstrumentUnsupported = true;
            throw apiErr;
          }
          // If Autonomous AI Agent has insufficient free cash balance on exchange (51008) or min size (51020),
          // fall back gracefully to virtual paper execution instead of crashing the AI loop
          if (
            source === 'AI_AGENT' &&
            (errCode === '51008' || errCode === '51020' || errCode === '51000')
          ) {
            return {
              executedVia: `Tryb Wirtualny AI (brak wolnego salda ${quoteCcy} na giełdzie)`,
              ordId: `AI-SIM-${Date.now().toString().slice(-5)}`,
              baseQty,
              quoteVal,
              baseCcy,
              quoteCcy,
              price: px,
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
        ordId: `SIM-${Date.now().toString().slice(-5)}`,
        baseQty,
        quoteVal,
        baseCcy,
        quoteCcy,
        price: px,
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
      const targetPair = (autoSettings.targetInstId || instId || 'ONDO-USDC').trim();
      const targetType =
        targetPair.endsWith('-SWAP')
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
            : await fetchOrderBook(targetPair, 5, credentials.region || 'global');

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
        const range24 = high24 > low24 ? (lastPx - low24) / (high24 - low24) : 0.5;

        // Calculate orderbook bid/ask pressure
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

        // Initialize reference price if not set
        if (!st.referencePrice) {
          setAutoBotCycleState((prev) => ({
            ...prev,
            referencePrice: lastPx,
            lastCheckTime: new Date().toLocaleTimeString(),
            lastStatusMsg: `Zainicjalizowano cenę bazową ${targetPair}: ${lastPx}. Monitorowanie reguł...`,
          }));
          if (!manualTrigger) return;
        }

        // 1. CHECK TAKE PROFIT OR STOP LOSS IF HOLDING AN ACTIVE CYCLE
        if (st.openCyclesCount > 0 && st.avgEntryPrice > 0 && st.heldBaseQty > 0) {
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

            const profitUsd =
              (lastPx - st.avgEntryPrice) * st.heldBaseQty;

            setAutoBotCycleState((prev) => ({
              ...prev,
              referencePrice: lastPx,
              avgEntryPrice: null,
              heldBaseQty: 0,
              openCyclesCount: 0,
              lastCheckTime: new Date().toLocaleTimeString(),
              lastStatusMsg: `Zrealizowano Take Profit (+${pnlPct.toFixed(2)}%) na ${targetPair}!`,
              realizedProfitUsd: (prev.realizedProfitUsd || 0) + profitUsd,
            }));

            appendHistory({
              source: 'Auto-Bot (Reguły)',
              actionType: 'TAKE_PROFIT',
              instId: targetPair,
              side: 'SELL',
              amountStr: `${st.heldBaseQty.toFixed(4)} ${execRes.baseCcy}`,
              priceStr: `${lastPx}`,
              profitUsd,
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
              lastStatusMsg: `Zadziałał Stop Loss (${pnlPct.toFixed(2)}%) na ${targetPair}.`,
              realizedProfitUsd: (prev.realizedProfitUsd || 0) + lossUsd,
            }));

            appendHistory({
              source: 'Auto-Bot (Reguły)',
              actionType: 'STOP_LOSS',
              instId: targetPair,
              side: 'SELL',
              amountStr: `${st.heldBaseQty.toFixed(4)} ${execRes.baseCcy}`,
              priceStr: `${lastPx}`,
              profitUsd: lossUsd,
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

          // Rule 1: Grid & Spread Scalping
          if (rules.grid_scalp && dropFromRefPct >= dipPct) {
            triggeredRule = 'Grid & Spread Scalping';
            triggerReason = `Cena ${targetPair} spadła o -${dropFromRefPct.toFixed(
              2
            )}% od bazy siatki (${refPx.toFixed(5)} ➔ ${lastPx}). Zakup do siatki pod odbicie +${tpPct}%.`;
          }
          // Rule 2: Mean Reversion & Oversold Bounce
          else if (
            rules.mean_reversion &&
            range24 <= 0.28 &&
            obRatio >= 1.05
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
            range24 >= 0.65 &&
            obRatio >= 1.15
          ) {
            triggeredRule = 'Momentum Breakout (Trend)';
            triggerReason = `Silny trend wzrostowy (+${(
              ((lastPx - open24) / open24) *
              100
            ).toFixed(2)}% 24h) oraz przewaga kupujących w arkuszu (${obRatio.toFixed(
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
          // Manual trigger test if user clicked "Testuj cykl teraz"
          else if (manualTrigger && st.openCyclesCount === 0) {
            const activeNames = AUTO_TRADING_RULES_CATALOG.filter(
              (r) => rules[r.id]
            ).map((r) => r.name.split('(')[0].trim());
            triggeredRule = activeNames[0] || 'Reguła Ręczna';
            triggerReason = `Wymuszone wejście testowe reguły (${triggeredRule}) na ${targetPair} po cenie ${lastPx} (Bid/Ask: ${obRatio.toFixed(
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
              source: `Auto-Bot • ${triggeredRule}`,
              actionType: 'BUY_RULE',
              instId: targetPair,
              side: 'BUY',
              amountStr: `${execRes.baseQty.toFixed(4)} ${execRes.baseCcy} ($${execRes.quoteVal.toFixed(
                2
              )})`,
              priceStr: `${lastPx}`,
              profitUsd: null,
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
    const sec = Math.max(5, parseInt(autoSettings.checkIntervalSec || '15', 10));
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

    // Require a valid numeric instIdCode so WebSocket orders never fail with 50014
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
    if (spreadPct > 0.75) return null;

    const change24hPct = ((last - open) / open) * 100;
    const volatility24hPct = ((high - low) / low) * 100;
    const posInRange = (last - low) / (high - low); // 0.0 = at 24h low, 1.0 = at 24h high

    // Require minimum intraday movement potential (> 0.8%)
    if (volatility24hPct < 0.8) return null;

    let score = 40;
    let signalType = 'Akumulacja';
    const reasons = [];

    // Factor 1: Strong oversold bounce opportunity (near 24h low with solid volatility)
    if (posInRange <= 0.25 && volatility24hPct >= 2.0) {
      const bounceBonus = Math.round((0.28 - posInRange) * 95);
      score += bounceBonus;
      signalType = 'Odbicie z wyprzedania (Dip Buy)';
      reasons.push(
        `nisko w kanale 24h (${(posInRange * 100).toFixed(
          0
        )}% od dołka) przy zmienności ${volatility24hPct.toFixed(1)}%`
      );
    }
    // Factor 2: Strong positive momentum breakout with room to 24h high
    else if (change24hPct >= 1.2 && posInRange >= 0.45 && posInRange <= 0.88) {
      const momBonus = Math.min(28, Math.round(change24hPct * 3.2));
      score += momBonus;
      signalType = 'Momentum & Trend Wzrostowy';
      reasons.push(
        `silny impet +${change24hPct.toFixed(
          2
        )}% z przestrzenią do szczytu 24h`
      );
    } else {
      score += Math.round((0.5 - Math.abs(posInRange - 0.35)) * 20);
    }

    // Factor 3: Tight spread & high liquidity bonus
    if (spreadPct < 0.12) {
      score += 12;
      reasons.push(`bardzo wąski spread (${spreadPct.toFixed(3)}%)`);
    } else if (spreadPct < 0.25) {
      score += 6;
    }

    // Factor 4: Volatility-to-reward bonus
    if (volatility24hPct >= 3.5 && volatility24hPct <= 18) {
      score += 10;
    }

    // Factor 5: Category tagging
    let categoryTag = inst.instType;
    if (isPreMarketInstrument(inst)) {
      categoryTag = 'PRE-MARKET';
      score += 4;
    } else if (isCommodityInstrument(inst)) {
      categoryTag = `SUROWIEC (${getCommodityDescription(inst) || inst.baseCcy})`;
      score += 3;
    } else if (isStockInstrument(inst)) {
      categoryTag = 'AKCJA / RWA';
      score += 3;
    }

    score = Math.max(5, Math.min(99, score));

    return {
      instId: inst.instId,
      instIdCode: instIdCodeNum,
      instType: inst.instType,
      baseCcy: inst.baseCcy || inst.instId.split('-')[0],
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
        `zmiana 24h: ${change24hPct.toFixed(2)}%, zmienność: ${volatility24hPct.toFixed(1)}%`,
    };
  }, []);

  const runAiAgentCycle = useCallback(
    async (manualTrigger = false) => {
      setAiLiveStatus((prev) => ({ ...prev, isScanning: true }));

      try {
        const region = credentials.region || 'global';
        const allowed = aiSettings.allowedMarkets || {};

        // Determine which quote currencies are supported in user's region / wallet
        const availUsdc = parseFloat(
          accountBalance?.details?.find((d) => d.ccy === 'USDC')?.availBal || '0'
        );
        const availUsdt = parseFloat(
          accountBalance?.details?.find((d) => d.ccy === 'USDT')?.availBal || '0'
        );
        const preferUsdcOnly =
          region === 'eea' || (availUsdc >= 1 && availUsdt < 1);

        // Fetch live catalogs for Spot and Swap
        const needSpot =
          allowed.SPOT || allowed.STOCKS || allowed.COMMODITIES;
        const needSwap =
          allowed.SWAP || allowed.PREMARKET || allowed.STOCKS || allowed.COMMODITIES;

        const [spotInst, spotTick, swapInst, swapTick] = await Promise.all([
          needSpot ? fetchAllInstruments('SPOT', region).catch(() => []) : [],
          needSpot ? fetchAllTickers('SPOT', region).catch(() => []) : [],
          needSwap ? fetchAllInstruments('SWAP', region).catch(() => []) : [],
          needSwap ? fetchAllTickers('SWAP', region).catch(() => []) : [],
        ]);

        const instByIdMap = {};
        for (const inst of [...spotInst, ...swapInst]) {
          if (inst?.instId) instByIdMap[inst.instId] = inst;
        }

        const tickersMap = {};
        for (const t of [...spotTick, ...swapTick]) {
          tickersMap[t.instId] = t;
        }

        const nowMs = Date.now();
        const budgetUsdt = parseFloat(aiSettings.tradeBudgetUsdt || '20');

        // Filter instruments according to allowed market categories & regional quote currency rules
        const candidateInstruments = [...spotInst, ...swapInst].filter((inst) => {
          const skipUntil = unsupportedInstRef.current.get(inst.instId);
          if (skipUntil && skipUntil > nowMs) return false;

          const quote =
            inst.quoteCcy || inst.settleCcy || inst.instId.split('-')[1];
          if (quote !== 'USDC' && quote !== 'USDT') return false;

          // On EEA accounts (MiCA) or when user holds USDC only, prioritize USDC pairs for real API orders
          if (
            preferUsdcOnly &&
            aiSettings.executeRealOrders &&
            hasCredentials &&
            quote !== 'USDC'
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
        });

        // Score all candidate instruments
        const scoredList = [];
        for (const inst of candidateInstruments) {
          const tk = tickersMap[inst.instId];
          if (!tk) continue;
          const scored = scoreInstrumentOpportunity(inst, tk);
          if (!scored) continue;
          // Ensure minimum order value is compatible with budget
          if (
            scored.minSz > 0 &&
            scored.minSz * scored.lastPrice > Math.max(budgetUsdt * 1.5, 25)
          ) {
            continue;
          }
          scoredList.push(scored);
        }

        scoredList.sort((a, b) => b.score - a.score);
        const topOpportunities = scoredList.slice(0, 6);
        const bestCandidate = topOpportunities[0] || null;

        const tpPct = parseFloat(aiSettings.targetProfitPct || '1.1');
        const slPct = parseFloat(aiSettings.stopLossPct || '1.8');
        const minRotAdv = parseFloat(
          aiSettings.minRotationAdvantageScore || '22'
        );
        const maxHoldings = parseInt(
          aiSettings.maxConcurrentHoldings || '4',
          10
        );

        let currentHoldings = [...aiHoldingsRef.current];

        // Include real Spot holdings from user's OKX accountBalance (non-stablecoins with value > $3)
        if (accountBalance?.details?.length) {
          for (const balItem of accountBalance.details) {
            const ccy = balItem.ccy;
            if (
              ccy === 'USDT' ||
              ccy === 'USDC' ||
              ccy === 'USD' ||
              ccy === 'EUR'
            ) {
              continue;
            }
            const avail = parseFloat(balItem.availBal || '0');
            const eqUsd = parseFloat(balItem.eqUsd || '0');
            if (avail > 0 && eqUsd >= 3) {
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
                  currentHoldings.push({
                    instId: matchedPair,
                    instIdCode: instMeta?.instIdCode
                      ? Number(instMeta.instIdCode)
                      : undefined,
                    instType: 'SPOT',
                    baseCcy: ccy,
                    qty: avail,
                    entryPrice: curPx,
                    entryScore: 50,
                    openedAt: new Date().toLocaleTimeString(),
                    fromWallet: true,
                  });
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

              const profitUsd = (curPx - hold.entryPrice) * hold.qty;
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
                currentThought: `Zrealizowano profit na ${hold.instId} (+${pnlPct.toFixed(
                  2
                )}%, zysk: +$${profitUsd.toFixed(
                  2
                )})! Kapitał gotowy do kolejnej okazji.`,
                cumulativeProfitUsd:
                  (prev.cumulativeProfitUsd || 0) + profitUsd,
                totalTradesCount: (prev.totalTradesCount || 0) + 1,
              }));

              appendHistory({
                source: '🤖 Agent AI',
                actionType: 'AI_PROFIT_HARVEST',
                instId: hold.instId,
                side: 'SELL (PROFIT)',
                amountStr: `${hold.qty.toFixed(4)} ${hold.baseCcy}`,
                priceStr: `${curPx}`,
                profitUsd,
                reason: `Agent AI zebrał skumulowany profit +${pnlPct.toFixed(
                  2
                )}% (wejście: ${hold.entryPrice.toFixed(
                  5
                )} ➔ sprzedaż: ${curPx}). [${execRes.executedVia}]`,
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

              const lossUsd = (curPx - hold.entryPrice) * hold.qty;
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
                currentThought: `Ochrona kapitału AI: zamknięto ${hold.instId} (${pnlPct.toFixed(
                  2
                )}%), aby uwolnić środki na lepsze okazje.`,
                cumulativeProfitUsd: (prev.cumulativeProfitUsd || 0) + lossUsd,
                totalTradesCount: (prev.totalTradesCount || 0) + 1,
              }));

              appendHistory({
                source: '🤖 Agent AI',
                actionType: 'AI_STOP_LOSS',
                instId: hold.instId,
                side: 'SELL (SL)',
                amountStr: `${hold.qty.toFixed(4)} ${hold.baseCcy}`,
                priceStr: `${curPx}`,
                profitUsd: lossUsd,
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
            const curScore = foundScoreObj ? foundScoreObj.score : 35;
            if (curScore < weakestScore) {
              weakestScore = curScore;
              weakestHold = { ...hold, currentScore: curScore };
            }
          }

          const scoreAdvantage = bestCandidate.score - weakestScore;
          if (
            weakestHold &&
            scoreAdvantage >= minRotAdv &&
            bestCandidate.score >= 70
          ) {
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

              const swapPnlUsd =
                (weakPx - weakestHold.entryPrice) * weakestHold.qty;
              const proceedsUsdt = Math.max(
                budgetUsdt,
                weakestHold.qty * weakPx * 0.995
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
                  entryScore: bestCandidate.score,
                  openedAt: new Date().toLocaleTimeString(),
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
                source: '🤖 Agent AI (Rotacja)',
                actionType: 'AI_ASSET_SWAP',
                instId: `${weakestHold.baseCcy} ➔ ${bestCandidate.baseCcy} (${bestCandidate.instId})`,
                side: 'SWAP',
                amountStr: `${weakestHold.qty.toFixed(4)} ${
                  weakestHold.baseCcy
                } ➔ ${buyRes.baseQty.toFixed(4)} ${bestCandidate.baseCcy}`,
                priceStr: `${weakPx} ➔ ${bestCandidate.lastPrice}`,
                profitUsd: swapPnlUsd,
                reason: `Zamiana aktywów: ${weakestHold.instId} miał niski potencjał (Score ${weakestScore}/100), natomiast ${bestCandidate.instId} [${bestCandidate.categoryTag}] wykazuje znacznie wyższe prawdopodobieństwo profitu (Score ${bestCandidate.score}/100: ${bestCandidate.reasonText}). [${buyRes.executedVia}]`,
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
        const minScoreThreshold =
          aiSettings.riskProfile === 'conservative'
            ? 74
            : aiSettings.riskProfile === 'aggressive'
            ? 58
            : 65;

        const unheldCandidates = topOpportunities.filter(
          (cand) =>
            !currentHoldings.some((h) => h.instId === cand.instId) &&
            (cand.score >= minScoreThreshold || manualTrigger)
        );

        if (currentHoldings.length < maxHoldings && unheldCandidates.length > 0) {
          for (const candidate of unheldCandidates.slice(0, 4)) {
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
                entryScore: candidate.score,
                openedAt: new Date().toLocaleTimeString(),
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
                currentThought: `Wykorzystano okazję rynkową: kupiono ${candidate.instId} [${candidate.categoryTag}] po ${candidate.lastPrice} (AI Score: ${candidate.score}/100 — ${candidate.signalType}). Cel profitu: +${tpPct}%.`,
                totalTradesCount: (prev.totalTradesCount || 0) + 1,
              }));

              appendHistory({
                source: '🤖 Agent AI',
                actionType: 'AI_BUY_OPPORTUNITY',
                instId: candidate.instId,
                side: 'BUY',
                amountStr: `${buyRes.baseQty.toFixed(4)} ${
                  candidate.baseCcy
                } ($${buyRes.quoteVal.toFixed(2)})`,
                priceStr: `${candidate.lastPrice}`,
                profitUsd: null,
                reason: `Wykryto okazję [${candidate.categoryTag}] — AI Score ${candidate.score}/100 (${candidate.signalType}): ${candidate.reasonText}. Cel TP: +${tpPct}%. [${buyRes.executedVia}]`,
              });
              return;
            } catch (buyErr) {
              if (buyErr?.isInstrumentUnsupported) {
                // Blacklist this unsupported instrument for 10 minutes and try the next candidate immediately
                unsupportedInstRef.current.set(
                  candidate.instId,
                  Date.now() + 10 * 60 * 1000
                );
                continue;
              }
              throw buyErr;
            }
          }
        }

        // Otherwise, log scan status
        setAiLiveStatus((prev) => ({
          ...prev,
          isScanning: false,
          lastScanTime: new Date().toLocaleTimeString(),
          scannedCount: scoredList.length,
          topOpportunities,
          currentThought: bestCandidate
            ? `Przeskanowano ${scoredList.length} rynków. Najlepszy sygnał: ${bestCandidate.instId} (Score ${bestCandidate.score}/100). Monitorowanie ${currentHoldings.length} aktywnych pozycji pod kątem profitu +${tpPct}%...`
            : `Przeskanowano rynki OKX. Oczekiwanie na okazję o wysokim stosunku zysku do ryzyka...`,
        }));
      } catch (err) {
        setAiLiveStatus((prev) => ({
          ...prev,
          isScanning: false,
          lastScanTime: new Date().toLocaleTimeString(),
          currentThought: `Błąd podczas cyklu Agenta AI: ${err.message}`,
        }));
      }
    },
    [
      credentials.region,
      hasCredentials,
      aiSettings,
      accountBalance,
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

  const activePairForBot = (autoSettings.targetInstId || instId || 'ONDO-USDC').trim();
  const activeBaseCcy = activePairForBot.split('-')[0] || 'ONDO';
  const activeQuoteCcy = activePairForBot.split('-')[1] || 'USDC';

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
              className={`mini-status-pill ${aiAgentEnabled ? 'ai-on' : 'off'}`}
            >
              {aiAgentEnabled ? 'AKTYWNY' : 'WYŁ.'}
            </span>
          </button>

          <button
            type="button"
            className={`auto-subtab ${
              activeSubTab === 'history' ? 'active' : ''
            }`}
            onClick={() => setActiveSubTab('history')}
          >
            <History size={16} />
            <span>3. Historia Działań i Zysków ({actionHistory.length})</span>
          </button>
        </div>

        <div className="automation-summary-pills">
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
              {totalRealizedProfit >= 0 ? '+' : ''}$
              {totalRealizedProfit.toFixed(2)} USD
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
                        ? `${autoBotCycleState.heldBaseQty.toFixed(4)} ${activeBaseCcy}`
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
                  Oddzielny Moduł: Autonomiczny Agent AI (Multi-Market Profit & Swap)
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
                  Pre-Market, Tokenizowane Akcje, Surowce, Swap). Szuka
                  niedowartościowanych okazji oraz silnych wybić, automatycznie
                  zbiera i kumuluje profity po osiągnięciu celu, a gdy wykryje
                  znacznie lepszą okazję na rynku —
                  <strong>
                    {' '}
                    automatycznie zamienia słabsze aktywo na bardziej zyskowne
                  </strong>
                  .
                </div>
              </div>

              <div className="form-group">
                <label>Rynki udostępnione dla Agenta AI (Multi-Market)</label>
                <div className="quote-filter-bar">
                  {[
                    { key: 'SPOT', label: 'Krypto Spot' },
                    { key: 'PREMARKET', label: '🔥 Pre-Market (Anthropic, OpenAI)' },
                    { key: 'STOCKS', label: '📈 Tokenizowane Akcje (xStocks)' },
                    { key: 'COMMODITIES', label: '🛢️ Surowce (Złoto, Ropa, Srebro)' },
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
                    Pozwól Agentowi AI sprzedawać słabsze aktywa i kupować za nie
                    instrumenty o wyższym prawdopodobieństwie zysku
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
                  przeskanowanych rynków) oraz Aktywne Pozycje AI
                </span>
              </div>

              {/* Active AI Holdings */}
              <div className="tracked-positions-mini">
                <div className="tracked-header">
                  <strong>
                    Aktywne aktywa pod nadzorem AI ({aiTrackedHoldings.length} /{' '}
                    {aiSettings.maxConcurrentHoldings})
                  </strong>
                  {aiTrackedHoldings.length > 0 && (
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={() => {
                        setAiTrackedHoldings([]);
                        publishCrossDeviceState({ aiTrackedHoldings: [] });
                      }}
                    >
                      Wyczyść listę śledzenia
                    </button>
                  )}
                </div>

                {aiTrackedHoldings.length === 0 ? (
                  <div className="min-sz-hint">
                    Brak otwartych pozycji AI. Włącz Agenta AI lub kliknij
                    „Skanuj i wykonaj ruch AI”, aby Agent znalazł pierwszą okazję.
                  </div>
                ) : (
                  aiTrackedHoldings.map((h) => (
                    <div key={h.instId} className="tracked-row">
                      <div>
                        <strong
                          style={{ cursor: 'pointer', color: '#60a5fa' }}
                          onClick={() =>
                            onSelectInstrument &&
                            onSelectInstrument(h.instId, h.instType)
                          }
                        >
                          {h.instId}
                        </strong>
                        <small>
                          {' '}
                          • Ilość: {Number(h.qty).toFixed(4)} {h.baseCcy} •
                          Wejście: {h.entryPrice}
                        </small>
                      </div>
                      <span className="rule-badge">
                        Score: {h.entryScore}/100
                      </span>
                    </div>
                  ))
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
                        <span
                          className={`ai-score-pill ${
                            opp.score >= 70 ? 'high' : 'mid'
                          }`}
                        >
                          AI Score: {opp.score}/100
                        </span>
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
        </div>
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
