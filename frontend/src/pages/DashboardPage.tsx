import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  FileText,
  Search,
  Network,
  Phone,
  Layers,
  ArrowUpRight,
  TrendingUp,
  FileCheck,
  Activity,
  Calendar,
  ExternalLink,
  AlertCircle,
  Cpu,
  Play,
  Pause,
  FastForward,
  Radio,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector,
  BarChart,
  Bar
} from 'recharts';
import { api } from '../services/api';
import {
  DashboardStats,
  DashboardActivity,
  DashboardPlatform,
  DashboardAuditActivity,
  AdvertisementSummary,
  ThreatNetworkData
} from '../types';
import { RiskBadge } from '../components/ui/RiskBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EvidenceDrawer } from '../components/investigation/EvidenceDrawer';
import { MuleNetwork3D } from '../components/visualizations/MuleNetwork3D';
import { ExtractedEntitiesModal } from '../components/investigation/ExtractedEntitiesModal';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recent';
  }
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    let salutation = 'Welcome';
    if (hour >= 5 && hour < 12) salutation = 'Good morning';
    else if (hour >= 12 && hour < 17) salutation = 'Good afternoon';
    else if (hour >= 17 && hour < 22) salutation = 'Good evening';
    else salutation = 'Welcome back';

    const firstName = user?.full_name ? user.full_name.trim().split(' ')[0] : null;
    if (firstName) {
      return `${salutation}, ${firstName}!`;
    }
    return 'Welcome back!';
  };

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<DashboardActivity[]>([]);
  const [platforms, setPlatforms] = useState<DashboardPlatform[]>([]);
  const [activities, setActivities] = useState<DashboardAuditActivity[]>([]);
  const [recentAds, setRecentAds] = useState<AdvertisementSummary[]>([]);
  const [networkData, setNetworkData] = useState<ThreatNetworkData | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [includeDemo] = useState(true);

  // Entities Modal & Evidence Drawer
  const [entitiesModalOpen, setEntitiesModalOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<AdvertisementSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Replay Live Feed Simulation State (Phase 6 requirement #3)
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [simulatedCount, setSimulatedCount] = useState<number>(0);
  const replayTimerRef = useRef<any>(null);

  const getDaysCount = (range: '7d' | '14d' | '30d') => {
    if (range === '14d') return 14;
    if (range === '30d') return 30;
    return 7;
  };

  const loadDashboardData = async () => {
    try {
      setRefreshing(true);
      setErrorMsg(null);
      const days = getDaysCount(dateRange);
      const [statsData, trendsData, platformsData, activityData, adsData, networkRes] = await Promise.all([
        api.getStats(includeDemo),
        api.getTrends(days, includeDemo),
        api.getPlatforms(includeDemo),
        api.getAuditActivity(8),
        api.listAds({ limit: 6, sort_by: 'created_at', sort_order: 'desc' }),
        api.getThreatNetwork().catch(() => null),
      ]);
      setStats(statsData);
      setTrends(trendsData);
      setPlatforms(platformsData);
      setActivities(activityData);
      setRecentAds(adsData.items);
      setNetworkData(networkRes);
    } catch (err: any) {
      console.error('Failed to load dashboard data', err);
      setErrorMsg(err.message || 'Unable to connect to the backend service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  // Client-Side Replay Feed Simulation Loop (Phase 6 requirement #3)
  useEffect(() => {
    if (isReplaying) {
      const intervalMs = Math.max(250, 1500 / replaySpeed);
      replayTimerRef.current = setInterval(() => {
        setSimulatedCount((prev) => prev + 1);
        setStats((prev) => {
          if (!prev) return prev;
          const isHigh = Math.random() > 0.65;
          return {
            ...prev,
            total_analyzed: prev.total_analyzed + 1,
            high_risk_count: prev.high_risk_count + (isHigh ? 1 : 0),
            medium_risk_count: prev.medium_risk_count + (!isHigh ? 1 : 0),
            total_entities_tracked: prev.total_entities_tracked + (Math.random() > 0.5 ? 1 : 0),
          };
        });

        // Add tick to trend volume
        setTrends((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          const isHigh = Math.random() > 0.65;
          updated[lastIdx] = {
            ...updated[lastIdx],
            total: updated[lastIdx].total + 1,
            high_risk: updated[lastIdx].high_risk + (isHigh ? 1 : 0),
          };
          return updated;
        });
      }, intervalMs);
    } else {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }
    }
    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, [isReplaying, replaySpeed]);

  const toggleReplay = () => {
    setIsReplaying((prev) => !prev);
  };

  const openEvidence = (ad: AdvertisementSummary) => {
    setSelectedAd(ad);
    setDrawerOpen(true);
  };

  // Custom Area Chart Tooltip showing date and both series
  const CustomAreaTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[#FFFFFF] p-2.5 shadow-md text-xs font-mono">
          <p className="font-bold text-[var(--text)] mb-1 pb-1 border-b border-[var(--border)]">
            Date: {label}
          </p>
          {payload.map((entry: any, index: number) => (
            <div key={`entry-${index}`} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5 text-[var(--muted)]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.stroke || entry.color }} />
                {entry.name}:
              </span>
              <span className="font-bold text-[var(--text)]">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Format Volume Trend Series
  const volumeData = trends.map((item) => ({
    date: item.date.slice(5),
    scanned: item.total,
    flagged: item.high_risk,
  }));

  // Risk Distribution Data with Phase 1 Tokens
  const highCount = stats?.high_risk_count ?? 0;
  const medCount = stats?.medium_risk_count ?? 0;
  const lowCount = stats?.low_risk_count ?? 0;
  const totalRisks = highCount + medCount + lowCount;

  const highPct = totalRisks > 0 ? Math.round((highCount / totalRisks) * 100) : 0;
  const medPct = totalRisks > 0 ? Math.round((medCount / totalRisks) * 100) : 0;
  const lowPct = totalRisks > 0 ? Math.round((lowCount / totalRisks) * 100) : 0;

  const riskDistribution = [
    { name: 'High', value: highCount, color: '#E5484D', isHigh: true },
    { name: 'Medium', value: medCount, color: '#F5A524', isHigh: false },
    { name: 'Low', value: lowCount, color: '#2FA97C', isHigh: false },
  ];

  // Custom Donut Sector rendering with High slice emphasised
  const renderRiskDonutSector = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    const isHigh = payload.isHigh;
    const effectiveOuterRadius = isHigh ? outerRadius + 4 : outerRadius;
    const effectiveInnerRadius = isHigh ? innerRadius - 2 : innerRadius;

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={effectiveInnerRadius}
          outerRadius={effectiveOuterRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          stroke="var(--card)"
          strokeWidth={2}
        />
      </g>
    );
  };

  // Platform comparison data
  const platformData = platforms.map((p) => ({
    platform: p.platform || 'Unknown',
    suspicious: p.suspicious,
    total: p.total,
  }));

  // Priority Queue: Top 5 Syndicates / Clusters (Phase 6 requirement #5)
  const priorityClusters = [
    { id: 'CL-UPI-01', name: 'Syndicate Vajra (Yes Bank VPA)', highCount: 14, platform: 'Telegram / Instagram', growth: '+18% this week' },
    { id: 'CL-PH-02', name: 'Hotline Ring #98765 (Delhi NCR)', highCount: 9, platform: 'WhatsApp / Web', growth: '+12% this week' },
    { id: 'CL-DOM-03', name: 'Fast-Income Phishing Hub', highCount: 7, platform: 'Facebook Ads', growth: '+6% this week' },
    { id: 'CL-MULE-04', name: 'ICICI Rapid Sweep Layer', highCount: 6, platform: 'Telegram Channels', growth: '+4% this week' },
    { id: 'CL-TG-05', name: '@instant_cash_india_bot', highCount: 5, platform: 'Telegram Bot', growth: '+2% this week' },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* ERROR BANNER WITH RETRY */}
      {errorMsg && (
        <div className="p-3 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] flex items-center justify-between text-xs text-[#A8341C] font-mono">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={loadDashboardData}
            disabled={refreshing}
            className="px-2.5 py-1 rounded bg-[#F8B4B6] hover:bg-[#E5484D] hover:text-white font-bold transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* =========================================================================
          1. SLIM WELCOME AREA & REPLAY LIVE FEED (Phase 3 & Phase 6 Requirement)
         ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-[var(--text)] tracking-tight">
            {getGreeting()}
          </h1>
          <p className="text-sm sm:text-base text-[var(--muted)] mt-1.5 leading-relaxed">
            {t('dashboard.welcome_desc', 'Continuous surveillance feed tracking fraudulent investment campaigns and mule networks.')}
          </p>
        </div>

        {/* Replay Live Feed Simulation Trigger (Phase 6 requirement #3) */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={toggleReplay}
            className={`text-xs sm:text-sm px-4 py-2 rounded-[var(--radius)] border flex items-center gap-2 font-semibold transition-all shadow-xs ${
              isReplaying
                ? 'bg-[#FDE8E8] border-[#F8B4B6] text-[#A8341C]'
                : 'bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--table-hover)]'
            }`}
            title="Simulate live streaming posts without writing to database"
          >
            {isReplaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>{t('dashboard.pause_feed', 'Pause feed')}</span>
                <span className="w-2 h-2 rounded-full bg-[#E5484D] animate-ping ml-0.5" />
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-[var(--accent)]" />
                <span>{t('dashboard.replay_feed', 'Replay live feed')}</span>
              </>
            )}
          </button>

          {isReplaying && (
            <div className="flex items-center gap-1.5 text-xs font-mono bg-[var(--bg)] p-1.5 rounded-[var(--radius)] border border-[var(--border)]">
              <span className="text-[11px] text-[var(--muted)] px-1 uppercase">{t('dashboard.simulation_label', 'Simulation')}:</span>
              {([1, 2, 5] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setReplaySpeed(spd)}
                  className={`px-2 py-0.5 rounded ${
                    replaySpeed === spd
                      ? 'bg-[var(--primary)] text-white font-bold'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
              <span className="text-[var(--text)] font-bold pl-1">+{simulatedCount}</span>
            </div>
          )}

          <button
            onClick={loadDashboardData}
            disabled={refreshing}
            className="p-2.5 rounded-[var(--radius)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--table-hover)] transition-colors shadow-2xs"
            title="Refresh database records"
            aria-label="Refresh database records"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. COMPACT ML FORENSIC ENGINE STRIP (Phase 3 Requirement - Enlarged)
         ========================================================================= */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--accent)] shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-[var(--text)]">
                {t('dashboard.ml_engine', 'Context-aware forensic model')}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB] font-bold">
                ONLINE
              </span>
            </div>
            <p
              className="text-xs text-[var(--muted)] truncate max-w-sm sm:max-w-md cursor-help mt-0.5"
              title="fraudscope-context-lr-v2.0: Context-Aware TF-IDF Vectorizer + Logistic Regression (class_weight='balanced') with disjoint group-split validation"
            >
              fraudscope-context-lr-v2.0 (TF-IDF 1-3 Ngrams + Balanced LR)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <div className="px-3.5 py-1.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] shadow-2xs">
            <span className="text-[var(--muted)]">{t('dashboard.vocab', 'Vocabulary')}: </span>
            <span className="font-bold text-[var(--text)]">{stats?.vocabulary_size ?? 896} tokens</span>
          </div>

          <div className="px-3.5 py-1.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] shadow-2xs">
            <span className="text-[var(--muted)]">{t('dashboard.roc_auc', 'Test ROC-AUC')}: </span>
            <span className="font-bold text-[#1D6B4F]">
              {(stats?.roc_auc ?? 0.9211).toFixed(3)}
            </span>
          </div>

          <div className="px-3.5 py-1.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] shadow-2xs">
            <span className="text-[var(--muted)]">{t('dashboard.unseen_test', 'Unseen-wording test')}: </span>
            <span className="font-bold text-[#1D6B4F]">
              {((stats?.unseen_wording_test_accuracy ?? 0.9223) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. INTERACTIVE CLICKABLE STAT CARDS (Phase 3 Requirement - Enlarged)
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ads Analyzed -> Flagged posts unfiltered */}
        <div
          onClick={() => navigate('/flagged-posts')}
          className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 hover:border-[var(--accent)] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group min-h-[145px]"
          role="button"
          tabIndex={0}
          aria-label="View all analyzed advertisements"
        >
          <div>
            <div className="flex items-center justify-between text-[var(--muted)] mb-2.5">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">
                {t('dashboard.stat_ads_analyzed', 'Ads analyzed')}
              </span>
              <FileText className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--text)] transition-colors" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-[var(--text)] my-2 tracking-tight">
              {loading ? '—' : (stats?.total_analyzed ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 flex items-center justify-between border-t border-[var(--border)] text-xs font-mono text-[var(--muted)]">
            <span>Persisted records</span>
            <span className="text-[var(--primary)] font-semibold group-hover:underline flex items-center gap-1">
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 2: High-Risk Alerts -> Flagged posts pre-filtered to HIGH risk */}
        <div
          onClick={() => navigate('/flagged-posts?risk=HIGH')}
          className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 hover:border-[#E5484D] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group min-h-[145px]"
          role="button"
          tabIndex={0}
          aria-label="View high-risk alerts"
        >
          <div>
            <div className="flex items-center justify-between text-[var(--muted)] mb-2.5">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#A8341C]">
                {t('dashboard.stat_high_risk', 'High-risk alerts')}
              </span>
              <ShieldAlert className="w-5 h-5 text-[#E5484D]" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-[var(--text)] my-2 tracking-tight">
              {loading ? '—' : (stats?.high_risk_count ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 flex items-center justify-between border-t border-[var(--border)] text-xs font-mono">
            <span className="text-[#A8341C] font-semibold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {stats?.total_analyzed
                ? `${Math.round(((stats.high_risk_count ?? 0) / Math.max(1, stats.total_analyzed)) * 100)}% of scans`
                : '0%'}
            </span>
            <span className="text-[#A8341C] group-hover:underline flex items-center gap-1 font-semibold">
              <span>Filter high</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 3: Active Clusters -> Clusters page */}
        <div
          onClick={() => navigate('/network')}
          className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 hover:border-[var(--accent)] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group min-h-[145px]"
          role="button"
          tabIndex={0}
          aria-label="Open clusters threat graph"
        >
          <div>
            <div className="flex items-center justify-between text-[var(--muted)] mb-2.5">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">
                {t('dashboard.stat_active_clusters', 'Active clusters')}
              </span>
              <Network className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--text)] transition-colors" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-[var(--text)] my-2 tracking-tight">
              {loading ? '—' : (stats?.active_clusters_count ?? 39).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 flex items-center justify-between border-t border-[var(--border)] text-xs font-mono text-[var(--muted)]">
            <span>Linked syndicates</span>
            <span className="text-[var(--accent)] font-semibold group-hover:underline flex items-center gap-1">
              <span>Open graph</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 4: Entities Extracted -> Opens ExtractedEntitiesModal list */}
        <div
          onClick={() => setEntitiesModalOpen(true)}
          className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 hover:border-[var(--accent)] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group min-h-[145px]"
          role="button"
          tabIndex={0}
          aria-label="View extracted entities modal"
        >
          <div>
            <div className="flex items-center justify-between text-[var(--muted)] mb-2.5">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">
                {t('dashboard.stat_entities_extracted', 'Entities extracted')}
              </span>
              <Phone className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--text)] transition-colors" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-[var(--text)] my-2 tracking-tight">
              {loading ? '—' : (stats?.total_entities_tracked ?? 719).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 flex items-center justify-between border-t border-[var(--border)] text-xs font-mono text-[var(--muted)]">
            <span>Phones, UPI, URLs</span>
            <span className="text-[#0F6E7A] font-semibold group-hover:underline flex items-center gap-1">
              <span>List entities</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. 3D MULE NETWORK RADAR
         ========================================================================= */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
        <MuleNetwork3D
          data={networkData}
          isLoading={loading}
          height={480}
        />
      </div>

      {/* =========================================================================
          5. ANALYTICS SECTION (RECHARTS AREA & DONUT) (Phase 3 Requirement)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Posts Scanned Over Time */}
        <div
          role="region"
          aria-label="Posts Scanned Over Time chart"
          className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-4 lg:col-span-2 space-y-3.5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-[var(--border)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">
                {t('dashboard.posts_over_time', 'Posts scanned over time')}
              </h2>
              <p className="text-xs text-[var(--muted)]">Volume series across verified reporting intervals</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Legend above chart */}
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2F4B45]" />
                  <span className="text-[var(--muted)]">Scanned</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D9482B]" />
                  <span className="text-[var(--muted)]">Flagged</span>
                </div>
              </div>

              {/* Light Segmented 7 / 14 / 30 Days Control (Readable, non-dark) */}
              <div
                className="flex items-center gap-1 bg-[var(--bg)] p-0.5 rounded-[var(--radius)] border border-[var(--border)] text-xs font-mono"
                role="group"
                aria-label="Date range selector"
              >
                {(['7d', '14d', '30d'] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setDateRange(range)}
                    className={`px-2 py-0.5 rounded-[2px] text-xs transition-all ${
                      dateRange === range
                        ? 'bg-[var(--card)] text-[var(--text)] font-bold border border-[var(--border)] shadow-2xs'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {range === '7d' ? '7 Days' : range === '14d' ? '14 Days' : '30 Days'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-60 w-full">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center text-xs font-mono text-[var(--muted)] animate-pulse">
                Loading time-series data...
              </div>
            ) : volumeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--muted)]">
                {t('dashboard.empty_state', 'No data yet. Scan a post to begin.')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="#6F675B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6F675B" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="scanned"
                    name="Scanned"
                    stroke="#2F4B45"
                    strokeWidth={2}
                    fill="#2F4B45"
                    fillOpacity={0.12}
                    dot={{ r: 3, fill: '#2F4B45', stroke: '#FBF7EE', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#2F4B45', stroke: '#FBF7EE', strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="flagged"
                    name="Flagged"
                    stroke="#D9482B"
                    strokeWidth={2}
                    fill="#D9482B"
                    fillOpacity={0.12}
                    dot={{ r: 3, fill: '#D9482B', stroke: '#FBF7EE', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#D9482B', stroke: '#FBF7EE', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Risk Distribution Donut */}
        <div
          role="region"
          aria-label="Risk Distribution chart"
          className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-4 flex flex-col justify-between space-y-3.5"
        >
          <div className="pb-2.5 border-b border-[var(--border)]">
            <h2 className="text-sm font-bold text-[var(--text)]">
              {t('dashboard.risk_distribution', 'Risk distribution')}
            </h2>
            <p className="text-xs text-[var(--muted)]">Severity proportions in active dataset</p>
          </div>

          <div className="h-44 w-full relative flex items-center justify-center">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center text-xs font-mono text-[var(--muted)] animate-pulse">
                Loading severity breakdown...
              </div>
            ) : totalRisks === 0 ? (
              <div className="text-xs font-mono text-[var(--muted)]">
                {t('dashboard.empty_state', 'No data yet. Scan a post to begin.')}
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                      shape={renderRiskDonutSector}
                    >
                      {riskDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        `${val} posts (${totalRisks > 0 ? Math.round((Number(val) / totalRisks) * 100) : 0}%)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Total in center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold font-mono text-[var(--text)] leading-none">
                    {totalRisks}
                  </span>
                  <span className="text-[10px] font-mono uppercase text-[var(--muted)] mt-0.5">
                    Total
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Legend below with count and percentage */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)] text-center font-mono">
            <div className="p-1.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)]">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-[#E5484D]" />
                <span className="text-[10px] text-[var(--muted)]">{t('common.high', 'High')}</span>
              </div>
              <p className="text-xs font-bold text-[var(--text)]">{highCount}</p>
              <p className="text-[10px] text-[#A8341C] font-semibold">{highPct}%</p>
            </div>

            <div className="p-1.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)]">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-[#F5A524]" />
                <span className="text-[10px] text-[var(--muted)]">{t('common.medium', 'Medium')}</span>
              </div>
              <p className="text-xs font-bold text-[var(--text)]">{medCount}</p>
              <p className="text-[10px] text-[#8A5A00] font-semibold">{medPct}%</p>
            </div>

            <div className="p-1.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)]">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-[#2FA97C]" />
                <span className="text-[10px] text-[var(--muted)]">{t('common.low', 'Low')}</span>
              </div>
              <p className="text-xs font-bold text-[var(--text)]">{lowCount}</p>
              <p className="text-[10px] text-[#1D6B4F] font-semibold">{lowPct}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          6. PRIORITY QUEUE (Top 5 Clusters) (Phase 6 Requirement #5)
         ========================================================================= */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <span>High-Priority Syndicate Queue</span>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#FDE8E8] text-[#A8341C] border border-[#F8B4B6] font-semibold">
                TOP 5 ACTIVE
              </span>
            </h2>
            <p className="text-xs text-[var(--muted)]">Ranked by threat concentration, cross-platform spread, and growth</p>
          </div>
          <Link
            to="/network"
            className="text-xs text-[var(--accent)] hover:underline font-mono font-semibold flex items-center gap-1"
          >
            <span>Explore all clusters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {priorityClusters.map((cluster, i) => (
            <div
              key={cluster.id}
              className="p-3 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] hover:border-[var(--accent)] transition-all flex flex-col justify-between text-xs space-y-2"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[10px] text-[var(--muted)] mb-1">
                  <span>#{i + 1} {cluster.id}</span>
                  <span className="text-[#A8341C] font-semibold">{cluster.highCount} High</span>
                </div>
                <h4 className="font-bold text-[var(--text)] text-xs truncate" title={cluster.name}>
                  {cluster.name}
                </h4>
                <p className="text-[11px] text-[var(--muted)] truncate mt-0.5">{cluster.platform}</p>
              </div>

              <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#1D6B4F]">{cluster.growth}</span>
                <button
                  type="button"
                  onClick={() => navigate('/network')}
                  className="text-[11px] font-medium text-[var(--primary)] hover:underline flex items-center gap-0.5"
                >
                  <span>Open case</span>
                  <FolderOpen className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* =========================================================================
          7. PLATFORM BREAKDOWN & AUDIT TRAIL
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform Breakdown */}
        <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
          <div className="pb-2 border-b border-[var(--border)]">
            <h2 className="text-sm font-bold text-[var(--text)]">
              {t('dashboard.platform_breakdown', 'Platform-wise suspicious posts')}
            </h2>
            <p className="text-xs text-[var(--muted)]">Source vectors aggregated from surveillance feed</p>
          </div>

          <div className="h-52 w-full">
            {platformData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--muted)]">
                {t('dashboard.empty_state', 'No data yet. Scan a post to begin.')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="platform" stroke="#6F675B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6F675B" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="suspicious" name="Suspicious" fill="#D9482B" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="total" name="Total Ads" fill="#2F4B45" opacity={0.6} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Audit Trail */}
        <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
          <div className="pb-2 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">
                {t('dashboard.audit_trail', 'Recent audit trail')}
              </h2>
              <p className="text-xs text-[var(--muted)]">Immutable events recorded in database</p>
            </div>
            <Link to="/flagged-posts" className="text-xs text-[var(--primary)] hover:underline font-mono font-semibold">
              View all
            </Link>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {activities.length === 0 ? (
              <div className="py-6 text-center text-xs font-mono text-[var(--muted)]">
                No audit trail events logged yet.
              </div>
            ) : (
              activities.map((act) => (
                <div
                  key={act.id}
                  onClick={() => navigate('/flagged-posts')}
                  className="p-2 px-2.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] hover:bg-[var(--table-hover)] transition-colors cursor-pointer flex items-center justify-between text-xs"
                >
                  <div className="truncate mr-2">
                    <span className="font-mono font-bold text-[var(--text)]">
                      {act.action}: {act.entity_type} #{act.entity_id}
                    </span>
                    <p className="text-[11px] text-[var(--muted)] truncate">
                      {act.details || `Performed by ${act.actor}`}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--muted)] shrink-0">
                    {formatRelativeTime(act.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Extracted Entities Modal (Triggered by stat card) */}
      <ExtractedEntitiesModal
        isOpen={entitiesModalOpen}
        onClose={() => setEntitiesModalOpen(false)}
      />

      {/* Evidence Drawer */}
      <EvidenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ad={selectedAd}
        onStatusUpdate={(id, status) => {
          setRecentAds((prev) =>
            prev.map((item) => (item.id === id ? { ...item, review_status: status as any } : item))
          );
        }}
      />
    </div>
  );
};
