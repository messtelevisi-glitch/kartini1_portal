import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest, assetUrl } from '../../services/api';
import type { StudentItem } from '../../types/exam';

interface AdmissionCardRow {
  id: number;
  studentId: number;
  participantNumber: string;
  academicYear: string;
  semester: string;
  sessionLabel: string;
  qrPayload: string;
  cardWidthMm: number;
  cardHeightMm: number;
  paperSize: string;
  student: StudentItem | null;
}

export function AdmissionCardsPage() {
  const { showToast } = useToast();
  const [cards, setCards] = useState<AdmissionCardRow[]>([]);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [classFilter, setClassFilter] = useState('ALL');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [semester, setSemester] = useState('Ganjil');
  const [sessionLabel, setSessionLabel] = useState('Sesi 1 — Ruang Utama');
  const [cardWidthMm, setCardWidthMm] = useState(95);
  const [cardHeightMm, setCardHeightMm] = useState(60);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4' | 'Letter'>('A4');
  const [generating, setGenerating] = useState(false);

  const loadCards = useCallback(async () => {
    try {
      const data = await apiRequest<AdmissionCardRow[]>('/api/admission-cards');
      setCards(data);
      const qrs: Record<string, string> = {};
      for (const c of data) {
        qrs[c.participantNumber] = await QRCode.toDataURL(c.qrPayload, {
          margin: 1,
          width: 140,
          color: { dark: '#243B64', light: '#FFFFFF' },
        });
      }
      setQrDataUrls(qrs);
    } catch (err: any) {
      showToast('error', 'Failed to load admission cards', err.message);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      await apiRequest('/api/admission-cards/generate', {
        method: 'POST',
        body: JSON.stringify({
          academicYear,
          semester,
          sessionLabel,
          cardWidthMm: Number(cardWidthMm),
          cardHeightMm: Number(cardHeightMm),
          paperSize,
        }),
      });
      showToast('success', 'Admission cards generated', 'QR codes and TKA dimensions updated.');
      await loadCards();
    } catch (err: any) {
      showToast('error', 'Generation failed', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const classes = ['ALL', ...Array.from(new Set(cards.map((c) => c.student?.className).filter(Boolean) as string[])).sort()];
  const filtered =
    classFilter === 'ALL'
      ? cards
      : cards.filter((c) => c.student?.className === classFilter);

  const exportPdf = async (targetCards: AdmissionCardRow[]) => {
    if (targetCards.length === 0) return;
    const doc = new jsPDF({ unit: 'mm', format: paperSize === 'Letter' ? 'letter' : 'a4' });
    const w = Number(cardWidthMm);
    const h = Number(cardHeightMm);
    const margin = 10;
    const gap = 6;
    const cols = Math.max(1, Math.floor((210 - margin * 2 + gap) / (w + gap)));

    let x = margin;
    let y = margin;
    let col = 0;

    for (const c of targetCards) {
      if (y + h > 285) {
        doc.addPage();
        x = margin;
        y = margin;
        col = 0;
      }

      doc.setDrawColor(36, 59, 100);
      doc.setLineWidth(0.35);
      doc.rect(x, y, w, h);

      doc.setFillColor(36, 59, 100);
      doc.rect(x, y, w, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8.5);
      doc.text('KARTU PESERTA UJIAN — SMP KARTINI 1 BATAM', x + 4, y + 5.5);
      doc.setFontSize(7);
      doc.text(`Tahun Ajaran ${c.academicYear} · Semester ${c.semester}`, x + 4, y + 9.5);

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(`No. Peserta : ${c.participantNumber}`, x + 4, y + 19);
      doc.text(`Nama Siswa  : ${c.student?.fullName || '-'}`, x + 4, y + 25);
      doc.text(`NIS / NISN  : ${c.student?.nis || '-'} / ${c.student?.nisn || '-'}`, x + 4, y + 31);
      doc.text(`Kelas       : ${c.student?.className || '-'}`, x + 4, y + 37);
      doc.text(`Sesi        : ${c.sessionLabel}`, x + 4, y + 43);

      const qrUrl = qrDataUrls[c.participantNumber];
      if (qrUrl) {
        doc.addImage(qrUrl, 'PNG', x + w - 24, y + 16, 20, 20);
      }

      doc.setFontSize(6.5);
      doc.text('Kepala SMP Kartini 1 Batam', x + w - 34, y + h - 4);

      col += 1;
      if (col >= cols) {
        col = 0;
        x = margin;
        y += h + gap;
      } else {
        x += w + gap;
      }
    }

    doc.save(`kartu_peserta_tka_${classFilter}.pdf`);
  };

  return (
    <PortalLayout
      pageTitle="Kartu Peserta Ujian (TKA Format)"
      pageSubtitle="Configure customizable TKA admission card dimensions, generate QR verification codes, and print or export PDF"
      headerAction={
        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Layout</span>
          </button>
          <button
            type="button"
            onClick={() => void exportPdf(filtered)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      }
    >
      {/* Dimension & Generation Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 no-print space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Academic Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Card Width (mm)</label>
            <input
              type="number"
              min={60}
              max={210}
              value={cardWidthMm}
              onChange={(e) => setCardWidthMm(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Card Height (mm)</label>
            <input
              type="number"
              min={40}
              max={297}
              value={cardHeightMm}
              onChange={(e) => setCardHeightMm(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Paper Size</label>
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as 'A4' | 'F4' | 'Letter')}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            >
              <option value="A4">A4</option>
              <option value="F4">F4</option>
              <option value="Letter">Letter</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Filter Class</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            >
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'All Classes' : `Class ${c}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <label className="text-xs font-medium text-slate-700 whitespace-nowrap">Session:</label>
            <input
              type="text"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerateAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#376FA6] hover:bg-[#2b5b8a] rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{generating ? 'Generating...' : 'Generate / Sync All Student Cards'}</span>
          </button>
        </div>
      </div>

      {/* Cards Preview & Print Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-semibold text-slate-800">No admission cards generated yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Register students in Manajemen Siswa, then click "Generate / Sync All Student Cards" above.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {filtered.map((card) => (
            <div
              key={card.id}
              style={{ width: `${cardWidthMm}mm`, minHeight: `${cardHeightMm}mm` }}
              className="admission-card-sheet bg-white border border-[#243B64] rounded-md overflow-hidden flex flex-col justify-between shadow-xs"
            >
              {/* Formal Header */}
              <div className="bg-[#243B64] text-white px-3 py-2 flex items-center gap-2.5">
                <img
                  src={assetUrl('assets/aistudio/logoku_6b323412.png')}
                  alt="SMP Kartini 1 Batam Logo"
                  className="w-8 h-8 object-contain bg-white rounded-full p-0.5 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wider text-[#D7B56D] leading-tight">
                    KARTU PESERTA UJIAN
                  </p>
                  <p className="text-[11px] font-semibold leading-tight truncate">
                    SMP KARTINI 1 BATAM
                  </p>
                  <p className="text-[9px] text-slate-200 leading-tight">
                    TA {card.academicYear} · Semester {card.semester}
                  </p>
                </div>
                <img
                  src={assetUrl('assets/aistudio/LOGO_YKB_RESOLUSI_BESAR_d340cd5e.png')}
                  alt="YKB Logo"
                  className="w-7 h-7 object-contain bg-white/95 rounded p-0.5 shrink-0"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Body */}
              <div className="p-3 flex items-center justify-between gap-2 flex-1">
                <div className="text-[10px] space-y-1 text-slate-800 min-w-0">
                  <p>
                    <span className="text-slate-500">No. Peserta:</span>{' '}
                    <span className="font-mono font-bold text-[#243B64]">{card.participantNumber}</span>
                  </p>
                  <p className="truncate">
                    <span className="text-slate-500">Nama:</span>{' '}
                    <span className="font-semibold">{card.student?.fullName}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">NIS / NISN:</span>{' '}
                    <span className="font-mono">
                      {card.student?.nis || '-'} / {card.student?.nisn || '-'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Kelas:</span>{' '}
                    <span className="font-semibold">{card.student?.className}</span>
                  </p>
                  <p className="truncate">
                    <span className="text-slate-500">Sesi:</span> {card.sessionLabel}
                  </p>
                </div>

                {qrDataUrls[card.participantNumber] && (
                  <img
                    src={qrDataUrls[card.participantNumber]}
                    alt={`QR ${card.participantNumber}`}
                    className="w-16 h-16 shrink-0 border border-slate-200 rounded"
                  />
                )}
              </div>

              {/* Footer */}
              <div className="px-3 py-1.5 border-t border-slate-200 bg-[#FAFBFD] flex items-center justify-between text-[9px] text-slate-600">
                <button
                  type="button"
                  onClick={() => void exportPdf([card])}
                  className="text-[#376FA6] hover:underline no-print"
                >
                  Download PDF
                </button>
                <span className="ml-auto font-medium">Kepala SMP Kartini 1 Batam</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
