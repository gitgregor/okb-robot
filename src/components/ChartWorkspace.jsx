import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  Grid,
  BarChart2,
  TrendingUp,
  Search,
  Plus,
  X,
  RefreshCw,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import {
  fetchCandles,
  fetchTicker,
  MARKET_CATEGORIES,
  fetchCategoryCatalog,
} from '../services/okxApi';

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1H', label: '1H' },
  { id: '4H', label: '4H' },
  { id: '1D', label: '1D' },
];

const DEFAULT_GRID_ASSETS = [
  { instId: 'BTC-USDC', instType: 'SPOT' },
  { instId: 'ETH-USDC', instType: 'SPOT' },
  { instId: 'SOL-USDC', instType: 'SPOT' },
  { instId: 'ONDO-USDC', instType: 'SPOT' },
  { instId: 'NVDA-USDT-SWAP', instType: 'SWAP' },
  { instId: 'XAU-USDT-SWAP', instType: 'SWAP' },
];

function formatPriceCompact(val) {
  const num = Number(val || 0);
  if (!num || Number.isNaN(num)) return '0.00';
  if (num >= 1000) return num.toFixed(2);
  if (num >= 1) return num.toFixed(4);
  if (num >= 0.01) return num.toFixed(5);
  return num.toFixed(6);
}

/**
 * Interactive SVG Candlestick / Area Chart with MA7, MA25, Volume bars, TP/SL lines & Crosshair.
 */
