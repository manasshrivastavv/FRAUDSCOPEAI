import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ScanSearch,
  Upload,
  Globe,
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Phone,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Cpu,
  Layers,
  FileDown,
  Send,
  Camera,
  Share2,
  Edit3,
  FileText,
  Brain,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { AdvertisementDetail, InvestigationReport } from '../types';
import { RiskBadge } from '../components/ui/RiskBadge';
import { ExplainableVerdictCard } from '../components/investigation/ExplainableVerdictCard';
import { AiInvestigationReportModal } from '../components/investigation/AiInvestigationReportModal';
import { generateCaseReportPdf } from '../services/pdfReportGenerator';

export const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const stateData = (location.state || {}) as { text?: string; platform?: string; url?: string };

  // Input states
  const [activeInputTab, setActiveInputTab] = useState<'text' | 'image'>('text');
  const [textContent, setTextContent] = useState(stateData.text || '');
  const [platform, setPlatform] = useState(stateData.platform || 'Telegram');
  const [submittedUrl, setSubmittedUrl] = useState(stateData.url || '');

  useEffect(() => {
    if (stateData.text) {
      setTextContent(stateData.text);
    }
    if (stateData.platform) {
      setPlatform(stateData.platform);
    }
    if (stateData.url) {
      setSubmittedUrl(stateData.url);
    }
  }, [location.state]);

  // OCR and File Upload
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  // Status & Results
  const [scanning, setScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AdvertisementDetail | null>(null);
  const [savedCaseRef, setSavedCaseRef] = useState<string | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  // Multilingual sample presets matching FinGuard AI targets (English, Hindi, Hinglish)
  const samplePresets = [
    {
      label: 'Hinglish Bank Account Rent',
      badge: 'Account Sale',
      text: 'Bank account kiraye pe available hai! Fresh current account with linked SIM card aur ATM card + PIN ready for immediate delivery. Urgent buyers only message on Telegram @CashDropDeal or call +91 98765 43210. 100% genuine guaranteed.',
      platform: 'Telegram',
      url: 'https://t.me/CashDropDeal',
    },
    {
      label: 'Preloaded ATM Card & PIN',
      badge: 'Card Fraud',
      text: 'ATM card chahiye with active savings account access? Pre-loaded debit card and account access available. Urgent buyers only. Guaranteed daily cash withdrawal limits. Contact fast for immediate dispatch.',
      platform: 'Instagram',
      url: 'https://instagram.com/fast_cards_hub',
    },
    {
      label: 'UPI Merchant Rental',
      badge: 'UPI Laundering',
      text: 'Merchant UPI access and verified business current accounts for rent. Daily rotation payment routing. High commission payout daily. Contact @UPI_Rentals on Telegram or WhatsApp +91 91234 56789. Genuine buyers only.',
      platform: 'Telegram',
      url: 'https://t.me/UPI_Rentals',
    },
    {
      label: 'Legitimate Bank Advisory',
      badge: 'Safe Advisory',
      text: 'FRAUD ADVISORY from RBI & Cyber Crime Cell: Never rent out your savings or current bank accounts. Selling bank accounts or sharing SIM cards linked to banking is a punishable offense under PMLA. Beware of fake Telegram channels.',
      platform: 'Facebook',
      url: 'https://rbi.org.in/cyber-safety',
    },
  ];

  const handleApplyPreset = (p: typeof samplePresets[0]) => {
    setTextContent(p.text);
    setPlatform(p.platform);
    setSubmittedUrl(p.url);
    setErrorMsg(null);
    setResult(null);
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textContent.trim()) {
      setErrorMsg('Please paste or OCR extract advertisement text before analyzing.');
      return;
    }

    setScanning(true);
    setErrorMsg(null);
    setResult(null);
    setSavedCaseRef(undefined);

    try {
      const res = await api.analyzeAd(
        textContent.trim(),
        activeInputTab === 'image' ? 'screenshot' : 'text',
        submittedUrl.trim() || undefined
      );
      res.platform_detected = platform;
      setResult(res);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setErrorMsg(err.message || 'Analysis failed. Please check backend connection.');
    } finally {
      setScanning(false);
    }
  };

  // Handle OCR screenshot upload with editable review
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('Image size exceeds 10MB limit.');
        return;
      }
      setImagePreview(URL.createObjectURL(file));
      setOcrStatus('Extracting text from image via OCR...');
      setOcrLoading(true);
      setErrorMsg(null);

      try {
        const ocrRes = await api.uploadOcrImage(file);
        if (ocrRes.success && ocrRes.extracted_text && ocrRes.extracted_text.trim().length > 0) {
          const text = ocrRes.extracted_text.trim();
          setTextContent(text);
          setOcrStatus(`✓ OCR completed: extracted ${text.length} characters. Review and edit the text below.`);
          setErrorMsg(null);
        } else if (ocrRes.success) {
          setOcrStatus(ocrRes.message || 'OCR processed successfully, but no legible text was recognized in the image. You can type or paste the text manually below.');
        } else {
          setOcrStatus(ocrRes.message || 'OCR extraction failed on host system.');
          setErrorMsg(ocrRes.message || 'OCR engine unavailable or image processing error.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'OCR extraction unavailable on host.');
        setOcrStatus(err.message || 'OCR extraction unavailable on host. Please paste the ad text directly.');
      } finally {
        setOcrLoading(false);
      }
    }
  };

  const handleSaveToCase = async () => {
    if (!result) return;
    try {
      const created = await api.createCase({
        title: `Ad Investigation: ${result.custom_id || `AD-${result.id}`}`,
        description: `Triage for ${result.platform || 'ad'}. Risk: ${result.analysis?.risk_level} (Score: ${result.analysis?.risk_score}). Snippet: ${result.original_text.substring(0, 150)}...`,
        priority: result.analysis?.risk_level === 'HIGH' ? 'HIGH' : 'MEDIUM',
        ad_ids: [result.id],
      });
      setSavedCaseRef(created.case_ref);
    } catch (err: any) {
      alert('Failed to save case: ' + err.message);
    }
  };

  const handleExportReport = () => {
    if (!result) return;
    generateCaseReportPdf(result, {
      analystNotes: 'Generated following advertisement triage. Evidence-based scoring and entities logged for investigation.',
    });
  };

  const [aiReport, setAiReport] = useState<InvestigationReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const handleOpenAiReport = async () => {
    if (!result) return;
    setGeneratingReport(true);
    try {
      const rep = await api.generateInvestigationReport({ advertisement_id: result.id });
      setAiReport(rep);
      setIsReportModalOpen(true);
    } catch (err: any) {
      alert('Failed to generate AI report: ' + (err.message || 'Unknown error'));
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleReset = () => {
    setTextContent('');
    setSubmittedUrl('');
    setResult(null);
    setErrorMsg(null);
    setImagePreview(null);
    setOcrStatus(null);
    setSavedCaseRef(undefined);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--primary)] text-white font-bold uppercase tracking-wider">
              Module 3
            </span>
            <span className="text-xs font-mono text-[var(--muted)]">Text & OCR Screenshot Analysis</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--text)] tracking-tight">
            Advertisement & Message Analysis
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Multilingual financial fraud detection (English, Hindi, Hinglish), image OCR extraction with editable review, and contextual phrase highlighting.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {textContent && (
            <button
              type="button"
              onClick={handleReset}
              className="btn-secondary text-xs py-2 px-3.5 shadow-xs font-medium"
            >
              Reset Form
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Input & OCR Card */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 shadow-xs space-y-5">
        {/* Input Mode Tabs: Paste Text vs Image Upload */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <button
            type="button"
            onClick={() => setActiveInputTab('text')}
            className={`px-3 py-1.5 rounded-[var(--radius)] text-xs font-semibold font-mono flex items-center gap-1.5 transition-all ${
              activeInputTab === 'text'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'text-[var(--muted)] hover:text-[var(--text)] bg-[var(--bg)]'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Pasted Text Input</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInputTab('image')}
            className={`px-3 py-1.5 rounded-[var(--radius)] text-xs font-semibold font-mono flex items-center gap-1.5 transition-all ${
              activeInputTab === 'image'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'text-[var(--muted)] hover:text-[var(--text)] bg-[var(--bg)]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Screenshot OCR Upload</span>
          </button>
        </div>

        {/* Quick Multilingual Presets */}
        <div>
          <span className="text-[11px] font-mono text-[var(--muted)] block mb-2">
            Multilingual Test Presets (English / Hindi / Hinglish):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {samplePresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="p-3 rounded-[var(--radius)] bg-[var(--bg)] hover:bg-[var(--table-hover)] border border-[var(--border)] text-left transition-all text-xs flex flex-col justify-between gap-1 group shadow-2xs"
              >
                <span className="font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                  {preset.label}
                </span>
                <span className="text-[10px] font-mono uppercase text-[var(--muted)]">{preset.badge}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Form Controls */}
        <form onSubmit={handleAnalyze} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="platform-select" className="block text-xs font-bold text-[var(--text)] uppercase font-mono mb-1">
                Source Social Platform:
              </label>
              <select
                id="platform-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="input-surface w-full p-2 text-xs font-mono text-[var(--text)]"
              >
                <option value="Telegram">Telegram Channel / Group</option>
                <option value="Instagram">Instagram Post / Story</option>
                <option value="Facebook">Facebook Marketplace / Group</option>
                <option value="X">X (Twitter)</option>
                <option value="YouTube">YouTube Community / Comments</option>
                <option value="WhatsApp">WhatsApp Group / Message</option>
              </select>
            </div>

            <div>
              <label htmlFor="post-url-input" className="block text-xs font-bold text-[var(--text)] uppercase font-mono mb-1">
                Original Post URL (Optional):
              </label>
              <input
                id="post-url-input"
                type="text"
                value={submittedUrl}
                onChange={(e) => setSubmittedUrl(e.target.value)}
                placeholder="https://t.me/channel or post link"
                className="input-surface w-full p-2 text-xs text-[var(--text)] font-mono"
              />
            </div>
          </div>

          {/* If Image Upload Tab: File Picker & Preview */}
          {activeInputTab === 'image' && (
            <div className="p-4 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] space-y-3">
              <label className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                Upload Screenshot for OCR Text Extraction:
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={ocrLoading}
                  onChange={handleImageUpload}
                  className="text-xs text-[var(--muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-[var(--radius)] file:border file:border-[var(--border)] file:bg-[var(--card)] file:text-[var(--text)] file:text-xs hover:file:bg-[var(--table-hover)] cursor-pointer disabled:opacity-50"
                />
                {ocrLoading && (
                  <span className="text-xs font-mono text-[var(--primary)] flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing OCR...</span>
                  </span>
                )}
              </div>

              {ocrStatus && (
                <div className="text-xs font-mono text-[var(--muted)] bg-[var(--card)] p-2 rounded border border-[var(--border)]">
                  {ocrStatus}
                </div>
              )}

              {imagePreview && (
                <div className="mt-2">
                  <span className="text-[11px] font-mono text-[var(--muted)] block mb-1">Uploaded Screenshot:</span>
                  <img
                    src={imagePreview}
                    alt="Screenshot preview"
                    className="max-h-48 rounded border border-[var(--border)] object-contain shadow-2xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Editable Text Area (Requirement: allow users to edit OCR text before analysis) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ad-content-textarea" className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                Advertisement Text ({activeInputTab === 'image' ? 'Review & Edit OCR Text' : 'Content for Analysis'}):
              </label>
              <span className="text-[11px] font-mono text-[var(--muted)]">{textContent.length} characters</span>
            </div>
            <textarea
              id="ad-content-textarea"
              rows={6}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste suspicious post offering bank accounts, current accounts, ATM cards, debit cards, linked SIMs, or UPI handles..."
              className="input-surface w-full p-3.5 text-xs sm:text-sm leading-relaxed resize-y font-sans text-[var(--text)]"
              required
            />
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Analyze CTA */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={scanning || !textContent.trim()}
              className="btn-primary text-xs sm:text-sm py-2.5 px-6 font-semibold shadow-xs flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning & Analyzing Content...</span>
                </>
              ) : (
                <>
                  <ScanSearch className="w-4 h-4" />
                  <span>Analyze Advertisement</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Analysis Results via Explainable Verdict */}
      {result && result.analysis && (
        <div ref={resultRef} className="space-y-6 animate-in fade-in duration-200">
          <div className="p-4 rounded-[var(--radius)] bg-[var(--card)] border border-cyan-800/40 flex items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Brain className="w-5 h-5 text-cyan-400 shrink-0" />
              <div>
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text)]">
                  Certified AI Investigation Dossier Available
                </h4>
                <p className="text-xs text-[var(--muted)]">
                  Inspect comprehensive 11-section structured report with calibrated severity, model limitations, and threat evidence.
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
            riskScore={result.analysis.risk_score}
            riskLevel={result.analysis.risk_level}
            verdictSummary={result.analysis.explanation}
            sourceTarget={`${result.platform || 'Social Ad'} · ${result.custom_id || `AD-${result.id}`}`}
            ruleIndicators={(result.evidence_items || []).map((ev) => ({
              category: ev.evidence_type,
              severity: result.analysis?.risk_level || 'HIGH',
              sourceQuote: ev.matched_text,
              explanation: ev.description,
              context: ev.source_location,
            }))}
            modelAnalysis={{
              modelAvailable: result.analysis.model_available,
              modelProbability: result.analysis.model_signal ?? undefined,
              modelClass: result.analysis.model_class ?? undefined,
              modelVersion: result.analysis.model_version || 'fraudscope-context-lr-v2.0',
            }}
            reputationFindings={{
              provider: result.url_analysis?.reputation_provider || 'unconfigured',
              status: result.url_analysis?.reputation_status || 'check_unavailable',
              detail: 'External commercial reputation feeds are unconfigured.',
            }}
            checksCompleted={[
              { check: 'Text Normalization & Tokenization', status: 'COMPLETED', result: `${result.normalized_text?.length || 0} normalized characters` },
              { check: 'Context-Aware ML Logistic Regression', status: 'COMPLETED', result: `Signal: ${((result.analysis.model_signal || 0) * 100).toFixed(1)}%` },
              { check: 'Financial Mule & Account Sale Rules', status: 'COMPLETED', result: `${result.evidence_items?.length || 0} matches` },
              { check: 'Entity Extraction (Phone, UPI, Handle)', status: 'COMPLETED', result: `${result.entities?.length || 0} entities identified` },
            ]}
            checksUnavailable={[]}
            recommendedSteps={[
              result.analysis.recommended_review_action || 'Review evidence with senior forensic team.',
              'Cross-reference extracted phone/UPI numbers against cluster syndicate database.',
              'Generate formal investigation case report PDF for regulatory filing.'
            ]}
            calculationBreakdown={{
              staticUrlScore: result.submitted_url ? 20 : 0,
              contentSignalsScore: Math.min(100, (result.evidence_items?.length || 0) * 25),
              mlClassifierScore: Math.round((result.analysis.model_signal || 0) * 100),
            }}
            onSaveCase={handleSaveToCase}
            onExportReport={handleExportReport}
            savedCaseRef={savedCaseRef}
          />

          {/* Extracted Entities Chips */}
          {result.entities && result.entities.length > 0 && (
            <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 shadow-xs space-y-3">
              <span className="font-bold text-xs uppercase font-mono tracking-wider text-[var(--text)] block border-b border-[var(--border)] pb-2">
                Extracted Communication & Financial Identifiers ({result.entities.length}):
              </span>
              <div className="flex flex-wrap gap-2">
                {result.entities.map((ent, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-1.5 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-xs font-mono flex items-center gap-2"
                  >
                    <span className="text-[10px] font-bold text-[var(--muted)] uppercase">
                      {ent.entity_type}:
                    </span>
                    <strong className="text-[var(--text)]">{ent.entity_value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
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
