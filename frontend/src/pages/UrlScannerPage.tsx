import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Globe,
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Layers,
  ArrowRight,
  Info,
  Lock,
  FileText,
  Sparkles,
  Brain,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { ExplainableVerdictCard } from '../components/investigation/ExplainableVerdictCard';
import { AiInvestigationReportModal } from '../components/investigation/AiInvestigationReportModal';
import { generateCaseReportPdf } from '../services/pdfReportGenerator';
import { InvestigationReport } from '../types';

export const UrlScannerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [urlInput, setUrlInput] = useState(searchParams.get('url') || '');
  const [titleInput, setTitleInput] = useState(searchParams.get('title') || '');
  const [scanning, setScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [savedCaseRef, setSavedCaseRef] = useState<string | undefined>(undefined);
  const [aiReport, setAiReport] = useState<InvestigationReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleOpenAiReport = async () => {
    if (!urlInput.trim()) return;
    setGeneratingReport(true);
    try {
      const rep = await api.generateInvestigationReport({
        url: urlInput.trim(),
        title: titleInput.trim() || undefined,
        input_type: 'url',
      });
      setAiReport(rep);
      setIsReportModalOpen(true);
    } catch (err: any) {
      alert('Failed to generate AI report: ' + (err.message || 'Unknown error'));
    } finally {
      setGeneratingReport(false);
    }
  };

  const samplePresets = [
    {
      label: 'Phishing KYC Spoof',
      badge: 'Phishing',
      url: 'https://verify-bank-kyc-update.com/login?token=claim-reward',
      title: 'Banking KYC Phishing Lure',
    },
    {
      label: 'Punycode Homograph',
      badge: 'Homograph',
      url: 'https://xn--sbi-bank-88a.in/online-banking-auth',
      title: 'Punycode SBI Brand Spoof',
    },
    {
      label: 'Obfuscated Shortener',
      badge: 'Shortener',
      url: 'https://bit.ly/crypto-yield-double-cash',
      title: 'Shortened Crypto Scheme Link',
    },
    {
      label: 'SSRF Loopback Probe',
      badge: 'Anti-SSRF',
      url: 'http://127.0.0.1:8000/api/admin/keys',
      title: 'Private IP Injection Attempt',
    },
    {
      label: 'Legitimate Advisory',
      badge: 'Safe Advisory',
      url: 'https://rbi.org.in/cyber-safety-advisory',
      title: 'RBI Cyber Safety Directive',
    },
  ];

  const handleScan = async (targetUrl?: string, customTitle?: string) => {
    const toScan = (targetUrl || urlInput).trim();
    if (!toScan) return;

    setScanning(true);
    setErrorMsg(null);
    setScanResult(null);
    setSavedCaseRef(undefined);

    try {
      const data = await api.scanUrl(toScan, customTitle || titleInput);
      setScanResult(data);
      if (data.saved_case_ref) {
        setSavedCaseRef(data.saved_case_ref);
      }
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setErrorMsg(err.message || 'URL Scan failed. Please check network connectivity.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('url')) {
      handleScan(searchParams.get('url') || undefined, searchParams.get('title') || undefined);
    }
  }, []);

  const handleSaveToCase = async () => {
    if (!scanResult) return;
    try {
      const saved = await api.scanUrl(scanResult.url, scanResult.investigation_title, true);
      if (saved.saved_case_ref) {
        setSavedCaseRef(saved.saved_case_ref);
      }
    } catch (err: any) {
      alert('Failed to save case: ' + err.message);
    }
  };

  const handleExportPdf = () => {
    if (!scanResult) return;
    generateCaseReportPdf({
      id: 9999,
      custom_id: `URL-SCAN-${scanResult.domain}`,
      original_text: `Target URL: ${scanResult.url}\nNormalized: ${scanResult.normalized_url}\nDomain: ${scanResult.domain}`,
      normalized_text: scanResult.normalized_url,
      source_type: 'url',
      submitted_url: scanResult.url,
      platform: 'Web / URL',
      is_demo: false,
      data_source: 'LIVE_SCAN',
      content_hash: 'SHA256-URL-EVAL',
      review_status: scanResult.risk_level === 'HIGH' ? 'NEEDS_REVIEW' : 'NEW',
      created_at: scanResult.timestamp || new Date().toISOString(),
      analysis: {
        risk_score: scanResult.risk_score,
        risk_level: scanResult.risk_level,
        model_available: false,
        model_signal: 0,
        explanation: scanResult.indicators?.join('. ') || scanResult.status,
        recommended_review_action: scanResult.recommended_steps?.[0] || 'Verify domain',
      },
      evidence_items: (scanResult.indicators || []).map((ind: string, idx: number) => ({
        id: idx + 1,
        evidence_type: 'URL_HEURISTIC',
        matched_text: ind,
        description: ind,
      })),
      entities: [
        { id: 1, entity_type: 'URL_DOMAIN', entity_value: scanResult.domain, normalized_value: scanResult.domain }
      ]
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--primary)] text-white font-bold uppercase tracking-wider">
              Module 1
            </span>
            <span className="text-xs font-mono text-[var(--muted)]">Automated Threat Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--text)] tracking-tight">
            Smart URL Scanner
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Structural heuristic analysis, homograph detection, SSRF boundary validation, and deceptive domain identification.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              if (scanResult?.url) {
                navigate(`/website-xray?url=${encodeURIComponent(scanResult.url)}`);
              } else {
                navigate('/website-xray');
              }
            }}
            className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-xs font-semibold"
            title="Inspect webpage content with Website X-Ray"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>Launch Website X-Ray</span>
          </button>
        </div>
      </div>

      {/* 2. URL Input & Controls Form */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 shadow-xs space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleScan(); }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
              <label htmlFor="url-input" className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                Target Website URL:
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="url-input"
                  type="text"
                  placeholder="e.g. https://verify-bank-login.in/claim or bit.ly/3xyz..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="input-surface w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-[var(--text)] font-mono"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="title-input" className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                Investigation Title (Optional):
              </label>
              <input
                id="title-input"
                type="text"
                placeholder="e.g. UPI Phishing Lure #42"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="input-surface w-full px-3 py-2 text-xs sm:text-sm text-[var(--text)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-[var(--muted)] mr-1">Sample Targets:</span>
              {samplePresets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setUrlInput(p.url);
                    setTitleInput(p.title);
                    handleScan(p.url, p.title);
                  }}
                  className="text-xs px-2.5 py-1 rounded-[var(--radius)] bg-[var(--bg)] hover:bg-[var(--table-hover)] border border-[var(--border)] text-[var(--text)] transition-colors flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={scanning || !urlInput.trim()}
              className="btn-primary text-xs sm:text-sm py-2 px-5 font-semibold shadow-xs flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing URL...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Scan URL</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Loading Indicator */}
      {scanning && (
        <div className="p-8 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] text-center space-y-3 shadow-xs animate-in fade-in">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)] mx-auto" />
          <p className="text-xs font-semibold text-[var(--text)]">Scanning target URL & resolving threat heuristics...</p>
          <p className="text-[11px] text-[var(--muted)]">Checking anti-SSRF protections, IP encodings, brand impersonation tokens, and domain reputation.</p>
        </div>
      )}

      {/* 4. Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 5. Scan Result via Explainable Verdict */}
      {scanResult && (
        <div ref={resultRef} className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 rounded-[var(--radius)] bg-[var(--card)] border border-cyan-800/40 flex items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Brain className="w-5 h-5 text-cyan-400 shrink-0" />
              <div>
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text)]">
                  Certified URL AI Investigation Report
                </h4>
                <p className="text-xs text-[var(--muted)]">
                  Inspect comprehensive 11-section structured report with domain heuristics, anti-SSRF safeguards, and risk breakdown.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenAiReport}
              disabled={generatingReport}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-2 font-mono font-bold uppercase tracking-wide bg-cyan-700 hover:bg-cyan-600 text-white shrink-0 shadow-xs"
            >
              <Brain className={`w-3.5 h-3.5 ${generatingReport ? 'animate-spin' : ''}`} />
              <span>{generatingReport ? 'Generating...' : 'View Full AI Report'}</span>
            </button>
          </div>

          <ExplainableVerdictCard
            riskScore={scanResult.risk_score}
            riskLevel={scanResult.risk_level}
            verdictSummary={
              scanResult.risk_level === 'HIGH'
                ? 'High-risk indicators identified. URL presents structural attributes characteristic of credential phishing or evasion infrastructure.'
                : scanResult.risk_level === 'MEDIUM'
                ? 'Suspicious indicators identified. URL exhibits properties requiring analyst confirmation.'
                : 'Standard technical parameters observed. Unverified against third-party registrar authenticity records.'
            }
            sourceTarget={scanResult.normalized_url || scanResult.url}
            ruleIndicators={(scanResult.indicators || []).map((ind: string) => ({
              category: 'URL_HEURISTIC',
              severity: scanResult.risk_level,
              sourceQuote: ind,
              explanation: ind,
            }))}
            reputationFindings={{
              provider: scanResult.reputation_provider,
              status: scanResult.reputation_status,
              detail: 'External commercial reputation feeds are not configured in this environment.',
            }}
            checksCompleted={scanResult.checks_completed || []}
            checksUnavailable={scanResult.checks_unavailable || []}
            recommendedSteps={scanResult.recommended_steps || []}
            calculationBreakdown={{
              staticUrlScore: scanResult.risk_score,
              contentSignalsScore: 0,
              mlClassifierScore: 0,
            }}
            onSaveCase={handleSaveToCase}
            onExportReport={handleExportPdf}
            savedCaseRef={savedCaseRef}
          />
        </div>
      )}

      {/* Full AI Investigation Report Modal (11 sections) */}
      <AiInvestigationReportModal
        report={aiReport}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </div>
  );
};
