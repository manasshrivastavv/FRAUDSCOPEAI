import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  AlertTriangle,
  ArrowUpDown,
  Send,
  Camera,
  Share2,
  Globe,
  Video,
  Phone,
  CreditCard,
  PlusCircle,
  Clock,
  CheckCircle2,
  Info,
  Server,
  Database,
  Key,
  ExternalLink,
  MessageSquare,
  Radio,
  Zap,
  Play,
  Pause,
  Square,
  RotateCcw,
  Sliders,
  Sparkles
} from 'lucide-react';
import { api, getApiUrl } from '../services/api';
import { AdvertisementSummary, SourceAdapterTelemetry, EntityChip, ReplayStatus } from '../types';
import { RiskBadge } from '../components/ui/RiskBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EvidenceDrawer } from '../components/investigation/EvidenceDrawer';
import { useLanguage } from '../context/LanguageContext';

export const AdvertisementsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  const [ads, setAds] = useState<AdvertisementSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Sync with global URL params
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [riskFilter, setRiskFilter] = useState(searchParams.get('risk') || '');
  const [platformFilter, setPlatformFilter] = useState(searchParams.get('platform') || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [provenanceFilter, setProvenanceFilter] = useState('All');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<AdvertisementSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Real-Time Streaming & Live Polling State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [newAlertBanner, setNewAlertBanner] = useState<{ message: string; platform: string } | null>(null);
  const latestAdIdRef = useRef<number>(0);

  // Source Adapters state
  const [sources, setSources] = useState<SourceAdapterTelemetry[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [showSourcesBar, setShowSourcesBar] = useState(true);

  // Meta Modal state
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaSyncMessage, setMetaSyncMessage] = useState<string | null>(null);
  const [metaSyncLoading, setMetaSyncLoading] = useState(false);

  // Telegram Modal & Ingestion state
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramPollLoading, setTelegramPollLoading] = useState(false);
  const [telegramPollResult, setTelegramPollResult] = useState<{ message: string; success: boolean } | null>(null);
  const [telegramTestLoading, setTelegramTestLoading] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    success: boolean;
    status: string;
    connected_to_dc: boolean;
    user_authorized: boolean;
    channels_count: number;
    channels: string[];
    message: string;
  } | null>(null);

  // Direct Ingest Modal
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [ingestContent, setIngestContent] = useState('');
  const [ingestPlatform, setIngestPlatform] = useState('Instagram');
  const [ingestAdvertiser, setIngestAdvertiser] = useState('');
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Last ingestion timestamp
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Dataset Replay Service State
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<'both' | 'json' | 'csv'>('both');
  const [replayInterval, setReplayInterval] = useState<number>(3.0);
  const [replayLoop, setReplayLoop] = useState<boolean>(false);
  const [showReplayBar, setShowReplayBar] = useState(true);
  const [replayError, setReplayError] = useState<string | null>(null);

  const fetchReplayStatus = useCallback(async () => {
    try {
      const status = await api.getReplayStatus();
      setReplayStatus(status);
      if (status.source && (status.source === 'both' || status.source === 'json' || status.source === 'csv')) {
        setSelectedSource(status.source as any);
      }
      if (status.interval_seconds) {
        setReplayInterval(status.interval_seconds);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchReplayStatus();
    const timer = setInterval(fetchReplayStatus, 3000);
    return () => clearInterval(timer);
  }, [fetchReplayStatus]);

  const handleStartReplay = async () => {
    setReplayLoading(true);
    setReplayError(null);
    try {
      const status = await api.startReplay({
        source: selectedSource,
        interval_seconds: replayInterval,
        loop: replayLoop,
      });
      setReplayStatus(status);
    } catch (err: any) {
      setReplayError(err.message || 'Failed to start replay');
    } finally {
      setReplayLoading(false);
    }
  };

  const handlePauseReplay = async () => {
    setReplayLoading(true);
    try {
      const status = await api.pauseReplay();
      setReplayStatus(status);
    } catch (err: any) {
      setReplayError(err.message || 'Failed to pause replay');
    } finally {
      setReplayLoading(false);
    }
  };

  const handleResumeReplay = async () => {
    setReplayLoading(true);
    try {
      const status = await api.resumeReplay();
      setReplayStatus(status);
    } catch (err: any) {
      setReplayError(err.message || 'Failed to resume replay');
    } finally {
      setReplayLoading(false);
    }
  };

  const handleStopReplay = async () => {
    setReplayLoading(true);
    try {
      const status = await api.stopReplay();
      setReplayStatus(status);
    } catch (err: any) {
      setReplayError(err.message || 'Failed to stop replay');
    } finally {
      setReplayLoading(false);
    }
  };

  const handleRestartReplay = async () => {
    setReplayLoading(true);
    setReplayError(null);
    try {
      const status = await api.restartReplay({
        source: selectedSource,
        interval_seconds: replayInterval,
        loop: replayLoop,
      });
      setReplayStatus(status);
    } catch (err: any) {
      setReplayError(err.message || 'Failed to restart replay');
    } finally {
      setReplayLoading(false);
    }
  };

  // Synchronize URL parameters if they change
  useEffect(() => {
    const urlRisk = searchParams.get('risk');
    const urlPlatform = searchParams.get('platform');
    const urlSearch = searchParams.get('search');
    if (urlRisk !== null && urlRisk !== riskFilter) setRiskFilter(urlRisk);
    if (urlPlatform !== null && urlPlatform !== platformFilter) setPlatformFilter(urlPlatform);
    if (urlSearch !== null && urlSearch !== search) setSearch(urlSearch);
  }, [searchParams]);

  // Load source adapters telemetry
  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const res = await api.getSourcesStatus();
      setSources(res);
      const syncTimes = res
        .map((s) => s.last_sync)
        .filter(Boolean)
        .sort();
      if (syncTimes.length > 0) {
        setLastSyncTime(new Date(syncTimes[syncTimes.length - 1]!).toLocaleTimeString());
      } else {
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('Could not load source adapter statuses', err);
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // List of keywords to highlight in snippets
  const suspiciousKeywords = [
    'account for rent',
    'bank account rent',
    'current account available',
    'fresh current',
    'ATM card',
    'card + PIN',
    'card aur PIN',
    'linked SIM',
    'linked SIM ke saath',
    'account kiraye pe',
    'rent par',
    'urgent buyers',
    'urgent buyers only',
    'guaranteed returns',
    'UPI access',
    'UPI ID for rent',
    'merchant UPI',
    'debit card and account',
    'fresh current account required',
    'mule account',
  ];

  // Helper to render text with highlighted keywords
  const renderHighlightedSnippet = (text: string) => {
    if (!text) return 'No text snippet';
    let parts: { text: string; highlight: boolean }[] = [{ text, highlight: false }];

    suspiciousKeywords.forEach((kw) => {
      const nextParts: { text: string; highlight: boolean }[] = [];
      parts.forEach((part) => {
        if (part.highlight) {
          nextParts.push(part);
          return;
        }
        const lowerPart = part.text.toLowerCase();
        const lowerKw = kw.toLowerCase();
        let startIdx = 0;
        let foundIdx = lowerPart.indexOf(lowerKw, startIdx);

        if (foundIdx === -1) {
          nextParts.push(part);
        } else {
          while (foundIdx !== -1) {
            if (foundIdx > startIdx) {
              nextParts.push({ text: part.text.slice(startIdx, foundIdx), highlight: false });
            }
            nextParts.push({ text: part.text.slice(foundIdx, foundIdx + kw.length), highlight: true });
            startIdx = foundIdx + kw.length;
            foundIdx = lowerPart.indexOf(lowerKw, startIdx);
          }
          if (startIdx < part.text.length) {
            nextParts.push({ text: part.text.slice(startIdx), highlight: false });
          }
        }
      });
      parts = nextParts;
    });

    return parts.map((chunk, idx) =>
      chunk.highlight ? (
        <span
          key={idx}
          className="bg-[#FDE8E8] text-[#A8341C] border border-[#F8B4B6] px-1 py-0.2 rounded font-semibold"
        >
          {chunk.text}
        </span>
      ) : (
        <span key={idx}>{chunk.text}</span>
      )
    );
  };

  const getPlatformIcon = (platform?: string) => {
    const p = (platform || '').toLowerCase();
    if (p.includes('telegram')) return <Send className="w-3.5 h-3.5 text-[#0F6E7A]" />;
    if (p.includes('instagram')) return <Camera className="w-3.5 h-3.5 text-[#A8341C]" />;
    if (p.includes('facebook')) return <Share2 className="w-3.5 h-3.5 text-[#2F4B45]" />;
    if (p.includes('youtube')) return <Video className="w-3.5 h-3.5 text-[#E5484D]" />;
    if (p.includes('whatsapp')) return <MessageSquare className="w-3.5 h-3.5 text-[#1D6B4F]" />;
    if (p.includes('x') || p.includes('twitter')) return <Globe className="w-3.5 h-3.5 text-[#1A1A1A]" />;
    return <Globe className="w-3.5 h-3.5 text-[var(--muted)]" />;
  };

  const loadAds = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.listAdvertisements({
        page,
        limit,
        risk_level: riskFilter && riskFilter !== 'All' ? riskFilter : undefined,
        platform: platformFilter && platformFilter !== 'All' ? platformFilter : undefined,
        review_status: statusFilter || undefined,
        search: search.trim() || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        is_demo: provenanceFilter === 'live' ? false : (provenanceFilter === 'demo' ? true : undefined),
        data_source: provenanceFilter === 'manual' ? 'MANUAL_SUBMISSION' : (provenanceFilter === 'real_api' ? 'REAL_API' : undefined),
      });

      setAds(res.items);
      setTotal(res.total);
      setPages(res.pages);
      setLastSyncTime(new Date().toLocaleTimeString());

      if (res.items.length > 0) {
        const maxId = Math.max(...res.items.map((i) => i.id));
        if (maxId > latestAdIdRef.current) {
          latestAdIdRef.current = maxId;
        }
      }
    } catch (err: any) {
      console.error('Failed to load advertisements', err);
      if (!silent) {
        setError(err?.message || 'Failed to query live intelligence feed. Please check backend connection.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, limit, riskFilter, platformFilter, statusFilter, provenanceFilter, sortBy, sortOrder, search]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  // Real-Time SSE Stream & Polling Fallback (Requirement 7 & 8)
  useEffect(() => {
    if (!autoRefresh) return;

    let eventSource: EventSource | null = null;
    let sseActive = false;

    try {
      eventSource = new EventSource(getApiUrl('/api/ads/live-events'));

      eventSource.addEventListener('connected', () => {
        setLiveConnected(true);
        sseActive = true;
      });

      eventSource.addEventListener('ping', () => {
        setLiveConnected(true);
      });

      eventSource.addEventListener('NEW_FEED_RECORD', (e: MessageEvent) => {
        try {
          const newRecord = JSON.parse(e.data) as AdvertisementSummary;

          // If on page 1 and no search query active, prepend smoothly
          if (page === 1 && !search.trim()) {
            setAds((prev) => {
              if (prev.some((item) => item.id === newRecord.id)) return prev;
              return [newRecord, ...prev.slice(0, limit - 1)];
            });
            setTotal((prev) => prev + 1);
          }

          if (newRecord.id > latestAdIdRef.current) {
            latestAdIdRef.current = newRecord.id;
          }

          setLastSyncTime(new Date().toLocaleTimeString());
          setNewAlertBanner({
            message: `New ${newRecord.platform} record detected: "${newRecord.original_text.slice(0, 60)}..."`,
            platform: newRecord.platform || 'Telegram'
          });

          setTimeout(() => {
            setNewAlertBanner(null);
          }, 6000);
        } catch (err) {
          console.error('Error handling SSE live event payload', err);
        }
      });

      eventSource.onerror = () => {
        setLiveConnected(false);
        sseActive = false;
        eventSource?.close();
      };
    } catch (err) {
      setLiveConnected(false);
      sseActive = false;
    }

    // Polling fallback: checks live status every 6 seconds to ensure updates are received even without SSE
    const pollTimer = setInterval(async () => {
      try {
        const liveStatus = await api.getLiveStatus();
        setLiveConnected(true);

        if (liveStatus.latest_ad_id && liveStatus.latest_ad_id > latestAdIdRef.current) {
          latestAdIdRef.current = liveStatus.latest_ad_id;
          loadAds(true); // silent refresh
          loadSources();
        }
      } catch (err) {
        if (!sseActive) setLiveConnected(false);
      }
    }, 6000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(pollTimer);
    };
  }, [autoRefresh, page, search, limit, loadAds, loadSources]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadAds();
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setRiskFilter('');
    setPlatformFilter('');
    setStatusFilter('');
    setProvenanceFilter('All');
    setPage(1);
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(
    search || (riskFilter && riskFilter !== 'All') || (platformFilter && platformFilter !== 'All') || statusFilter || provenanceFilter !== 'All'
  );

  // Poll Telegram channels immediately
  const handlePollTelegram = async () => {
    setTelegramPollLoading(true);
    setTelegramPollResult(null);
    try {
      const res = await api.pollTelegram();
      setTelegramPollResult({
        message: `${res.message} (${res.persisted_count} new ads saved to database)`,
        success: true
      });
      loadSources();
      loadAds(true);
      setTimeout(() => setTelegramPollResult(null), 5000);
    } catch (err: any) {
      setTelegramPollResult({
        message: err?.message || 'Telegram polling failed. Ensure TELEGRAM_API_ID & HASH are configured.',
        success: false
      });
    } finally {
      setTelegramPollLoading(false);
    }
  };

  // Test Telegram Connection & DC Reachability
  const handleTestTelegram = async () => {
    setTelegramTestLoading(true);
    setTelegramTestResult(null);
    try {
      const res = await api.testTelegramConnection();
      setTelegramTestResult(res);
      loadSources();
    } catch (err: any) {
      setTelegramTestResult({
        success: false,
        status: 'ERROR',
        connected_to_dc: false,
        user_authorized: false,
        channels_count: 0,
        channels: [],
        message: err?.message || 'Failed to test Telegram connection.'
      });
    } finally {
      setTelegramTestLoading(false);
    }
  };

  // Test Meta Access
  const handleTestMeta = async () => {
    setMetaSyncLoading(true);
    setMetaSyncMessage(null);
    try {
      const res = await api.syncSource('meta_ad_library');
      setMetaSyncMessage(`Success: ${res.message} (${res.persisted} ads persisted).`);
      loadSources();
      loadAds();
    } catch (err: any) {
      setMetaSyncMessage(err?.message || 'Meta Ad Library requires authorization. Set META_ACCESS_TOKEN in backend .env.');
    } finally {
      setMetaSyncLoading(false);
    }
  };

  // Ingest manual / live ad
  const handleIngestPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestContent.trim()) return;
    setIngesting(true);
    setIngestError(null);
    setIngestSuccess(null);

    try {
      const res = await api.ingestPost({
        content: ingestContent.trim(),
        platform: ingestPlatform,
        advertiser_name: ingestAdvertiser.trim() || undefined,
        submitted_url: ingestUrl.trim() || undefined,
        is_demo: false,
      });

      setIngestSuccess(`Record #${res.ad_id} (${res.custom_id}) ingested successfully with ${res.risk_level} risk!`);
      setIngestContent('');
      setIngestAdvertiser('');
      setIngestUrl('');
      loadAds();
      loadSources();
      setTimeout(() => {
        setIngestModalOpen(false);
        setIngestSuccess(null);
      }, 1500);
    } catch (err: any) {
      setIngestError(err?.message || 'Ingestion failed. Please check backend.');
    } finally {
      setIngesting(false);
    }
  };

  const renderProvenanceBadge = (ad: AdvertisementSummary) => {
    if (ad.data_source === 'DATASET_REPLAY') {
      return (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] flex items-center gap-1 shadow-2xs"
          title="Dataset Replay — Continuous simulated stream from JSON/CSV forensic files"
        >
          <Radio className="w-2.5 h-2.5 text-[#EA580C] animate-pulse" />
          DATASET REPLAY
        </span>
      );
    }

    const isSynthetic = ad.is_demo || ad.data_source === 'SYNTHETIC_DATASET';
    const isManual = ad.data_source === 'MANUAL_SUBMISSION';
    const isRealApi = ad.data_source === 'REAL_API';

    if (isSynthetic) {
      return (
        <span
          className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F4F0E6] text-[#7A6B56] border border-[#DDD3C1]"
          title="Synthetic benchmark sample - not live social data"
        >
          DEMO DATA
        </span>
      );
    }

    if (isManual) {
      return (
        <span
          className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#EBF5FB] text-[#1B6CA8] border border-[#BEE3F8]"
          title="Analyst manual submission / verified investigation"
        >
          MANUAL SCAN
        </span>
      );
    }

    if (isRealApi) {
      return (
        <span
          className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB]"
          title="Live automated feed stream"
        >
          REAL API
        </span>
      );
    }

    return (
      <span
        className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F4F0E6] text-[#7A6B56] border border-[#DDD3C1]"
        title="Recorded dataset sample"
      >
        ARCHIVED
      </span>
    );
  };

  const renderEntityChips = (ad: AdvertisementSummary) => {
    if (ad.top_entities && ad.top_entities.length > 0) {
      return (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {ad.top_entities.slice(0, 2).map((entity: EntityChip, i: number) => {
            const type = (entity.entity_type || '').toUpperCase();
            let icon = <Globe className="w-2.5 h-2.5" />;
            if (type.includes('PHONE')) icon = <Phone className="w-2.5 h-2.5" />;
            if (type.includes('UPI')) icon = <CreditCard className="w-2.5 h-2.5" />;
            if (type.includes('TELEGRAM')) icon = <Send className="w-2.5 h-2.5" />;
            if (type.includes('WHATSAPP')) icon = <MessageSquare className="w-2.5 h-2.5" />;

            return (
              <span
                key={i}
                className="bg-[#D8EEF0] text-[#0F6E7A] border border-[#B2DFE3] px-1.5 py-0.5 rounded-[var(--radius)] font-mono text-[10px] inline-flex items-center gap-1 truncate max-w-[140px]"
                title={`${type}: ${entity.entity_value}`}
              >
                {icon}
                <span className="truncate">{entity.entity_value}</span>
              </span>
            );
          })}
          {ad.top_entities.length > 2 && (
            <span className="text-[10px] font-mono text-[var(--muted)] self-center">
              +{ad.top_entities.length - 2}
            </span>
          )}
        </div>
      );
    }

    if (ad.entities_count && ad.entities_count > 0) {
      return (
        <span className="text-[11px] font-mono text-[var(--muted)]">
          {ad.entities_count} indicators
        </span>
      );
    }

    return (
      <span className="text-[11px] font-mono text-[var(--muted)] opacity-70">
        None detected
      </span>
    );
  };

  const telegramSource = sources.find((s) => s.adapter_id === 'telegram_feed');
  const metaSource = sources.find((s) => s.adapter_id === 'meta_ad_library');
  const manualSource = sources.find((s) => s.adapter_id === 'manual_submission');
  const demoSource = sources.find((s) => s.adapter_id === 'synthetic_demo');

  const renderTelegramBadge = (statusStr?: string) => {
    switch (statusStr) {
      case 'MONITORING_LIVE':
      case 'CONNECTED':
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1D6B4F] animate-pulse" />
            LIVE MONITOR
          </span>
        );
      case 'CONFIGURED':
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB]">
            CONFIGURED
          </span>
        );
      case 'AUTH_REQUIRED':
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]">
            AUTH REQUIRED
          </span>
        );
      case 'RATE_LIMITED':
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]">
            RATE LIMITED
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F4F0E6] text-[#7A6B56] border border-[#DDD3C1]">
            PENDING CONFIG
          </span>
        );
    }
  };

  return (
    <div className="space-y-3.5 max-w-7xl mx-auto">
      {/* Real-time Notification Banner */}
      {newAlertBanner && (
        <div className="p-2.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-[#1D6B4F] text-xs flex items-center justify-between shadow-xs animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#1D6B4F] shrink-0 animate-bounce" />
            <span className="font-medium">{newAlertBanner.message}</span>
          </div>
          <button
            onClick={() => setNewAlertBanner(null)}
            className="text-[11px] underline font-mono text-[#1D6B4F] hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Telegram Poll Result Toast */}
      {telegramPollResult && (
        <div
          className={`p-2.5 rounded-[var(--radius)] text-xs flex items-center justify-between border shadow-xs animate-in slide-in-from-top duration-150 ${
            telegramPollResult.success
              ? 'bg-[#E6F7F0] border-[#A3E3CB] text-[#1D6B4F]'
              : 'bg-[#FDE8E8] border-[#F8B4B6] text-[#A8341C]'
          }`}
        >
          <div className="flex items-center gap-2">
            {telegramPollResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{telegramPollResult.message}</span>
          </div>
          <button
            onClick={() => setTelegramPollResult(null)}
            className="text-[11px] underline font-mono hover:opacity-80"
          >
            Close
          </button>
        </div>
      )}

      {/* 1. Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text)] tracking-tight">
              {t('nav.flagged_posts', 'Flagged posts')}
            </h1>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${
                liveConnected
                  ? 'bg-[#E6F7F0] text-[#1D6B4F] border-[#A3E3CB]'
                  : 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  liveConnected ? 'bg-[#1D6B4F] animate-pulse' : 'bg-[#D97706]'
                }`}
              />
              {liveConnected ? 'LIVE STREAMING' : 'CONNECTING FEED'}
            </span>
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Multi-platform intelligence ledger indexing suspicious investment lures, mule account recruitments, and real-time Telegram channel posts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2.5 py-1 text-xs rounded-[var(--radius)] font-mono border flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'bg-[var(--card)] text-[var(--text)] border-[var(--border)]'
                : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
            }`}
            title={autoRefresh ? 'Pause auto-refresh' : 'Resume live auto-refresh'}
          >
            {autoRefresh ? (
              <>
                <Pause className="w-3 h-3 text-[#1D6B4F]" />
                <span>Auto-Feed: ON</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-[var(--muted)]" />
                <span>Auto-Feed: PAUSED</span>
              </>
            )}
          </button>

          {lastSyncTime && (
            <span className="text-[11px] font-mono text-[var(--muted)] flex items-center gap-1 bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
              <Clock className="w-3 h-3 text-[var(--muted)]" />
              <span>Synced: {lastSyncTime}</span>
            </span>
          )}

          <button
            onClick={() => setIngestModalOpen(true)}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            title="Ingest a new advertisement or post into the ledger"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ingest Post</span>
          </button>

          <button
            onClick={() => loadAds()}
            className="p-1.5 rounded-[var(--radius)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--table-hover)] transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Live Dataset Replay Control Station (Continuous JSON/CSV Replay) */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xs p-3.5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${replayStatus?.status === 'RUNNING' ? 'text-[#EA580C] animate-pulse' : 'text-[var(--primary)]'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text)]">Dataset Replay Engine</span>
                <span className="text-[10px] font-mono text-[var(--muted)]">(Forensic JSONL & CSV Replay)</span>
                {/* Replay State Pill */}
                {replayStatus?.status === 'RUNNING' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
                    STREAMING REPLAY ({replayStatus.interval_seconds}s)
                  </span>
                )}
                {replayStatus?.status === 'PAUSED' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] flex items-center gap-1">
                    <Pause className="w-2.5 h-2.5" />
                    PAUSED ({replayStatus.current_index}/{replayStatus.total_records})
                  </span>
                )}
                {replayStatus?.status === 'COMPLETED' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB] flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    COMPLETED ({replayStatus.total_records} RECORDS)
                  </span>
                )}
                {(!replayStatus || replayStatus?.status === 'IDLE' || replayStatus?.status === 'STOPPED') && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]">
                    STANDBY
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowReplayBar(!showReplayBar)}
              className="text-[11px] font-mono text-[var(--muted)] hover:text-[var(--text)] underline"
            >
              {showReplayBar ? 'Collapse Panel' : 'Expand Controls'}
            </button>
          </div>
        </div>

        {showReplayBar && (
          <div className="space-y-3 pt-0.5">
            {replayError && (
              <div className="p-2.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{replayError}</span>
                </div>
                <button onClick={() => setReplayError(null)} className="text-[10px] underline">Dismiss</button>
              </div>
            )}

            {/* Controls & Configuration Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 font-mono">
                {/* Source Selection */}
                <div className="flex items-center gap-1 bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
                  <Database className="w-3 h-3 text-[var(--muted)]" />
                  <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Dataset:</span>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value as any)}
                    disabled={replayStatus?.status === 'RUNNING'}
                    className="bg-transparent text-[11px] font-mono text-[var(--text)] outline-none cursor-pointer"
                    aria-label="Select Dataset Source"
                  >
                    <option value="both">Both Datasets (JSON + CSV) — 628 Events</option>
                    <option value="json">JSON Dataset (finguard_live_feed.jsonl) — 628</option>
                    <option value="csv">CSV Dataset (finguard_live_feed.csv) — 628</option>
                  </select>
                </div>

                {/* Interval Selection */}
                <div className="flex items-center gap-1 bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
                  <Clock className="w-3 h-3 text-[var(--muted)]" />
                  <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Interval:</span>
                  <select
                    value={replayInterval}
                    onChange={(e) => setReplayInterval(Number(e.target.value))}
                    className="bg-transparent text-[11px] font-mono text-[var(--text)] outline-none cursor-pointer"
                    aria-label="Select Replay Interval"
                  >
                    <option value={1}>1.0s (Fast Stream)</option>
                    <option value={2}>2.0s (Accelerated)</option>
                    <option value={3}>3.0s (Default Live)</option>
                    <option value={5}>5.0s (Steady)</option>
                    <option value={10}>10.0s (Slow Analysis)</option>
                  </select>
                </div>

                {/* Repeat / Loop toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)] select-none">
                  <input
                    type="checkbox"
                    checked={replayLoop}
                    onChange={(e) => setReplayLoop(e.target.checked)}
                    className="rounded text-[var(--primary)] focus:ring-0"
                  />
                  <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Loop</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {replayStatus?.status === 'RUNNING' ? (
                  <button
                    type="button"
                    onClick={handlePauseReplay}
                    disabled={replayLoading}
                    className="px-3 py-1.5 rounded-[var(--radius)] text-xs font-mono font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] hover:bg-[#FDE68A] flex items-center gap-1.5 transition-colors shadow-2xs"
                    title="Pause dataset replay"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                ) : replayStatus?.status === 'PAUSED' ? (
                  <button
                    type="button"
                    onClick={handleResumeReplay}
                    disabled={replayLoading}
                    className="px-3 py-1.5 rounded-[var(--radius)] text-xs font-mono font-bold bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB] hover:bg-[#C6F0DF] flex items-center gap-1.5 transition-colors shadow-2xs"
                    title="Resume dataset replay"
                  >
                    <Play className="w-3.5 h-3.5 text-[#1D6B4F]" />
                    <span>Resume</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartReplay}
                    disabled={replayLoading}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-2xs"
                    title="Start dataset replay into live feed"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Replay</span>
                  </button>
                )}

                {(replayStatus?.status === 'RUNNING' || replayStatus?.status === 'PAUSED') && (
                  <button
                    type="button"
                    onClick={handleStopReplay}
                    disabled={replayLoading}
                    className="px-2.5 py-1.5 rounded-[var(--radius)] text-xs font-mono bg-[var(--bg)] border border-[var(--border)] text-[#A8341C] hover:bg-[#FDE8E8] flex items-center gap-1 transition-colors"
                    title="Stop replay engine"
                  >
                    <Square className="w-3 h-3" />
                    <span>Stop</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRestartReplay}
                  disabled={replayLoading}
                  className="px-2.5 py-1.5 rounded-[var(--radius)] text-xs font-mono bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--table-hover)] flex items-center gap-1 transition-colors"
                  title="Restart dataset replay from record 0"
                >
                  <RotateCcw className={`w-3 h-3 ${replayLoading ? 'animate-spin' : ''}`} />
                  <span>Restart</span>
                </button>
              </div>
            </div>

            {/* Replay Telemetry Progress Bar & Indicators */}
            {replayStatus && replayStatus.total_records > 0 && (
              <div className="p-2.5 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] space-y-2">
                <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-[var(--muted)]">
                  <div className="flex items-center gap-3">
                    <span>
                      Published:{' '}
                      <strong className="text-[var(--text)]">
                        {replayStatus.published_count} / {replayStatus.total_records}
                      </strong>
                    </span>
                    <span>
                      Remaining:{' '}
                      <strong className="text-[var(--text)]">{replayStatus.remaining_count}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {replayStatus.last_published_id && (
                      <span>
                        Last ID: <strong className="text-[#C2410C] font-mono">{replayStatus.last_published_id}</strong>
                      </span>
                    )}
                    {replayStatus.last_event_time && (
                      <span>
                        Last Event: <strong className="text-[var(--text)]">{new Date(replayStatus.last_event_time).toLocaleTimeString()}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full bg-[#EA580C] transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((replayStatus.current_index / replayStatus.total_records) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted)] pt-1 border-t border-[var(--border)]">
              <span>
                Provenance: <strong className="text-[var(--text)]">DATASET REPLAY</strong> | Replayed items are evaluated independently by the ML model.
              </span>
              <span>Ground-truth labels are never used as model input.</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Source Connectors & Adapter Telemetry Bar (Task 4, 5, 6, 8) */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xs p-3">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span className="text-xs font-bold text-[var(--text)]">Source Adapters & Ingestion Pipeline</span>
            <span className="text-[10px] font-mono text-[var(--muted)]">(Telethon Telegram, Meta Graph API, Manual Scans)</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSourcesBar(!showSourcesBar)}
            className="text-[11px] font-mono text-[var(--muted)] hover:text-[var(--text)] underline"
          >
            {showSourcesBar ? 'Collapse Adapters' : 'Expand Adapters'}
          </button>
        </div>

        {showSourcesBar && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-xs">
            {/* Adapter 1: Telegram Surveillance Feed (Telethon) */}
            <div className="p-2.5 rounded-[var(--radius)] border border-[#0F6E7A]/30 bg-[#F4F9FA] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                    <Send className="w-3.5 h-3.5 text-[#0F6E7A]" />
                    <span>Telegram Feed</span>
                  </div>
                  {renderTelegramBadge(telegramSource?.status)}
                </div>
                <p className="text-[11px] text-[var(--muted)] leading-tight">
                  Telethon MTProto live monitor indexing public channels & recruitment chats.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[10px] font-mono text-[var(--muted)]">
                  {telegramSource ? `${telegramSource.items_synced || 293} records` : 'Active'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTelegramModalOpen(true)}
                    className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] underline flex items-center gap-0.5"
                  >
                    <Key className="w-2.5 h-2.5" />
                    <span>Setup</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePollTelegram}
                    disabled={telegramPollLoading}
                    className="text-[10px] font-mono font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
                    title="Poll configured channels now"
                  >
                    <RefreshCw className={`w-3 h-3 ${telegramPollLoading ? 'animate-spin' : ''}`} />
                    <span>Poll Live</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Adapter 2: Meta Ad Library */}
            <div className="p-2.5 rounded-[var(--radius)] border border-[#E5C158] bg-[#FDFBF7] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                    <Share2 className="w-3.5 h-3.5 text-[#1877F2]" />
                    <span>Meta Ad Library</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]">
                    PENDING AUTH
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted)] leading-tight">
                  Facebook & Instagram Ads Archive connector (Graph API v21.0).
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[10px] font-mono text-[var(--muted)]">Pending Token</span>
                <button
                  type="button"
                  onClick={() => setMetaModalOpen(true)}
                  className="text-[10px] font-mono font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
                >
                  <Key className="w-3 h-3" />
                  <span>Configure</span>
                </button>
              </div>
            </div>

            {/* Adapter 3: Manual Analyst Scanner */}
            <div className="p-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#0F6E7A]" />
                    <span>Manual Analyst Scans</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#EBF5FB] text-[#1B6CA8] border border-[#BEE3F8]">
                    READY
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted)] leading-tight">
                  Direct scans submitted via Studio Scanner & Quick Scan.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[10px] font-mono text-[var(--muted)]">Live ingestion</span>
                <button
                  type="button"
                  onClick={() => setIngestModalOpen(true)}
                  className="text-[10px] font-mono font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>Submit Ad</span>
                </button>
              </div>
            </div>

            {/* Adapter 4: Synthetic Benchmark Dataset */}
            <div className="p-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                    <Database className="w-3.5 h-3.5 text-[var(--muted)]" />
                    <span>Synthetic Benchmark</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F4F0E6] text-[#7A6B56] border border-[#DDD3C1]">
                    BENCHMARK
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted)] leading-tight">
                  1,000+ calibrated test patterns across 7 social platforms.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[10px] font-mono text-[var(--muted)]">1,054 records</span>
                <span className="text-[10px] font-mono text-[var(--muted)]">Persisted DB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Search & Filter Bar (Task 3) */}
      <div className="p-3 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by ID, keyword, URL, platform, advertiser, phone, UPI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs input-surface"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Platform Filter */}
          <select
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value);
              setPage(1);
            }}
            className="py-1 px-2.5 text-xs input-surface font-mono"
            aria-label="Filter by Platform"
          >
            <option value="">All Platforms</option>
            <option value="Telegram">Telegram</option>
            <option value="Instagram">Instagram</option>
            <option value="Facebook">Facebook</option>
            <option value="WhatsApp Group">WhatsApp</option>
            <option value="X">X (Twitter)</option>
            <option value="Classifieds">Classifieds</option>
            <option value="Web">Web Landing</option>
          </select>

          {/* Risk Level Filter */}
          <select
            value={riskFilter}
            onChange={(e) => {
              setRiskFilter(e.target.value);
              setPage(1);
            }}
            className="py-1 px-2.5 text-xs input-surface font-mono"
            aria-label="Filter by Risk"
          >
            <option value="">All Risk Levels</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="py-1 px-2.5 text-xs input-surface font-mono"
            aria-label="Filter by Review Status"
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="NEEDS_REVIEW">Needs review</option>
            <option value="UNDER_REVIEW">Reviewed</option>
            <option value="ESCALATED">Escalated</option>
            <option value="FALSE_POSITIVE">Dismissed</option>
          </select>

          {/* Provenance / Data Source Filter */}
          <select
            value={provenanceFilter}
            onChange={(e) => {
              setProvenanceFilter(e.target.value);
              setPage(1);
            }}
            className="py-1 px-2.5 text-xs input-surface font-mono"
            aria-label="Filter by Data Source"
          >
            <option value="All">All Data Sources</option>
            <option value="real_api">Real API Feeds</option>
            <option value="manual">Manual Scans</option>
            <option value="live">All Non-Demo</option>
            <option value="demo">Synthetic Dataset</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="py-1 px-2.5 text-xs rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--table-hover)] flex items-center gap-1 transition-colors"
              title="Reset all filters"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="p-3 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadAds()}
            className="px-2.5 py-1 rounded bg-white text-[#A8341C] border border-[#F8B4B6] font-medium hover:bg-gray-50 shrink-0 font-mono"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 4. Flagged Posts Table */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-[var(--border)] bg-[#FFFFFF] text-[11px] font-mono text-[var(--muted)] uppercase sticky top-0 select-none">
              <tr>
                <th className="py-2.5 px-3.5 font-semibold text-[var(--text)]">
                  {t('table.platform', 'Platform & Source')}
                </th>
                <th
                  className="py-2.5 px-3.5 cursor-pointer hover:text-[var(--text)]"
                  onClick={() => toggleSort('id')}
                >
                  <div className="flex items-center gap-1">
                    <span>{t('table.post_id', 'Record ID')}</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5 font-semibold text-[var(--text)] max-w-md">
                  {t('table.snippet', 'Advertisement Snippet')}
                </th>
                <th
                  className="py-2.5 px-3.5 cursor-pointer hover:text-[var(--text)]"
                  onClick={() => toggleSort('risk_score')}
                >
                  <div className="flex items-center gap-1">
                    <span>{t('table.risk_level', 'Risk Score')}</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5 font-semibold text-[var(--text)]">
                  {t('table.indicators', 'Extracted Indicators')}
                </th>
                <th className="py-2.5 px-3.5 font-semibold text-[var(--text)]">
                  {t('table.status', 'Status')}
                </th>
                <th className="py-2.5 px-3.5 font-semibold text-[var(--text)]">
                  {t('table.date', 'Detected')}
                </th>
                <th className="py-2.5 px-3.5 text-right font-semibold text-[var(--text)]">
                  {t('table.evidence_action', 'Action')}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[var(--muted)] font-mono">
                    <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2.5" />
                    Querying intelligence surveillance ledger...
                  </td>
                </tr>
              ) : ads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="max-w-sm mx-auto space-y-2">
                      <AlertTriangle className="w-8 h-8 text-[var(--muted)] mx-auto opacity-50" />
                      <div className="font-bold text-sm text-[var(--text)]">
                        No advertisements match the selected criteria
                      </div>
                      <p className="text-xs text-[var(--muted)]">
                        {hasActiveFilters
                          ? 'Try clearing active filters or modifying search keywords.'
                          : 'No records currently present in this surveillance channel.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          className="btn-secondary text-xs py-1 px-3 mt-2 inline-flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          <span>Clear All Filters</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                ads.map((ad) => {
                  const resolvedPlatform = ad.platform || ad.platform_detected || 'Unknown';
                  return (
                    <tr
                      key={ad.id}
                      onClick={() => {
                        setSelectedAd(ad);
                        setDrawerOpen(true);
                      }}
                      className="table-row-interactive cursor-pointer group hover:bg-[var(--table-hover)] transition-colors"
                    >
                      {/* 1. Platform & Provenance */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]">
                            {getPlatformIcon(resolvedPlatform)}
                          </div>
                          <div>
                            <div className="font-medium text-[var(--text)]">
                              {resolvedPlatform}
                            </div>
                            {ad.advertiser_name && (
                              <div
                                className="text-[10px] text-[var(--muted)] font-mono truncate max-w-[130px]"
                                title={ad.advertiser_name}
                              >
                                {ad.advertiser_name.startsWith('@') ? ad.advertiser_name : `@${ad.advertiser_name}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Post ID & Provenance Badge */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-bold text-[var(--text)]">
                            {ad.custom_id || `AD-${ad.id}`}
                          </span>
                          {renderProvenanceBadge(ad)}
                        </div>
                      </td>

                      {/* 3. Snippet */}
                      <td
                        className="py-2.5 px-3.5 max-w-xs sm:max-w-md text-[var(--text)] leading-snug"
                        title={ad.original_text}
                      >
                        <div className="line-clamp-2">
                          {renderHighlightedSnippet(ad.original_text)}
                        </div>
                        {ad.submitted_url && (
                          <div className="mt-0.5 text-[10px] text-[var(--muted)] truncate max-w-xs font-mono">
                            {ad.submitted_url}
                          </div>
                        )}
                      </td>

                      {/* 4. Risk Level and Score */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <RiskBadge level={ad.risk_level} score={ad.risk_score} size="sm" />
                      </td>

                      {/* 5. Extracted Indicators */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {renderEntityChips(ad)}
                      </td>

                      {/* 6. Review Status */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <StatusBadge status={ad.review_status} size="sm" />
                      </td>

                      {/* 7. Detection Date */}
                      <td className="py-2.5 px-3.5 font-mono text-[var(--muted)] whitespace-nowrap text-[11px]">
                        {new Date(ad.created_at).toLocaleDateString()}
                      </td>

                      {/* 8. Inspect Action */}
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAd(ad);
                            setDrawerOpen(true);
                          }}
                          className="text-[11px] font-mono text-[var(--accent)] hover:underline flex items-center gap-1 ml-auto font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t('table.view_evidence', 'Inspect')}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Pagination Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[#FFFFFF] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[var(--muted)]">
          <div>
            Showing <strong className="text-[var(--text)]">{ads.length}</strong> of{' '}
            <strong className="text-[var(--text)]">{total.toLocaleString()}</strong> records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 px-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--table-hover)] flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="px-2 text-[var(--text)] font-bold">
              Page {page} / {Math.max(1, pages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="p-1 px-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--table-hover)] flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Telegram Live Feed Configuration & Telethon Setup Modal (Task 8, 10) */}
      {telegramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            className="w-full max-w-lg rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[#FFFFFF]">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[#0F6E7A]" />
                <h3 className="text-sm font-bold text-[var(--text)]">Telegram Live Feed (Telethon Integration)</h3>
              </div>
              <button
                onClick={() => setTelegramModalOpen(false)}
                className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div
                className={`p-3 rounded-[var(--radius)] border space-y-1 ${
                  telegramSource?.configured
                    ? 'bg-[#E6F7F0] border-[#A3E3CB] text-[#1D6B4F]'
                    : 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {telegramSource?.configured ? (
                    <CheckCircle2 className="w-4 h-4 text-[#1D6B4F]" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#D97706]" />
                  )}
                  <span>Status: {telegramSource?.status || 'PENDING CONFIGURATION'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {telegramSource?.description ||
                    'Monitors public Telegram channels via Telethon MTProto protocol without storing credentials in the browser.'}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[var(--text)] mb-1">How to Configure Live Telegram Surveillance</h4>
                <ol className="list-decimal list-inside space-y-1 text-[var(--muted)] leading-relaxed">
                  <li>Visit <strong>https://my.telegram.org</strong> and log in with your phone number.</li>
                  <li>Go to <strong>API development tools</strong> and register an app to get your <code className="font-mono bg-[var(--bg)] px-1 rounded">api_id</code> and <code className="font-mono bg-[var(--bg)] px-1 rounded">api_hash</code>.</li>
                  <li>
                    Add your credentials and target public channels in your backend <code className="font-mono bg-[var(--bg)] px-1 py-0.5 rounded">.env</code>:
                  </li>
                </ol>
                <pre className="mt-2 p-2.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono text-[11px] text-[var(--text)] select-all leading-tight">
                  TELEGRAM_API_ID=12345678{"\n"}
                  TELEGRAM_API_HASH=your_telegram_api_hash_here{"\n"}
                  TELEGRAM_CHANNELS=fraud_alerts_channel,mule_recruitment_watch{"\n"}
                  TELEGRAM_SESSION_NAME=fraudscope_telegram{"\n"}
                  TELEGRAM_POLL_INTERVAL=30
                </pre>
              </div>

              <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] text-[11px] space-y-1">
                <div className="font-bold text-[var(--text)]">Rate Limit & Safety Protocol:</div>
                <p>
                  Telethon respects Telegram access restrictions, automatically catches FloodWaitError rate limits, and uses message ID deduplication to prevent duplicate database ingestion.
                </p>
              </div>

              {/* Connection Diagnostic Test Results */}
              {telegramTestResult && (
                <div
                  className={`p-3 rounded-[var(--radius)] border space-y-1.5 ${
                    telegramTestResult.connected_to_dc
                      ? telegramTestResult.user_authorized
                        ? 'bg-[#E6F7F0] border-[#A3E3CB] text-[#1D6B4F]'
                        : 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]'
                      : 'bg-[#FDE8E8] border-[#F8B4B6] text-[#A8341C]'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs">
                    <span className="flex items-center gap-1.5">
                      {telegramTestResult.connected_to_dc ? (
                        <CheckCircle2 className="w-4 h-4 text-[#1D6B4F]" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[#A8341C]" />
                      )}
                      <span>
                        DC Connection:{' '}
                        {telegramTestResult.connected_to_dc ? 'Handshake Verified' : 'Failed'}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/70 border border-current">
                      {telegramTestResult.status}
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed">{telegramTestResult.message}</p>

                  {telegramTestResult.channels.length > 0 && (
                    <div className="pt-1 border-t border-current/20 text-[10px] font-mono">
                      Target Channels ({telegramTestResult.channels.length}):{' '}
                      {telegramTestResult.channels.join(', ')}
                    </div>
                  )}

                  {!telegramTestResult.user_authorized && telegramTestResult.connected_to_dc && (
                    <div className="mt-1 p-2 rounded bg-white/60 border border-[#FCD34D] text-[#92400E] text-[10px] font-mono">
                      👉 To authorize: run <code className="font-bold">python backend/scripts/telegram_login.py</code> in terminal.
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)]">
                  Live Telegram records are marked as REAL API.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTelegramModalOpen(false)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={telegramTestLoading}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 border-[var(--border)] hover:bg-[var(--table-hover)]"
                    title="Test connection to Telegram MTProto Data Centers"
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${telegramTestLoading ? 'animate-spin' : 'text-[#1D6B4F]'}`} />
                    <span>{telegramTestLoading ? 'Testing...' : 'Test Connection'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setTelegramModalOpen(false);
                      await handlePollTelegram();
                    }}
                    disabled={telegramPollLoading}
                    className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${telegramPollLoading ? 'animate-spin' : ''}`} />
                    <span>Poll Channels Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meta Ad Library Configuration Modal */}
      {metaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            className="w-full max-w-lg rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[#FFFFFF]">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#1877F2]" />
                <h3 className="text-sm font-bold text-[var(--text)]">Meta Ad Library Integration</h3>
              </div>
              <button
                onClick={() => setMetaModalOpen(false)}
                className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="p-3 rounded-[var(--radius)] bg-[#FEF3C7] border border-[#FCD34D] text-[#92400E] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#D97706]" />
                  <span>Integration Status: PENDING AUTHORIZATION</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  The source adapter is fully architected and ready. Live streaming of Facebook and Instagram advertisements requires an authorized Meta Graph API access token.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[var(--text)] mb-1">How to Connect Authorized Meta API</h4>
                <ol className="list-decimal list-inside space-y-1 text-[var(--muted)] leading-relaxed">
                  <li>Visit developers.facebook.com and create or open your Meta App.</li>
                  <li>Request permission for <strong>Ads Archive API (ads_read)</strong>.</li>
                  <li>Generate a long-lived System User Access Token.</li>
                  <li>
                    Add credentials to your backend <code className="font-mono bg-[var(--bg)] px-1 py-0.5 rounded">.env</code>:
                  </li>
                </ol>
                <pre className="mt-2 p-2.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono text-[11px] text-[var(--text)] select-all">
                  META_ACCESS_TOKEN=EAAG...{"\n"}
                  META_APP_ID=1234567890{"\n"}
                  META_APP_SECRET=your_secret_here
                </pre>
              </div>

              {metaSyncMessage && (
                <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] font-mono text-[11px]">
                  {metaSyncMessage}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)]">
                  Sample data is never disguised as live Meta ads.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMetaModalOpen(false)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleTestMeta}
                    disabled={metaSyncLoading}
                    className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                  >
                    {metaSyncLoading ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct Ingest Modal */}
      {ingestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            className="w-full max-w-lg rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[#FFFFFF]">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-bold text-[var(--text)]">Ingest New Advertisement / Post</h3>
              </div>
              <button
                onClick={() => setIngestModalOpen(false)}
                className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIngestPost} className="p-4 space-y-3 text-xs">
              {ingestSuccess && (
                <div className="p-2.5 rounded bg-[#E6F7F0] border border-[#A3E3CB] text-[#1D6B4F] flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{ingestSuccess}</span>
                </div>
              )}
              {ingestError && (
                <div className="p-2.5 rounded bg-[#FDE8E8] border border-[#F8B4B6] text-[#A8341C] flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{ingestError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">
                    Platform Source *
                  </label>
                  <select
                    value={ingestPlatform}
                    onChange={(e) => setIngestPlatform(e.target.value)}
                    className="w-full py-1.5 px-3 input-surface text-xs"
                  >
                    <option value="Telegram">Telegram Channel / Bot</option>
                    <option value="Instagram">Instagram Sponsored Ad</option>
                    <option value="Facebook">Facebook Ad / Group</option>
                    <option value="WhatsApp Group">WhatsApp Broadcast</option>
                    <option value="X">X (Twitter)</option>
                    <option value="Classifieds">Classifieds Platform</option>
                    <option value="Web">Web Landing Page</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">
                    Advertiser / Handle (Optional)
                  </label>
                  <input
                    type="text"
                    value={ingestAdvertiser}
                    onChange={(e) => setIngestAdvertiser(e.target.value)}
                    placeholder="e.g. @fraud_recruiter or channel_name"
                    className="w-full py-1.5 px-3 input-surface text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  Source URL or Post Link (Optional)
                </label>
                <input
                  type="url"
                  value={ingestUrl}
                  onChange={(e) => setIngestUrl(e.target.value)}
                  placeholder="https://t.me/channel/123 or https://instagram.com/p/..."
                  className="w-full py-1.5 px-3 input-surface text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  Advertisement Content / Post Body *
                </label>
                <textarea
                  rows={4}
                  value={ingestContent}
                  onChange={(e) => setIngestContent(e.target.value)}
                  placeholder="Paste ad body, phone number, UPI ID, or mule recruitment terms..."
                  className="w-full p-2.5 input-surface text-xs leading-relaxed"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)]">
                  Persists to database with deduplication & entity extraction.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIngestModalOpen(false)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={ingesting || !ingestContent.trim()}
                    className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                  >
                    {ingesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Ingesting...</span>
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Save to Ledger</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-in Evidence Detail Drawer */}
      <EvidenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ad={selectedAd}
        onStatusUpdate={(id, status) => {
          setAds((prev) =>
            prev.map((item) => (item.id === id ? { ...item, review_status: status as any } : item))
          );
        }}
      />
    </div>
  );
};
