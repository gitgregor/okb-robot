import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  KeyRound,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  ShieldAlert,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  History,
  Eye,
  EyeOff,
  Globe,
  Search,
  Star,
  Layers,
  Sliders,
  Activity,
  Bot,
  Cpu,
} from 'lucide-react';
import {
  OKX_REGIONS,
  MARKET_CATEGORIES,
  isPreMarketInstrument,
  isStockInstrument,
  isCommodityInstrument,
  getCommodityDescription,
  fetchCategoryCatalog,
  fetchTicker,
  fetchOrderBook,
  fetchInstrumentInfo,
  fetchAccountBalance,
  fetchAccountConfig,
  fetchPositions,
  setAccountLeverage,
  placeOrder,
  closePositionMarket,
  cancelOrder,
  fetchPendingOrders,
  fetchOrderHistory,
  autoDiscoverKeyViaWebSocket,
} from './services/okxApi';
import AutoTradingPanels from './components/AutoTradingPanels';
import './App.css';

const STORAGE_KEY = 'okx_trader_credentials_v1';
const FAVORITES_KEY = 'okx_trader_favorites_v2';

const DEFAULT_FAVORITES = [
  'ONDO-USDC',
  'ANTHROPIC-USDT-SWAP',
  'OPENAI-USDT-SWAP',
  'PAXG-USDT',
  'XAUT-USDT',
  'XAU-USDT-SWAP',
  'XAG-USDT-SWAP',
  'CL-USDT-SWAP',
  'NG-USDT-SWAP',
  'XUSO-USDT',
  'XURNM-USDT',
  'XNVDA-USDT',
  'XTSLA-USDT',
  'XAAPL-USDT',
  'XSPCX-USDT',
  'NVDA-USDT-SWAP',
  'OKB-USDT',
  'BTC-USDT',
];

const DEFAULT_INST_BY_CATEGORY = {
  SPOT: { instId: 'ONDO-USDC', instType: 'SPOT' },
  SWAP: { instId: 'BTC-USDT-SWAP', instType: 'SWAP' },
  PREMARKET: { instId: 'ANTHROPIC-USDT-SWAP', instType: 'SWAP' },
  STOCKS: { instId: 'XNVDA-USDT', instType: 'SPOT' },
  COMMODITIES: { instId: 'PAXG-USDT', instType: 'SPOT' },
  FUTURES: { instId: 'ANTHROPIC-USD_UM_XPERP-310912', instType: 'FUTURES' },
  MARGIN: { instId: 'BTC-USDT', instType: 'MARGIN' },
};

const STANDARD_QUOTE_FILTERS = [
  'ALL',
  '★ FAV',
  'USDT',
  'USDC',
  'EUR',
  'USD',
  'BTC',
  'OKB',
];

const SPECIAL_CATEGORY_FILTERS = [
  'ALL',
  '★ FAV',
  'SPOT',
  'SWAP',
  'FUTURES',
  'USDT',
  'USDC',
  'USD',
];

