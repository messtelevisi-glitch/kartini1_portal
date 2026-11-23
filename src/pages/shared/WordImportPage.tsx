import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Upload } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';
import { parseWordDocument, type ParsedWordQuestion, type WordParseReport } from '../../utils/wordParser';
import type { QuestionType, SubjectItem } from '../../types/exam';

export function WordImportPage() {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subjectId, setSubjectId] = useState<number>(0);
  const [classLevel, setClassLevel] = useState('8');
  const [semester, setSemester] = useState('Ganjil');
  const [academicYear, setAcademicYear] = useState('2026/2027');

  const [report, setReport] = useState<WordParseReport | null>(null);
  const [editableItems, setEditableItems] = useState<ParsedWordQuestion[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    apiRequest<SubjectItem[]>('/api/subjects')
      .then((rows) => {
        setSubjects(rows);
        if (rows.length > 0) setSubjectId(rows[0].id);
      })
      .catch(() => {});
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseWordDocument(file);
      setReport(parsed);
      setEditableItems(parsed.questions);
      if (parsed.totalDetected === 0) {
        showToast('warning', 'No questions detected', 'Review the expected Word template structure.');
      } else {
        showToast(
          'info',
          'Document parsed for review',
          `${parsed.totalDetected} questions detected. Review and edit before saving.`
        );
      }
    } catch (err: any) {
      showToast('error', 'Word parsing failed', err.message);
      setReport(null);
      setEditableItems([]);
    } finally {
      e.target.value = '';
    }
  };

  const updateItem = (idx: number, patch: Partial<ParsedWordQuestion>) => {
    setEditableItems((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleConfirmImport = async () => {
    if (!subjectId || editableItems.length === 0) return;
    setImporting(true);
    try {
      const items = editableItems.map((q) => ({
        subjectId,
        classLevel,
        semester,
        academicYear,
        topic: 'Word Import',
        difficulty: 'medium' as const,
        questionType: q.questionType,
        questionText: q.questionText,
        points: q.points || 5,
        partialCredit: false,
        options: q.options.map((o, i) => ({ ...o, sortOrder: i })),
        matchingPairs: q.matchingPairs.map((m, i) => ({ ...m, sortOrder: i })),
        media: [],
      }));

      const res = await apiRequest<{ importedCount: number }>('/api/questions/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ subjectId, items }),
      });

      showToast(
        'success',
        'Word questions imported',
        `${res.importedCount} question(s) added to your Question Bank.`
      );
      setReport(null);
      setEditableItems([]);
    } catch (err: any) {
      showToast('error', 'Import failed', err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <PortalLayout
      pageTitle="Import Questions from Word"
      pageSubtitle="Upload .DOCX files, inspect detected question types, edit in preview, and confirm save to Bank Soal"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload & Configuration Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-[#243B64]">1. Upload & Target Metadata</h2>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Grade Level</label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="7">Grade 7</option>
                <option value="8">Grade 8</option>
                <option value="9">Grade 9</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </div>
          </div>

          <label className="block border-2 border-dashed border-slate-300 hover:border-[#376FA6] rounded-xl p-6 text-center cursor-pointer transition-colors bg-[#FAFBFD]">
            <Upload className="w-7 h-7 text-[#376FA6] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#243B64]">Select .DOCX File</p>
            <p className="text-xs text-slate-500 mt-1">
              Legacy .DOC files must be saved as .DOCX before uploading.
            </p>
            <input type="file" accept=".docx,.doc" onChange={handleFileSelect} className="hidden" />
          </label>

          <div className="p-3.5 rounded-lg bg-[#F1F4F8] text-xs text-slate-700 space-y-1.5">
            <p className="font-semibold text-[#243B64]">Supported Word Structure:</p>
            <pre className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-slate-600">
{`QUESTION 1
What is the capital city of Indonesia?
A. Bandung
B. Jakarta
C. Surabaya
D. Medan
ANSWER: B
TYPE: MULTIPLE_CHOICE
POINT: 5`}
            </pre>
          </div>
        </div>

        {/* Editable Preview Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!report ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-800">No Word document parsed yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Upload a structured .DOCX file on the left. Questions are never saved automatically until you review and confirm them here.
              </p>
            </div>
          ) : (
            <>
              {/* Diagnostics Summary */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    {report.validCount} Ready
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    {report.needsCorrectionCount} Needs Review
                  </span>
                  <span className="text-slate-600 tabular-nums">
                    Total Detected: {report.totalDetected}
                  </span>
                  {report.embeddedImageCount > 0 && (
                    <span className="text-amber-700 font-medium">
                      {report.embeddedImageCount} embedded image(s) detected — upload media in Question Bank
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={importing || editableItems.length === 0}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg disabled:opacity-50 whitespace-nowrap"
                >
                  {importing
                    ? 'Saving Questions...'
                    : `Confirm & Import (${editableItems.length})`}
                </button>
              </div>

              {report.errors.length > 0 && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
                  {report.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}

              {/* Editable Preview Cards */}
              <div className="space-y-3">
                {editableItems.map((item, idx) => (
                  <div
                    key={item.tempId}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#243B64]">
                        QUESTION {item.questionNumber}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={item.questionType}
                          onChange={(e) =>
                            updateItem(idx, { questionType: e.target.value as QuestionType })
                          }
                          className="px-2 py-1 text-xs border border-slate-200 rounded-md"
                        >
                          <option value="MULTIPLE_CHOICE">MULTIPLE_CHOICE</option>
                          <option value="MULTIPLE_RESPONSE">MULTIPLE_RESPONSE</option>
                          <option value="TRUE_FALSE">TRUE_FALSE</option>
                          <option value="MATCHING">MATCHING</option>
                          <option value="ESSAY">ESSAY</option>
                        </select>
                        <input
                          type="number"
                          value={item.points}
                          onChange={(e) => updateItem(idx, { points: Number(e.target.value) })}
                          className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-md font-mono"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditableItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {item.warnings.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        {item.warnings.join(' ')}
                      </div>
                    )}

                    <textarea
                      rows={2}
                      value={item.questionText}
                      onChange={(e) => updateItem(idx, { questionText: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />

                    {item.options.length > 0 && (
                      <div className="space-y-1.5">
                        {item.options.map((opt, oIdx) => (
                          <div key={opt.optionKey} className="flex items-center gap-2">
                            <input
                              type={item.questionType === 'MULTIPLE_RESPONSE' ? 'checkbox' : 'radio'}
                              checked={opt.isCorrect}
                              onChange={(e) => {
                                const nextOpts = item.options.map((o, oi) =>
                                  item.questionType === 'MULTIPLE_RESPONSE'
                                    ? oi === oIdx
                                      ? { ...o, isCorrect: e.target.checked }
                                      : o
                                    : { ...o, isCorrect: oi === oIdx }
                                );
                                updateItem(idx, { options: nextOpts });
                              }}
                            />
                            <span className="font-mono text-xs font-semibold w-5">
                              {opt.optionKey}.
                            </span>
                            <input
                              type="text"
                              value={opt.optionText}
                              onChange={(e) => {
                                const nextOpts = item.options.map((o, oi) =>
                                  oi === oIdx ? { ...o, optionText: e.target.value } : o
                                );
                                updateItem(idx, { options: nextOpts });
                              }}
                              className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {item.matchingPairs.length > 0 && (
                      <div className="space-y-1.5">
                        {item.matchingPairs.map((pair, pIdx) => (
                          <div key={pIdx} className="grid grid-cols-2 gap-2 text-xs">
                            <input
                              type="text"
                              value={pair.promptText}
                              onChange={(e) => {
                                const next = item.matchingPairs.map((m, mi) =>
                                  mi === pIdx ? { ...m, promptText: e.target.value } : m
                                );
                                updateItem(idx, { matchingPairs: next });
                              }}
                              className="px-2.5 py-1 border border-slate-200 rounded"
                            />
                            <input
                              type="text"
                              value={pair.matchText}
                              onChange={(e) => {
                                const next = item.matchingPairs.map((m, mi) =>
                                  mi === pIdx ? { ...m, matchText: e.target.value } : m
                                );
                                updateItem(idx, { matchingPairs: next });
                              }}
                              className="px-2.5 py-1 border border-slate-200 rounded"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
