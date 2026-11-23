import React, { useEffect, useState } from 'react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';

interface ViolationRow {
  id: number;
  studentNumber: string;
  studentName: string;
  className: string;
  subjectName: string;
  examTitle: string;
  violationType: string;
  violationNumber: number;
  severity: string;
  description: string | null;
  occurredAt: string;
  source: string;
  status: string;
}

export function ViolationsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ViolationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<ViolationRow[]>('/api/violations')
      .then(setRows)
      .catch((err: any) => showToast('error', 'Failed to load violations', err.message))
      .finally(() => setLoading(false));
  }, [showToast]);

  const columns: ColumnDef<ViolationRow>[] = [
    {
      key: 'student',
      header: 'Participant',
      render: (v) => (
        <div>
          <p className="font-semibold text-[#243B64]">{v.studentName}</p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {v.studentNumber} · {v.className}
          </p>
        </div>
      ),
    },
    {
      key: 'exam',
      header: 'Exam & Subject',
      render: (v) => (
        <div className="text-xs">
          <p className="font-medium text-slate-800">{v.examTitle || v.description || 'General'}</p>
          <p className="text-slate-500">{v.subjectName || '—'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Violation Event',
      render: (v) => (
        <div className="text-xs">
          <p className="font-semibold text-slate-800">{v.violationType}</p>
          <p className="text-slate-500">{v.severity}</p>
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Strike #',
      align: 'center',
      render: (v) => <span className="font-mono text-xs font-bold tabular-nums">{v.violationNumber}</span>,
    },
    {
      key: 'time',
      header: 'Timestamp',
      render: (v) => (
        <span className="text-xs text-slate-500 tabular-nums">
          {new Date(v.occurredAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => (
        <span
          className={`text-xs font-semibold ${
            v.status === 'Disqualified' ? 'text-red-700' : 'text-amber-700'
          }`}
        >
          {v.status} ({v.source})
        </span>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Data Pelanggaran Siswa"
      pageSubtitle="Complete audit log of real-time exam security violations and imported disciplinary records"
    >
      <DataTable
        data={rows}
        columns={columns}
        keyField={(v) => v.id}
        loading={loading}
        searchPlaceholder="Search student, exam, or violation type..."
        searchFilter={(v, q) =>
          v.studentName.toLowerCase().includes(q) ||
          v.studentNumber.toLowerCase().includes(q) ||
          v.violationType.toLowerCase().includes(q)
        }
        emptyTitle="No security violations recorded"
        emptyDescription="Violation events from Kartini Exam Security System will appear here automatically."
      />
    </PortalLayout>
  );
}