export default function App() {
  // Active market category tab ('SPOT' | 'SWAP' | 'PREMARKET' | 'STOCKS' | 'COMMODITIES' | 'FUTURES' | 'MARGIN')
  const [activeCategory, setActiveCategory] = useState('SPOT');
  // Actual OKX API instType of the currently selected instrument ('SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN')
  const [instType, setInstType] = useState('SPOT');
  const [instId, setInstId] = useState('ONDO-USDC');
  // Active mobile bottom-tab view ('trade' | 'markets' | 'orders' | 'wallet')
  const [mobileView, setMobileView] = useState('trade');

  // Favorites list
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_FAVORITES;
  });

  // Full catalog of instruments & tickers for the current category
  const [allInstruments, setAllInstruments] = useState([]);
  const [allTickersMap, setAllTickersMap] = useState({});
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quoteFilter, setQuoteFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('vol'); // 'vol' | 'change' | 'name'

  // API Credentials & Environment Mode
  const [credentials, setCredentials] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          apiKey: parsed.apiKey || '',
          secretKey: parsed.secretKey || '',
          passphrase: parsed.passphrase || '',
          region: parsed.userSelectedRegion || 'global',
          isDemo: typeof parsed.isDemo === 'boolean' ? parsed.isDemo : true,
          rememberMe: parsed.rememberMe !== false,
        };
      }
    } catch {
      // ignore
    }
    return {
      apiKey: '',
      secretKey: '',
      passphrase: '',
      region: 'global',
      isDemo: true,
      rememberMe: true,
    };
  });

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  // Selected instrument live market data
  const [ticker, setTicker] = useState(null);
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const [instrumentInfo, setInstrumentInfo] = useState(null);
  const [marketError, setMarketError] = useState(null);

  // Private Account, Positions & Orders state
  const [accountBalance, setAccountBalance] = useState({ totalEq: '0', details: [] });
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [activeBottomTab, setActiveBottomTab] = useState('positions');
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [privateError, setPrivateError] = useState(null);
  const [automationBook, setAutomationBook] = useState({
    activePositions: [],
    pendingTargetOrders: [],
    executedOrders: [],
  });

  // Order Form State
  const [side, setSide] = useState('buy'); // 'buy' | 'sell'
  const [ordType, setOrdType] = useState('limit'); // 'limit' | 'market'
  const [tdMode, setTdMode] = useState('cash'); // 'cash' (SPOT) | 'cross' | 'isolated'
  const [posSideMode, setPosSideMode] = useState('net'); // 'net' (One-way) | 'long_short' (Hedge)
  const [leverage, setLeverage] = useState('5');
  const [isSettingLeverage, setIsSettingLeverage] = useState(false);
  const [marginCcy, setMarginCcy] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [showTpSl, setShowTpSl] = useState(false);
  const [tpTriggerPx, setTpTriggerPx] = useState('');
  const [slTriggerPx, setSlTriggerPx] = useState('');

  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [marketTgtCcy, setMarketTgtCcy] = useState('quote_ccy');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState(null);

  // Separate Master States for Automated Rule Bot & Autonomous AI Agent (persisted & synced across devices)
  const [autoBotEnabled, setAutoBotEnabled] = useState(() => {
    try {
      return localStorage.getItem('okx_autobot_enabled_v2') === 'true';
    } catch {
      return false;
    }
  });
  const [aiAgentEnabled, setAiAgentEnabled] = useState(() => {
    try {
      return localStorage.getItem('okx_ai_agent_enabled_v2') === 'true';
    } catch {
      return false;
    }
  });
  const [userToggleSignal, setUserToggleSignal] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem('okx_autobot_enabled_v2', String(autoBotEnabled));
    } catch {
      // ignore
    }
  }, [autoBotEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('okx_ai_agent_enabled_v2', String(aiAgentEnabled));
    } catch {
      // ignore
    }
  }, [aiAgentEnabled]);

  const handleUserToggleAutoBot = useCallback((nextVal) => {
    setAutoBotEnabled((prev) =>
      typeof nextVal === 'boolean' ? nextVal : !prev
    );
    setUserToggleSignal(Date.now());
  }, []);

  const handleUserToggleAiAgent = useCallback((nextVal) => {
    setAiAgentEnabled((prev) =>
      typeof nextVal === 'boolean' ? nextVal : !prev
    );
    setUserToggleSignal(Date.now());
  }, []);

  const hasCredentials = Boolean(
    credentials.apiKey.trim() &&
      credentials.secretKey.trim() &&
      credentials.passphrase.trim()
  );

  // Persist favorites
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  const toggleFavorite = (id, e) => {
    e?.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Persist credentials
  useEffect(() => {
    try {
      if (credentials.rememberMe) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...credentials,
            userSelectedRegion: credentials.region,
          })
        );
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [credentials]);

  // Helper to select an instrument and sync its instType + tdMode
  const selectInstrument = useCallback(
    (itemInstId, itemInstType, switchToTrade = false) => {
      const resolvedType =
        activeCategory === 'MARGIN' ? 'MARGIN' : itemInstType || 'SPOT';
      setInstId(itemInstId);
      setInstType(resolvedType);
      setOrderFeedback(null);
      setSize('');
      if (resolvedType === 'SPOT') {
        setTdMode('cash');
        setReduceOnly(false);
      } else {
        setTdMode((prev) => (prev === 'isolated' ? 'isolated' : 'cross'));
      }
      if (switchToTrade) {
        setMobileView('trade');
      }
    },
    [activeCategory]
  );

  // Load full catalog of instruments + tickers when activeCategory or region changes
  const loadCatalog = useCallback(
    async (categoryToLoad, switchDefaultInstrument = false) => {
      setIsLoadingCatalog(true);
      try {
        const activeRegion = credentials.region || 'global';
        const { instruments: instList, tickersMap } =
          await fetchCategoryCatalog(categoryToLoad, activeRegion);

        setAllInstruments(instList);
        setAllTickersMap(tickersMap);

        if (instList.length > 0) {
          const currentExists = instList.find((item) => item.instId === instId);
          if (switchDefaultInstrument || !currentExists) {
            const preferred = DEFAULT_INST_BY_CATEGORY[categoryToLoad];
            const foundPreferred = preferred
              ? instList.find((i) => i.instId === preferred.instId)
              : null;
            const target = foundPreferred || instList[0];
            selectInstrument(
              target.instId,
              categoryToLoad === 'MARGIN' ? 'MARGIN' : target.instType
            );
          }
        }
      } catch (err) {
        setMarketError(err.message);
      } finally {
        setIsLoadingCatalog(false);
      }
    },
    [credentials.region, instId, selectInstrument]
  );

  useEffect(() => {
    loadCatalog(activeCategory, false);
    const tickerInterval = setInterval(async () => {
      try {
        const activeRegion = credentials.region || 'global';
        const { tickersMap } = await fetchCategoryCatalog(
          activeCategory,
          activeRegion
        );
        setAllTickersMap(tickersMap);
      } catch {
        // ignore background refresh error
      }
    }, 10000);

    return () => clearInterval(tickerInterval);
  }, [activeCategory, credentials.region]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle switching top category tab
  const handleSelectCategory = (newCat) => {
    setActiveCategory(newCat);
    setQuoteFilter('ALL');
    setOrderFeedback(null);
    loadCatalog(newCat, true);
  };

  // Load selected instrument live ticker, order book, and metadata
  const loadActiveInstrumentData = useCallback(
    async (pair, populateInitialPrice = false) => {
      if (!pair) return;
      try {
        const activeRegion = credentials.region || 'global';
        const [tickerData, bookData] = await Promise.all([
          fetchTicker(pair, activeRegion),
          fetchOrderBook(pair, 9, activeRegion).catch(() => null),
        ]);
        if (tickerData) {
          setTicker(tickerData);
          setMarketError(null);
          if (populateInitialPrice && tickerData.last) {
            setPrice(tickerData.last);
          }
        }
        if (bookData) {
          setOrderBook(bookData);
        }
      } catch (err) {
        setTicker((prev) => {
          if (!prev) {
            setMarketError(err.message);
          }
          return prev;
        });
      }
    },
    [credentials.region]
  );

  useEffect(() => {
    if (!instId) return;
    let active = true;
    setTicker(null);
    setOrderBook({ asks: [], bids: [] });
    setInstrumentInfo(null);
    setOrderFeedback(null);

    loadActiveInstrumentData(instId, true);
    fetchInstrumentInfo(instId, instType, credentials.region || 'global')
      .then((info) => {
        if (active && info) {
          setInstrumentInfo(info);
          if (info.quoteCcy) {
            setMarginCcy(info.quoteCcy);
          } else if (info.settleCcy) {
            setMarginCcy(info.settleCcy);
          }
        }
      })
      .catch(() => {});

    const interval = setInterval(() => {
      loadActiveInstrumentData(instId, false);
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [instId, instType, credentials.region, loadActiveInstrumentData]);

  // Fetch private account data (Balance, Config, Positions, Open Orders, History)
  const loadPrivateData = useCallback(async () => {
    if (!hasCredentials) return;
    setIsLoadingPrivate(true);
    setPrivateError(null);
    try {
      let activeCreds = credentials;
      let balData;
      try {
        balData = await fetchAccountBalance(activeCreds);
      } catch (firstErr) {
        const codeStr = String(firstErr.code || '');
        if (codeStr === '50119' || codeStr === '60012' || codeStr === '60009') {
          const discovered = await autoDiscoverKeyViaWebSocket(activeCreds);
          if (discovered) {
            activeCreds = {
              ...credentials,
              region: discovered.region,
              isDemo: discovered.isDemo,
            };
            setCredentials((prev) => ({
              ...prev,
              region: discovered.region,
              isDemo: discovered.isDemo,
            }));
            if (discovered.ipError) {
              throw discovered.ipError;
            }
            balData = discovered.balance || (await fetchAccountBalance(activeCreds));
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      setAccountBalance(balData);

      const [cfgData, posData, openOrd, histOrd] = await Promise.all([
        fetchAccountConfig(activeCreds).catch(() => null),
        fetchPositions(activeCreds).catch(() => []),
        fetchPendingOrders(activeCreds).catch(() => []),
        fetchOrderHistory(activeCreds, instType).catch(() => []),
      ]);

      if (cfgData) {
        if (cfgData.posMode === 'long_short_mode') {
          setPosSideMode('long_short');
        } else {
          setPosSideMode('net');
        }
      }
      setPositions(posData);
      setPendingOrders(openOrd);
      setOrderHistory(histOrd);
    } catch (err) {
      setPrivateError(err.message);
    } finally {
      setIsLoadingPrivate(false);
    }
  }, [credentials, hasCredentials, instType]);

  useEffect(() => {
    if (hasCredentials) {
      loadPrivateData();
    } else {
      setAccountBalance({ totalEq: '0', details: [] });
      setPositions([]);
      setPendingOrders([]);
      setOrderHistory([]);
      setPrivateError(null);
    }
  }, [
    hasCredentials,
    credentials.apiKey,
    credentials.secretKey,
    credentials.passphrase,
    credentials.region,
    credentials.isDemo,
    instType,
    loadPrivateData,
  ]);

  // Parse base / quote / settle currencies for the active instrument
  const parts = instId.split('-');
  const baseCcy =
    instrumentInfo?.baseCcy || instrumentInfo?.ctValCcy || parts[0] || '';
  const quoteCcy =
    instrumentInfo?.quoteCcy ||
    instrumentInfo?.settleCcy ||
    (parts[1]?.includes('_') ? 'USD' : parts[1]) ||
    'USDT';
  const isContract = instType === 'SWAP' || instType === 'FUTURES';

  const isSpecialCategory =
    activeCategory === 'PREMARKET' ||
    activeCategory === 'STOCKS' ||
    activeCategory === 'COMMODITIES';
  const filterPills = isSpecialCategory
    ? SPECIAL_CATEGORY_FILTERS
    : STANDARD_QUOTE_FILTERS;

  // Filtered and sorted instrument list for the sidebar explorer
  const filteredInstruments = useMemo(() => {
    const q = searchQuery.trim().toUpperCase().replace(/\//g, '-');

    const filtered = allInstruments.filter((inst) => {
      if (q) {
        const desc = (getCommodityDescription(inst) || '').toUpperCase();
        if (
          !inst.instId.toUpperCase().includes(q) &&
          !desc.includes(q)
        ) {
          return false;
        }
      }
      if (quoteFilter === '★ FAV') {
        return favorites.includes(inst.instId);
      }
      if (
        quoteFilter === 'SPOT' ||
        quoteFilter === 'SWAP' ||
        quoteFilter === 'FUTURES'
      ) {
        return inst.instType === quoteFilter;
      }
      if (quoteFilter !== 'ALL') {
        const instQuote =
          inst.quoteCcy || inst.settleCcy || inst.instId.split('-')[1];
        return instQuote === quoteFilter || inst.baseCcy === quoteFilter;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const ta = allTickersMap[a.instId];
      const tb = allTickersMap[b.instId];

      // Prioritize pre_market in PREMARKET tab, and favorites when no search is entered
      if (!q && quoteFilter === 'ALL') {
        if (activeCategory === 'PREMARKET') {
          const aPre = a.ruleType === 'pre_market' ? 1 : 0;
          const bPre = b.ruleType === 'pre_market' ? 1 : 0;
          if (aPre !== bPre) return bPre - aPre;
        }
        const aFav = favorites.includes(a.instId) ? 1 : 0;
        const bFav = favorites.includes(b.instId) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
      }

      if (sortBy === 'name') {
        return a.instId.localeCompare(b.instId);
      }
      if (sortBy === 'change') {
        const ca =
          ta && parseFloat(ta.open24h) > 0
            ? (parseFloat(ta.last) - parseFloat(ta.open24h)) /
              parseFloat(ta.open24h)
            : -999;
        const cb =
          tb && parseFloat(tb.open24h) > 0
            ? (parseFloat(tb.last) - parseFloat(tb.open24h)) /
              parseFloat(tb.open24h)
            : -999;
        return cb - ca;
      }
      const va = parseFloat(ta?.volCcy24h || ta?.vol24h || '0');
      const vb = parseFloat(tb?.volCcy24h || tb?.vol24h || '0');
      return vb - va;
    });
  }, [
    allInstruments,
    allTickersMap,
    searchQuery,
    quoteFilter,
    sortBy,
    favorites,
    activeCategory,
  ]);

  // Helper to get available balance for a specific currency
  const getAvailableBalance = (ccy) => {
    const found = accountBalance.details?.find((d) => d.ccy === ccy);
    return found ? parseFloat(found.availBal || '0') : 0;
  };

  const availBase = getAvailableBalance(baseCcy);
  const availQuote = getAvailableBalance(quoteCcy);

  // Percentage quick-fill handler
  const handlePercentageClick = (pct) => {
    const lastPx = parseFloat(price || ticker?.last || '0');

    if (instType === 'SPOT') {
      if (side === 'buy') {
        if (availQuote <= 0) return;
        const quoteToSpend = availQuote * pct;
        if (ordType === 'market' && marketTgtCcy === 'quote_ccy') {
          setSize(quoteToSpend.toFixed(2));
        } else if (lastPx > 0) {
          const computedBase = (quoteToSpend / lastPx) * 0.995;
          setSize(computedBase.toFixed(6));
        }
      } else {
        if (availBase <= 0) return;
        const baseToSell = availBase * pct;
        setSize(baseToSell.toFixed(6));
      }
    } else if (isContract) {
      if (availQuote <= 0 || lastPx <= 0) return;
      const lev = parseFloat(leverage || '1');
      const ctVal = parseFloat(instrumentInfo?.ctVal || '1');
      const buyingPowerQuote = availQuote * pct * lev * 0.95;
      const contractNotional =
        instrumentInfo?.ctType === 'linear' ? ctVal * lastPx : ctVal;
      if (contractNotional > 0) {
        const rawContracts = Math.floor(buyingPowerQuote / contractNotional);
        setSize(
          String(Math.max(rawContracts, Number(instrumentInfo?.minSz || 1)))
        );
      }
    } else {
      if (availQuote <= 0 || lastPx <= 0) return;
      const lev = parseFloat(leverage || '1');
      const computedBase = ((availQuote * pct * lev) / lastPx) * 0.95;
      setSize(computedBase.toFixed(5));
    }
  };

  // Apply Leverage to OKX API
  const handleApplyLeverage = async () => {
    if (!hasCredentials) {
      setShowKeyModal(true);
      return;
    }
    setIsSettingLeverage(true);
    setOrderFeedback(null);
    try {
      const mgnMode = tdMode === 'isolated' ? 'isolated' : 'cross';
      if (posSideMode === 'long_short' && mgnMode === 'isolated') {
        await Promise.all([
          setAccountLeverage(credentials, {
            instId,
            lever: leverage,
            mgnMode,
            posSide: 'long',
          }),
          setAccountLeverage(credentials, {
            instId,
            lever: leverage,
            mgnMode,
            posSide: 'short',
          }),
        ]);
      } else {
        await setAccountLeverage(credentials, {
          instId,
          lever: leverage,
          mgnMode,
        });
      }
      setOrderFeedback({
        type: 'success',
        message: `Dźwignia dla ${instId} ustawiona na ${leverage}x (${mgnMode}).`,
      });
    } catch (err) {
      setOrderFeedback({
        type: 'error',
        message: `Błąd ustawiania dźwigni: ${err.message}`,
      });
    } finally {
      setIsSettingLeverage(false);
    }
  };

  // Place Order across any instrument type
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderFeedback(null);

    if (!hasCredentials) {
      setShowKeyModal(true);
      setOrderFeedback({
        type: 'error',
        message: 'Najpierw skonfiguruj klucze OKX API (API Key, Secret, Passphrase).',
      });
      return;
    }

    if (!size || parseFloat(size) <= 0) {
      setOrderFeedback({
        type: 'error',
        message: 'Podaj prawidłową wielkość zlecenia.',
      });
      return;
    }

    if (ordType === 'limit' && (!price || parseFloat(price) <= 0)) {
      setOrderFeedback({
        type: 'error',
        message: 'Podaj prawidłową cenę Limit.',
      });
      return;
    }

    setIsSubmittingOrder(true);
    try {
      let computedPosSide = 'net';
      if (isContract && posSideMode === 'long_short') {
        if (reduceOnly) {
          computedPosSide = side === 'buy' ? 'short' : 'long';
        } else {
          computedPosSide = side === 'buy' ? 'long' : 'short';
        }
      }

      const result = await placeOrder(credentials, {
        instId,
        instType,
        tdMode: instType === 'SPOT' ? 'cash' : tdMode,
        ccy: instType === 'MARGIN' ? marginCcy || quoteCcy : undefined,
        side,
        posSide: computedPosSide,
        ordType,
        sz: size,
        px: ordType === 'limit' ? price : undefined,
        tgtCcy:
          instType === 'SPOT' && ordType === 'market'
            ? side === 'buy'
              ? marketTgtCcy
              : 'base_ccy'
            : undefined,
        reduceOnly: instType !== 'SPOT' ? reduceOnly : false,
        tpTriggerPx: showTpSl && tpTriggerPx ? tpTriggerPx : undefined,
        slTriggerPx: showTpSl && slTriggerPx ? slTriggerPx : undefined,
      });

      setOrderFeedback({
        type: 'success',
        message: `Zlecenie ${side.toUpperCase()} (${instId}) złożone! ID: ${
          result?.ordId || 'OK'
        }`,
      });
      setSize('');
      await loadPrivateData();
    } catch (err) {
      setOrderFeedback({
        type: 'error',
        message: err.message,
      });
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Cancel open order
  const handleCancelOrder = async (orderInstId, ordId) => {
    try {
      await cancelOrder(credentials, { instId: orderInstId, ordId });
      await loadPrivateData();
    } catch (err) {
      setOrderFeedback({
        type: 'error',
        message: `Nie udało się anulować zlecenia: ${err.message}`,
      });
    }
  };

  // Market close open position
  const handleClosePosition = async (pos) => {
    try {
      await closePositionMarket(credentials, {
        instId: pos.instId,
        mgnMode: pos.mgnMode,
        posSide: pos.posSide,
        ccy: pos.ccy,
        pos: pos.pos,
      });
      await loadPrivateData();
    } catch (err) {
      setOrderFeedback({
        type: 'error',
        message: `Błąd zamykania pozycji: ${err.message}`,
      });
    }
  };

  // 24h price change calculation
  const lastPrice = parseFloat(ticker?.last || '0');
  const open24h = parseFloat(ticker?.open24h || '0');
  const change24hPct =
    open24h > 0 ? (((lastPrice - open24h) / open24h) * 100).toFixed(2) : '0.00';
  const isPositive24h = parseFloat(change24hPct) >= 0;

  // Estimated order total & underlying quantity for contracts
  const ctValNum = parseFloat(instrumentInfo?.ctVal || '1');
  const ctValCcy = instrumentInfo?.ctValCcy || baseCcy;

  const estimatedTotalQuote = (() => {
    const szNum = parseFloat(size || '0');
    if (!szNum || szNum <= 0) return '0.00';
    const refPx = ordType === 'limit' ? parseFloat(price || '0') : lastPrice;
    if (isContract) {
      if (instrumentInfo?.ctType === 'inverse') {
        return (szNum * ctValNum).toFixed(2);
      }
      return (szNum * ctValNum * refPx).toFixed(4);
    }
    if (
      instType === 'SPOT' &&
      ordType === 'market' &&
      side === 'buy' &&
      marketTgtCcy === 'quote_ccy'
    ) {
      return szNum.toFixed(2);
    }
    return (szNum * refPx).toFixed(4);
  })();

  const derivativePositions = positions.filter(
    (p) => parseFloat(p.pos || '0') !== 0
  );

  const automationMappedPositions = (automationBook.activePositions || []).map(
    (ap) => {
      const entryPx = Number(ap.entryPrice || 0);
      const curPx =
        allTickersMap[ap.instId]?.last
          ? parseFloat(allTickersMap[ap.instId].last)
          : Number(ap.currentPrice || entryPx);
      const qty = Number(ap.qty || 0);
      const uplVal = entryPx > 0 ? (curPx - entryPx) * qty : 0;
      const uplRatioVal = entryPx > 0 ? (curPx - entryPx) / entryPx : 0;
      return {
        instId: ap.instId,
        instType: ap.instType || 'SPOT',
        mgnMode: ap.source || 'AI / SPOT',
        lever: '1',
        posSide: 'long',
        pos: qty.toFixed(4),
        avgPx: entryPx.toFixed(entryPx >= 100 ? 2 : 5),
        markPx: curPx.toFixed(curPx >= 100 ? 2 : 5),
        liqPx: ap.tpPrice ? `TP: ${ap.tpPrice} / SL: ${ap.slPrice}` : '—',
        upl: String(uplVal),
        uplRatio: String(uplRatioVal),
        isAutomationPosition: true,
      };
    }
  );

  const activePositions = [
    ...derivativePositions,
    ...automationMappedPositions.filter(
      (ap) => !derivativePositions.some((dp) => dp.instId === ap.instId)
    ),
  ];

  const combinedPendingOrders = [
    ...pendingOrders,
    ...(automationBook.pendingTargetOrders || []).filter(
      (to) => !pendingOrders.some((po) => po.ordId === to.ordId)
    ),
  ];

  const combinedOrderHistory = (() => {
    const seen = new Set();
    const list = [];
    for (const ord of [
      ...(automationBook.executedOrders || []),
      ...orderHistory,
    ]) {
      const key = ord.ordId || `${ord.instId}-${ord.cTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(ord);
      }
    }
    return list;
  })();

  return (
    <div className={`app-shell mobile-view-${mobileView}`}>
      {/* Top Navigation Bar */}
      <header className="top-nav">
        <div className="brand-group">
          <div className="brand-logo">OKX</div>
          <div>
            <h1 className="brand-title">Pro Multi-Instrument Terminal</h1>
            <span className="brand-subtitle">
              SPOT • SWAP • PRE-MARKET • TOKENIZED STOCKS • FUTURES
            </span>
          </div>
        </div>

        {/* Market Category Selector Tabs */}
        <div className="inst-type-nav">
          {MARKET_CATEGORIES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`inst-type-tab ${
                activeCategory === t.id ? 'active' : ''
              }`}
              onClick={() => handleSelectCategory(t.id)}
              title={t.desc}
            >
              <Layers size={14} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="nav-center-controls">
          {/* Region Selector: Global / EEA / US */}
          <div className="region-select-wrapper" title="OKX Regional Endpoint">
            <Globe size={15} />
            <select
              className="region-select"
              value={credentials.region || 'global'}
              onChange={(e) =>
                setCredentials((prev) => ({ ...prev, region: e.target.value }))
              }
            >
              {OKX_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Switcher: Demo vs Live */}
          <div className="mode-toggle-container">
            <button
              type="button"
              className={`mode-btn ${credentials.isDemo ? 'active-demo' : ''}`}
              onClick={() =>
                setCredentials((prev) => ({ ...prev, isDemo: true }))
              }
            >
              <FlaskConical size={15} />
              Demo
            </button>
            <button
              type="button"
              className={`mode-btn ${!credentials.isDemo ? 'active-live' : ''}`}
              onClick={() =>
                setCredentials((prev) => ({ ...prev, isDemo: false }))
              }
            >
              <ShieldAlert size={15} />
              Live
            </button>
          </div>

          <button
            type="button"
            className={`top-module-status-pill ${
              autoBotEnabled ? 'bot-on' : 'bot-off'
            }`}
            onClick={() => handleUserToggleAutoBot()}
            title="Kliknij aby włączyć/wyłączyć Automatyczny Handel (Reguły)"
          >
            <Bot size={14} />
            <span>Auto-Bot: {autoBotEnabled ? 'AKTYWNY' : 'WYŁ.'}</span>
            <span className="status-dot" />
          </button>

          <button
            type="button"
            className={`top-module-status-pill ${
              aiAgentEnabled ? 'ai-on' : 'bot-off'
            }`}
            onClick={() => handleUserToggleAiAgent()}
            title="Kliknij aby aktywować/deaktywować Autonomicznego Agenta AI"
          >
            <Cpu size={14} />
            <span>Agent AI: {aiAgentEnabled ? 'AKTYWNY' : 'WYŁ.'}</span>
            <span className="status-dot" />
          </button>

          <button
            type="button"
            className={`api-key-btn ${
              hasCredentials && !privateError ? 'connected' : 'disconnected'
            }`}
            onClick={() => setShowKeyModal(true)}
          >
            <KeyRound size={16} />
            <span>
              {hasCredentials && !privateError ? 'API Połączone' : 'Klucze API'}
            </span>
            <span className="status-dot" />
          </button>
        </div>
      </header>

      {/* Active Instrument Live Ticker Bar */}
      <section className="market-bar">
        {marketError ? (
          <div className="ticker-error">
            <AlertCircle size={15} />
            <span>
              Błąd danych rynkowych ({instId}): {marketError}
            </span>
          </div>
        ) : (
          <div className="ticker-stats">
            <div className="ticker-pair-main">
              <button
                type="button"
                className={`fav-star-btn ${
                  favorites.includes(instId) ? 'active' : ''
                }`}
                onClick={(e) => toggleFavorite(instId, e)}
                title="Dodaj/usuń z ulubionych"
              >
                <Star size={16} />
              </button>
              <button
                type="button"
                className="active-pair-btn"
                onClick={() =>
                  setMobileView((v) => (v === 'markets' ? 'trade' : 'markets'))
                }
                title="Zmień parę handlową"
              >
                <span className="active-pair-label">{instId}</span>
                <span className="mobile-pair-chevron">▾</span>
              </button>
              <span className="inst-type-badge">{instType}</span>
              {instrumentInfo?.ruleType === 'pre_market' && (
                <span className="premarket-badge">PRE-MARKET</span>
              )}
              {isStockInstrument(instrumentInfo) && (
                <span className="stock-badge">STOCK / RWA</span>
              )}
              {isCommodityInstrument(instrumentInfo) && (
                <span className="commodity-badge">
                  SUROWIEC • {getCommodityDescription(instrumentInfo)}
                </span>
              )}
              <span className={`last-price ${isPositive24h ? 'pos' : 'neg'}`}>
                {ticker
                  ? Number(ticker.last).toLocaleString(undefined, {
                      maximumFractionDigits: 8,
                    })
                  : '—'}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Zmiana 24h</span>
              <span className={`stat-value ${isPositive24h ? 'pos' : 'neg'}`}>
                {isPositive24h ? (
                  <TrendingUp size={14} />
                ) : (
                  <TrendingDown size={14} />
                )}
                {isPositive24h ? `+${change24hPct}%` : `${change24hPct}%`}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Max 24h</span>
              <span className="stat-value">
                {ticker?.high24h
                  ? Number(ticker.high24h).toLocaleString(undefined, {
                      maximumFractionDigits: 8,
                    })
                  : '—'}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Min 24h</span>
              <span className="stat-value">
                {ticker?.low24h
                  ? Number(ticker.low24h).toLocaleString(undefined, {
                      maximumFractionDigits: 8,
                    })
                  : '—'}
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Obrót 24h</span>
              <span className="stat-value">
                {ticker?.vol24h
                  ? Number(ticker.vol24h).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })
                  : '—'}
              </span>
            </div>

            {instrumentInfo?.lever && (
              <div className="stat-item">
                <span className="stat-label">Max Dźwignia</span>
                <span className="stat-value highlight-amber">
                  {instrumentInfo.lever}x
                </span>
              </div>
            )}

            {isContract && instrumentInfo?.ctVal && (
              <div className="stat-item">
                <span className="stat-label">Wartość 1 kontraktu</span>
                <span className="stat-value">
                  {instrumentInfo.ctVal} {instrumentInfo.ctValCcy}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main 4-Column Trading Workspace */}
      <main className="trading-grid-4col">
        {/* Column 1: Full Market Explorer (All OKX Instruments) */}
        <section className="card markets-card">
          <div className="card-header">
            <h2>
              Rynki {activeCategory} ({filteredInstruments.length})
            </h2>
            <button
              type="button"
              className="icon-refresh-btn"
              onClick={() => loadCatalog(activeCategory, false)}
              disabled={isLoadingCatalog}
              title="Odśwież listę instrumentów"
            >
              <RefreshCw size={14} className={isLoadingCatalog ? 'spin' : ''} />
            </button>
          </div>

          {/* Search Box */}
          <div className="market-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Szukaj (np. Złoto, PAXG, Ropa, ANTHROPIC, NVDA...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Quote / Subtype Filter Pills */}
          <div className="quote-filter-bar">
            {filterPills.map((qf) => (
              <button
                key={qf}
                type="button"
                className={`quote-pill ${quoteFilter === qf ? 'active' : ''}`}
                onClick={() => setQuoteFilter(qf)}
              >
                {qf}
              </button>
            ))}
          </div>

          {/* Sort Header */}
          <div className="market-list-header">
            <span
              className={sortBy === 'name' ? 'active-sort' : ''}
              onClick={() => setSortBy('name')}
            >
              Instrument
            </span>
            <span
              className={sortBy === 'vol' ? 'active-sort' : ''}
              onClick={() => setSortBy('vol')}
            >
              Cena / Wol.
            </span>
            <span
              className={sortBy === 'change' ? 'active-sort' : ''}
              onClick={() => setSortBy('change')}
            >
              24h %
            </span>
          </div>

          {/* Scrollable List of All Instruments */}
          <div className="market-list-scroll">
            {isLoadingCatalog && allInstruments.length === 0 ? (
              <div className="empty-list-msg">
                Ładowanie listy instrumentów z OKX...
              </div>
            ) : filteredInstruments.length === 0 ? (
              <div className="empty-list-msg">
                Brak instrumentów pasujących do filtra.
              </div>
            ) : (
              filteredInstruments.slice(0, 1000).map((item) => {
                const tk = allTickersMap[item.instId];
                const last = tk ? parseFloat(tk.last) : 0;
                const open = tk ? parseFloat(tk.open24h) : 0;
                const pct =
                  open > 0 ? (((last - open) / open) * 100).toFixed(2) : '0.00';
                const pos = parseFloat(pct) >= 0;
                const isFav = favorites.includes(item.instId);
                const isPre = isPreMarketInstrument(item);
                const commodityDesc = getCommodityDescription(item);

                return (
                  <div
                    key={`${item.instType}-${item.instId}`}
                    className={`market-row-item ${
                      instId === item.instId ? 'selected' : ''
                    }`}
                    onClick={() =>
                      selectInstrument(item.instId, item.instType, true)
                    }
                  >
                    <div className="m-col-name">
                      <button
                        type="button"
                        className={`fav-star-sm ${isFav ? 'active' : ''}`}
                        onClick={(e) => toggleFavorite(item.instId, e)}
                      >
                        ★
                      </button>
                      <div className="m-name-wrap">
                        <strong>{item.instId}</strong>
                        <div className="m-badges-row">
                          {isSpecialCategory && (
                            <span className="mini-type-tag">
                              {item.instType}
                            </span>
                          )}
                          {isPre && (
                            <span className="mini-pre-tag">PRE-MARKET</span>
                          )}
                          {commodityDesc && (
                            <span className="mini-comm-tag">
                              {commodityDesc}
                            </span>
                          )}
                          {item.lever && (
                            <span className="lever-tag">{item.lever}x</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="m-col-price">
                      <span>
                        {tk
                          ? Number(tk.last).toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })
                          : '—'}
                      </span>
                    </div>

                    <div
                      className={`m-col-change ${pos ? 'pos-text' : 'neg-text'}`}
                    >
                      {tk ? `${pos ? '+' : ''}${pct}%` : '—'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Column 2: Live Order Book */}
        <section className="card orderbook-card">
          <div className="card-header">
            <h2>Order Book</h2>
            <span className="card-hint">Kliknij cenę aby użyć</span>
          </div>

          <div className="ob-columns">
            <span>Cena ({quoteCcy})</span>
            <span>Ilość ({isContract ? 'Kontr.' : baseCcy})</span>
          </div>

          <div className="ob-list asks-list">
            {[...(orderBook.asks || [])]
              .slice(0, 8)
              .reverse()
              .map(([askPx, askSz], idx) => (
                <div
                  key={`ask-${idx}`}
                  className="ob-row ask-row"
                  onClick={() => {
                    setOrdType('limit');
                    setPrice(askPx);
                  }}
                >
                  <span className="ob-px ask-px">{askPx}</span>
                  <span className="ob-sz">{Number(askSz).toLocaleString()}</span>
                </div>
              ))}
          </div>

          <div
            className={`ob-mid-price ${isPositive24h ? 'pos' : 'neg'}`}
            onClick={() => {
              if (ticker?.last) setPrice(ticker.last);
            }}
          >
            <span>{ticker?.last || '—'}</span>
            <small>Ostatnia cena</small>
          </div>

          <div className="ob-list bids-list">
            {(orderBook.bids || []).slice(0, 8).map(([bidPx, bidSz], idx) => (
              <div
                key={`bid-${idx}`}
                className="ob-row bid-row"
                onClick={() => {
                  setOrdType('limit');
                  setPrice(bidPx);
                }}
              >
                <span className="ob-px bid-px">{bidPx}</span>
                <span className="ob-sz">{Number(bidSz).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {instrumentInfo && (
            <div className="inst-rules">
              <div>
                <span>Min. zlecenie:</span>
                <strong>
                  {instrumentInfo.minSz} {isContract ? 'kontr.' : baseCcy}
                </strong>
              </div>
              <div>
                <span>Krok ceny:</span>
                <strong>{instrumentInfo.tickSz}</strong>
              </div>
            </div>
          )}
        </section>

        {/* Column 3: Universal Order Form (Spot / Swap / Futures / Margin) */}
        <section className="card trade-card">
          {/* Margin Mode & Leverage Bar for SWAP / FUTURES / MARGIN */}
          {instType !== 'SPOT' && (
            <div className="derivatives-config-bar">
              <div className="mgn-mode-group">
                <button
                  type="button"
                  className={tdMode === 'cross' ? 'active' : ''}
                  onClick={() => setTdMode('cross')}
                >
                  Cross
                </button>
                <button
                  type="button"
                  className={tdMode === 'isolated' ? 'active' : ''}
                  onClick={() => setTdMode('isolated')}
                >
                  Isolated
                </button>
              </div>

              <div className="leverage-control">
                <Sliders size={13} />
                <input
                  type="number"
                  min="1"
                  max={instrumentInfo?.lever || 125}
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="leverage-input"
                />
                <span>x</span>
                <button
                  type="button"
                  className="apply-lev-btn"
                  onClick={handleApplyLeverage}
                  disabled={isSettingLeverage}
                >
                  {isSettingLeverage ? '...' : 'Ustaw'}
                </button>
              </div>
            </div>
          )}

          {/* Position Mode Switcher for SWAP / FUTURES */}
          {isContract && (
            <div className="pos-mode-row">
              <span>Tryb pozycji konta:</span>
              <div className="pos-mode-pills">
                <button
                  type="button"
                  className={posSideMode === 'net' ? 'active' : ''}
                  onClick={() => setPosSideMode('net')}
                >
                  One-Way (Net)
                </button>
                <button
                  type="button"
                  className={posSideMode === 'long_short' ? 'active' : ''}
                  onClick={() => setPosSideMode('long_short')}
                >
                  Hedge (Long/Short)
                </button>
              </div>
            </div>
          )}

          {/* Buy/Long vs Sell/Short Toggle */}
          <div className="side-tabs">
            <button
              type="button"
              className={`side-tab buy-tab ${side === 'buy' ? 'active' : ''}`}
              onClick={() => {
                setSide('buy');
                setOrderFeedback(null);
              }}
            >
              {isContract ? `Buy / Long ${baseCcy}` : `Kup (Buy) ${baseCcy}`}
            </button>
            <button
              type="button"
              className={`side-tab sell-tab ${side === 'sell' ? 'active' : ''}`}
              onClick={() => {
                setSide('sell');
                setOrderFeedback(null);
              }}
            >
              {isContract
                ? `Sell / Short ${baseCcy}`
                : `Sprzedaj (Sell) ${baseCcy}`}
            </button>
          </div>

          <div className="ordtype-tabs">
            <button
              type="button"
              className={`ordtype-btn ${ordType === 'limit' ? 'active' : ''}`}
              onClick={() => setOrdType('limit')}
            >
              Limit
            </button>
            <button
              type="button"
              className={`ordtype-btn ${ordType === 'market' ? 'active' : ''}`}
              onClick={() => setOrdType('market')}
            >
              Market
            </button>
          </div>

          {/* Available Balance */}
          <div className="avail-row">
            <span>Dostępne saldo</span>
            <strong>
              {instType === 'SPOT' && side === 'sell'
                ? `${availBase.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })} ${baseCcy}`
                : `${availQuote.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })} ${quoteCcy}`}
            </strong>
          </div>

          <form onSubmit={handlePlaceOrder} className="trade-form">
            {ordType === 'limit' ? (
              <div className="form-group">
                <div className="label-row">
                  <label>Cena Limit ({quoteCcy})</label>
                  {ticker?.last && (
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={() => setPrice(ticker.last)}
                    >
                      Ostatnia ({ticker.last})
                    </button>
                  )}
                </div>
                <div className="input-with-unit">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                  <span className="unit-tag">{quoteCcy}</span>
                </div>
              </div>
            ) : (
              <div className="market-notice">
                Realizacja natychmiastowa po najlepszej cenie rynkowej (Market).
              </div>
            )}

            {/* Spot Market Buy Unit Switch */}
            {instType === 'SPOT' && ordType === 'market' && side === 'buy' && (
              <div className="form-group">
                <label>Jednostka kwoty zlecenia</label>
                <div className="unit-switch">
                  <button
                    type="button"
                    className={marketTgtCcy === 'quote_ccy' ? 'active' : ''}
                    onClick={() => {
                      setMarketTgtCcy('quote_ccy');
                      setSize('');
                    }}
                  >
                    Wydaj {quoteCcy} (Kwota)
                  </button>
                  <button
                    type="button"
                    className={marketTgtCcy === 'base_ccy' ? 'active' : ''}
                    onClick={() => {
                      setMarketTgtCcy('base_ccy');
                      setSize('');
                    }}
                  >
                    Kup {baseCcy} (Ilość)
                  </button>
                </div>
              </div>
            )}

            {/* Order Quantity / Contracts Input */}
            <div className="form-group">
              <div className="label-row">
                <label>
                  {isContract
                    ? 'Liczba kontraktów (sz)'
                    : instType === 'SPOT' &&
                      ordType === 'market' &&
                      side === 'buy' &&
                      marketTgtCcy === 'quote_ccy'
                    ? `Kwota do wydania (${quoteCcy})`
                    : `Ilość (${baseCcy})`}
                </label>
                {instrumentInfo?.minSz && (
                  <span className="min-sz-hint">
                    Min: {instrumentInfo.minSz}{' '}
                    {isContract ? 'kontr.' : baseCcy}
                  </span>
                )}
              </div>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  required
                />
                <span className="unit-tag">
                  {isContract
                    ? 'KONTR.'
                    : instType === 'SPOT' &&
                      ordType === 'market' &&
                      side === 'buy' &&
                      marketTgtCcy === 'quote_ccy'
                    ? quoteCcy
                    : baseCcy}
                </span>
              </div>
              {isContract && size && parseFloat(size) > 0 && (
                <div className="contract-equiv-hint">
                  ≈ {(parseFloat(size) * ctValNum).toFixed(4)} {ctValCcy}
                </div>
              )}
            </div>

            <div className="pct-buttons">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="pct-btn"
                  onClick={() => handlePercentageClick(pct)}
                >
                  {pct * 100}%
                </button>
              ))}
            </div>

            {/* Extra Options: Reduce-Only & TP/SL */}
            <div className="extra-order-options">
              {instType !== 'SPOT' && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={reduceOnly}
                    onChange={(e) => setReduceOnly(e.target.checked)}
                  />
                  <span>Reduce-Only (Tylko redukcja pozycji)</span>
                </label>
              )}

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showTpSl}
                  onChange={(e) => setShowTpSl(e.target.checked)}
                />
                <span>Dodaj Take Profit / Stop Loss (TP/SL)</span>
              </label>
            </div>

            {showTpSl && (
              <div className="tpsl-grid">
                <div className="form-group">
                  <label>Take Profit Trigger ({quoteCcy})</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Cena TP"
                    value={tpTriggerPx}
                    onChange={(e) => setTpTriggerPx(e.target.value)}
                    className="tpsl-input"
                  />
                </div>
                <div className="form-group">
                  <label>Stop Loss Trigger ({quoteCcy})</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Cena SL"
                    value={slTriggerPx}
                    onChange={(e) => setSlTriggerPx(e.target.value)}
                    className="tpsl-input"
                  />
                </div>
              </div>
            )}

            <div className="order-summary-row">
              <span>Szacowana wartość</span>
              <strong>
                ≈ {estimatedTotalQuote} {quoteCcy}
              </strong>
            </div>

            {orderFeedback && (
              <div className={`feedback-banner ${orderFeedback.type}`}>
                {orderFeedback.type === 'success' ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <span>{orderFeedback.message}</span>
              </div>
            )}

            {hasCredentials && privateError && (
              <div
                className="feedback-banner error"
                style={{ flexDirection: 'column', gap: '6px' }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <AlertCircle size={15} />
                  <span>Błąd klucza API: {privateError}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary-sm-btn"
                    onClick={() =>
                      setCredentials((prev) => ({
                        ...prev,
                        isDemo: !prev.isDemo,
                      }))
                    }
                  >
                    Przełącz na {credentials.isDemo ? 'Live' : 'Demo'}
                  </button>
                  <button
                    type="button"
                    className="secondary-sm-btn"
                    onClick={() => setShowKeyModal(true)}
                  >
                    Sprawdź klucze API
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingOrder}
              className={`submit-order-btn ${
                side === 'buy' ? 'buy-btn' : 'sell-btn'
              }`}
            >
              {isSubmittingOrder
                ? 'Wysyłanie zlecenia do OKX...'
                : `${
                    isContract
                      ? side === 'buy'
                        ? 'Buy / Long'
                        : 'Sell / Short'
                      : side === 'buy'
                      ? 'Kup'
                      : 'Sprzedaj'
                  } ${instId} (${credentials.isDemo ? 'Demo' : 'Live'})`}
            </button>
          </form>
        </section>

        {/* Column 4: Account Balances */}
        <section className="card balance-card">
          <div className="card-header">
            <div className="header-with-icon">
              <Wallet size={17} />
              <h2>Portfel Handlowy</h2>
            </div>
            <button
              type="button"
              className="icon-refresh-btn"
              onClick={loadPrivateData}
              disabled={!hasCredentials || isLoadingPrivate}
              title="Odśwież salda"
            >
              <RefreshCw
                size={15}
                className={isLoadingPrivate ? 'spin' : ''}
              />
            </button>
          </div>

          {!hasCredentials ? (
            <div className="empty-auth-state">
              <KeyRound size={28} />
              <p>
                Połącz klucze OKX API, aby widzieć salda, pozycje i składać
                zlecenia.
              </p>
              <button
                type="button"
                className="primary-outline-btn"
                onClick={() => setShowKeyModal(true)}
              >
                Skonfiguruj klucze API
              </button>
            </div>
          ) : (
            <>
              {privateError && (
                <div
                  className="feedback-banner error"
                  style={{ marginBottom: '12px', flexDirection: 'column' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertCircle size={16} />
                    <strong>{privateError}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      flexWrap: 'wrap',
                      marginTop: '6px',
                    }}
                  >
                    <button
                      type="button"
                      className="secondary-sm-btn"
                      onClick={() =>
                        setCredentials((prev) => ({
                          ...prev,
                          isDemo: !prev.isDemo,
                        }))
                      }
                    >
                      Przełącz na {credentials.isDemo ? 'Live' : 'Demo'}
                    </button>
                    <button
                      type="button"
                      className="secondary-sm-btn"
                      onClick={() =>
                        setCredentials((prev) => ({
                          ...prev,
                          region: prev.region === 'eea' ? 'global' : 'eea',
                        }))
                      }
                    >
                      Zmień serwer (
                      {credentials.region === 'eea' ? 'Global' : 'EEA'})
                    </button>
                  </div>
                </div>
              )}

              <div className="equity-box">
                <span className="equity-label">
                  Całkowita wartość konta (Equity)
                </span>
                <strong className="equity-value">
                  $
                  {Number(accountBalance.totalEq || 0).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </strong>
              </div>

              <div className="asset-list-header">
                <span>Waluta</span>
                <span>Dostępne</span>
                <span>Wartość USD</span>
              </div>

              <div className="asset-list">
                {accountBalance.details && accountBalance.details.length > 0 ? (
                  accountBalance.details.map((item) => (
                    <div
                      key={item.ccy}
                      className="asset-row"
                      onClick={() => {
                        setSearchQuery(item.ccy);
                        setMobileView('markets');
                      }}
                      title={`Kliknij aby wyszukać instrumenty dla ${item.ccy}`}
                    >
                      <div className="asset-ccy">
                        <strong>{item.ccy}</strong>
                        {parseFloat(item.frozenBal || '0') > 0 && (
                          <small>
                            Zablok.: {Number(item.frozenBal).toFixed(4)}
                          </small>
                        )}
                      </div>
                      <span className="asset-avail">
                        {Number(item.availBal || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}
                      </span>
                      <span className="asset-usd">
                        $
                        {Number(item.eqUsd || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-list-msg">
                    Brak środków na koncie handlowym (Trading Account).
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Automated Trading (Rule Bot) + Autonomous AI Agent + Action History */}
      <AutoTradingPanels
        instId={instId}
        instType={instType}
        ticker={ticker}
        orderBook={orderBook}
        credentials={credentials}
        hasCredentials={hasCredentials}
        accountBalance={accountBalance}
        onSelectInstrument={selectInstrument}
        onRefreshPrivateData={loadPrivateData}
        autoBotEnabled={autoBotEnabled}
        setAutoBotEnabled={setAutoBotEnabled}
        onUserToggleAutoBot={handleUserToggleAutoBot}
        aiAgentEnabled={aiAgentEnabled}
        setAiAgentEnabled={setAiAgentEnabled}
        onUserToggleAiAgent={handleUserToggleAiAgent}
        userToggleSignal={userToggleSignal}
        onSyncAutomationBook={setAutomationBook}
      />

      {/* Bottom Panel: Positions, Open Orders & Order History */}
      <section className="card orders-panel">
        <div className="orders-header">
          <div className="orders-tabs">
            <button
              type="button"
              className={`orders-tab ${
                activeBottomTab === 'positions' ? 'active' : ''
              }`}
              onClick={() => setActiveBottomTab('positions')}
            >
              <Activity size={15} />
              Otwarte Pozycje ({activePositions.length})
            </button>
            <button
              type="button"
              className={`orders-tab ${
                activeBottomTab === 'open' ? 'active' : ''
              }`}
              onClick={() => setActiveBottomTab('open')}
            >
              <Clock size={15} />
              Otwarte Zlecenia ({combinedPendingOrders.length})
            </button>
            <button
              type="button"
              className={`orders-tab ${
                activeBottomTab === 'history' ? 'active' : ''
              }`}
              onClick={() => setActiveBottomTab('history')}
            >
              <History size={15} />
              Historia Zleceń ({combinedOrderHistory.length})
            </button>
          </div>

          {hasCredentials && (
            <button
              type="button"
              className="secondary-sm-btn"
              onClick={loadPrivateData}
              disabled={isLoadingPrivate}
            >
              <RefreshCw size={13} className={isLoadingPrivate ? 'spin' : ''} />
              Odśwież
            </button>
          )}
        </div>

        {activeBottomTab === 'positions' ? (
          activePositions.length === 0 ? (
            <div className="orders-empty">
              Brak otwartych pozycji. Włącz Autonomicznego Agenta AI lub Auto-Bota powyżej, albo otwórz pozycję ręcznie.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Źródło / Tryb</th>
                    <th>Wielkość</th>
                    <th>Cena wejścia</th>
                    <th>Cena bieżąca</th>
                    <th>Cel TP / SL / Likwidacja</th>
                    <th>Niezrealizowane PnL</th>
                    <th>Akcja</th>
                  </tr>
                </thead>
                <tbody>
                  {activePositions.map((pos) => {
                    const upl = parseFloat(pos.upl || '0');
                    const uplRatio = (
                      parseFloat(pos.uplRatio || '0') * 100
                    ).toFixed(2);
                    const isLong =
                      pos.posSide === 'long' ||
                      (pos.posSide === 'net' && parseFloat(pos.pos) > 0);

                    return (
                      <tr key={`${pos.instId}-${pos.posSide}-${pos.mgnMode}`}>
                        <td>
                          <strong
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              selectInstrument(pos.instId, pos.instType, true)
                            }
                          >
                            {pos.instId}
                          </strong>
                        </td>
                        <td>
                          <span className="uppercase">{pos.mgnMode}</span>
                          {!pos.isAutomationPosition && (
                            <>
                              {' '}
                              • <strong>{pos.lever}x</strong>
                            </>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isLong ? 'badge-buy' : 'badge-sell'
                            }`}
                          >
                            {isLong ? 'LONG' : 'SHORT'} {pos.pos}
                          </span>
                        </td>
                        <td>{pos.avgPx}</td>
                        <td>{pos.markPx}</td>
                        <td className={pos.isAutomationPosition ? '' : 'neg'}>
                          {pos.liqPx || '—'}
                        </td>
                        <td className={upl >= 0 ? 'pos' : 'neg'}>
                          <strong>
                            {upl >= 0 ? '+' : ''}
                            {upl.toFixed(4)} ({upl >= 0 ? '+' : ''}
                            {uplRatio}%)
                          </strong>
                        </td>
                        <td>
                          {pos.isAutomationPosition ? (
                            <button
                              type="button"
                              className="secondary-sm-btn"
                              onClick={() =>
                                selectInstrument(pos.instId, pos.instType, true)
                              }
                            >
                              Pokaż wykres
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="cancel-ord-btn"
                              onClick={() => handleClosePosition(pos)}
                            >
                              Zamknij Market
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : activeBottomTab === 'open' ? (
          combinedPendingOrders.length === 0 ? (
            <div className="orders-empty">
              Brak aktywnych oczekujących zleceń.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Czas</th>
                    <th>Instrument</th>
                    <th>Typ rynku</th>
                    <th>Rodzaj</th>
                    <th>Strona</th>
                    <th>Cena docelowa</th>
                    <th>Ilość</th>
                    <th>Status / Wypełniono</th>
                    <th>Akcja</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedPendingOrders.map((ord) => (
                    <tr key={ord.ordId}>
                      <td>
                        {new Date(Number(ord.cTime)).toLocaleTimeString()}
                      </td>
                      <td>
                        <strong
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            selectInstrument(ord.instId, 'SPOT', true)
                          }
                        >
                          {ord.instId}
                        </strong>
                      </td>
                      <td>{ord.instType}</td>
                      <td className="uppercase">{ord.ordType}</td>
                      <td>
                        <span
                          className={`badge ${
                            ord.side === 'buy' ? 'badge-buy' : 'badge-sell'
                          }`}
                        >
                          {ord.side.toUpperCase()}
                        </span>
                      </td>
                      <td>{ord.px || 'Market'}</td>
                      <td>{ord.sz}</td>
                      <td>{ord.accFillSz || '0'}</td>
                      <td>
                        {ord.isAutomationTarget ? (
                          <span className="state-pill state-live">
                            Aktywny TP/SL
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="cancel-ord-btn"
                            onClick={() =>
                              handleCancelOrder(ord.instId, ord.ordId)
                            }
                          >
                            <XCircle size={14} />
                            Anuluj
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : combinedOrderHistory.length === 0 ? (
          <div className="orders-empty">
            Brak historii zleceń. Włącz Autonomicznego Agenta AI lub złóż zlecenie, aby zobaczyć historię.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Czas</th>
                  <th>Instrument</th>
                  <th>Źródło / Rodzaj</th>
                  <th>Strona</th>
                  <th>Śr. cena wykonania</th>
                  <th>Wykonano / Ilość</th>
                  <th>PnL ($)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {combinedOrderHistory.map((ord) => (
                  <tr key={ord.ordId}>
                    <td>
                      {ord.timeLabel ||
                        new Date(
                          Number(ord.uTime || ord.cTime)
                        ).toLocaleString()}
                    </td>
                    <td>
                      <strong>{ord.instId}</strong>
                    </td>
                    <td className="uppercase">{ord.ordType}</td>
                    <td>
                      <span
                        className={`badge ${
                          ord.side === 'buy'
                            ? 'badge-buy'
                            : ord.side === 'swap'
                            ? 'badge-swap'
                            : 'badge-sell'
                        }`}
                      >
                        {(ord.sideLabel || ord.side || 'BUY').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {ord.avgPx && ord.avgPx !== '0'
                        ? ord.avgPx
                        : ord.px || 'Market'}
                    </td>
                    <td>
                      {ord.isAutomationHistory
                        ? ord.sz
                        : `${ord.accFillSz} / ${ord.sz}`}
                    </td>
                    <td
                      className={
                        parseFloat(ord.pnl || '0') > 0
                          ? 'pos'
                          : parseFloat(ord.pnl || '0') < 0
                          ? 'neg'
                          : ''
                      }
                    >
                      {ord.pnl && ord.pnl !== '0'
                        ? `${parseFloat(ord.pnl) > 0 ? '+' : ''}${Number(
                            ord.pnl
                          ).toFixed(4)}`
                        : '—'}
                    </td>
                    <td>
                      <span className="state-pill state-filled">
                        {ord.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* API Credentials Configuration Modal */}
      {showKeyModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowKeyModal(false)}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Konfiguracja Kluczy OKX V5 API</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowKeyModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="modal-desc">
              Podaj klucze OKX V5 API z uprawnieniami <strong>Read</strong> oraz{' '}
              <strong>Trade</strong>.
            </p>

            <div className="modal-form">
              <div className="form-group">
                <label>Region konta OKX</label>
                <select
                  className="modal-select"
                  value={credentials.region || 'global'}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      region: e.target.value,
                    }))
                  }
                >
                  {OKX_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Środowisko handlowe</label>
                <div className="unit-switch">
                  <button
                    type="button"
                    className={credentials.isDemo ? 'active' : ''}
                    onClick={() =>
                      setCredentials((prev) => ({ ...prev, isDemo: true }))
                    }
                  >
                    Demo Trading (Paper)
                  </button>
                  <button
                    type="button"
                    className={!credentials.isDemo ? 'active' : ''}
                    onClick={() =>
                      setCredentials((prev) => ({ ...prev, isDemo: false }))
                    }
                  >
                    Live Trading (Real)
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>API Key (OK-ACCESS-KEY)</label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="np. 8f4c2b10-..."
                  value={credentials.apiKey}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      apiKey: e.target.value.replace(/\s+/g, ''),
                    }))
                  }
                />
              </div>

              <div className="form-group">
                <div className="label-row">
                  <label>Secret Key</label>
                  <button
                    type="button"
                    className="text-link-btn"
                    onClick={() => setShowSecrets((s) => !s)}
                  >
                    {showSecrets ? (
                      <>
                        <EyeOff size={13} /> Ukryj
                      </>
                    ) : (
                      <>
                        <Eye size={13} /> Pokaż
                      </>
                    )}
                  </button>
                </div>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Wklej Secret Key"
                  value={credentials.secretKey}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      secretKey: e.target.value.replace(/\s+/g, ''),
                    }))
                  }
                />
              </div>

              <div className="form-group">
                <label>Passphrase (Hasło klucza API)</label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Hasło nadane przy tworzeniu klucza API"
                  value={credentials.passphrase}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      passphrase: e.target.value,
                    }))
                  }
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={credentials.rememberMe}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      rememberMe: e.target.checked,
                    }))
                  }
                />
                <span>Zapamiętaj klucze w pamięci przeglądarki</span>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => {
                    setCredentials({
                      apiKey: '',
                      secretKey: '',
                      passphrase: '',
                      region: 'global',
                      isDemo: credentials.isDemo,
                      rememberMe: false,
                    });
                    localStorage.removeItem(STORAGE_KEY);
                  }}
                >
                  Wyczyść klucze
                </button>
                <button
                  type="button"
                  className="save-btn"
                  onClick={() => {
                    setShowKeyModal(false);
                    if (hasCredentials) {
                      loadPrivateData();
                    }
                  }}
                >
                  Zapisz i połącz
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Nawigacja mobilna">
        <button
          type="button"
          className={`mobile-nav-btn ${mobileView === 'trade' ? 'active' : ''}`}
          onClick={() => setMobileView('trade')}
        >
          <TrendingUp size={18} />
          <span>Handel</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${
            mobileView === 'markets' ? 'active' : ''
          }`}
          onClick={() => setMobileView('markets')}
        >
          <Search size={18} />
          <span>Rynki</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${
            mobileView === 'auto' ? 'active' : ''
          }`}
          onClick={() => setMobileView('auto')}
        >
          <Bot size={18} />
          <span>
            Auto / AI
            {autoBotEnabled || aiAgentEnabled ? ' ●' : ''}
          </span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${
            mobileView === 'orders' ? 'active' : ''
          }`}
          onClick={() => setMobileView('orders')}
        >
          <Activity size={18} />
          <span>
            Zlecenia
            {activePositions.length + combinedPendingOrders.length > 0
              ? ` (${activePositions.length + combinedPendingOrders.length})`
              : ''}
          </span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${
            mobileView === 'wallet' ? 'active' : ''
          }`}
          onClick={() => setMobileView('wallet')}
        >
          <Wallet size={18} />
          <span>Portfel</span>
        </button>
      </nav>
    </div>
  );
}
