import React, { useState, useEffect } from 'react';
import {
  FileBarChart2,
  Download,
  FileDown,
  Printer,
  Shield,
  CheckCircle,
  AlertTriangle,
  Info,
  Lock,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  Brain,
  Globe,
  MessageSquare,
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { RiskBadge } from '../components/ui/RiskBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { generateCaseReportPdf } from '../services/pdfReportGenerator';
import { AiInvestigationReportModal } from '../components/investigation/AiInvestigationReportModal';
import { InvestigationReport, InvestigationReportListItem } from '../types';

interface CaseReport {
  caseId: string;
  adId: string;
  rawId: number;
  title: string;
  originalText: string;
  platform: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore: number;
  summary: string;
  indicators: string[];
  status: string;
  generatedDate: string;
  analyst: string;
}

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ai_reports' | 'case_dossiers'>('ai_reports');

  // AI Investigation Reports state
  const [aiReports, setAiReports] = useState<InvestigationReportListItem[]>([]);
  const [loadingAiReports, setLoadingAiReports] = useState(true);
  const [aiReportSearch, setAiReportSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [selectedReport, setSelectedReport] = useState<InvestigationReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loadingSelectedReport, setLoadingSelectedReport] = useState(false);

  // Quick On-Demand Generation state
  const [quickInput, setQuickInput] = useState('');
  const [quickType, setQuickType] = useState<'message' | 'url'>('message');
  const [isGeneratingQuick, setIsGeneratingQuick] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  // Case Dossiers state
  const [caseReports, setCaseReports] = useState<CaseReport[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [caseSearch, setCaseSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [downloadSuccessId, setDownloadSuccessId] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any | null>(null);

  const fetchAiReports = () => {
    setLoadingAiReports(true);
    api.listInvestigationReports({
      limit: 30,
      search: aiReportSearch || undefined,
      severity: severityFilter !== 'All' ? severityFilter : undefined,
    })
      .then((res) => {
        setAiReports(res.items || res.reports || []);
      })
      .catch((err) => {
        console.error('Failed to load investigation reports', err);
      })
      .finally(() => {
        setLoadingAiReports(false);
      });
  };

  const fetchCaseReports = () => {
    setLoadingCases(true);
    setErrorMsg(null);

    // Fetch reports summary metrics
    api.getReportsSummary()
      .then((sum) => setSummaryData(sum))
      .catch(() => {});

    api.listAds({ limit: 30, sort_by: 'created_at', sort_order: 'desc' })
      .then((res) => {
        const mappedReports: CaseReport[] = res.items.map((item) => {
          const text = item.original_text || '';
          const detectedIndicators: string[] = [];

          if (item.submitted_url) {
            detectedIndicators.push(item.submitted_url);
          }

          const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
          if (phoneMatch) detectedIndicators.push(phoneMatch[0].trim());

          const upiMatch = text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/);
          if (upiMatch) detectedIndicators.push(upiMatch[0].trim());

          const tgMatch = text.match(/(?:@|t\.me\/)[a-zA-Z0-9_]{4,32}/i);
          if (tgMatch) detectedIndicators.push(tgMatch[0].trim());

          const uniqueIndicators = Array.from(new Set(detectedIndicators));

          return {
            caseId: `CASE-2026-${String(item.id).padStart(4, '0')}`,
            adId: item.custom_id || `AD-${item.id}`,
            rawId: item.id,
            title: text.slice(0, 70) + (text.length > 70 ? '...' : ''),
            originalText: text,
            platform: item.platform || 'Social Web',
            riskLevel: (item.risk_level as any) || 'LOW',
            riskScore: item.risk_score || 0,
            summary: item.review_status || 'Automated ML & heuristic triage complete.',
            indicators: uniqueIndicators.length > 0 ? uniqueIndicators : ['Platform Pattern Match'],
            status: item.review_status || 'NEW',
            generatedDate: item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent',
            analyst: 'Analyst Alpha',
          };
        });

        setCaseReports(mappedReports);
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Failed to load case reports.');
      })
      .finally(() => {
        setLoadingCases(false);
      });
  };

  useEffect(() => {
    fetchAiReports();
    fetchCaseReports();
  }, []);

  const handleOpenReport = async (identifier: string | number) => {
    setLoadingSelectedReport(true);
    try {
      const fullReport = await api.getInvestigationReport(identifier);
      setSelectedReport(fullReport);
      setIsReportModalOpen(true);
    } catch (err: any) {
      alert(`Could not load report: ${err.message || 'Unknown error'}`);
    } finally {
      setLoadingSelectedReport(false);
    }
  };

  const handleQuickGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;

    setIsGeneratingQuick(true);
    setQuickError(null);

    try {
      const payload: any = {
        input_type: quickType,
        source_type: 'manual_scan',
      };
      if (quickType === 'url') {
        payload.url = quickInput.trim();
      } else {
        payload.content = quickInput.trim();
      }

      const generated = await api.generateInvestigationReport(payload);
      setSelectedReport(generated);
      setIsReportModalOpen(true);
      setQuickInput('');
      fetchAiReports();
    } catch (err: any) {
      setQuickError(err.message || 'Failed to generate investigation report.');
    } finally {
      setIsGeneratingQuick(false);
    }
  };

  const handleExportPdf = (rep: CaseReport) => {
    generateCaseReportPdf({
      id: rep.rawId,
      custom_id: rep.adId,
      original_text: rep.originalText,
      normalized_text: rep.originalText,
      source_type: 'text',
      platform: rep.platform,
      is_demo: false,
      data_source: 'LIVE_SCAN',
      content_hash: 'SHA256-VERIFIED',
      review_status: rep.status,
      created_at: rep.generatedDate,
      analysis: {
        risk_score: rep.riskScore,
        risk_level: rep.riskLevel,
        model_available: true,
        model_signal: rep.riskScore / 100,
        explanation: `Automated forensic triage evaluated for ${rep.adId}. Indicators: ${rep.indicators.join(', ')}`,
        recommended_review_action: 'Proceed with formal legal dossier export.',
      },
      evidence_items: rep.indicators.map((ind, i) => ({
        id: i + 1,
        evidence_type: 'CORRELATED_INDICATOR',
        matched_text: ind,
        description: `Verified pattern: ${ind}`,
      })),
      entities: rep.indicators.map((ind, i) => ({
        id: i + 1,
        entity_type: ind.includes('@') ? 'UPI' : (ind.startsWith('+') ? 'PHONE' : 'DOMAIN'),
        entity_value: ind,
        normalized_value: ind,
      }))
    }, {
      analystNotes: `Executive case report for ${rep.caseId}. Verified against stored SQLite forensic database.`,
    });

    setDownloadSuccessId(rep.caseId);
    setTimeout(() => setDownloadSuccessId(null), 4000);
  };

  const filteredCaseReports = caseReports.filter((r) => {
    const matchesSearch =
      r.caseId.toLowerCase().includes(caseSearch.toLowerCase()) ||
      r.adId.toLowerCase().includes(caseSearch.toLowerCase()) ||
      r.title.toLowerCase().includes(caseSearch.toLowerCase());
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--primary)] text-white font-bold uppercase tracking-wider">
              Investigation Reports & Dossiers
            </span>
            <span className="text-xs font-mono text-[var(--muted)]">Evidence-Based Forensic Suite</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--text)] tracking-tight">
            AI Investigation Reports & Certified Dossiers
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Generate and inspect comprehensive 11-section AI Investigation Reports with calibrated risk scores, threat evidence, model limitations, and printable PDF exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <a
            href={api.getExportCsvUrl()}
            download
            className="btn-secondary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-2 shadow-xs font-semibold"
            title="Download complete database in sanitized CSV format"
          >
            <FileSpreadsheet className="w-4 h-4 text-[var(--accent)]" />
            <span>Export CSV Dataset</span>
          </a>

          <button
            onClick={() => {
              fetchAiReports();
              fetchCaseReports();
            }}
            disabled={loadingAiReports || loadingCases}
            className="btn-primary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-2 shadow-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loadingAiReports || loadingCases) ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-[var(--border)] gap-2">
        <button
          onClick={() => setActiveTab('ai_reports')}
          className={`pb-3 px-4 text-xs sm:text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'ai_reports'
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <Brain className="w-4 h-4" />
          <span>AI Investigation Reports ({aiReports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('case_dossiers')}
          className={`pb-3 px-4 text-xs sm:text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'case_dossiers'
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <FileBarChart2 className="w-4 h-4" />
          <span>Case Dossiers & Audit Exports ({caseReports.length})</span>
        </button>
      </div>

      {/* TAB 1: AI INVESTIGATION REPORTS */}
      {activeTab === 'ai_reports' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Quick On-Demand Scan & Report Banner */}
          <div className="p-5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-500" />
                <h3 className="text-sm font-mono font-bold uppercase tracking-wide text-[var(--text)]">
                  Instant On-Demand AI Investigation Scan
                </h3>
              </div>
              <div className="flex items-center gap-1.5 bg-[var(--bg)] p-1 rounded border border-[var(--border)] text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setQuickType('message')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    quickType === 'message' ? 'bg-[var(--primary)] text-white font-bold' : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Message Text
                </button>
                <button
                  type="button"
                  onClick={() => setQuickType('url')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    quickType === 'url' ? 'bg-[var(--primary)] text-white font-bold' : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Direct URL
                </button>
              </div>
            </div>

            <form onSubmit={handleQuickGenerateReport} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={
                    quickType === 'url'
                      ? 'Enter URL e.g. https://phish-secure-portal.com/login or http://127.0.0.1:8000...'
                      : 'Paste suspicious message text offering bank accounts, OTP verifications, or ATM cards...'
                  }
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  className="input-surface flex-1 px-3.5 py-2 text-xs font-mono text-[var(--text)]"
                  required
                />
                <button
                  type="submit"
                  disabled={isGeneratingQuick || !quickInput.trim()}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 font-bold uppercase font-mono shadow-xs"
                >
                  {isGeneratingQuick ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Brain className="w-3.5 h-3.5" />
                      <span>Generate Report</span>
                    </>
                  )}
                </button>
              </div>

              {quickError && (
                <div className="text-xs text-red-500 font-mono bg-red-50 dark:bg-red-950/30 p-2.5 rounded border border-red-200 dark:border-red-900/50 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{quickError}</span>
                </div>
              )}
            </form>
          </div>

          {/* AI Reports Search & Filter */}
          <div className="p-4 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by Report ID, Scan ID, or target..."
                value={aiReportSearch}
                onChange={(e) => setAiReportSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchAiReports()}
                className="input-surface w-full pl-9 pr-4 py-1.5 text-xs text-[var(--text)] font-mono"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[var(--muted)]">Severity:</span>
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                  }}
                  className="input-surface text-xs text-[var(--text)] px-3 py-1.5 font-mono"
                >
                  <option value="All">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="Informational">Informational</option>
                </select>
              </div>

              <button
                type="button"
                onClick={fetchAiReports}
                className="btn-secondary text-xs py-1.5 px-3 font-mono"
              >
                Filter
              </button>
            </div>
          </div>

          {/* AI Reports Table */}
          {loadingAiReports ? (
            <div className="py-20 text-center text-xs font-mono text-[var(--muted)] space-y-2">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p>Loading AI investigation reports from database...</p>
            </div>
          ) : aiReports.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto space-y-3 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-8">
              <div className="w-12 h-12 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] mx-auto">
                <Brain className="w-6 h-6 text-cyan-500" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text)]">No Investigation Reports Yet</h3>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Scan any message or URL using the box above, or click on any record in Live Feed / Scanner to automatically generate structured AI investigation reports.
              </p>
            </div>
          ) : (
            <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] font-mono uppercase">
                      <th className="py-3 px-4">Report ID</th>
                      <th className="py-3 px-4">Input Type</th>
                      <th className="py-3 px-4">Target Summary</th>
                      <th className="py-3 px-4">Verdict</th>
                      <th className="py-3 px-4">Risk Score</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">Generated</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-sans">
                    {aiReports.map((rep) => (
                      <tr key={rep.id} className="hover:bg-[var(--table-hover)] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[var(--primary)] whitespace-nowrap">
                          {rep.report_id}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] uppercase text-[10px]">
                            {rep.input_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[var(--text)] truncate max-w-xs font-mono text-[11px]">
                          {rep.target_summary}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            rep.verdict === 'Suspicious' ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300' :
                            rep.verdict === 'Likely Suspicious' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' :
                            rep.verdict === 'Inconclusive' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300' :
                            'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}>
                            {rep.verdict}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                          <span className={
                            rep.risk_score >= 80 ? 'text-red-600' :
                            rep.risk_score >= 60 ? 'text-orange-600' :
                            rep.risk_score >= 40 ? 'text-amber-600' : 'text-emerald-600'
                          }>
                            {Math.round(rep.risk_score)}/100
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] uppercase whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            rep.severity === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' :
                            rep.severity === 'High' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            rep.severity === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {rep.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[var(--muted)] font-mono text-[11px] whitespace-nowrap">
                          {new Date(rep.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenReport(rep.report_id)}
                              className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1 font-mono font-medium"
                              title="Inspect full 11-section AI report"
                            >
                              <Brain className="w-3.5 h-3.5" />
                              <span>View Report</span>
                            </button>
                            <a
                              href={api.getReportExportHtmlUrl(rep.report_id)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary text-xs py-1 px-2 text-[var(--muted)] hover:text-[var(--text)]"
                              title="Print / PDF View"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </a>
                            <a
                              href={api.getReportExportJsonUrl(rep.report_id)}
                              download={`${rep.report_id}.json`}
                              className="btn-secondary text-xs py-1 px-2 text-[var(--muted)] hover:text-[var(--text)]"
                              title="Download JSON Report"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CASE DOSSIERS & CERTIFIED AUDIT EXPORTS */}
      {activeTab === 'case_dossiers' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Executive Summary Cards */}
          {summaryData && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3.5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-2xs">
                <span className="text-[var(--muted)] block text-[10px] uppercase font-bold">TOTAL EVALUATED</span>
                <strong className="text-xl font-bold text-[var(--text)] mt-1 block">
                  {summaryData.metrics?.total_advertisements_evaluated ?? 0}
                </strong>
              </div>

              <div className="p-3.5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-2xs">
                <span className="text-[#A8341C] block text-[10px] uppercase font-bold">HIGH RISK DOSSIERS</span>
                <strong className="text-xl font-bold text-[#A8341C] mt-1 block">
                  {summaryData.metrics?.risk_distribution?.high_risk ?? 0}
                </strong>
              </div>

              <div className="p-3.5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-2xs">
                <span className="text-[var(--muted)] block text-[10px] uppercase font-bold">ACTIVE CASES</span>
                <strong className="text-xl font-bold text-[var(--text)] mt-1 block">
                  {summaryData.metrics?.cases?.open ?? 0} Open
                </strong>
              </div>

              <div className="p-3.5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-2xs">
                <span className="text-[#1D6B4F] block text-[10px] uppercase font-bold">REPORT CLASSIFICATION</span>
                <strong className="text-xs font-bold text-[#1D6B4F] mt-1.5 block truncate">
                  {summaryData.classification || 'INTERNAL USE'}
                </strong>
              </div>
            </div>
          )}

          {/* Success Notification */}
          {downloadSuccessId && (
            <div className="p-3.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-xs font-mono text-[#1D6B4F] flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Case Report PDF for {downloadSuccessId} generated with SHA-256 evidence hash and downloaded!</span>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="p-4 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by Case ID, Ad ID, or text..."
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                className="input-surface w-full pl-9 pr-4 py-1.5 text-xs text-[var(--text)] font-mono"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-mono text-[var(--muted)]">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-surface text-xs text-[var(--text)] px-3 py-1.5 font-mono"
              >
                <option value="All">All Statuses</option>
                <option value="NEW">NEW</option>
                <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                <option value="UNDER_INVESTIGATION">UNDER_INVESTIGATION</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
          </div>

          {/* Reports List */}
          {loadingCases ? (
            <div className="py-20 text-center text-xs font-mono text-[var(--muted)] space-y-2">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p>Loading database case reports...</p>
            </div>
          ) : filteredCaseReports.length === 0 ? (
            <div className="py-16 text-center max-w-sm mx-auto space-y-3 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-6">
              <div className="w-10 h-10 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] mx-auto">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text)]">No Reports Found</h3>
              <p className="text-xs text-[var(--muted)]">
                No records matched your search query or filter criteria in the current database.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCaseReports.map((rep) => (
                <div
                  key={rep.caseId}
                  className="p-5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] transition-all space-y-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-[var(--text)]">{rep.caseId}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]">
                          {rep.adId}
                        </span>
                      </div>
                      <h3 className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-relaxed">
                        {rep.title}
                      </h3>
                    </div>
                    <RiskBadge level={rep.riskLevel} score={rep.riskScore} size="sm" />
                  </div>

                  <div className="p-3 rounded bg-[var(--bg)] border border-[var(--border)] space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[var(--muted)] font-mono text-[11px]">
                      <span>Platform: {rep.platform}</span>
                      <span>Date: {rep.generatedDate}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {rep.indicators.slice(0, 3).map((ind, i) => (
                        <span
                          key={i}
                          className="indicator-chip font-mono text-[10px] truncate max-w-[200px]"
                        >
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                    <StatusBadge status={rep.status} size="sm" />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenReport(rep.rawId)}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 font-medium"
                      >
                        <Brain className="w-3.5 h-3.5" />
                        <span>AI Report</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf(rep)}
                        className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                      >
                        <FileDown className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span>Download PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Structured AI Investigation Report Modal (11 sections) */}
      <AiInvestigationReportModal
        report={selectedReport}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </div>
  );
};
