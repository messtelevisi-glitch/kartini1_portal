import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';

interface ScorePreviewRow {
  studentNumber: string;
  studentName: string;
  className: string;
  subjectName: string;
  examination: string;
  score: number;
  remarks: string;
}

interface ViolationPreviewRow {
  studentNumber: string;
  studentName: string;
  className: string;
  examination: string;
  violationType: string;
  violationCount: number;
  violationDate: string;
  remarks: string;
  status: string;
}

export function ImportScoresViolationsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'scores' | 'violations'>('scores');

  const [scoreFileName, setScoreFileName] = useState('');
  const [scoreRows, setScoreRows] = useState<ScorePreviewRow[]>([]);
  const [scoreReport, setScoreReport] = useState<{
    totalRows: number;
    successRows: number;
    failedRows: number;
    errors: string[];
  } | null>(null);

  const [violationRows, setViolationRows] = useState<ViolationPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);

  const downloadScoreTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Student Number': 'KRT-2026-001',
        'Student Name': 'Aulia Putri Pratama',
        Class: '8A',
        Subject: 'Bahasa Inggris',
        Examination: 'UAS Bahasa Inggris Kelas 8',
        Score: 88,
        Remarks: 'Passed',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scores');
    XLSX.writeFile(wb, 'kartini_import_scores_template.xlsx');
  };

  const downloadViolationTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Student Number': 'KRT-2026-001',
        'Student Name': 'Aulia Putri Pratama',
        Class: '8A',
        Examination: 'UAS Bahasa Inggris Kelas 8',
        'Violation Type': 'Tab Switching',
        'Violation Count': 2,
        'Violation Date': new Date().toISOString().slice(0, 10),
        Remarks: 'Recorded by proctor',
        Status: 'Recorded',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Violations');
    XLSX.writeFile(wb, 'kartini_import_violations_template.xlsx');
  };

  const handleScoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const parsed: ScorePreviewRow[] = raw.map((r) => ({
        studentNumber: String(r['Student Number'] || r.studentNumber || '').trim(),
        studentName: String(r['Student Name'] || r.studentName || '').trim(),
        className: String(r['Class'] || r.className || '').trim(),
        subjectName: String(r['Subject'] || r.subjectName || '').trim(),
        examination: String(r['Examination'] || r.examination || '').trim(),
        score: Number(r['Score'] || r.score || 0),
        remarks: String(r['Remarks'] || r.remarks || ''),
      }));
      setScoreFileName(file.name);
      setScoreRows(parsed);
      setScoreReport(null);
    } catch {
      showToast('error', 'Failed to read spreadsheet');
    } finally {
      e.target.value = '';
    }
  };

  const handleViolationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const parsed: ViolationPreviewRow[] = raw.map((r) => ({
        studentNumber: String(r['Student Number'] || '').trim(),
        studentName: String(r['Student Name'] || '').trim(),
        className: String(r['Class'] || '').trim(),
        examination: String(r['Examination'] || '').trim(),
        violationType: String(r['Violation Type'] || '').trim(),
        violationCount: Number(r['Violation Count'] || 1),
        violationDate: String(r['Violation Date'] || new Date().toISOString().slice(0, 10)),
        remarks: String(r['Remarks'] || ''),
        status: String(r['Status'] || 'Recorded'),
      }));
      setViolationRows(parsed);
    } catch {
      showToast('error', 'Failed to read violation spreadsheet');
    } finally {
      e.target.value = '';
    }
  };

  const confirmScoreImport = async () => {
    setImporting(true);
    try {
      const res = await apiRequest<{
        totalRows: number;
        successRows: number;
        failedRows: number;
        errors: string[];
      }>('/api/imports/scores', {
        method: 'POST',
        body: JSON.stringify({ fileName: scoreFileName, rows: scoreRows }),
      });
      setScoreReport(res);
      showToast('success', 'Score import completed', `${res.successRows} saved, ${res.failedRows} failed.`);
    } catch (err: any) {
      showToast('error', 'Import failed', err.message);
    } finally {
      setImporting(false);
    }
  };

  const confirmViolationImport = async () => {
    setImporting(true);
    try {
      const res = await apiRequest<{ imported: number }>('/api/imports/violations', {
        method: 'POST',
        body: JSON.stringify({ rows: violationRows }),
      });
      showToast('success', 'Violations imported', `${res.imported} records added with audit trail.`);
      setViolationRows([]);
    } catch (err: any) {
      showToast('error', 'Import failed', err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <PortalLayout
      pageTitle="Impor Nilai & Data Pelanggaran"
      pageSubtitle="Validate, preview, and import examination scores or disciplinary records from XLSX/CSV"
    >
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-6">
        <button
          type="button"
          onClick={() => setTab('scores')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            tab === 'scores' ? 'bg-white text-[#243B64] shadow-sm' : 'text-slate-600'
          }`}
        >
          Import Scores
        </button>
        <button
          type="button"
          onClick={() => setTab('violations')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            tab === 'violations' ? 'bg-white text-[#243B64] shadow-sm' : 'text-slate-600'
          }`}
        >
          Import Violations
        </button>
      </div>

      {tab === 'scores' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#243B64]">Import Examination Scores (.XLSX / .CSV)</h2>
              <p className="text-xs text-slate-500">
                Teachers can only import scores for subjects assigned to their profile.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadScoreTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Template</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Spreadsheet</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleScoreFile} className="hidden" />
              </label>
            </div>
          </div>

          {scoreRows.length > 0 && (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F1F4F8] text-[#243B64]">
                    <tr>
                      <th className="px-3 py-2">Student No.</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Class</th>
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2">Examination</th>
                      <th className="px-3 py-2 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scoreRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono">{r.studentNumber}</td>
                        <td className="px-3 py-2">{r.studentName}</td>
                        <td className="px-3 py-2">{r.className}</td>
                        <td className="px-3 py-2">{r.subjectName}</td>
                        <td className="px-3 py-2">{r.examination}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{r.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={importing}
                  onClick={confirmScoreImport}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#376FA6] hover:bg-[#2b5b8a] rounded-lg"
                >
                  {importing ? 'Importing...' : `Confirm Import (${scoreRows.length} rows)`}
                </button>
              </div>
            </div>
          )}

          {scoreReport && (
            <div className="p-4 rounded-xl bg-[#FAFBFD] border border-slate-200 text-xs space-y-2">
              <p className="font-semibold text-[#243B64]">
                Import Report: {scoreReport.successRows} succeeded · {scoreReport.failedRows} failed
              </p>
              {scoreReport.errors.length > 0 && (
                <ul className="list-disc pl-5 text-red-700 space-y-0.5">
                  {scoreReport.errors.map((er, i) => (
                    <li key={i}>{er}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#243B64]">Import Violation Records (.XLSX / .CSV)</h2>
              <p className="text-xs text-slate-500">
                All imported violation logs preserve an audit trail linked to your staff account.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadViolationTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Template</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Spreadsheet</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleViolationFile} className="hidden" />
              </label>
            </div>
          </div>

          {violationRows.length > 0 && (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F1F4F8] text-[#243B64]">
                    <tr>
                      <th className="px-3 py-2">Student No.</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Class</th>
                      <th className="px-3 py-2">Violation Type</th>
                      <th className="px-3 py-2 text-right">Count</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {violationRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono">{r.studentNumber}</td>
                        <td className="px-3 py-2">{r.studentName}</td>
                        <td className="px-3 py-2">{r.className}</td>
                        <td className="px-3 py-2">{r.violationType}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.violationCount}</td>
                        <td className="px-3 py-2">{r.violationDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={importing}
                  onClick={confirmViolationImport}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#376FA6] rounded-lg"
                >
                  {importing ? 'Importing...' : `Confirm Import (${violationRows.length} rows)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
