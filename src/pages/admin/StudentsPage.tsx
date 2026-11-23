import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';
import type { StudentItem } from '../../types/exam';

export function StudentsPage() {
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentItem | null>(null);
  const [studentNumber, setStudentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [className, setClassName] = useState('8A');
  const [nis, setNis] = useState('');
  const [nisn, setNisn] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StudentItem | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiRequest<StudentItem[]>('/api/students');
      setStudents(rows);
    } catch (err: any) {
      showToast('error', 'Failed to load students', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const openCreate = () => {
    setEditing(null);
    setStudentNumber(`KRT-${new Date().getFullYear()}-${String(students.length + 1).padStart(3, '0')}`);
    setFullName('');
    setClassName('8A');
    setNis('');
    setNisn('');
    setGender('L');
    setModalOpen(true);
  };

  const openEdit = (st: StudentItem) => {
    setEditing(st);
    setStudentNumber(st.studentNumber);
    setFullName(st.fullName);
    setClassName(st.className);
    setNis(st.nis || '');
    setNisn(st.nisn || '');
    setGender(st.gender === 'P' ? 'P' : 'L');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/students/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ studentNumber, fullName, className, nis: nis || null, nisn: nisn || null, gender }),
        });
        showToast('success', 'Student updated', fullName);
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify({ studentNumber, fullName, className, nis, nisn, gender }),
        });
        showToast('success', 'Student added', `${fullName} (${studentNumber})`);
      }
      setModalOpen(false);
      await loadStudents();
    } catch (err: any) {
      showToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/students/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('success', 'Student removed');
      setDeleteTarget(null);
      await loadStudents();
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Student Number': 'KRT-2026-001',
        'Student Name': 'Aulia Putri Pratama',
        Class: '8A',
        NIS: '2401001',
        NISN: '0112345678',
        Gender: 'P',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'kartini_students_template.xlsx');
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const rows = raw
        .map((r) => ({
          studentNumber: String(r['Student Number'] || r['Nomor Peserta'] || r.studentNumber || '').trim(),
          fullName: String(r['Student Name'] || r['Nama Siswa'] || r.fullName || '').trim(),
          className: String(r['Class'] || r['Kelas'] || r.className || '').trim(),
          nis: r['NIS'] ? String(r['NIS']) : undefined,
          nisn: r['NISN'] ? String(r['NISN']) : undefined,
          gender: r['Gender'] ? String(r['Gender']) : 'L',
        }))
        .filter((r) => r.studentNumber && r.fullName && r.className);

      if (rows.length === 0) {
        showToast('warning', 'No valid student rows found in file');
        return;
      }
      const res = await apiRequest<{ imported: number }>('/api/students/bulk', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      showToast('success', 'Student roster imported', `${res.imported} student(s) saved.`);
      await loadStudents();
    } catch (err: any) {
      showToast('error', 'Import failed', err.message);
    } finally {
      e.target.value = '';
    }
  };

  const classOptions = ['ALL', ...Array.from(new Set(students.map((s) => s.className))).sort()];
  const filtered = classFilter === 'ALL' ? students : students.filter((s) => s.className === classFilter);

  const columns: ColumnDef<StudentItem>[] = [
    {
      key: 'studentNumber',
      header: 'Participant No.',
      render: (s) => <span className="font-mono text-xs font-semibold text-[#243B64] tabular-nums">{s.studentNumber}</span>,
    },
    {
      key: 'fullName',
      header: 'Student Name',
      render: (s) => <span className="font-medium text-slate-900">{s.fullName}</span>,
    },
    {
      key: 'className',
      header: 'Class',
      render: (s) => <span className="font-medium text-[#376FA6]">{s.className}</span>,
    },
    {
      key: 'nisn',
      header: 'NIS / NISN',
      render: (s) => (
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {s.nis || '-'} / {s.nisn || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(s)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(s)}
            className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Manajemen Siswa"
      pageSubtitle="Manage participant identities, classes, and bulk Excel student rosters"
      headerAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Template</span>
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#243B64] bg-[#EAF3FA] hover:bg-[#dcebf7] rounded-lg cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            <span>Import XLSX</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} className="hidden" />
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        keyField={(s) => s.id}
        loading={loading}
        searchPlaceholder="Search by participant number, name, or NISN..."
        searchFilter={(s, q) =>
          s.fullName.toLowerCase().includes(q) ||
          s.studentNumber.toLowerCase().includes(q) ||
          (s.nisn || '').includes(q)
        }
        toolbarExtra={
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg"
          >
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Classes' : `Class ${c}`}
              </option>
            ))}
          </select>
        }
        emptyTitle="No students registered"
        emptyDescription="Add students manually or import a class roster spreadsheet (.XLSX / .CSV)."
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Student Record' : 'Register Student Participant'}
      >
        <form id="student-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Participant Number</label>
              <input
                type="text"
                required
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Class</label>
              <input
                type="text"
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="8A"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NIS</label>
              <input
                type="text"
                value={nis}
                onChange={(e) => setNis(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NISN</label>
              <input
                type="text"
                value={nisn}
                onChange={(e) => setNisn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="L">Laki-laki (L)</option>
                <option value="P">Perempuan (P)</option>
              </select>
            </div>
          </div>
        </form>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="student-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            {saving ? 'Saving...' : 'Save Student'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Student"
        description={`Remove ${deleteTarget?.fullName} (${deleteTarget?.studentNumber}) from the active student roster?`}
        confirmLabel="Remove"
        danger
        loading={saving}
      />
    </PortalLayout>
  );
}