function InteractiveCandleChart({
  instId,
  bar = '15m',
  chartStyle = 'candles', // 'candles' | 'area'
  region = 'global',
  height = 420,
  compact = false,
  positionOverlay = null, // { entryPrice, tpPrice, slPrice }
  onExpandToLarge = null,
}) {
  const [candles, setCandles] = useState([]);
  const [liveTicker, setLiveTicker] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const loadChartData = useCallback(async () => {
    if (!instId) return;
    try {
      const [tk, ohlc] = await Promise.all([
        fetchTicker(instId, region).catch(() => null),
        fetchCandles(
          instId,
          bar,
          compact ? 42 : 72,
          region,
          liveTicker?.last ? parseFloat(liveTicker.last) : 0
        ),
      ]);
      if (tk) setLiveTicker(tk);
      if (Array.isArray(ohlc) && ohlc.length > 0) {
        if (tk?.last) {
          const lastPx = parseFloat(tk.last);
          if (lastPx > 0) {
            const updated = [...ohlc];
            const lastCandle = { ...updated[updated.length - 1] };
            lastCandle.close = lastPx;
            if (lastPx > lastCandle.high) lastCandle.high = lastPx;
            if (lastPx < lastCandle.low) lastCandle.low = lastPx;
            updated[updated.length - 1] = lastCandle;
            setCandles(updated);
          } else {
            setCandles(ohlc);
          }
        } else {
          setCandles(ohlc);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [instId, bar, compact, region]);

  useEffect(() => {
    setIsLoading(true);
    loadChartData();
    const interval = setInterval(loadChartData, compact ? 8000 : 4500);
    return () => clearInterval(interval);
  }, [loadChartData, compact]);

  const stats = useMemo(() => {
    if (!candles.length) return null;
    let minLow = Infinity;
    let maxHigh = -Infinity;
    let maxVol = 0;

    for (const c of candles) {
      if (c.low < minLow) minLow = c.low;
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.vol > maxVol) maxVol = c.vol;
    }

    if (positionOverlay) {
      const ep = Number(positionOverlay.entryPrice || 0);
      const tp = Number(positionOverlay.tpPrice || 0);
      const sl = Number(positionOverlay.slPrice || 0);
      if (ep > 0) {
        minLow = Math.min(minLow, ep);
        maxHigh = Math.max(maxHigh, ep);
      }
      if (tp > 0) maxHigh = Math.max(maxHigh, tp);
      if (sl > 0) minLow = Math.min(minLow, sl);
    }

    const pad = Math.max((maxHigh - minLow) * 0.08, minLow * 0.002, 0.0001);
    const yMin = minLow - pad;
    const yMax = maxHigh + pad;

    // Calculate MA7 and MA25
    const ma7 = candles.map((_, idx) => {
      const start = Math.max(0, idx - 6);
      const slice = candles.slice(start, idx + 1);
      return slice.reduce((s, x) => s + x.close, 0) / slice.length;
    });
    const ma25 = candles.map((_, idx) => {
      const start = Math.max(0, idx - 24);
      const slice = candles.slice(start, idx + 1);
      return slice.reduce((s, x) => s + x.close, 0) / slice.length;
    });

    const firstOpen = candles[0]?.open || 1;
    const lastClose = candles[candles.length - 1]?.close || firstOpen;
    const periodChangePct =
      firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;

    return {
      minLow,
      maxHigh,
      yMin,
      yMax,
      maxVol: maxVol || 1,
      ma7,
      ma25,
      lastClose,
      periodChangePct,
    };
  }, [candles, positionOverlay]);

  const width = 900;
  const viewH = height;
  const priceRightGutter = compact ? 64 : 84;
  const bottomGutter = compact ? 22 : 28;
  const topGutter = compact ? 14 : 22;
  const chartW = width - priceRightGutter;
  const chartH = viewH - topGutter - bottomGutter;

  const priceToY = (px) => {
    if (!stats) return topGutter + chartH / 2;
    const ratio = (px - stats.yMin) / Math.max(stats.yMax - stats.yMin, 1e-9);
    return topGutter + chartH * (1 - ratio);
  };

  const handleMouseMove = (e) => {
    if (!svgRef.current || !candles.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    if (relX < 0 || relX > chartW) {
      setHoverIdx(null);
      return;
    }
    const idx = Math.min(
      candles.length - 1,
      Math.max(0, Math.floor((relX / chartW) * candles.length))
    );
    setHoverIdx(idx);
  };

  const activeCandle =
    hoverIdx !== null && candles[hoverIdx]
      ? candles[hoverIdx]
      : candles[candles.length - 1] || null;

  return (
    <div
      className={`candle-chart-container ${compact ? 'compact-mode' : 'full-mode'}`}
      onClick={() => {
        if (compact && onExpandToLarge) {
          onExpandToLarge();
        }
      }}
    >
      {/* Top OHLCV & MA Legend Bar */}
      <div className="candle-legend-bar">
        {activeCandle ? (
          <>
            <span className="legend-time">
              {new Date(activeCandle.ts).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>
              O: <strong>{formatPriceCompact(activeCandle.open)}</strong>
            </span>
            <span>
              H: <strong className="pos-text">{formatPriceCompact(activeCandle.high)}</strong>
            </span>
            <span>
              L: <strong className="neg-text">{formatPriceCompact(activeCandle.low)}</strong>
            </span>
            <span>
              C:{' '}
              <strong
                className={
                  activeCandle.close >= activeCandle.open ? 'pos-text' : 'neg-text'
                }
              >
                {formatPriceCompact(activeCandle.close)}
              </strong>
            </span>
            {!compact && stats && (
              <>
                <span className="ma-tag ma7-tag">
                  MA(7): {formatPriceCompact(stats.ma7[hoverIdx ?? candles.length - 1])}
                </span>
                <span className="ma-tag ma25-tag">
                  MA(25): {formatPriceCompact(stats.ma25[hoverIdx ?? candles.length - 1])}
                </span>
              </>
            )}
          </>
        ) : (
          <span>Ładowanie danych świecowych ({instId})...</span>
        )}
      </div>

      <div className="candle-svg-wrapper">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${viewH}`}
          preserveAspectRatio="none"
          className="candle-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal Grid Lines & Price Axis */}
          {stats &&
            [0.1, 0.3, 0.5, 0.7, 0.9].map((ratio, i) => {
              const y = topGutter + chartH * ratio;
              const pxVal = stats.yMax - (stats.yMax - stats.yMin) * ratio;
              return (
                <g key={i}>
                  <line
                    x1={0}
                    y1={y}
                    x2={chartW}
                    y2={y}
                    stroke="rgba(148, 163, 184, 0.12)"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={chartW + 6}
                    y={y + 4}
                    fill="#94a3b8"
                    fontSize={compact ? '13' : '11'}
                    fontFamily="monospace"
                  >
                    {formatPriceCompact(pxVal)}
                  </text>
                </g>
              );
            })}

          {/* Volume Bars at bottom 22% of chart */}
          {stats &&
            candles.map((c, idx) => {
              const stepW = chartW / candles.length;
              const xCenter = idx * stepW + stepW / 2;
              const barW = Math.max(2, stepW * 0.66);
              const volH = (c.vol / stats.maxVol) * (chartH * 0.22);
              const isUp = c.close >= c.open;
              return (
                <rect
                  key={`v-${c.ts}-${idx}`}
                  x={xCenter - barW / 2}
                  y={topGutter + chartH - volH}
                  width={barW}
                  height={Math.max(1, volH)}
                  fill={
                    isUp
                      ? 'rgba(16, 185, 129, 0.18)'
                      : 'rgba(244, 63, 94, 0.18)'
                  }
                />
              );
            })}

          {/* Area / Line Mode */}
          {stats && chartStyle === 'area' && candles.length > 1 && (
            <>
              <defs>
                <linearGradient id={`grad-${instId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={
                      stats.periodChangePct >= 0 ? '#10b981' : '#f43f5e'
                    }
                    stopOpacity="0.38"
                  />
                  <stop
                    offset="100%"
                    stopColor={
                      stats.periodChangePct >= 0 ? '#10b981' : '#f43f5e'
                    }
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>
              <polygon
                fill={`url(#grad-${instId})`}
                points={[
                  `${(chartW / candles.length) * 0.5},${topGutter + chartH}`,
                  ...candles.map((c, idx) => {
                    const stepW = chartW / candles.length;
                    const x = idx * stepW + stepW / 2;
                    const y = priceToY(c.close);
                    return `${x},${y}`;
                  }),
                  `${chartW - (chartW / candles.length) * 0.5},${topGutter + chartH}`,
                ].join(' ')}
              />
              <polyline
                fill="none"
                stroke={stats.periodChangePct >= 0 ? '#10b981' : '#f43f5e'}
                strokeWidth="2.4"
                points={candles
                  .map((c, idx) => {
                    const stepW = chartW / candles.length;
                    return `${idx * stepW + stepW / 2},${priceToY(c.close)}`;
                  })
                  .join(' ')}
              />
            </>
          )}

          {/* Candlesticks Mode */}
          {stats &&
            chartStyle === 'candles' &&
            candles.map((c, idx) => {
              const stepW = chartW / candles.length;
              const xCenter = idx * stepW + stepW / 2;
              const bodyW = Math.max(2.5, Math.min(14, stepW * 0.7));
              const isUp = c.close >= c.open;
              const color = isUp ? '#10b981' : '#f43f5e';
              const highY = priceToY(c.high);
              const lowY = priceToY(c.low);
              const openY = priceToY(c.open);
              const closeY = priceToY(c.close);
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(2, Math.abs(closeY - openY));

              return (
                <g key={`c-${c.ts}-${idx}`}>
                  <line
                    x1={xCenter}
                    y1={highY}
                    x2={xCenter}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.3"
                  />
                  <rect
                    x={xCenter - bodyW / 2}
                    y={bodyTop}
                    width={bodyW}
                    height={bodyHeight}
                    fill={color}
                    rx="1"
                  />
                </g>
              );
            })}

          {/* Moving Average Lines (MA7 & MA25) */}
          {stats && candles.length > 2 && (
            <>
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.6"
                points={stats.ma7
                  .map((val, idx) => {
                    const stepW = chartW / candles.length;
                    return `${idx * stepW + stepW / 2},${priceToY(val)}`;
                  })
                  .join(' ')}
              />
              {!compact && (
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                  points={stats.ma25
                    .map((val, idx) => {
                      const stepW = chartW / candles.length;
                      return `${idx * stepW + stepW / 2},${priceToY(val)}`;
                    })
                    .join(' ')}
                />
              )}
            </>
          )}

          {/* Active Position Entry / TP / SL Overlay Lines */}
          {stats && positionOverlay && (
            <>
              {Number(positionOverlay.entryPrice) > 0 && (
                <g>
                  <line
                    x1={0}
                    y1={priceToY(Number(positionOverlay.entryPrice))}
                    x2={chartW}
                    y2={priceToY(Number(positionOverlay.entryPrice))}
                    stroke="#60a5fa"
                    strokeWidth="1.5"
                    strokeDasharray="6 3"
                  />
                  <text
                    x={10}
                    y={priceToY(Number(positionOverlay.entryPrice)) - 5}
                    fill="#60a5fa"
                    fontSize="11"
                    fontWeight="bold"
                  >
                    Wejście AI/Bot: {positionOverlay.entryPrice}
                  </text>
                </g>
              )}
              {Number(positionOverlay.tpPrice) > 0 && (
                <g>
                  <line
                    x1={0}
                    y1={priceToY(Number(positionOverlay.tpPrice))}
                    x2={chartW}
                    y2={priceToY(Number(positionOverlay.tpPrice))}
                    stroke="#10b981"
                    strokeWidth="1.4"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={10}
                    y={priceToY(Number(positionOverlay.tpPrice)) - 5}
                    fill="#10b981"
                    fontSize="11"
                    fontWeight="bold"
                  >
                    Take Profit: {positionOverlay.tpPrice}
                  </text>
                </g>
              )}
            </>
          )}

          {/* Live Last Price Line & Tag */}
          {stats && (
            <g>
              <line
                x1={0}
                y1={priceToY(stats.lastClose)}
                x2={chartW}
                y2={priceToY(stats.lastClose)}
                stroke={stats.periodChangePct >= 0 ? '#10b981' : '#f43f5e'}
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
              <rect
                x={chartW + 2}
                y={priceToY(stats.lastClose) - 10}
                width={priceRightGutter - 4}
                height={20}
                rx="4"
                fill={stats.periodChangePct >= 0 ? '#059669' : '#e11d48'}
              />
              <text
                x={chartW + 6}
                y={priceToY(stats.lastClose) + 4}
                fill="#ffffff"
                fontSize={compact ? '12' : '11'}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {formatPriceCompact(stats.lastClose)}
              </text>
            </g>
          )}

          {/* Crosshair on Hover */}
          {hoverIdx !== null && candles[hoverIdx] && (
            <g>
              <line
                x1={(hoverIdx + 0.5) * (chartW / candles.length)}
                y1={topGutter}
                x2={(hoverIdx + 0.5) * (chartW / candles.length)}
                y2={topGutter + chartH}
                stroke="rgba(226, 232, 240, 0.45)"
                strokeDasharray="3 3"
              />
              <line
                x1={0}
                y1={priceToY(candles[hoverIdx].close)}
                x2={chartW}
                y2={priceToY(candles[hoverIdx].close)}
                stroke="rgba(226, 232, 240, 0.35)"
                strokeDasharray="3 3"
              />
            </g>
          )}
        </svg>

        {isLoading && candles.length === 0 && (
          <div className="chart-loading-overlay">
            <RefreshCw size={18} className="spin" />
            <span>Pobieranie wykresu {instId}...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full-Screen Chart & Minimized Multi-Chart Grid Workspace.
 * Modes:
 * - 'closed': hidden
 * - 'fullscreen': full-screen single chart with asset switcher & minimize-to-grid button
 * - 'grid_fullscreen': full-screen multi-chart grid with 1-click expand to single large chart
 * - 'grid_minimized': compact docked multi-chart grid panel on the page so user can watch multiple charts while trading
 */
export default function ChartWorkspace({
  mode, // 'closed' | 'fullscreen' | 'grid_fullscreen' | 'grid_minimized'
  setMode,
  focusedInstId,
  focusedInstType = 'SPOT',
  onChangeFocusedAsset,
  onSelectForTrading,
  allInstruments = [],
  allTickersMap = {},
  activePositions = [],
  region = 'global',
}) {
  const [timeframe, setTimeframe] = useState('15m');
  const [chartStyle, setChartStyle] = useState('candles'); // 'candles' | 'area'
  const [gridAssets, setGridAssets] = useState(() => {
    try {
      const saved = localStorage.getItem('okx_chart_grid_assets_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_GRID_ASSETS;
  });

  const [assetSearch, setAssetSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState('ALL');
  const [globalCatalog, setGlobalCatalog] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState('focus'); // 'focus' | 'add_grid'

  useEffect(() => {
    try {
      localStorage.setItem('okx_chart_grid_assets_v1', JSON.stringify(gridAssets));
    } catch {
      // ignore
    }
  }, [gridAssets]);

  // Ensure focusedInstId is also present in gridAssets when opened
  useEffect(() => {
    if (!focusedInstId) return;
    setGridAssets((prev) => {
      if (prev.some((x) => x.instId === focusedInstId)) return prev;
      return [
        { instId: focusedInstId, instType: focusedInstType || 'SPOT' },
        ...prev.slice(0, 7),
      ];
    });
  }, [focusedInstId, focusedInstType]);

  // Load multi-market catalog when asset picker is opened so user can open chart of ANY asset
  const loadFullAssetCatalog = useCallback(async () => {
    if (globalCatalog.length > 50 || isLoadingCatalog) return;
    setIsLoadingCatalog(true);
    try {
      const cats = ['SPOT', 'PREMARKET', 'STOCKS', 'COMMODITIES', 'SWAP'];
      const results = await Promise.allSettled(
        cats.map((c) => fetchCategoryCatalog(c, region))
      );
      const merged = [];
      const seen = new Set();
      results.forEach((res, idx) => {
        const catId = cats[idx];
        if (res.status === 'fulfilled' && res.value?.instruments) {
          for (const inst of res.value.instruments) {
            if (!seen.has(inst.instId)) {
              seen.add(inst.instId);
              merged.push({
                instId: inst.instId,
                instType: inst.instType || (catId === 'SPOT' ? 'SPOT' : 'SWAP'),
                category: catId,
                last: res.value.tickersMap?.[inst.instId]?.last || null,
              });
            }
          }
        }
      });
      if (merged.length > 0) {
        setGlobalCatalog(merged);
      }
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [globalCatalog.length, isLoadingCatalog, region]);

  useEffect(() => {
    if (showAssetPicker) {
      loadFullAssetCatalog();
    }
  }, [showAssetPicker, loadFullAssetCatalog]);

  const combinedSearchableAssets = useMemo(() => {
    const sourceList =
      globalCatalog.length > 0
        ? globalCatalog
        : allInstruments.map((i) => ({
            instId: i.instId,
            instType: i.instType || 'SPOT',
            category: i.instType || 'SPOT',
            last: allTickersMap[i.instId]?.last || null,
          }));

    const q = assetSearch.trim().toUpperCase();
    return sourceList
      .filter((item) => {
        if (pickerCategory !== 'ALL' && item.category !== pickerCategory) {
          return false;
        }
        if (!q) return true;
        return item.instId.toUpperCase().includes(q);
      })
      .slice(0, 80);
  }, [globalCatalog, allInstruments, allTickersMap, assetSearch, pickerCategory]);

  if (mode === 'closed') return null;

  const activePosOverlay = activePositions.find(
    (p) => p.instId === focusedInstId
  )
    ? {
        entryPrice: activePositions.find((p) => p.instId === focusedInstId)?.avgPx,
      }
    : null;

  const handlePickAsset = (item) => {
    if (pickerTarget === 'add_grid') {
      setGridAssets((prev) => {
        if (prev.some((x) => x.instId === item.instId)) return prev;
        return [...prev, { instId: item.instId, instType: item.instType || 'SPOT' }];
      });
    } else {
      onChangeFocusedAsset(item.instId, item.instType || 'SPOT');
      if (mode === 'grid_fullscreen' || mode === 'grid_minimized') {
        setMode('fullscreen');
      }
    }
    setShowAssetPicker(false);
    setAssetSearch('');
  };

  const removeGridAsset = (idToRemove, e) => {
    e?.stopPropagation();
    setGridAssets((prev) => prev.filter((item) => item.instId !== idToRemove));
  };

  // ============================================================================
  // RENDER MODE 1: MINIMIZED DOCKED MULTI-CHART GRID ON THE PAGE
  // ============================================================================
  if (mode === 'grid_minimized') {
    return (
      <section className="card chart-minimized-dock">
        <div className="chart-dock-header">
          <div className="chart-dock-title">
            <Grid size={16} className="text-accent" />
            <strong>Zminimalizowana Siatka Wykresów (Multi-Chart Grid)</strong>
            <span className="mini-type-tag">
              Kliknij dowolny wykres, aby przełączyć na Duży Wykres Pełnoekranowy
            </span>
          </div>

          <div className="chart-dock-actions">
            <div className="timeframe-pills">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  className={`tf-pill ${timeframe === tf.id ? 'active' : ''}`}
                  onClick={() => setTimeframe(tf.id)}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="secondary-sm-btn"
              onClick={() => {
                setPickerTarget('add_grid');
                setShowAssetPicker(true);
              }}
            >
              <Plus size={13} />
              Dodaj aktywo do siatki
            </button>

            <button
              type="button"
              className="secondary-sm-btn"
              onClick={() => setMode('grid_fullscreen')}
              title="Powiększ całą siatkę wykresów na pełny ekran"
            >
              <Maximize2 size={13} />
              Siatka na Pełny Ekran
            </button>

            <button
              type="button"
              className="secondary-sm-btn"
              onClick={() => setMode('fullscreen')}
              title="Przełącz na pojedynczy duży wykres pełnoekranowy"
            >
              <BarChart2 size={13} />
              Duży Wykres ({focusedInstId})
            </button>

            <button
              type="button"
              className="cancel-ord-btn"
              onClick={() => setMode('closed')}
            >
              <X size={13} />
              Ukryj
            </button>
          </div>
        </div>

        {/* Asset Picker Drawer inside Minimized Grid */}
        {showAssetPicker && (
          <div className="chart-asset-picker-box">
            <div className="picker-top-row">
              <div className="search-box" style={{ flex: 1 }}>
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Wpisz symbol dowolnego aktywa (np. BTC, ETH, ONDO, NVDA, ANTHROPIC, XAU)..."
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                type="button"
                className="secondary-sm-btn"
                onClick={() => setShowAssetPicker(false)}
              >
                Zamknij wybór
              </button>
            </div>
            <div className="picker-results-pills">
              {combinedSearchableAssets.slice(0, 28).map((item) => (
                <button
                  key={item.instId}
                  type="button"
                  className="picker-asset-pill"
                  onClick={() => handlePickAsset(item)}
                >
                  <strong>{item.instId}</strong>
                  <small>{item.category}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chart-minimized-grid">
          {gridAssets.slice(0, 6).map((item) => (
            <div key={item.instId} className="mini-grid-chart-card">
              <div className="mini-grid-card-header">
                <div
                  className="mini-grid-pair"
                  onClick={() => {
                    onChangeFocusedAsset(item.instId, item.instType);
                    setMode('fullscreen');
                  }}
                >
                  <strong>{item.instId}</strong>
                  <span className="mini-type-tag">{item.instType}</span>
                </div>
                <div className="mini-grid-card-btns">
                  <button
                    type="button"
                    className="expand-chart-btn"
                    onClick={() => {
                      onChangeFocusedAsset(item.instId, item.instType);
                      setMode('fullscreen');
                    }}
                    title="Przełącz na duży wykres pełnoekranowy"
                  >
                    <Maximize2 size={12} />
                    Duży wykres
                  </button>
                  {gridAssets.length > 1 && (
                    <button
                      type="button"
                      className="remove-grid-btn"
                      onClick={(e) => removeGridAsset(item.instId, e)}
                      title="Usuń z siatki"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              <InteractiveCandleChart
                instId={item.instId}
                bar={timeframe}
                chartStyle={chartStyle}
                region={region}
                height={185}
                compact={true}
                onExpandToLarge={() => {
                  onChangeFocusedAsset(item.instId, item.instType);
                  setMode('fullscreen');
                }}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ============================================================================
  // RENDER MODE 2 & 3: FULLSCREEN SINGLE CHART OR FULLSCREEN MULTI-CHART GRID
  // ============================================================================
  return (
    <div className="chart-fullscreen-overlay">
      <div className="chart-fullscreen-shell">
        {/* Top Control Bar */}
        <div className="chart-fs-header">
          <div className="chart-fs-left">
            <div className="chart-fs-brand">
              <BarChart2 size={18} />
              <strong>
                {mode === 'grid_fullscreen'
                  ? `Siatka Wykresów Multi-Asset (${gridAssets.length})`
                  : `Wykres Pełnoekranowy: ${focusedInstId}`}
              </strong>
            </div>

            {/* Button to open chart of ANY asset */}
            <button
              type="button"
              className="chart-open-any-asset-btn"
              onClick={() => {
                setPickerTarget(mode === 'grid_fullscreen' ? 'add_grid' : 'focus');
                setShowAssetPicker((s) => !s);
              }}
            >
              <Search size={14} />
              <span>
                {mode === 'grid_fullscreen'
                  ? '+ Dodaj dowolne aktywo do siatki'
                  : 'Zmień / Otwórz wykres każdego aktywa'}
              </span>
            </button>

            {/* Timeframe Selector */}
            <div className="timeframe-pills">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  className={`tf-pill ${timeframe === tf.id ? 'active' : ''}`}
                  onClick={() => setTimeframe(tf.id)}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Chart Style Toggle */}
            <div className="timeframe-pills">
              <button
                type="button"
                className={`tf-pill ${chartStyle === 'candles' ? 'active' : ''}`}
                onClick={() => setChartStyle('candles')}
              >
                Świece OHLC
              </button>
              <button
                type="button"
                className={`tf-pill ${chartStyle === 'area' ? 'active' : ''}`}
                onClick={() => setChartStyle('area')}
              >
                Linia / Obszar
              </button>
            </div>
          </div>

          <div className="chart-fs-right">
            {/* Switch between Single Large Chart and Grid */}
            {mode === 'fullscreen' ? (
              <button
                type="button"
                className="chart-mode-btn"
                onClick={() => setMode('grid_fullscreen')}
              >
                <Grid size={14} />
                <span>Przełącz na Siatkę Grid ({gridAssets.length})</span>
              </button>
            ) : (
              <button
                type="button"
                className="chart-mode-btn"
                onClick={() => setMode('fullscreen')}
              >
                <Maximize2 size={14} />
                <span>Duży Wykres ({focusedInstId})</span>
              </button>
            )}

            {/* Minimize to Docked Grid on Page */}
            <button
              type="button"
              className="chart-mode-btn minimize-btn"
              onClick={() => setMode('grid_minimized')}
              title="Minimalizuj do siatki wykresów na stronie głównej"
            >
              <Minimize2 size={14} />
              <span>Minimalizuj do Siatki Grid</span>
            </button>

            {/* Trade this asset button */}
            {mode === 'fullscreen' && onSelectForTrading && (
              <button
                type="button"
                className="chart-trade-btn"
                onClick={() => {
                  onSelectForTrading(focusedInstId, focusedInstType, true);
                  setMode('grid_minimized');
                }}
              >
                <ArrowUpRight size={14} />
                <span>Handluj {focusedInstId}</span>
              </button>
            )}

            {/* Close Fullscreen */}
            <button
              type="button"
              className="chart-close-btn"
              onClick={() => setMode('closed')}
            >
              <X size={16} />
              <span>Zamknij</span>
            </button>
          </div>
        </div>

        {/* Quick Bar of Active Positions & Grid Assets */}
        <div className="chart-quick-assets-bar">
          <span className="quick-label">Szybki wybór wykresu:</span>
          {activePositions.map((pos) => (
            <button
              key={`pos-${pos.instId}`}
              type="button"
              className={`quick-asset-chip pos-chip ${
                focusedInstId === pos.instId && mode === 'fullscreen'
                  ? 'active'
                  : ''
              }`}
              onClick={() => {
                onChangeFocusedAsset(pos.instId, pos.instType || 'SPOT');
                setMode('fullscreen');
              }}
            >
              <Activity size={12} />
              <span>{pos.instId} (Pozycja)</span>
            </button>
          ))}
          {gridAssets.map((ga) => (
            <button
              key={`ga-${ga.instId}`}
              type="button"
              className={`quick-asset-chip ${
                focusedInstId === ga.instId && mode === 'fullscreen'
                  ? 'active'
                  : ''
              }`}
              onClick={() => {
                onChangeFocusedAsset(ga.instId, ga.instType || 'SPOT');
                setMode('fullscreen');
              }}
            >
              <span>{ga.instId}</span>
            </button>
          ))}
        </div>

        {/* Universal Asset Search & Selector Drawer */}
        {showAssetPicker && (
          <div className="chart-fs-picker-panel">
            <div className="picker-top-row">
              <div className="search-box" style={{ flex: 1 }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Wyszukaj dowolne aktywo z całej giełdy OKX (np. BTC-USDC, ONDO-USDC, ANTHROPIC, NVDA, XAU, SOL)..."
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="quote-filter-bar">
                <button
                  type="button"
                  className={`quote-pill ${pickerCategory === 'ALL' ? 'active' : ''}`}
                  onClick={() => setPickerCategory('ALL')}
                >
                  Wszystkie Rynki
                </button>
                {MARKET_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`quote-pill ${
                      pickerCategory === cat.id ? 'active' : ''
                    }`}
                    onClick={() => setPickerCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="picker-results-pills">
              {isLoadingCatalog && (
                <span className="min-sz-hint">
                  Pobieranie pełnego katalogu aktywów OKX...
                </span>
              )}
              {combinedSearchableAssets.map((item) => (
                <button
                  key={item.instId}
                  type="button"
                  className={`picker-asset-pill ${
                    item.instId === focusedInstId ? 'active' : ''
                  }`}
                  onClick={() => handlePickAsset(item)}
                >
                  <strong>{item.instId}</strong>
                  <small>{item.category}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Body: Single Fullscreen Chart OR Fullscreen Multi-Chart Grid */}
        <div className="chart-fs-body">
          {mode === 'fullscreen' ? (
            <div className="single-fs-chart-wrapper">
              <InteractiveCandleChart
                instId={focusedInstId}
                bar={timeframe}
                chartStyle={chartStyle}
                region={region}
                height={540}
                compact={false}
                positionOverlay={activePosOverlay}
              />
            </div>
          ) : (
            <div className="fullscreen-grid-container">
              {gridAssets.map((item) => (
                <div key={item.instId} className="fs-grid-chart-card">
                  <div className="mini-grid-card-header">
                    <div
                      className="mini-grid-pair"
                      onClick={() => {
                        onChangeFocusedAsset(item.instId, item.instType);
                        setMode('fullscreen');
                      }}
                    >
                      <strong>{item.instId}</strong>
                      <span className="mini-type-tag">{item.instType}</span>
                    </div>
                    <div className="mini-grid-card-btns">
                      <button
                        type="button"
                        className="expand-chart-btn"
                        onClick={() => {
                          onChangeFocusedAsset(item.instId, item.instType);
                          setMode('fullscreen');
                        }}
                      >
                        <Maximize2 size={13} />
                        Przełącz na duży wykres
                      </button>
                      {gridAssets.length > 1 && (
                        <button
                          type="button"
                          className="remove-grid-btn"
                          onClick={(e) => removeGridAsset(item.instId, e)}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <InteractiveCandleChart
                    instId={item.instId}
                    bar={timeframe}
                    chartStyle={chartStyle}
                    region={region}
                    height={250}
                    compact={true}
                    onExpandToLarge={() => {
                      onChangeFocusedAsset(item.instId, item.instType);
                      setMode('fullscreen');
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
