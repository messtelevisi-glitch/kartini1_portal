import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  GraduationCap,
  ShieldOff,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PortalLayout } from '../../layouts/PortalLayout';
import { useAuth } from '../../features/auth/AuthContext';
import { apiRequest } from '../../services/api';

interface SummaryResponse {
  stats: {
    totalStudents: number;
    totalTeachers: number;
    totalSubjects: number;
    totalExams: number;
    ongoingExams: number;
    upcomingExams: number;
    completedExams: number;
    activeParticipants: number;
    violationStudents: number;
    totalViolations: number;
    disqualifiedCount: number;
  };
  subjectActivity: {
    subject: string;
    subjectName: string;
    exams: number;
    participants: number;
    violations: number;
  }[];
  recentAuditLogs: {
    id: number;
    actorName: string;
    actorRole: string;
    action: string;
    resourceType: string;
    createdAt: string;
  }[];
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<SummaryResponse>('/api/dashboard/summary')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isAdmin = user?.role === 'admin';
  const basePath = isAdmin ? '/admin' : '/teacher';

  const stats = data?.stats;
  const statCards = [
    ...(isAdmin
      ? [
          { label: 'Total Students', value: stats?.totalStudents ?? 0, icon: <GraduationCap className="w-4 h-4 text-[#376FA6]" /> },
          { label: 'Total Teachers', value: stats?.totalTeachers ?? 0, icon: <Users className="w-4 h-4 text-[#376FA6]" /> },
        ]
      : []),
    { label: isAdmin ? 'Total Subjects' : 'Assigned Subjects', value: stats?.totalSubjects ?? 0, icon: <BookOpen className="w-4 h-4 text-[#376FA6]" /> },
    { label: 'Total Exams', value: stats?.totalExams ?? 0, icon: <FileText className="w-4 h-4 text-[#243B64]" /> },
    { label: 'Ongoing Exams', value: stats?.ongoingExams ?? 0, icon: <Activity className="w-4 h-4 text-[#6EAAA1]" /> },
    { label: 'Upcoming Exams', value: stats?.upcomingExams ?? 0, icon: <CalendarClock className="w-4 h-4 text-[#376FA6]" /> },
    { label: 'Completed Exams', value: stats?.completedExams ?? 0, icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" /> },
    { label: 'Active Participants', value: stats?.activeParticipants ?? 0, icon: <Users className="w-4 h-4 text-[#6EAAA1]" /> },
    { label: 'Students with Violations', value: stats?.violationStudents ?? 0, icon: <AlertTriangle className="w-4 h-4 text-amber-600" /> },
    { label: 'Disqualified', value: stats?.disqualifiedCount ?? 0, icon: <ShieldOff className="w-4 h-4 text-red-600" /> },
  ];

  return (
    <PortalLayout
      pageTitle="Examination Overview"
      pageSubtitle={
        isAdmin
          ? 'Real-time operational summary across all SMP Kartini 1 Batam examination sessions'
          : `Scoped overview for your assigned subjects: ${user?.subjectNames.join(', ') || 'None assigned'}`
      }
      headerAction={
        <Link
          to={`${basePath}/monitoring`}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Open Live Monitor
        </Link>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="truncate">{c.label}</span>
              {c.icon}
            </div>
            <p className="text-2xl font-bold text-[#243B64] mt-2 tabular-nums">
              {loading ? '—' : c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Main Split: Activity Chart + Quick Actions / Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#243B64]">
                Examination Activity by Subject
              </h2>
              <p className="text-xs text-slate-500">
                Comparison of configured exams, active/completed attempts, and recorded security flags
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {loading ? (
              <div className="h-full bg-slate-100 rounded-lg animate-pulse" />
            ) : (data?.subjectActivity?.length ?? 0) === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                No subject activity available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.subjectActivity || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="exams" name="Exams" fill="#243B64" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="participants" name="Attempts" fill="#376FA6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="violations" name="Violations" fill="#D7B56D" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#243B64] mb-1">
              {isAdmin ? 'Recent Security & Audit Logs' : 'Quick Workflow'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {isAdmin
                ? 'Latest recorded administrative and authentication actions'
                : 'Jump directly into your subject examination tasks'}
            </p>

            {isAdmin ? (
              <div className="divide-y divide-slate-100">
                {(data?.recentAuditLogs || []).length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No audit events recorded yet.</p>
                ) : (
                  data?.recentAuditLogs.map((log) => (
                    <div key={log.id} className="py-2.5">
                      <p className="text-xs font-semibold text-slate-800">{log.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {log.actorName} · {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <Link
                  to="/teacher/question-bank"
                  className="block p-3 rounded-lg border border-slate-200 hover:bg-[#EAF3FA]/60 transition-colors"
                >
                  <p className="text-sm font-semibold text-[#243B64]">Open Question Bank</p>
                  <p className="text-xs text-slate-500">Create 5 question types with multimedia</p>
                </Link>
                <Link
                  to="/teacher/import-word"
                  className="block p-3 rounded-lg border border-slate-200 hover:bg-[#EAF3FA]/60 transition-colors"
                >
                  <p className="text-sm font-semibold text-[#243B64]">Import Questions from Word</p>
                  <p className="text-xs text-slate-500">Parse .DOCX files with editable preview</p>
                </Link>
                <Link
                  to="/teacher/exams"
                  className="block p-3 rounded-lg border border-slate-200 hover:bg-[#EAF3FA]/60 transition-colors"
                >
                  <p className="text-sm font-semibold text-[#243B64]">Build Subject Exam</p>
                  <p className="text-xs text-slate-500">Configure duration, shuffling, and security</p>
                </Link>
                <Link
                  to="/teacher/results"
                  className="block p-3 rounded-lg border border-slate-200 hover:bg-[#EAF3FA]/60 transition-colors"
                >
                  <p className="text-sm font-semibold text-[#243B64]">Grade Essays & Export Results</p>
                  <p className="text-xs text-slate-500">Review pending essay responses</p>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
