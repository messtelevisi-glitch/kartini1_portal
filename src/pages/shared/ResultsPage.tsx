import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { Download, FileSpreadsheet, PenLine } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';

interface ExamResultRow {
  id: number;
  attemptId: number | null;
  examId: number;
  examTitle: string;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  studentNumber: string;
  studentName: string;
  className: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  pendingEssayCount: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  gradingStatus: string;
  durationSeconds: number;
  submittedAt: string;
}

interface AnswerForGrading {
  id: number;
  questionId: number;
  essayText: string | null;
  pointsEarned: number;
  graderNotes: string | null;
  question: {
    id: number;
    questionType: string;
    questionText: string;
    points: number;
  } | null;
}

export function ResultsPage() {
  const { showToast } = useToast();
  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState('ALL');

  const [gradingTarget, setGradingTarget] = useState<ExamResultRow | null>(null);
  const [essayAnswers, setEssayAnswers] = useState<AnswerForGrading[]>([]);
  const [savingGrades, setSavingGrades] = useState(false);

  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<ExamResultRow[]>('/api/results');
      setResults(data);
    } catch (err: any) {
      showToast('error', 'Failed to load results', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const openEssayGrading = async (row: ExamResultRow) => {
    if (!row.attemptId) {
      showToast('info', 'Imported score record has no essay text to grade.');
      return;
    }
    setGradingTarget(row);
    try {
      const answers = await apiRequest<AnswerForGrading[]>(`/api/results/${row.attemptId}/answers`);
      setEssayAnswers(answers.filter((a) => a.question?.questionType === 'ESSAY'));
    } catch (err: any) {
      showToast('error', 'Failed to load essay responses', err.message);
    }
  };

  const handleSaveEssayGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingTarget?.attemptId) return;
    setSavingGrades(true);
    try {
      await apiRequest(`/api/results/${gradingTarget.attemptId}/grade-essay`, {
        method: 'POST',
        body: JSON.stringify({
          grades: essayAnswers.map((a) => ({
            answerId: a.id,
            pointsEarned: Number(a.pointsEarned || 0),
            graderNotes: a.graderNotes || '',
          })),
        }),
      });
      showToast('success', 'Essay grades saved and total score updated');
      setGradingTarget(null);
      await loadResults();
    } catch (err: any) {
      showToast('error', 'Grading failed', err.message);
    } finally {
      setSavingGrades(false);
    }
  };

  const subjectNames = ['ALL', ...Array.from(new Set(results.map((r) => r.subjectName).filter(Boolean)))];
  const filtered =
    subjectFilter === 'ALL' ? results : results.filter((r) => r.subjectName === subjectFilter);

  const avg =
    filtered.length > 0
      ? (filtered.reduce((s, r) => s + r.percentage, 0) / filtered.length).toFixed(1)
      : '0.0';
  const highest =
    filtered.length > 0 ? Math.max(...filtered.map((r) => r.percentage)).toFixed(1) : '0.0';
  const lowest =
    filtered.length > 0 ? Math.min(...filtered.map((r) => r.percentage)).toFixed(1) : '0.0';

  const distribution = [
    { range: '0–49', count: filtered.filter((r) => r.percentage < 50).length },
    { range: '50–69', count: filtered.filter((r) => r.percentage >= 50 && r.percentage < 70).length },
    { range: '70–84', count: filtered.filter((r) => r.percentage >= 70 && r.percentage < 85).length },
    { range: '85–100', count: filtered.filter((r) => r.percentage >= 85).length },
  ];

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r) => ({
        'Participant No.': r.studentNumber,
        'Student Name': r.studentName,
        Class: r.className,
        Subject: r.subjectName,
        Examination: r.examTitle,
        'Total Questions': r.totalQuestions,
        Correct: r.correctCount,
        Wrong: r.wrongCount,
        Score: r.totalScore,
        'Max Score': r.maxScore,
        'Final (%)': r.percentage,
        Status: r.gradingStatus,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exam Results');
    XLSX.writeFile(wb, `kartini_exam_results_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('SMP KARTINI 1 BATAM — EXAMINATION RESULTS REPORT', 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} | Average: ${avg}% | High: ${highest}% | Low: ${lowest}%`, 14, 25);

    let y = 34;
    doc.setFontSize(9);
    doc.text('No. Peserta | Nama Siswa | Kelas | Mapel | Nilai (%) | Status', 14, y);
    y += 6;
    for (const r of filtered.slice(0, 40)) {
      doc.text(
        `${r.studentNumber} | ${r.studentName.slice(0, 24)} | ${r.className} | ${r.subjectCode} | ${r.percentage}% | ${r.gradingStatus}`,
        14,
        y
      );
      y += 6;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    }
    doc.save(`kartini_exam_results_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const columns: ColumnDef<ExamResultRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <p className="font-semibold text-[#243B64]">{r.studentName}</p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {r.studentNumber} · {r.className}
          </p>
        </div>
      ),
    },
    {
      key: 'exam',
      header: 'Subject & Exam',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.examTitle}</p>
          <p className="text-xs text-slate-500">{r.subjectName}</p>
        </div>
      ),
    },
    {
      key: 'breakdown',
      header: 'Correct / Wrong',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          {r.correctCount} / {r.wrongCount} ({r.totalQuestions})
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Final Score',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-sm font-bold text-[#243B64] tabular-nums">
          {r.percentage}%
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Grading Status',
      render: (r) => (
        <span
          className={`text-xs font-semibold ${
            r.gradingStatus === 'Pending Grading' ? 'text-amber-700' : 'text-emerald-700'
          }`}
        >
          {r.gradingStatus}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        r.attemptId ? (
          <button
            type="button"
            onClick={() => openEssayGrading(r)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#376FA6] hover:underline"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Grade Essay</span>
          </button>
        ) : (
          <span className="text-xs text-slate-400">Imported</span>
        ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Hasil & Rekap Nilai"
      pageSubtitle="Confidential staff-only examination results, essay grading, and class statistics"
      headerAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Class Average</p>
            <p className="text-2xl font-bold text-[#243B64] mt-1 tabular-nums">{avg}%</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Highest Score</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{highest}%</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Lowest Score</p>
            <p className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">{lowest}%</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#243B64] mb-3">Score Distribution</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Students" fill="#376FA6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search student name or examination..."
        searchFilter={(r, q) =>
          r.studentName.toLowerCase().includes(q) ||
          r.studentNumber.toLowerCase().includes(q) ||
          r.examTitle.toLowerCase().includes(q)
        }
        toolbarExtra={
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg"
          >
            {subjectNames.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All Subjects' : s}
              </option>
            ))}
          </select>
        }
        emptyTitle="No examination results yet"
        emptyDescription="Submitted exam attempts and imported score sheets will appear here for authorized staff."
      />

      <Modal
        open={Boolean(gradingTarget)}
        onClose={() => setGradingTarget(null)}
        title={`Manual Essay Grading — ${gradingTarget?.studentName || ''}`}
        subtitle={gradingTarget?.examTitle}
        maxWidthClass="max-w-2xl"
      >
        <form id="essay-grade-form" onSubmit={handleSaveEssayGrades} className="space-y-4">
          {essayAnswers.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              This attempt has no essay questions.
            </p>
          ) : (
            essayAnswers.map((ans, idx) => (
              <div key={ans.id} className="p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-semibold text-[#243B64]">
                    Essay {idx + 1}: {ans.question?.questionText}
                  </p>
                  <span className="font-mono text-xs text-slate-500 shrink-0">
                    Max {ans.question?.points} pts
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#FAFBFD] border border-slate-100 text-sm text-slate-800 whitespace-pre-wrap">
                  {ans.essayText || '(No response submitted)'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Awarded Score
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={ans.question?.points || 100}
                      value={ans.pointsEarned}
                      onChange={(e) =>
                        setEssayAnswers((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, pointsEarned: Number(e.target.value) } : x
                          )
                        )
                      }
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Examiner Notes
                    </label>
                    <input
                      type="text"
                      value={ans.graderNotes || ''}
                      onChange={(e) =>
                        setEssayAnswers((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, graderNotes: e.target.value } : x
                          )
                        )
                      }
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </form>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setGradingTarget(null)}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg"
          >
            Close
          </button>
          {essayAnswers.length > 0 && (
            <button
              type="submit"
              form="essay-grade-form"
              disabled={savingGrades}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
            >
              {savingGrades ? 'Saving...' : 'Save Essay Grades'}
            </button>
          )}
        </div>
      </Modal>
    </PortalLayout>
  );
}
