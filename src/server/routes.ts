import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import multer from 'multer';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  academicYears,
  admissionCards,
  auditLogs,
  classes,
  examAttempts,
  examQuestions,
  examResults,
  examSchedules,
  examTokens,
  exams,
  matchingPairs,
  profiles,
  questionMedia,
  questionOptions,
  questions,
  roles,
  scoreImports,
  studentAnswers,
  students,
  subjects,
  systemSettings,
  teacherSubjects,
  teachers,
  violations,
} from '../db/schema.ts';
import {
  assertSubjectAccess,
  AuthenticatedRequest,
  authenticateStaffToken,
  buildAuthUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  requireStudentSession,
  signSessionToken,
  syncFirebaseUserToProfile,
  verifyPassword,
} from './auth.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { broadcastMonitoringEvent } from './realtime.ts';
import type { SystemSettingsConfig } from '../types/exam.ts';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES: Record<string, { mediaType: 'image' | 'audio' | 'video'; ext: string[] }> = {
  'image/jpeg': { mediaType: 'image', ext: ['.jpg', '.jpeg'] },
  'image/png': { mediaType: 'image', ext: ['.png'] },
  'image/webp': { mediaType: 'image', ext: ['.webp'] },
  'audio/mpeg': { mediaType: 'audio', ext: ['.mp3'] },
  'audio/mp3': { mediaType: 'audio', ext: ['.mp3'] },
  'audio/wav': { mediaType: 'audio', ext: ['.wav'] },
  'audio/x-wav': { mediaType: 'audio', ext: ['.wav'] },
  'audio/mp4': { mediaType: 'audio', ext: ['.m4a'] },
  'audio/x-m4a': { mediaType: 'audio', ext: ['.m4a'] },
  'audio/aac': { mediaType: 'audio', ext: ['.m4a'] },
  'video/mp4': { mediaType: 'video', ext: ['.mp4'] },
  'video/webm': { mediaType: 'video', ext: ['.webm'] },
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ALLOWED_MIME_TYPES[file.mimetype];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed || !allowed.ext.includes(ext)) {
      cb(new Error('Unsupported media format. Allowed: JPG, JPEG, PNG, WEBP, MP3, WAV, M4A, MP4, WEBM.'));
      return;
    }
    cb(null, true);
  },
});

// Rate limiter for student token validation
const tokenFailureMap = new Map<string, { count: number; resetAt: number }>();

function checkTokenRateLimit(key: string): boolean {
  const now = Date.now();
  const rec = tokenFailureMap.get(key);
  if (!rec || rec.resetAt < now) return true;
  return rec.count < 10;
}

function recordTokenFailure(key: string) {
  const now = Date.now();
  const rec = tokenFailureMap.get(key);
  if (!rec || rec.resetAt < now) {
    tokenFailureMap.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    rec.count += 1;
  }
}

function clearTokenFailures(key: string) {
  tokenFailureMap.delete(key);
}

const DEFAULT_SETTINGS: SystemSettingsConfig = {
  schoolName: 'SMP Kartini 1 Batam',
  foundationName: 'Yayasan Keluarga Batam',
  portalTitle: 'KARTINI EXAM PORTAL',
  schoolAddress: 'Jl. Kartini No. 1, Sekupang, Kota Batam, Kepulauan Riau',
  principalName: 'Kepala SMP Kartini 1 Batam',
  academicYear: '2026/2027',
  semester: 'Ganjil',
  defaultDurationMinutes: 90,
  maxUploadMb: 10,
  maxViolationsBeforeDisqualification: 3,
  tokenExpiryMinutes: 120,
  cardWidthMm: 95,
  cardHeightMm: 60,
  cardPaperSize: 'A4',
  maintenanceMode: false,
  enableRealtimeNotifications: true,
};

async function getPortalSettings(): Promise<SystemSettingsConfig> {
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, 'portal_config'))
    .limit(1);
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(row.settingValue as Partial<SystemSettingsConfig>) };
}

async function writeAuditLog(params: {
  actorProfileId?: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      actorProfileId: params.actorProfileId ?? null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details ?? {},
      ipAddress: params.ipAddress,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createApiRouter(): Router {
  const router = Router();

  // ==========================================
  // 1. AUTHENTICATION & FIRST-RUN BOOTSTRAP
  // ==========================================

  router.get('/auth/bootstrap-status', async (_req, res) => {
    try {
      const adminsWithPassword = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.role, 'admin'), sql`${profiles.passwordHash} IS NOT NULL`))
        .limit(1);
      const settings = await getPortalSettings();
      res.json({
        hasClaimedAdmin: adminsWithPassword.length > 0,
        schoolName: settings.schoolName,
        portalTitle: settings.portalTitle,
        maintenanceMode: settings.maintenanceMode,
      });
    } catch (err) {
      console.error('Bootstrap status error:', err);
      res.status(500).json({ error: 'Failed to load portal bootstrap status' });
    }
  });

  router.post('/auth/claim-admin', async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(3).max(40),
        email: z.string().email(),
        fullName: z.string().min(2).max(100),
        password: z.string().min(8).max(128),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      }

      const existing = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.role, 'admin'), sql`${profiles.passwordHash} IS NOT NULL`))
        .limit(1);
      if (existing.length > 0) {
        return res.status(403).json({ error: 'Initial administrator account has already been claimed' });
      }

      const [adminRole] = await db.select().from(roles).where(eq(roles.name, 'admin')).limit(1);
      const passwordHash = hashPassword(parsed.data.password);
      const normalizedEmail = parsed.data.email.toLowerCase();
      const normalizedUsername = parsed.data.username.trim().toLowerCase();

      const [existingEmail] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.email, normalizedEmail))
        .limit(1);

      let profileId: number;
      if (existingEmail) {
        const [updated] = await db
          .update(profiles)
          .set({
            role: 'admin',
            roleId: adminRole?.id ?? null,
            username: normalizedUsername,
            fullName: parsed.data.fullName.trim(),
            passwordHash,
            isActive: true,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, existingEmail.id))
          .returning();
        profileId = updated.id;
      } else {
        const [inserted] = await db
          .insert(profiles)
          .values({
            uid: `local-admin-${crypto.randomUUID()}`,
            roleId: adminRole?.id ?? null,
            role: 'admin',
            username: normalizedUsername,
            email: normalizedEmail,
            fullName: parsed.data.fullName.trim(),
            passwordHash,
            isActive: true,
            lastLoginAt: new Date(),
          })
          .returning();
        profileId = inserted.id;
      }

      const user = await buildAuthUser(profileId);
      if (!user) return res.status(500).json({ error: 'Failed to initialize admin profile' });

      const token = signSessionToken({
        type: 'staff',
        profileId: user.id,
        role: 'admin',
      });

      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: 'admin',
        action: 'CLAIM_INITIAL_ADMIN',
        resourceType: 'profile',
        resourceId: String(user.id),
        ipAddress: req.ip,
      });

      res.json({ token, user });
    } catch (err) {
      console.error('Claim admin error:', err);
      res.status(500).json({ error: 'Failed to claim administrator account' });
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const schema = z.object({
        identifier: z.string().min(2),
        password: z.string().min(1),
        expectedRole: z.enum(['admin', 'teacher', 'any']).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Username/email and password are required' });
      }

      const idLower = parsed.data.identifier.trim().toLowerCase();
      const [profile] = await db
        .select()
        .from(profiles)
        .where(
          idLower.includes('@') ? eq(profiles.email, idLower) : eq(profiles.username, idLower)
        )
        .limit(1);

      if (!profile || !profile.passwordHash || !verifyPassword(parsed.data.password, profile.passwordHash)) {
        return res.status(401).json({ error: 'Invalid username/email or password' });
      }
      if (!profile.isActive) {
        return res.status(403).json({ error: 'Your account has been deactivated by the administrator' });
      }
      if (
        parsed.data.expectedRole &&
        parsed.data.expectedRole !== 'any' &&
        profile.role !== parsed.data.expectedRole
      ) {
        return res.status(403).json({
          error: `This login portal is restricted to ${parsed.data.expectedRole} accounts.`,
        });
      }

      await db
        .update(profiles)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(profiles.id, profile.id));

      const user = await buildAuthUser(profile.id);
      if (!user) {
        return res.status(403).json({ error: 'Account is inactive or incomplete' });
      }

      const token = signSessionToken({
        type: 'staff',
        profileId: user.id,
        role: user.role,
      });

      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'STAFF_LOGIN',
        resourceType: 'auth',
        ipAddress: req.ip,
      });

      res.json({ token, user });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  router.post('/auth/firebase', async (req, res) => {
    try {
      const { idToken } = req.body as { idToken?: string };
      if (!idToken) {
        return res.status(400).json({ error: 'Missing Firebase ID token' });
      }
      const decoded = await adminAuth.verifyIdToken(idToken);
      if (!decoded.email) {
        return res.status(400).json({ error: 'Google account has no verified email' });
      }
      const user = await syncFirebaseUserToProfile(decoded.uid, decoded.email, decoded.name);
      if (!user) {
        return res.status(403).json({
          error:
            'Your Google email is not registered as an Admin or Teacher. Please contact the SMP Kartini 1 Batam Administrator.',
        });
      }
      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'GOOGLE_SIGN_IN',
        resourceType: 'auth',
        ipAddress: req.ip,
      });
      res.json({ user });
    } catch (err) {
      console.error('Firebase auth error:', err);
      res.status(401).json({ error: 'Invalid Google sign-in token' });
    }
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  router.post('/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        oldPassword: z.string().optional(),
        newPassword: z.string().min(8).max(128),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Password must be at least 8 characters' });
      }

      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, req.authUser!.id))
        .limit(1);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });

      if (profile.passwordHash) {
        if (!parsed.data.oldPassword || !verifyPassword(parsed.data.oldPassword, profile.passwordHash)) {
          return res.status(400).json({ error: 'Current password is incorrect' });
        }
      }

      const nextHash = hashPassword(parsed.data.newPassword);
      await db
        .update(profiles)
        .set({ passwordHash: nextHash, updatedAt: new Date() })
        .where(eq(profiles.id, profile.id));

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: req.authUser!.role,
        action: 'CHANGE_PASSWORD',
        resourceType: 'profile',
        resourceId: String(profile.id),
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  // ==========================================
  // 2. DASHBOARD SUMMARY
  // ==========================================

  router.get('/dashboard/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const allowedSubjectIds = user.subjectIds;

      const [studentRows, teacherRows, subjectRows, examRows, scheduleRows, attemptRows, violationRows, logs] =
        await Promise.all([
          db.select({ id: students.id }).from(students).where(isNull(students.deletedAt)),
          db.select({ id: teachers.id }).from(teachers),
          db.select().from(subjects).where(eq(subjects.isActive, true)),
          allowedSubjectIds.length
            ? db
                .select()
                .from(exams)
                .where(
                  and(
                    isNull(exams.deletedAt),
                    user.role === 'admin' ? sql`true` : inArray(exams.subjectId, allowedSubjectIds)
                  )
                )
            : Promise.resolve([]),
          allowedSubjectIds.length
            ? db
                .select()
                .from(examSchedules)
                .where(
                  user.role === 'admin'
                    ? sql`true`
                    : inArray(examSchedules.subjectId, allowedSubjectIds)
                )
            : Promise.resolve([]),
          db
            .select({
              id: examAttempts.id,
              status: examAttempts.status,
              examId: examAttempts.examId,
              violationCount: examAttempts.violationCount,
              createdAt: examAttempts.createdAt,
            })
            .from(examAttempts),
          allowedSubjectIds.length
            ? db
                .select()
                .from(violations)
                .where(
                  user.role === 'admin'
                    ? sql`true`
                    : inArray(violations.subjectId, allowedSubjectIds)
                )
            : Promise.resolve([]),
          user.role === 'admin'
            ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8)
            : Promise.resolve([]),
        ]);

      const examIdsSet = new Set(examRows.map((e) => e.id));
      const scopedAttempts = attemptRows.filter((a) => examIdsSet.has(a.examId));

      const ongoingExams = scheduleRows.filter((s) => s.releaseStatus === 'Ongoing').length;
      const upcomingExams = scheduleRows.filter((s) =>
        ['Scheduled', 'Published'].includes(s.releaseStatus)
      ).length;
      const completedExams = scheduleRows.filter((s) => s.releaseStatus === 'Completed').length;

      const activeParticipants = scopedAttempts.filter((a) => a.status === 'In Progress').length;
      const disqualifiedCount = scopedAttempts.filter((a) => a.status === 'Disqualified').length;
      const violationStudents = new Set(
        violationRows.map((v) => v.studentNumber)
      ).size;

      // Activity chart by subject
      const scopedSubjects =
        user.role === 'admin'
          ? subjectRows
          : subjectRows.filter((s) => allowedSubjectIds.includes(s.id));

      const subjectActivity = scopedSubjects.map((s) => {
        const subExams = examRows.filter((e) => e.subjectId === s.id);
        const subExamIds = new Set(subExams.map((e) => e.id));
        const subAttempts = scopedAttempts.filter((a) => subExamIds.has(a.examId));
        return {
          subject: s.code,
          subjectName: s.name,
          exams: subExams.length,
          participants: subAttempts.length,
          violations: violationRows.filter((v) => v.subjectId === s.id).length,
        };
      });

      res.json({
        stats: {
          totalStudents: studentRows.length,
          totalTeachers: teacherRows.length,
          totalSubjects: scopedSubjects.length,
          totalExams: examRows.length,
          ongoingExams,
          upcomingExams,
          completedExams,
          activeParticipants,
          violationStudents,
          totalViolations: violationRows.length,
          disqualifiedCount,
        },
        subjectActivity,
        recentAuditLogs: logs,
      });
    } catch (err) {
      console.error('Dashboard summary error:', err);
      res.status(500).json({ error: 'Failed to load dashboard summary' });
    }
  });

  // ==========================================
  // 3. SUBJECTS, CLASSES & ACADEMIC YEARS
  // ==========================================

  router.get('/subjects', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const all = await db.select().from(subjects).orderBy(subjects.name);
      if (user.role === 'admin') {
        return res.json(all);
      }
      return res.json(all.filter((s) => user.subjectIds.includes(s.id)));
    } catch (err) {
      console.error('Get subjects error:', err);
      res.status(500).json({ error: 'Failed to fetch subjects' });
    }
  });

  router.post('/subjects', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        code: z.string().min(2).max(12),
        name: z.string().min(2).max(100),
        description: z.string().optional(),
        gradeLevels: z.array(z.number()).default([7, 8, 9]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

      const [created] = await db
        .insert(subjects)
        .values({
          code: parsed.data.code.toUpperCase().trim(),
          name: parsed.data.name.trim(),
          description: parsed.data.description?.trim() || null,
          gradeLevels: parsed.data.gradeLevels,
          isActive: true,
        })
        .returning();

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: 'admin',
        action: 'CREATE_SUBJECT',
        resourceType: 'subject',
        resourceId: String(created.id),
      });

      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Subject code already exists' });
      res.status(500).json({ error: 'Failed to create subject' });
    }
  });

  router.patch('/subjects/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        code: z.string().min(2).max(12).optional(),
        name: z.string().min(2).max(100).optional(),
        description: z.string().nullable().optional(),
        gradeLevels: z.array(z.number()).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid subject payload' });

      const [updated] = await db
        .update(subjects)
        .set({
          ...parsed.data,
          code: parsed.data.code ? parsed.data.code.toUpperCase().trim() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(subjects.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Subject not found' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update subject' });
    }
  });

  router.delete('/subjects/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(subjects).where(eq(subjects.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete subject (ensure no active exams depend on it)' });
    }
  });

  router.get('/classes', requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(classes).orderBy(classes.name);
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch classes' });
    }
  });

  router.post('/classes', requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1).max(20), gradeLevel: z.number().min(7).max(9) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid class payload' });
      const [created] = await db.insert(classes).values(parsed.data).returning();
      res.status(201).json(created);
    } catch {
      res.status(500).json({ error: 'Failed to create class' });
    }
  });

  // ==========================================
  // 4. TEACHER MANAGEMENT (ADMIN ONLY)
  // ==========================================

  router.get('/teachers', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const teacherList = await db.select().from(teachers).orderBy(desc(teachers.createdAt));
      const profileList = await db.select().from(profiles);
      const tsList = await db.select().from(teacherSubjects);
      const subjectList = await db.select().from(subjects);

      const profileMap = new Map(profileList.map((p) => [p.id, p]));
      const subjectMap = new Map(subjectList.map((s) => [s.id, s]));

      const enriched = teacherList.map((t) => {
        const prof = profileMap.get(t.profileId);
        const assignedIds = tsList.filter((x) => x.teacherId === t.id).map((x) => x.subjectId);
        return {
          ...t,
          subjectIds: assignedIds,
          subjects: assignedIds
            .map((sid) => subjectMap.get(sid))
            .filter(Boolean)
            .map((s) => ({ id: s!.id, code: s!.code, name: s!.name })),
          lastLoginAt: prof?.lastLoginAt || null,
        };
      });
      res.json(enriched);
    } catch (err) {
      console.error('Get teachers error:', err);
      res.status(500).json({ error: 'Failed to fetch teachers' });
    }
  });

  router.post('/teachers', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        fullName: z.string().min(2).max(100),
        email: z.string().email(),
        username: z.string().min(3).max(40),
        nip: z.string().optional(),
        phone: z.string().optional(),
        initialPassword: z.string().min(8).max(128),
        subjectIds: z.array(z.number()).min(1, 'Assign at least one subject'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid teacher data' });
      }

      const [teacherRole] = await db.select().from(roles).where(eq(roles.name, 'teacher')).limit(1);
      const passwordHash = hashPassword(parsed.data.initialPassword);
      const email = parsed.data.email.toLowerCase().trim();
      const username = parsed.data.username.toLowerCase().trim();

      const [profile] = await db
        .insert(profiles)
        .values({
          uid: `teacher-${crypto.randomUUID()}`,
          roleId: teacherRole?.id ?? null,
          role: 'teacher',
          username,
          email,
          fullName: parsed.data.fullName.trim(),
          passwordHash,
          isActive: true,
        })
        .returning();

      const [teacher] = await db
        .insert(teachers)
        .values({
          profileId: profile.id,
          nip: parsed.data.nip?.trim() || null,
          fullName: parsed.data.fullName.trim(),
          email,
          username,
          phone: parsed.data.phone?.trim() || null,
          isActive: true,
        })
        .returning();

      for (const sid of parsed.data.subjectIds) {
        await db.insert(teacherSubjects).values({ teacherId: teacher.id, subjectId: sid }).onConflictDoNothing();
      }

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: 'admin',
        action: 'CREATE_TEACHER',
        resourceType: 'teacher',
        resourceId: String(teacher.id),
        details: { username, subjectIds: parsed.data.subjectIds },
      });

      res.status(201).json(teacher);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Username or email is already registered' });
      }
      console.error('Create teacher error:', err);
      res.status(500).json({ error: 'Failed to create teacher account' });
    }
  });

  router.patch('/teachers/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        fullName: z.string().min(2).max(100).optional(),
        email: z.string().email().optional(),
        username: z.string().min(3).max(40).optional(),
        nip: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        subjectIds: z.array(z.number()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid teacher update payload' });

      const [existing] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Teacher not found' });

      const updateFields: Partial<typeof teachers.$inferInsert> = { updatedAt: new Date() };
      const profileUpdate: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };

      if (parsed.data.fullName !== undefined) {
        updateFields.fullName = parsed.data.fullName.trim();
        profileUpdate.fullName = parsed.data.fullName.trim();
      }
      if (parsed.data.email !== undefined) {
        updateFields.email = parsed.data.email.toLowerCase().trim();
        profileUpdate.email = parsed.data.email.toLowerCase().trim();
      }
      if (parsed.data.username !== undefined) {
        updateFields.username = parsed.data.username.toLowerCase().trim();
        profileUpdate.username = parsed.data.username.toLowerCase().trim();
      }
      if (parsed.data.nip !== undefined) updateFields.nip = parsed.data.nip;
      if (parsed.data.phone !== undefined) updateFields.phone = parsed.data.phone;
      if (parsed.data.isActive !== undefined) {
        updateFields.isActive = parsed.data.isActive;
        profileUpdate.isActive = parsed.data.isActive;
      }

      const [updated] = await db.update(teachers).set(updateFields).where(eq(teachers.id, id)).returning();
      await db.update(profiles).set(profileUpdate).where(eq(profiles.id, existing.profileId));

      if (parsed.data.subjectIds) {
        await db.delete(teacherSubjects).where(eq(teacherSubjects.teacherId, id));
        for (const sid of parsed.data.subjectIds) {
          await db.insert(teacherSubjects).values({ teacherId: id, subjectId: sid }).onConflictDoNothing();
        }
      }

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: 'admin',
        action: 'UPDATE_TEACHER',
        resourceType: 'teacher',
        resourceId: String(id),
      });

      res.json(updated);
    } catch (err) {
      console.error('Update teacher error:', err);
      res.status(500).json({ error: 'Failed to update teacher' });
    }
  });

  router.post('/teachers/:id/reset-password', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({ newPassword: z.string().min(8).max(128) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

      await db
        .update(profiles)
        .set({ passwordHash: hashPassword(parsed.data.newPassword), updatedAt: new Date() })
        .where(eq(profiles.id, teacher.profileId));

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: 'admin',
        action: 'RESET_TEACHER_PASSWORD',
        resourceType: 'teacher',
        resourceId: String(id),
      });

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to reset teacher password' });
    }
  });

  router.delete('/teachers/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      await db.delete(profiles).where(eq(profiles.id, teacher.profileId));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete teacher' });
    }
  });

  // ==========================================
  // 5. STUDENT MANAGEMENT
  // ==========================================

  router.get('/students', requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(students)
        .where(isNull(students.deletedAt))
        .orderBy(students.className, students.fullName);
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch students' });
    }
  });

  router.post('/students', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        studentNumber: z.string().min(3).max(40),
        nis: z.string().optional(),
        nisn: z.string().optional(),
        fullName: z.string().min(2).max(100),
        className: z.string().min(1).max(20),
        gender: z.enum(['L', 'P']).default('L'),
        photoUrl: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

      const [cls] = await db
        .select()
        .from(classes)
        .where(eq(classes.name, parsed.data.className.trim().toUpperCase()))
        .limit(1);

      const [created] = await db
        .insert(students)
        .values({
          studentNumber: parsed.data.studentNumber.trim(),
          nis: parsed.data.nis?.trim() || null,
          nisn: parsed.data.nisn?.trim() || null,
          fullName: parsed.data.fullName.trim(),
          classId: cls?.id ?? null,
          className: parsed.data.className.trim().toUpperCase(),
          gender: parsed.data.gender,
          photoUrl: parsed.data.photoUrl || null,
          isActive: true,
        })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Student participant number already exists' });
      res.status(500).json({ error: 'Failed to create student' });
    }
  });

  router.post('/students/bulk', requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        rows: z.array(
          z.object({
            studentNumber: z.string().min(2),
            fullName: z.string().min(2),
            className: z.string().min(1),
            nis: z.string().optional(),
            nisn: z.string().optional(),
            gender: z.string().optional(),
          })
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid bulk student payload' });

      let imported = 0;
      for (const r of parsed.data.rows) {
        await db
          .insert(students)
          .values({
            studentNumber: r.studentNumber.trim(),
            fullName: r.fullName.trim(),
            className: r.className.trim().toUpperCase(),
            nis: r.nis?.trim() || null,
            nisn: r.nisn?.trim() || null,
            gender: r.gender === 'P' ? 'P' : 'L',
            isActive: true,
          })
          .onConflictDoUpdate({
            target: students.studentNumber,
            set: {
              fullName: r.fullName.trim(),
              className: r.className.trim().toUpperCase(),
              nis: r.nis?.trim() || null,
              nisn: r.nisn?.trim() || null,
              updatedAt: new Date(),
            },
          });
        imported += 1;
      }
      res.json({ imported });
    } catch {
      res.status(500).json({ error: 'Failed to import students' });
    }
  });

  router.patch('/students/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        studentNumber: z.string().min(2).optional(),
        fullName: z.string().min(2).optional(),
        className: z.string().min(1).optional(),
        nis: z.string().nullable().optional(),
        nisn: z.string().nullable().optional(),
        gender: z.string().optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid student payload' });

      const [updated] = await db
        .update(students)
        .set({
          ...parsed.data,
          className: parsed.data.className ? parsed.data.className.trim().toUpperCase() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(students.id, id))
        .returning();
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to update student' });
    }
  });

  router.delete('/students/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.update(students).set({ deletedAt: new Date(), isActive: false }).where(eq(students.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete student' });
    }
  });

  // ==========================================
  // 6. MULTIMEDIA UPLOAD (10 MB MAX, PATH-SAFE)
  // ==========================================

  router.post('/media/upload', requireAuth, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File exceeds the maximum allowed size of 10 MB.' });
        }
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No media file provided' });
      }
      const meta = ALLOWED_MIME_TYPES[req.file.mimetype];
      res.status(201).json({
        storageUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        mediaType: meta?.mediaType || 'image',
      });
    });
  });

  // ==========================================
  // 7. QUESTION BANK (5 TYPES + MULTIMEDIA + RBAC)
  // ==========================================

  router.get('/questions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const subjectIdFilter = req.query.subjectId ? Number(req.query.subjectId) : null;

      if (subjectIdFilter && !assertSubjectAccess(user, subjectIdFilter)) {
        return res.status(403).json({ error: 'Access denied for this subject' });
      }

      const conditions = [eq(questions.isDeleted, false)];
      if (subjectIdFilter) {
        conditions.push(eq(questions.subjectId, subjectIdFilter));
      } else if (user.role !== 'admin') {
        if (user.subjectIds.length === 0) return res.json([]);
        conditions.push(inArray(questions.subjectId, user.subjectIds));
      }

      const qRows = await db
        .select()
        .from(questions)
        .where(and(...conditions))
        .orderBy(desc(questions.createdAt));

      if (qRows.length === 0) return res.json([]);

      const qIds = qRows.map((q) => q.id);
      const [optRows, pairRows, mediaRows, subjectRows] = await Promise.all([
        db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds)).orderBy(questionOptions.sortOrder),
        db.select().from(matchingPairs).where(inArray(matchingPairs.questionId, qIds)).orderBy(matchingPairs.sortOrder),
        db.select().from(questionMedia).where(inArray(questionMedia.questionId, qIds)),
        db.select().from(subjects),
      ]);

      const subMap = new Map(subjectRows.map((s) => [s.id, s]));

      const enriched = qRows.map((q) => ({
        ...q,
        subjectName: subMap.get(q.subjectId)?.name || '',
        subjectCode: subMap.get(q.subjectId)?.code || '',
        options: optRows.filter((o) => o.questionId === q.id),
        matchingPairs: pairRows.filter((m) => m.questionId === q.id),
        media: mediaRows.filter((m) => m.questionId === q.id),
      }));

      res.json(enriched);
    } catch (err) {
      console.error('Get questions error:', err);
      res.status(500).json({ error: 'Failed to load question bank' });
    }
  });

  const questionInputSchema = z.object({
    subjectId: z.number(),
    classLevel: z.string().default('8'),
    semester: z.string().default('Ganjil'),
    academicYear: z.string().default('2026/2027'),
    topic: z.string().default('General'),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    questionType: z.enum(['MULTIPLE_CHOICE', 'MULTIPLE_RESPONSE', 'TRUE_FALSE', 'MATCHING', 'ESSAY']),
    questionText: z.string().min(1),
    explanation: z.string().nullable().optional(),
    points: z.number().min(0.5).max(100).default(5),
    partialCredit: z.boolean().default(false),
    options: z
      .array(
        z.object({
          optionKey: z.string(),
          optionText: z.string(),
          mediaUrl: z.string().nullable().optional(),
          mediaType: z.enum(['image', 'audio', 'video']).nullable().optional(),
          isCorrect: z.boolean(),
          sortOrder: z.number().default(0),
        })
      )
      .default([]),
    matchingPairs: z
      .array(
        z.object({
          promptKey: z.string(),
          promptText: z.string(),
          matchKey: z.string(),
          matchText: z.string(),
          sortOrder: z.number().default(0),
        })
      )
      .default([]),
    media: z
      .array(
        z.object({
          targetType: z.enum(['question', 'option']).default('question'),
          targetKey: z.string().nullable().optional(),
          mediaType: z.enum(['image', 'audio', 'video']),
          fileName: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
          storageUrl: z.string(),
        })
      )
      .default([]),
  });

  async function saveSingleQuestion(data: z.infer<typeof questionInputSchema>, user: NonNullable<AuthenticatedRequest['authUser']>) {
    const [inserted] = await db
      .insert(questions)
      .values({
        subjectId: data.subjectId,
        createdByTeacherId: user.teacherId,
        createdByProfileId: user.id,
        classLevel: data.classLevel,
        semester: data.semester,
        academicYear: data.academicYear,
        topic: data.topic,
        difficulty: data.difficulty,
        questionType: data.questionType,
        questionText: data.questionText,
        explanation: data.explanation || null,
        points: data.points,
        partialCredit: data.partialCredit,
      })
      .returning();

    if (data.options.length > 0) {
      await db.insert(questionOptions).values(
        data.options.map((o, idx) => ({
          questionId: inserted.id,
          optionKey: o.optionKey,
          optionText: o.optionText,
          mediaUrl: o.mediaUrl || null,
          mediaType: o.mediaType || null,
          isCorrect: o.isCorrect,
          sortOrder: o.sortOrder ?? idx,
        }))
      );
    }

    if (data.matchingPairs.length > 0) {
      await db.insert(matchingPairs).values(
        data.matchingPairs.map((m, idx) => ({
          questionId: inserted.id,
          promptKey: m.promptKey,
          promptText: m.promptText,
          matchKey: m.matchKey,
          matchText: m.matchText,
          sortOrder: m.sortOrder ?? idx,
        }))
      );
    }

    if (data.media.length > 0) {
      await db.insert(questionMedia).values(
        data.media.map((m) => ({
          questionId: inserted.id,
          targetType: m.targetType,
          targetKey: m.targetKey || null,
          mediaType: m.mediaType,
          fileName: m.fileName,
          mimeType: m.mimeType,
          fileSize: m.fileSize,
          storageUrl: m.storageUrl,
        }))
      );
    }

    return inserted;
  }

  router.post('/questions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const parsed = questionInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid question payload' });
      }
      if (!assertSubjectAccess(user, parsed.data.subjectId)) {
        return res.status(403).json({ error: 'You are not authorized to add questions to this subject' });
      }
      const created = await saveSingleQuestion(parsed.data, user);
      res.status(201).json(created);
    } catch (err) {
      console.error('Create question error:', err);
      res.status(500).json({ error: 'Failed to create question' });
    }
  });

  router.post('/questions/bulk-import', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const schema = z.object({
        subjectId: z.number(),
        items: z.array(questionInputSchema),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bulk question payload' });
      }
      if (!assertSubjectAccess(user, parsed.data.subjectId)) {
        return res.status(403).json({ error: 'You are not authorized to import questions into this subject' });
      }

      const createdIds: number[] = [];
      for (const item of parsed.data.items) {
        const q = await saveSingleQuestion({ ...item, subjectId: parsed.data.subjectId }, user);
        createdIds.push(q.id);
      }

      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'IMPORT_WORD_QUESTIONS',
        resourceType: 'question',
        details: { subjectId: parsed.data.subjectId, count: createdIds.length },
      });

      res.status(201).json({ importedCount: createdIds.length, createdIds });
    } catch (err) {
      console.error('Bulk question import error:', err);
      res.status(500).json({ error: 'Failed to import questions' });
    }
  });

  router.patch('/questions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
      if (!existing || existing.isDeleted) return res.status(404).json({ error: 'Question not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) {
        return res.status(403).json({ error: 'Access denied for this subject' });
      }

      const parsed = questionInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
      if (!assertSubjectAccess(user, parsed.data.subjectId)) {
        return res.status(403).json({ error: 'Access denied for target subject' });
      }

      const [updated] = await db
        .update(questions)
        .set({
          subjectId: parsed.data.subjectId,
          classLevel: parsed.data.classLevel,
          semester: parsed.data.semester,
          academicYear: parsed.data.academicYear,
          topic: parsed.data.topic,
          difficulty: parsed.data.difficulty,
          questionType: parsed.data.questionType,
          questionText: parsed.data.questionText,
          explanation: parsed.data.explanation || null,
          points: parsed.data.points,
          partialCredit: parsed.data.partialCredit,
          updatedAt: new Date(),
        })
        .where(eq(questions.id, id))
        .returning();

      await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
      await db.delete(matchingPairs).where(eq(matchingPairs.questionId, id));
      await db.delete(questionMedia).where(eq(questionMedia.questionId, id));

      if (parsed.data.options.length > 0) {
        await db.insert(questionOptions).values(
          parsed.data.options.map((o, idx) => ({
            questionId: id,
            optionKey: o.optionKey,
            optionText: o.optionText,
            mediaUrl: o.mediaUrl || null,
            mediaType: o.mediaType || null,
            isCorrect: o.isCorrect,
            sortOrder: o.sortOrder ?? idx,
          }))
        );
      }
      if (parsed.data.matchingPairs.length > 0) {
        await db.insert(matchingPairs).values(
          parsed.data.matchingPairs.map((m, idx) => ({
            questionId: id,
            promptKey: m.promptKey,
            promptText: m.promptText,
            matchKey: m.matchKey,
            matchText: m.matchText,
            sortOrder: m.sortOrder ?? idx,
          }))
        );
      }
      if (parsed.data.media.length > 0) {
        await db.insert(questionMedia).values(
          parsed.data.media.map((m) => ({
            questionId: id,
            targetType: m.targetType,
            targetKey: m.targetKey || null,
            mediaType: m.mediaType,
            fileName: m.fileName,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            storageUrl: m.storageUrl,
          }))
        );
      }

      res.json(updated);
    } catch (err) {
      console.error('Update question error:', err);
      res.status(500).json({ error: 'Failed to update question' });
    }
  });

  router.post('/questions/:id/duplicate', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
      if (!existing || existing.isDeleted) return res.status(404).json({ error: 'Question not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const [opts, pairs, med] = await Promise.all([
        db.select().from(questionOptions).where(eq(questionOptions.questionId, id)),
        db.select().from(matchingPairs).where(eq(matchingPairs.questionId, id)),
        db.select().from(questionMedia).where(eq(questionMedia.questionId, id)),
      ]);
      const created = await saveSingleQuestion(
        {
          subjectId: existing.subjectId,
          classLevel: existing.classLevel,
          semester: existing.semester,
          academicYear: existing.academicYear,
          topic: existing.topic,
          difficulty: existing.difficulty as 'easy' | 'medium' | 'hard',
          questionType: existing.questionType as any,
          questionText: `${existing.questionText} (Copy)`,
          explanation: existing.explanation,
          points: existing.points,
          partialCredit: existing.partialCredit,
          options: opts.map((o) => ({
            optionKey: o.optionKey,
            optionText: o.optionText,
            mediaUrl: o.mediaUrl,
            mediaType: o.mediaType as any,
            isCorrect: o.isCorrect,
            sortOrder: o.sortOrder,
          })),
          matchingPairs: pairs.map((p) => ({
            promptKey: p.promptKey,
            promptText: p.promptText,
            matchKey: p.matchKey,
            matchText: p.matchText,
            sortOrder: p.sortOrder,
          })),
          media: med.map((m) => ({
            targetType: m.targetType as 'question' | 'option',
            targetKey: m.targetKey,
            mediaType: m.mediaType as 'image' | 'audio' | 'video',
            fileName: m.fileName,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            storageUrl: m.storageUrl,
          })),
        },
        user
      );
      res.status(201).json(created);
    } catch {
      res.status(500).json({ error: 'Failed to duplicate question' });
    }
  });

  router.delete('/questions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Question not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      await db.update(questions).set({ isDeleted: true, updatedAt: new Date() }).where(eq(questions.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete question' });
    }
  });

  // ==========================================
  // 8. EXAMS, SCHEDULES & TOKENS
  // ==========================================

  router.get('/exams', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      if (user.role !== 'admin' && user.subjectIds.length === 0) return res.json([]);
      const examRows = await db
        .select()
        .from(exams)
        .where(
          and(
            isNull(exams.deletedAt),
            user.role === 'admin' ? sql`true` : inArray(exams.subjectId, user.subjectIds)
          )
        )
        .orderBy(desc(exams.createdAt));

      const [subjectList, eqRows] = await Promise.all([
        db.select().from(subjects),
        examRows.length
          ? db.select().from(examQuestions).where(inArray(examQuestions.examId, examRows.map((e) => e.id)))
          : Promise.resolve([]),
      ]);
      const subMap = new Map(subjectList.map((s) => [s.id, s]));

      res.json(
        examRows.map((e) => ({
          ...e,
          subjectName: subMap.get(e.subjectId)?.name || '',
          subjectCode: subMap.get(e.subjectId)?.code || '',
          questionIds: eqRows
            .filter((x) => x.examId === e.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((x) => x.questionId),
        }))
      );
    } catch (err) {
      console.error('Get exams error:', err);
      res.status(500).json({ error: 'Failed to fetch exams' });
    }
  });

  const examInputSchema = z.object({
    title: z.string().min(2).max(200),
    subjectId: z.number(),
    className: z.string().min(1),
    semester: z.string().default('Ganjil'),
    academicYear: z.string().default('2026/2027'),
    examType: z.string().default('Ujian Akhir Semester'),
    durationMinutes: z.number().min(5).max(360).default(90),
    instructions: z.string().default('Read each question carefully before answering.'),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    oneQuestionPerPage: z.boolean().default(true),
    allowNavigation: z.boolean().default(true),
    showQuestionNumbers: z.boolean().default(true),
    allowMarkReview: z.boolean().default(true),
    allowPrevious: z.boolean().default(true),
    requireFullscreen: z.boolean().default(true),
    antiCheatingEnabled: z.boolean().default(true),
    autosaveEnabled: z.boolean().default(true),
    autoSubmitEnabled: z.boolean().default(true),
    status: z.enum(['Draft', 'Scheduled', 'Published', 'Ongoing', 'Completed', 'Cancelled']).default('Draft'),
    questionIds: z.array(z.number()).default([]),
  });

  router.post('/exams', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const parsed = examInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
      if (!assertSubjectAccess(user, parsed.data.subjectId)) {
        return res.status(403).json({ error: 'Access denied for this subject' });
      }

      const qRows = parsed.data.questionIds.length
        ? await db.select().from(questions).where(inArray(questions.id, parsed.data.questionIds))
        : [];
      const totalPoints = qRows.reduce((acc, q) => acc + q.points, 0);

      const [created] = await db
        .insert(exams)
        .values({
          title: parsed.data.title.trim(),
          subjectId: parsed.data.subjectId,
          className: parsed.data.className.trim().toUpperCase(),
          semester: parsed.data.semester,
          academicYear: parsed.data.academicYear,
          examType: parsed.data.examType,
          durationMinutes: parsed.data.durationMinutes,
          totalQuestions: qRows.length,
          totalPoints: totalPoints || 100,
          instructions: parsed.data.instructions,
          shuffleQuestions: parsed.data.shuffleQuestions,
          shuffleOptions: parsed.data.shuffleOptions,
          oneQuestionPerPage: parsed.data.oneQuestionPerPage,
          allowNavigation: parsed.data.allowNavigation,
          showQuestionNumbers: parsed.data.showQuestionNumbers,
          allowMarkReview: parsed.data.allowMarkReview,
          allowPrevious: parsed.data.allowPrevious,
          requireFullscreen: parsed.data.requireFullscreen,
          antiCheatingEnabled: parsed.data.antiCheatingEnabled,
          autosaveEnabled: parsed.data.autosaveEnabled,
          autoSubmitEnabled: parsed.data.autoSubmitEnabled,
          status: parsed.data.status,
          createdByProfileId: user.id,
        })
        .returning();

      for (let i = 0; i < parsed.data.questionIds.length; i++) {
        await db
          .insert(examQuestions)
          .values({
            examId: created.id,
            questionId: parsed.data.questionIds[i],
            sortOrder: i,
          })
          .onConflictDoNothing();
      }

      res.status(201).json(created);
    } catch (err) {
      console.error('Create exam error:', err);
      res.status(500).json({ error: 'Failed to create examination' });
    }
  });

  router.patch('/exams/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Exam not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const parsed = examInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
      if (!assertSubjectAccess(user, parsed.data.subjectId)) {
        return res.status(403).json({ error: 'Access denied for target subject' });
      }

      const qRows = parsed.data.questionIds.length
        ? await db.select().from(questions).where(inArray(questions.id, parsed.data.questionIds))
        : [];
      const totalPoints = qRows.reduce((acc, q) => acc + q.points, 0);

      const [updated] = await db
        .update(exams)
        .set({
          title: parsed.data.title.trim(),
          subjectId: parsed.data.subjectId,
          className: parsed.data.className.trim().toUpperCase(),
          semester: parsed.data.semester,
          academicYear: parsed.data.academicYear,
          examType: parsed.data.examType,
          durationMinutes: parsed.data.durationMinutes,
          totalQuestions: qRows.length,
          totalPoints: totalPoints || 100,
          instructions: parsed.data.instructions,
          shuffleQuestions: parsed.data.shuffleQuestions,
          shuffleOptions: parsed.data.shuffleOptions,
          oneQuestionPerPage: parsed.data.oneQuestionPerPage,
          allowNavigation: parsed.data.allowNavigation,
          showQuestionNumbers: parsed.data.showQuestionNumbers,
          allowMarkReview: parsed.data.allowMarkReview,
          allowPrevious: parsed.data.allowPrevious,
          requireFullscreen: parsed.data.requireFullscreen,
          antiCheatingEnabled: parsed.data.antiCheatingEnabled,
          autosaveEnabled: parsed.data.autosaveEnabled,
          autoSubmitEnabled: parsed.data.autoSubmitEnabled,
          status: parsed.data.status,
          updatedAt: new Date(),
        })
        .where(eq(exams.id, id))
        .returning();

      await db.delete(examQuestions).where(eq(examQuestions.examId, id));
      for (let i = 0; i < parsed.data.questionIds.length; i++) {
        await db
          .insert(examQuestions)
          .values({
            examId: id,
            questionId: parsed.data.questionIds[i],
            sortOrder: i,
          })
          .onConflictDoNothing();
      }

      res.json(updated);
    } catch (err) {
      console.error('Update exam error:', err);
      res.status(500).json({ error: 'Failed to update exam' });
    }
  });

  router.delete('/exams/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Exam not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      await db.update(exams).set({ deletedAt: new Date() }).where(eq(exams.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete exam' });
    }
  });

  // Schedules
  router.get('/schedules', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      if (user.role !== 'admin' && user.subjectIds.length === 0) return res.json([]);
      const rows = await db
        .select()
        .from(examSchedules)
        .where(user.role === 'admin' ? sql`true` : inArray(examSchedules.subjectId, user.subjectIds))
        .orderBy(desc(examSchedules.startTime));

      const [examList, subjectList, tokenList] = await Promise.all([
        db.select().from(exams),
        db.select().from(subjects),
        db.select().from(examTokens).orderBy(desc(examTokens.createdAt)),
      ]);
      const examMap = new Map(examList.map((e) => [e.id, e]));
      const subMap = new Map(subjectList.map((s) => [s.id, s]));

      res.json(
        rows.map((s) => {
          const activeToken = tokenList.find((t) => t.scheduleId === s.id && t.isActive) || tokenList.find((t) => t.scheduleId === s.id) || null;
          return {
            ...s,
            examTitle: examMap.get(s.examId)?.title || '',
            subjectName: subMap.get(s.subjectId)?.name || '',
            subjectCode: subMap.get(s.subjectId)?.code || '',
            activeToken,
          };
        })
      );
    } catch (err) {
      console.error('Get schedules error:', err);
      res.status(500).json({ error: 'Failed to fetch exam schedules' });
    }
  });

  router.post('/schedules', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const schema = z.object({
        examId: z.number(),
        className: z.string().min(1),
        examDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        durationMinutes: z.number().min(5).max(360),
        proctorName: z.string().optional(),
        releaseStatus: z.enum(['Draft', 'Scheduled', 'Published', 'Ongoing', 'Completed', 'Cancelled']).default('Published'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

      const [exam] = await db.select().from(exams).where(eq(exams.id, parsed.data.examId)).limit(1);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      if (!assertSubjectAccess(user, exam.subjectId)) {
        return res.status(403).json({ error: 'Access denied for this subject' });
      }

      const [created] = await db
        .insert(examSchedules)
        .values({
          examId: exam.id,
          subjectId: exam.subjectId,
          className: parsed.data.className.trim().toUpperCase(),
          examDate: parsed.data.examDate,
          startTime: new Date(parsed.data.startTime),
          endTime: new Date(parsed.data.endTime),
          durationMinutes: parsed.data.durationMinutes,
          proctorName: parsed.data.proctorName?.trim() || null,
          releaseStatus: parsed.data.releaseStatus,
        })
        .returning();

      res.status(201).json(created);
    } catch (err) {
      console.error('Create schedule error:', err);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  });

  router.patch('/schedules/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(examSchedules).where(eq(examSchedules.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Schedule not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const schema = z.object({
        releaseStatus: z.enum(['Draft', 'Scheduled', 'Published', 'Ongoing', 'Completed', 'Cancelled']).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        durationMinutes: z.number().optional(),
        proctorName: z.string().nullable().optional(),
        className: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid schedule update' });

      const [updated] = await db
        .update(examSchedules)
        .set({
          releaseStatus: parsed.data.releaseStatus ?? existing.releaseStatus,
          startTime: parsed.data.startTime ? new Date(parsed.data.startTime) : existing.startTime,
          endTime: parsed.data.endTime ? new Date(parsed.data.endTime) : existing.endTime,
          durationMinutes: parsed.data.durationMinutes ?? existing.durationMinutes,
          proctorName: parsed.data.proctorName !== undefined ? parsed.data.proctorName : existing.proctorName,
          className: parsed.data.className ? parsed.data.className.toUpperCase() : existing.className,
          updatedAt: new Date(),
        })
        .where(eq(examSchedules.id, id))
        .returning();
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  router.delete('/schedules/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.authUser!;
      const [existing] = await db.select().from(examSchedules).where(eq(examSchedules.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Schedule not found' });
      if (!assertSubjectAccess(user, existing.subjectId)) return res.status(403).json({ error: 'Access denied' });
      await db.delete(examSchedules).where(eq(examSchedules.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  // Tokens (Admin manages tokens)
  router.get('/tokens', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const [tokenRows, scheduleRows, examRows, subjectRows] = await Promise.all([
        db.select().from(examTokens).orderBy(desc(examTokens.createdAt)),
        db.select().from(examSchedules),
        db.select().from(exams),
        db.select().from(subjects),
      ]);
      const schedMap = new Map(scheduleRows.map((s) => [s.id, s]));
      const examMap = new Map(examRows.map((e) => [e.id, e]));
      const subMap = new Map(subjectRows.map((s) => [s.id, s]));

      res.json(
        tokenRows.map((t) => {
          const sched = schedMap.get(t.scheduleId);
          const exam = examMap.get(t.examId);
          const sub = exam ? subMap.get(exam.subjectId) : undefined;
          return {
            ...t,
            examTitle: exam?.title || '',
            subjectName: sub?.name || '',
            className: sched?.className || exam?.className || '',
          };
        })
      );
    } catch {
      res.status(500).json({ error: 'Failed to fetch tokens' });
    }
  });

  router.post('/tokens/generate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        scheduleId: z.number(),
        validMinutes: z.number().min(5).max(1440).default(120),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid token payload' });

      const [schedule] = await db
        .select()
        .from(examSchedules)
        .where(eq(examSchedules.id, parsed.data.scheduleId))
        .limit(1);
      if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

      // Deactivate previous tokens for this schedule so each session has 1 active token
      await db
        .update(examTokens)
        .set({ isActive: false })
        .where(eq(examTokens.scheduleId, schedule.id));

      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += alphabet[crypto.randomInt(0, alphabet.length)];
      }

      const validFrom = new Date();
      const validUntil = new Date(validFrom.getTime() + parsed.data.validMinutes * 60 * 1000);

      const [created] = await db
        .insert(examTokens)
        .values({
          examId: schedule.examId,
          scheduleId: schedule.id,
          tokenCode: code,
          isActive: true,
          validFrom,
          validUntil,
          maxAttempts: 1,
          createdByProfileId: req.authUser!.id,
        })
        .returning();

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: 'admin',
        action: 'GENERATE_EXAM_TOKEN',
        resourceType: 'exam_token',
        resourceId: String(created.id),
        details: { scheduleId: schedule.id },
      });

      res.status(201).json(created);
    } catch (err) {
      console.error('Generate token error:', err);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  router.patch('/tokens/:id/toggle', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(examTokens).where(eq(examTokens.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Token not found' });
      const [updated] = await db
        .update(examTokens)
        .set({ isActive: !existing.isActive })
        .where(eq(examTokens.id, id))
        .returning();
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to toggle token' });
    }
  });

  // ==========================================
  // 9. STUDENT EXAM ACCESS & ENGINE (NO SCORES/KEYS LEAKED)
  // ==========================================

  router.get('/student/server-time', (_req, res) => {
    const now = new Date();
    res.json({ serverTimeIso: now.toISOString(), serverEpochMs: now.getTime() });
  });

  router.get('/student/upcoming', async (_req, res) => {
    try {
      const [scheduleRows, examRows, subjectRows, settings] = await Promise.all([
        db
          .select()
          .from(examSchedules)
          .where(inArray(examSchedules.releaseStatus, ['Scheduled', 'Published', 'Ongoing']))
          .orderBy(examSchedules.startTime),
        db.select().from(exams).where(isNull(exams.deletedAt)),
        db.select().from(subjects),
        getPortalSettings(),
      ]);

      const examMap = new Map(examRows.map((e) => [e.id, e]));
      const subMap = new Map(subjectRows.map((s) => [s.id, s]));

      res.json({
        serverTimeIso: new Date().toISOString(),
        schoolName: settings.schoolName,
        maintenanceMode: settings.maintenanceMode,
        schedules: scheduleRows.map((s) => ({
          id: s.id,
          examTitle: examMap.get(s.examId)?.title || 'Examination',
          subjectName: subMap.get(s.subjectId)?.name || '',
          className: s.className,
          examDate: s.examDate,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMinutes: s.durationMinutes,
          releaseStatus: s.releaseStatus,
        })),
      });
    } catch {
      res.status(500).json({ error: 'Failed to load examination schedule' });
    }
  });

  router.post('/student/validate-token', async (req, res) => {
    try {
      const schema = z.object({
        studentNumber: z.string().min(2),
        studentName: z.string().min(2),
        className: z.string().min(1),
        tokenCode: z.string().min(4).max(16),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'All participant identity fields and exam token are required.' });
      }

      const rateKey = `${req.ip}:${parsed.data.studentNumber.trim()}`;
      if (!checkTokenRateLimit(rateKey)) {
        return res.status(429).json({
          error: 'Too many invalid token attempts. Please wait 15 minutes or contact your proctor.',
        });
      }

      const settings = await getPortalSettings();
      if (settings.maintenanceMode) {
        return res.status(503).json({ error: 'Examination portal is currently in maintenance mode.' });
      }

      const tokenUpper = parsed.data.tokenCode.trim().toUpperCase();
      const [tokenRow] = await db
        .select()
        .from(examTokens)
        .where(eq(examTokens.tokenCode, tokenUpper))
        .limit(1);

      if (!tokenRow || !tokenRow.isActive) {
        recordTokenFailure(rateKey);
        return res.status(401).json({ error: 'Invalid or inactive examination token.' });
      }

      const now = new Date();
      if (now < tokenRow.validFrom || now > tokenRow.validUntil) {
        recordTokenFailure(rateKey);
        return res.status(401).json({ error: 'This examination token has expired or is not yet active.' });
      }

      const [schedule] = await db
        .select()
        .from(examSchedules)
        .where(eq(examSchedules.id, tokenRow.scheduleId))
        .limit(1);

      if (!schedule || !['Published', 'Ongoing'].includes(schedule.releaseStatus)) {
        return res.status(403).json({ error: 'This examination schedule has not been released.' });
      }

      if (now < schedule.startTime) {
        return res.status(403).json({
          error: `Examination has not started yet. Scheduled start: ${schedule.startTime.toISOString()}`,
          startsAt: schedule.startTime.toISOString(),
        });
      }

      if (now > schedule.endTime) {
        return res.status(403).json({ error: 'The examination schedule window has closed.' });
      }

      // Verify student identity
      const [student] = await db
        .select()
        .from(students)
        .where(
          and(
            eq(students.studentNumber, parsed.data.studentNumber.trim()),
            isNull(students.deletedAt)
          )
        )
        .limit(1);

      if (!student || !student.isActive) {
        recordTokenFailure(rateKey);
        return res.status(404).json({ error: 'Participant number is not registered or inactive.' });
      }

      const reqClass = parsed.data.className.trim().toUpperCase();
      if (student.className.toUpperCase() !== reqClass) {
        recordTokenFailure(rateKey);
        return res.status(403).json({ error: 'Class does not match participant registration.' });
      }

      if (
        schedule.className.toUpperCase() !== 'ALL' &&
        schedule.className.toUpperCase() !== student.className.toUpperCase()
      ) {
        return res.status(403).json({
          error: `This examination session is restricted to class ${schedule.className}.`,
        });
      }

      const reqName = parsed.data.studentName.trim().toLowerCase();
      if (!student.fullName.toLowerCase().includes(reqName) && reqName !== student.fullName.toLowerCase()) {
        recordTokenFailure(rateKey);
        return res.status(403).json({ error: 'Participant name verification failed.' });
      }

      const [exam] = await db.select().from(exams).where(eq(exams.id, schedule.examId)).limit(1);
      if (!exam || exam.deletedAt) {
        return res.status(404).json({ error: 'Examination configuration not found.' });
      }
      const [subject] = await db.select().from(subjects).where(eq(subjects.id, exam.subjectId)).limit(1);

      // Check existing attempt
      const [existingAttempt] = await db
        .select()
        .from(examAttempts)
        .where(and(eq(examAttempts.scheduleId, schedule.id), eq(examAttempts.studentId, student.id)))
        .limit(1);

      if (existingAttempt) {
        if (['Completed', 'Submitted'].includes(existingAttempt.status)) {
          return res.status(403).json({ error: 'You have already submitted this examination.' });
        }
        if (existingAttempt.status === 'Disqualified') {
          return res.status(403).json({
            error: `You have been disqualified from this examination: ${existingAttempt.disqualificationReason || 'Security policy violation'}.`,
          });
        }
        if (now > existingAttempt.serverEndTime) {
          return res.status(403).json({ error: 'Your examination time limit has expired.' });
        }
      }

      clearTokenFailures(rateKey);

      const eqRows = await db
        .select()
        .from(examQuestions)
        .where(eq(examQuestions.examId, exam.id))
        .orderBy(examQuestions.sortOrder);

      let attempt = existingAttempt;
      if (!attempt) {
        const questionIds = exam.shuffleQuestions
          ? shuffleArray(eqRows.map((r) => r.questionId))
          : eqRows.map((r) => r.questionId);

        const durationEnd = new Date(now.getTime() + schedule.durationMinutes * 60 * 1000);
        const serverEndTime = durationEnd < schedule.endTime ? durationEnd : schedule.endTime;

        const [createdAttempt] = await db
          .insert(examAttempts)
          .values({
            examId: exam.id,
            scheduleId: schedule.id,
            studentId: student.id,
            studentNumber: student.studentNumber,
            studentName: student.fullName,
            className: student.className,
            tokenId: tokenRow.id,
            status: 'Not Started',
            startedAt: now,
            serverEndTime,
            totalQuestions: questionIds.length,
            questionOrder: questionIds,
            optionOrders: {},
          })
          .returning();
        attempt = createdAttempt;
      }

      const studentToken = signSessionToken(
        {
          type: 'student',
          attemptId: attempt.id,
          studentId: student.id,
          scheduleId: schedule.id,
          role: 'student',
        },
        60 * 60 * 8
      );

      res.json({
        studentToken,
        confirmation: {
          attemptId: attempt.id,
          studentNumber: student.studentNumber,
          studentName: student.fullName,
          className: student.className,
          subjectName: subject?.name || '',
          examTitle: exam.title,
          examType: exam.examType,
          durationMinutes: schedule.durationMinutes,
          startTime: schedule.startTime.toISOString(),
          serverEndTime: attempt.serverEndTime.toISOString(),
          serverNow: now.toISOString(),
          instructions: exam.instructions,
          totalQuestions: attempt.totalQuestions,
          requireFullscreen: exam.requireFullscreen,
          antiCheatingEnabled: exam.antiCheatingEnabled,
          maxViolations: settings.maxViolationsBeforeDisqualification,
        },
      });
    } catch (err) {
      console.error('Validate token error:', err);
      res.status(500).json({ error: 'Failed to validate examination access' });
    }
  });

  router.post('/student/exam/start', requireStudentSession, async (req: AuthenticatedRequest, res) => {
    try {
      const { attemptId } = req.studentSession!;
      const [attempt] = await db
        .select()
        .from(examAttempts)
        .where(eq(examAttempts.id, attemptId))
        .limit(1);

      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      if (attempt.status === 'Disqualified') {
        return res.status(403).json({ error: 'Participant is disqualified' });
      }
      if (['Submitted', 'Completed'].includes(attempt.status)) {
        return res.status(403).json({ error: 'Examination already submitted' });
      }

      const now = new Date();
      const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
      const [schedule] = await db.select().from(examSchedules).where(eq(examSchedules.id, attempt.scheduleId)).limit(1);
      if (!exam || !schedule) return res.status(404).json({ error: 'Exam configuration missing' });

      if (attempt.status === 'Not Started') {
        const durationEnd = new Date(now.getTime() + schedule.durationMinutes * 60 * 1000);
        const serverEndTime = durationEnd < schedule.endTime ? durationEnd : schedule.endTime;
        const [updated] = await db
          .update(examAttempts)
          .set({
            status: 'In Progress',
            startedAt: now,
            serverEndTime,
            lastSyncAt: now,
            updatedAt: now,
          })
          .where(eq(examAttempts.id, attempt.id))
          .returning();
        attempt.status = updated.status;
        attempt.startedAt = updated.startedAt;
        attempt.serverEndTime = updated.serverEndTime;

        broadcastMonitoringEvent(exam.subjectId, exam.id, {
          type: 'attempt:started',
          payload: {
            attemptId: attempt.id,
            studentNumber: attempt.studentNumber,
            studentName: attempt.studentName,
            className: attempt.className,
            status: 'In Progress',
          },
        });
      }

      // Fetch sanitized questions (ZERO answer keys, ZERO explanations)
      const qIds = attempt.questionOrder;
      const [qRows, optRows, pairRows, mediaRows, savedAnswers, subjectRow, settings] =
        await Promise.all([
          qIds.length ? db.select().from(questions).where(inArray(questions.id, qIds)) : Promise.resolve([]),
          qIds.length ? db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds)).orderBy(questionOptions.sortOrder) : Promise.resolve([]),
          qIds.length ? db.select().from(matchingPairs).where(inArray(matchingPairs.questionId, qIds)).orderBy(matchingPairs.sortOrder) : Promise.resolve([]),
          qIds.length ? db.select().from(questionMedia).where(inArray(questionMedia.questionId, qIds)) : Promise.resolve([]),
          db.select().from(studentAnswers).where(eq(studentAnswers.attemptId, attempt.id)),
          db.select().from(subjects).where(eq(subjects.id, exam.subjectId)).limit(1),
          getPortalSettings(),
        ]);

      const qMap = new Map(qRows.map((q) => [q.id, q]));
      const sanitizedQuestions = qIds
        .map((id) => qMap.get(id))
        .filter(Boolean)
        .map((q) => {
          const rawOpts = optRows.filter((o) => o.questionId === q!.id);
          const opts = exam.shuffleOptions && q!.questionType !== 'TRUE_FALSE' ? shuffleArray(rawOpts) : rawOpts;
          const pairs = pairRows.filter((p) => p.questionId === q!.id);
          const shuffledChoices = shuffleArray(
            pairs.map((p) => ({ matchKey: p.matchKey, matchText: p.matchText }))
          );

          return {
            id: q!.id,
            questionType: q!.questionType,
            questionText: q!.questionText,
            points: q!.points,
            options: opts.map((o) => ({
              optionKey: o.optionKey,
              optionText: o.optionText,
              mediaUrl: o.mediaUrl,
              mediaType: o.mediaType,
            })),
            matchingPrompts: pairs.map((p) => ({
              promptKey: p.promptKey,
              promptText: p.promptText,
            })),
            matchingChoices: shuffledChoices,
            media: mediaRows.filter((m) => m.questionId === q!.id),
          };
        });

      res.json({
        attempt: {
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt.toISOString(),
          serverEndTime: attempt.serverEndTime.toISOString(),
          serverNow: now.toISOString(),
          violationCount: attempt.violationCount,
          currentQuestionIndex: attempt.currentQuestionIndex,
        },
        exam: {
          id: exam.id,
          title: exam.title,
          subjectName: subjectRow[0]?.name || '',
          allowNavigation: exam.allowNavigation,
          allowPrevious: exam.allowPrevious,
          allowMarkReview: exam.allowMarkReview,
          showQuestionNumbers: exam.showQuestionNumbers,
          requireFullscreen: exam.requireFullscreen,
          antiCheatingEnabled: exam.antiCheatingEnabled,
          autosaveEnabled: exam.autosaveEnabled,
          autoSubmitEnabled: exam.autoSubmitEnabled,
          maxViolations: settings.maxViolationsBeforeDisqualification,
        },
        student: {
          studentNumber: attempt.studentNumber,
          studentName: attempt.studentName,
          className: attempt.className,
        },
        questions: sanitizedQuestions,
        savedAnswers: savedAnswers.map((a) => ({
          questionId: a.questionId,
          selectedOptions: a.selectedOptions,
          matchingAnswers: a.matchingAnswers,
          essayText: a.essayText || '',
          isMarkedForReview: a.isMarkedForReview,
        })),
      });
    } catch (err) {
      console.error('Start exam error:', err);
      res.status(500).json({ error: 'Failed to start examination session' });
    }
  });

  router.post('/student/exam/autosave', requireStudentSession, async (req: AuthenticatedRequest, res) => {
    try {
      const { attemptId } = req.studentSession!;
      const schema = z.object({
        currentQuestionIndex: z.number().min(0).optional(),
        answers: z.array(
          z.object({
            questionId: z.number(),
            selectedOptions: z.array(z.string()).default([]),
            matchingAnswers: z.record(z.string(), z.string()).default({}),
            essayText: z.string().default(''),
            isMarkedForReview: z.boolean().default(false),
          })
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid answer payload' });

      const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      if (attempt.status !== 'In Progress') {
        return res.status(403).json({ error: `Attempt is locked (${attempt.status})` });
      }

      const now = new Date();
      // Reject edits if server time expired (+5s network grace)
      if (now.getTime() > attempt.serverEndTime.getTime() + 5000) {
        return res.status(403).json({ error: 'Examination time has expired', expired: true });
      }

      for (const ans of parsed.data.answers) {
        await db
          .insert(studentAnswers)
          .values({
            attemptId: attempt.id,
            questionId: ans.questionId,
            selectedOptions: ans.selectedOptions,
            matchingAnswers: ans.matchingAnswers,
            essayText: ans.essayText,
            isMarkedForReview: ans.isMarkedForReview,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [studentAnswers.attemptId, studentAnswers.questionId],
            set: {
              selectedOptions: ans.selectedOptions,
              matchingAnswers: ans.matchingAnswers,
              essayText: ans.essayText,
              isMarkedForReview: ans.isMarkedForReview,
              updatedAt: now,
            },
          });
      }

      const allAnswers = await db
        .select()
        .from(studentAnswers)
        .where(eq(studentAnswers.attemptId, attempt.id));

      const answeredCount = allAnswers.filter(
        (a) =>
          (a.selectedOptions && a.selectedOptions.length > 0) ||
          (a.matchingAnswers && Object.keys(a.matchingAnswers).length > 0) ||
          (a.essayText && a.essayText.trim().length > 0)
      ).length;

      await db
        .update(examAttempts)
        .set({
          answeredCount,
          currentQuestionIndex: parsed.data.currentQuestionIndex ?? attempt.currentQuestionIndex,
          lastSyncAt: now,
          updatedAt: now,
        })
        .where(eq(examAttempts.id, attempt.id));

      const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
      if (exam) {
        broadcastMonitoringEvent(exam.subjectId, exam.id, {
          type: 'attempt:progress',
          payload: {
            attemptId: attempt.id,
            answeredCount,
            totalQuestions: attempt.totalQuestions,
            lastSyncAt: now.toISOString(),
          },
        });
      }

      res.json({ savedAt: now.toISOString(), serverNow: now.toISOString(), answeredCount });
    } catch (err) {
      console.error('Autosave error:', err);
      res.status(500).json({ error: 'Failed to save answers' });
    }
  });

  async function finalizeAndGradeAttempt(attemptId: number, finalStatus: 'Submitted' | 'Disqualified') {
    const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
    if (!attempt) return null;
    const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
    if (!exam) return null;

    const qIds = attempt.questionOrder;
    const [qRows, optRows, pairRows, ansRows] = await Promise.all([
      qIds.length ? db.select().from(questions).where(inArray(questions.id, qIds)) : Promise.resolve([]),
      qIds.length ? db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds)) : Promise.resolve([]),
      qIds.length ? db.select().from(matchingPairs).where(inArray(matchingPairs.questionId, qIds)) : Promise.resolve([]),
      db.select().from(studentAnswers).where(eq(studentAnswers.attemptId, attemptId)),
    ]);

    const ansMap = new Map(ansRows.map((a) => [a.questionId, a]));
    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let pendingEssayCount = 0;

    for (const q of qRows) {
      maxScore += q.points;
      const ans = ansMap.get(q.id);
      if (!ans) {
        if (q.questionType === 'ESSAY') pendingEssayCount += 1;
        else wrongCount += 1;
        continue;
      }

      if (q.questionType === 'MULTIPLE_CHOICE' || q.questionType === 'TRUE_FALSE') {
        const correctOpt = optRows.find((o) => o.questionId === q.id && o.isCorrect);
        const selected = ans.selectedOptions?.[0];
        const isCorrect = Boolean(correctOpt && selected && correctOpt.optionKey === selected);
        const earned = isCorrect ? q.points : 0;
        totalScore += earned;
        if (isCorrect) correctCount += 1;
        else wrongCount += 1;
        await db
          .update(studentAnswers)
          .set({ isCorrect, pointsEarned: earned })
          .where(eq(studentAnswers.id, ans.id));
      } else if (q.questionType === 'MULTIPLE_RESPONSE') {
        const correctKeys = optRows
          .filter((o) => o.questionId === q.id && o.isCorrect)
          .map((o) => o.optionKey)
          .sort();
        const selected = [...(ans.selectedOptions || [])].sort();
        const exactMatch =
          correctKeys.length === selected.length &&
          correctKeys.every((k, i) => k === selected[i]);

        let earned = 0;
        if (exactMatch) {
          earned = q.points;
          correctCount += 1;
        } else if (q.partialCredit && correctKeys.length > 0) {
          const hits = selected.filter((s) => correctKeys.includes(s)).length;
          const misses = selected.filter((s) => !correctKeys.includes(s)).length;
          const ratio = Math.max(0, (hits - misses) / correctKeys.length);
          earned = Number((ratio * q.points).toFixed(2));
          if (earned > 0) correctCount += 1;
          else wrongCount += 1;
        } else {
          wrongCount += 1;
        }
        totalScore += earned;
        await db
          .update(studentAnswers)
          .set({ isCorrect: exactMatch, pointsEarned: earned })
          .where(eq(studentAnswers.id, ans.id));
      } else if (q.questionType === 'MATCHING') {
        const pairs = pairRows.filter((p) => p.questionId === q.id);
        let hits = 0;
        for (const p of pairs) {
          if (ans.matchingAnswers?.[p.promptKey] === p.matchKey) {
            hits += 1;
          }
        }
        const isAllCorrect = pairs.length > 0 && hits === pairs.length;
        const earned = pairs.length > 0 ? Number(((hits / pairs.length) * q.points).toFixed(2)) : 0;
        totalScore += earned;
        if (isAllCorrect) correctCount += 1;
        else wrongCount += 1;
        await db
          .update(studentAnswers)
          .set({ isCorrect: isAllCorrect, pointsEarned: earned })
          .where(eq(studentAnswers.id, ans.id));
      } else if (q.questionType === 'ESSAY') {
        pendingEssayCount += 1;
      }
    }

    const now = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000)
    );
    const percentage = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;
    const gradingStatus = pendingEssayCount > 0 ? 'Pending Grading' : 'Graded';

    await db
      .update(examAttempts)
      .set({
        status: finalStatus,
        submittedAt: now,
        lastSyncAt: now,
        updatedAt: now,
      })
      .where(eq(examAttempts.id, attemptId));

    await db
      .insert(examResults)
      .values({
        attemptId,
        examId: exam.id,
        studentId: attempt.studentId,
        subjectId: exam.subjectId,
        totalQuestions: qRows.length,
        correctCount,
        wrongCount,
        pendingEssayCount,
        totalScore: Number(totalScore.toFixed(2)),
        maxScore: Number(maxScore.toFixed(2)),
        percentage,
        gradingStatus,
        durationSeconds,
        submittedAt: now,
      })
      .onConflictDoUpdate({
        target: examResults.attemptId,
        set: {
          correctCount,
          wrongCount,
          pendingEssayCount,
          totalScore: Number(totalScore.toFixed(2)),
          maxScore: Number(maxScore.toFixed(2)),
          percentage,
          gradingStatus,
          durationSeconds,
          submittedAt: now,
          updatedAt: now,
        },
      });

    return { now, exam };
  }

  router.post('/student/exam/violation', requireStudentSession, async (req: AuthenticatedRequest, res) => {
    try {
      const { attemptId } = req.studentSession!;
      const schema = z.object({
        violationType: z.string().min(2).max(100),
        description: z.string().max(300).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid violation payload' });

      const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      if (['Submitted', 'Completed', 'Disqualified'].includes(attempt.status)) {
        return res.json({
          violationCount: attempt.violationCount,
          disqualified: attempt.status === 'Disqualified',
          severity: 'Locked',
        });
      }

      const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
      const settings = await getPortalSettings();
      const maxWarnings = settings.maxViolationsBeforeDisqualification || 3;

      const nextCount = attempt.violationCount + 1;
      let severity = 'Warning 1';
      let disqualified = false;

      if (nextCount === 1) severity = 'Warning 1';
      else if (nextCount === 2) severity = 'Warning 2';
      else if (nextCount <= maxWarnings) severity = 'Final Warning';
      else {
        severity = 'Auto Disqualification';
        disqualified = true;
      }

      const now = new Date();
      await db.insert(violations).values({
        attemptId: attempt.id,
        examId: attempt.examId,
        studentId: attempt.studentId,
        studentNumber: attempt.studentNumber,
        studentName: attempt.studentName,
        className: attempt.className,
        subjectId: exam?.subjectId ?? null,
        violationType: parsed.data.violationType,
        violationNumber: nextCount,
        severity,
        description: parsed.data.description || parsed.data.violationType,
        occurredAt: now,
        source: 'realtime',
        status: disqualified ? 'Disqualified' : 'Recorded',
      });

      await db
        .update(examAttempts)
        .set({
          violationCount: nextCount,
          disqualificationReason: disqualified
            ? `Exceeded maximum warnings (${nextCount} violations: ${parsed.data.violationType})`
            : null,
          disqualifiedAt: disqualified ? now : null,
          updatedAt: now,
        })
        .where(eq(examAttempts.id, attempt.id));

      if (disqualified) {
        await finalizeAndGradeAttempt(attempt.id, 'Disqualified');
      }

      if (exam) {
        broadcastMonitoringEvent(exam.subjectId, exam.id, {
          type: disqualified ? 'attempt:disqualified' : 'violation:recorded',
          payload: {
            attemptId: attempt.id,
            studentNumber: attempt.studentNumber,
            studentName: attempt.studentName,
            className: attempt.className,
            violationType: parsed.data.violationType,
            violationCount: nextCount,
            severity,
            occurredAt: now.toISOString(),
          },
        });
      }

      res.json({
        violationCount: nextCount,
        maxWarnings,
        severity,
        disqualified,
      });
    } catch (err) {
      console.error('Violation log error:', err);
      res.status(500).json({ error: 'Failed to record security violation' });
    }
  });

  router.post('/student/exam/submit', requireStudentSession, async (req: AuthenticatedRequest, res) => {
    try {
      const { attemptId } = req.studentSession!;
      const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

      if (attempt.status === 'Disqualified') {
        return res.status(403).json({ error: 'Attempt has been locked due to disqualification' });
      }

      const result = await finalizeAndGradeAttempt(attemptId, 'Submitted');
      if (result) {
        broadcastMonitoringEvent(result.exam.subjectId, result.exam.id, {
          type: 'attempt:submitted',
          payload: {
            attemptId,
            studentNumber: attempt.studentNumber,
            studentName: attempt.studentName,
            status: 'Submitted',
            submittedAt: result.now.toISOString(),
          },
        });
      }

      // Strictly return ONLY submission confirmation (never score, never answers)
      res.json({
        submitted: true,
        submittedAt: result?.now.toISOString() || new Date().toISOString(),
      });
    } catch (err) {
      console.error('Submit exam error:', err);
      res.status(500).json({ error: 'Failed to submit examination' });
    }
  });

  // ==========================================
  // 10. LIVE MONITORING, RESULTS, ESSAY GRADING
  // ==========================================

  router.get('/monitoring/attempts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const examIdFilter = req.query.examId ? Number(req.query.examId) : null;

      if (user.role !== 'admin' && user.subjectIds.length === 0) return res.json([]);

      const scopedExams = await db
        .select()
        .from(exams)
        .where(
          and(
            isNull(exams.deletedAt),
            user.role === 'admin' ? sql`true` : inArray(exams.subjectId, user.subjectIds)
          )
        );
      const scopedExamIds = scopedExams.map((e) => e.id);
      if (scopedExamIds.length === 0) return res.json([]);

      const targetExamIds = examIdFilter
        ? scopedExamIds.filter((id) => id === examIdFilter)
        : scopedExamIds;
      if (targetExamIds.length === 0) return res.status(403).json({ error: 'Access denied' });

      const [attemptRows, violationRows, subjectRows] = await Promise.all([
        db
          .select()
          .from(examAttempts)
          .where(inArray(examAttempts.examId, targetExamIds))
          .orderBy(desc(examAttempts.updatedAt)),
        db
          .select()
          .from(violations)
          .where(inArray(violations.examId, targetExamIds))
          .orderBy(desc(violations.occurredAt)),
        db.select().from(subjects),
      ]);

      const examMap = new Map(scopedExams.map((e) => [e.id, e]));
      const subMap = new Map(subjectRows.map((s) => [s.id, s]));

      res.json(
        attemptRows.map((a) => {
          const exam = examMap.get(a.examId);
          const sub = exam ? subMap.get(exam.subjectId) : undefined;
          const nowMs = Date.now();
          const lastSyncMs = a.lastSyncAt.getTime();
          const isStale = a.status === 'In Progress' && nowMs - lastSyncMs > 90000;
          return {
            ...a,
            displayStatus: isStale ? 'Connection Lost' : a.status,
            examTitle: exam?.title || '',
            subjectName: sub?.name || '',
            remainingSeconds:
              a.status === 'In Progress'
                ? Math.max(0, Math.floor((a.serverEndTime.getTime() - nowMs) / 1000))
                : 0,
            violations: violationRows.filter((v) => v.attemptId === a.id),
          };
        })
      );
    } catch (err) {
      console.error('Monitoring error:', err);
      res.status(500).json({ error: 'Failed to load monitoring data' });
    }
  });

  router.get('/results', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      if (user.role !== 'admin' && user.subjectIds.length === 0) return res.json([]);

      const [resultRows, studentRows, examRows, subjectRows] = await Promise.all([
        db
          .select()
          .from(examResults)
          .where(user.role === 'admin' ? sql`true` : inArray(examResults.subjectId, user.subjectIds))
          .orderBy(desc(examResults.submittedAt)),
        db.select().from(students),
        db.select().from(exams),
        db.select().from(subjects),
      ]);

      const studentMap = new Map(studentRows.map((s) => [s.id, s]));
      const examMap = new Map(examRows.map((e) => [e.id, e]));
      const subMap = new Map(subjectRows.map((s) => [s.id, s]));

      res.json(
        resultRows.map((r) => {
          const st = studentMap.get(r.studentId);
          const ex = examMap.get(r.examId);
          const sub = subMap.get(r.subjectId);
          return {
            ...r,
            studentNumber: st?.studentNumber || '',
            studentName: st?.fullName || '',
            className: st?.className || '',
            examTitle: ex?.title || '',
            subjectName: sub?.name || '',
            subjectCode: sub?.code || '',
          };
        })
      );
    } catch (err) {
      console.error('Get results error:', err);
      res.status(500).json({ error: 'Failed to load results' });
    }
  });

  router.get('/results/:attemptId/answers', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const user = req.authUser!;
      const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

      const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
      if (!exam || !assertSubjectAccess(user, exam.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [ansRows, qRows] = await Promise.all([
        db.select().from(studentAnswers).where(eq(studentAnswers.attemptId, attemptId)),
        attempt.questionOrder.length
          ? db.select().from(questions).where(inArray(questions.id, attempt.questionOrder))
          : Promise.resolve([]),
      ]);
      const qMap = new Map(qRows.map((q) => [q.id, q]));

      res.json(
        ansRows.map((a) => ({
          ...a,
          question: qMap.get(a.questionId) || null,
        }))
      );
    } catch {
      res.status(500).json({ error: 'Failed to load attempt answers' });
    }
  });

  router.post('/results/:attemptId/grade-essay', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const user = req.authUser!;
      const schema = z.object({
        grades: z.array(
          z.object({
            answerId: z.number(),
            pointsEarned: z.number().min(0),
            graderNotes: z.string().optional(),
          })
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid grading payload' });

      const [resultRow] = await db
        .select()
        .from(examResults)
        .where(eq(examResults.attemptId, attemptId))
        .limit(1);
      if (!resultRow) return res.status(404).json({ error: 'Result record not found' });
      if (!assertSubjectAccess(user, resultRow.subjectId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const now = new Date();
      for (const g of parsed.data.grades) {
        await db
          .update(studentAnswers)
          .set({
            pointsEarned: g.pointsEarned,
            isCorrect: g.pointsEarned > 0,
            graderNotes: g.graderNotes || null,
            gradedByProfileId: user.id,
            gradedAt: now,
          })
          .where(and(eq(studentAnswers.id, g.answerId), eq(studentAnswers.attemptId, attemptId)));
      }

      const allAns = await db.select().from(studentAnswers).where(eq(studentAnswers.attemptId, attemptId));
      const newTotalScore = Number(allAns.reduce((sum, a) => sum + (a.pointsEarned || 0), 0).toFixed(2));
      const percentage =
        resultRow.maxScore > 0 ? Number(((newTotalScore / resultRow.maxScore) * 100).toFixed(2)) : 0;

      const [updated] = await db
        .update(examResults)
        .set({
          totalScore: newTotalScore,
          percentage,
          pendingEssayCount: 0,
          gradingStatus: 'Graded',
          updatedAt: now,
        })
        .where(eq(examResults.id, resultRow.id))
        .returning();

      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'GRADE_ESSAY',
        resourceType: 'exam_result',
        resourceId: String(resultRow.id),
      });

      res.json(updated);
    } catch (err) {
      console.error('Grade essay error:', err);
      res.status(500).json({ error: 'Failed to save essay grades' });
    }
  });

  // ==========================================
  // 11. VIOLATIONS, IMPORTS (SCORES & VIOLATIONS)
  // ==========================================

  router.get('/violations', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      if (user.role !== 'admin' && user.subjectIds.length === 0) return res.json([]);
      const rows = await db
        .select()
        .from(violations)
        .where(user.role === 'admin' ? sql`true` : inArray(violations.subjectId, user.subjectIds))
        .orderBy(desc(violations.occurredAt));

      const [subjectRows, examRows] = await Promise.all([db.select().from(subjects), db.select().from(exams)]);
      const subMap = new Map(subjectRows.map((s) => [s.id, s]));
      const examMap = new Map(examRows.map((e) => [e.id, e]));

      res.json(
        rows.map((v) => ({
          ...v,
          subjectName: v.subjectId ? subMap.get(v.subjectId)?.name || '' : '',
          examTitle: v.examId ? examMap.get(v.examId)?.title || '' : '',
        }))
      );
    } catch {
      res.status(500).json({ error: 'Failed to fetch violations' });
    }
  });

  router.post('/imports/scores', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const schema = z.object({
        fileName: z.string(),
        rows: z.array(
          z.object({
            studentNumber: z.string(),
            studentName: z.string(),
            className: z.string(),
            subjectName: z.string(),
            examination: z.string(),
            score: z.number(),
            remarks: z.string().optional(),
          })
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid score import payload' });

      const [allStudents, allSubjects, allExams] = await Promise.all([
        db.select().from(students).where(isNull(students.deletedAt)),
        db.select().from(subjects),
        db.select().from(exams).where(isNull(exams.deletedAt)),
      ]);

      const studentByNum = new Map(allStudents.map((s) => [s.studentNumber.trim(), s]));
      const subjectByName = new Map(allSubjects.map((s) => [s.name.toLowerCase().trim(), s]));
      const subjectByCode = new Map(allSubjects.map((s) => [s.code.toLowerCase().trim(), s]));

      let successRows = 0;
      let failedRows = 0;
      const errors: string[] = [];

      for (let i = 0; i < parsed.data.rows.length; i++) {
        const r = parsed.data.rows[i];
        const st = studentByNum.get(r.studentNumber.trim());
        if (!st) {
          failedRows += 1;
          errors.push(`Row ${i + 1}: Unregistered student number "${r.studentNumber}"`);
          continue;
        }
        const sub =
          subjectByName.get(r.subjectName.toLowerCase().trim()) ||
          subjectByCode.get(r.subjectName.toLowerCase().trim());
        if (!sub) {
          failedRows += 1;
          errors.push(`Row ${i + 1}: Unknown subject "${r.subjectName}"`);
          continue;
        }
        if (!assertSubjectAccess(user, sub.id)) {
          failedRows += 1;
          errors.push(`Row ${i + 1}: Unauthorized subject "${sub.name}"`);
          continue;
        }

        let exam = allExams.find(
          (e) => e.subjectId === sub.id && e.title.toLowerCase() === r.examination.toLowerCase().trim()
        );
        if (!exam) {
          const [createdExam] = await db
            .insert(exams)
            .values({
              title: r.examination.trim(),
              subjectId: sub.id,
              className: r.className.trim().toUpperCase(),
              status: 'Completed',
              createdByProfileId: user.id,
            })
            .returning();
          exam = createdExam;
          allExams.push(createdExam);
        }

        await db.insert(examResults).values({
          examId: exam.id,
          studentId: st.id,
          subjectId: sub.id,
          totalQuestions: 0,
          correctCount: 0,
          wrongCount: 0,
          pendingEssayCount: 0,
          totalScore: r.score,
          maxScore: 100,
          percentage: r.score,
          gradingStatus: 'Graded',
          remarks: r.remarks || 'Imported Score',
        });
        successRows += 1;
      }

      await db.insert(scoreImports).values({
        importedByProfileId: user.id,
        fileName: parsed.data.fileName,
        totalRows: parsed.data.rows.length,
        successRows,
        failedRows,
        summary: { errors },
      });

      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'IMPORT_SCORES',
        resourceType: 'exam_result',
        details: { fileName: parsed.data.fileName, successRows, failedRows },
      });

      res.json({ totalRows: parsed.data.rows.length, successRows, failedRows, errors });
    } catch (err) {
      console.error('Import scores error:', err);
      res.status(500).json({ error: 'Failed to import scores' });
    }
  });

  router.post('/imports/violations', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const schema = z.object({
        rows: z.array(
          z.object({
            studentNumber: z.string(),
            studentName: z.string(),
            className: z.string(),
            examination: z.string(),
            violationType: z.string(),
            violationCount: z.number().default(1),
            violationDate: z.string(),
            remarks: z.string().optional(),
            status: z.string().default('Recorded'),
          })
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid violation import payload' });

      const [allStudents, allExams] = await Promise.all([
        db.select().from(students).where(isNull(students.deletedAt)),
        db.select().from(exams).where(isNull(exams.deletedAt)),
      ]);
      const studentMap = new Map(allStudents.map((s) => [s.studentNumber.trim(), s]));

      let imported = 0;
      for (const r of parsed.data.rows) {
        const st = studentMap.get(r.studentNumber.trim());
        const exam = allExams.find((e) => e.title.toLowerCase() === r.examination.toLowerCase().trim());
        if (exam && !assertSubjectAccess(user, exam.subjectId)) {
          continue;
        }
        await db.insert(violations).values({
          examId: exam?.id ?? null,
          studentId: st?.id ?? null,
          studentNumber: r.studentNumber.trim(),
          studentName: r.studentName.trim(),
          className: r.className.trim().toUpperCase(),
          subjectId: exam?.subjectId ?? (user.subjectIds[0] || null),
          violationType: r.violationType.trim(),
          violationNumber: r.violationCount,
          severity: r.violationCount >= 4 ? 'Auto Disqualification' : `Warning ${Math.min(3, r.violationCount)}`,
          description: r.remarks || r.examination,
          occurredAt: new Date(r.violationDate || Date.now()),
          source: 'import',
          status: r.status || 'Recorded',
        });
        imported += 1;
      }

      await writeAuditLog({
        actorProfileId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'IMPORT_VIOLATIONS',
        resourceType: 'violation',
        details: { imported },
      });

      res.json({ imported });
    } catch (err) {
      console.error('Import violations error:', err);
      res.status(500).json({ error: 'Failed to import violation records' });
    }
  });

  // ==========================================
  // 12. ADMISSION CARDS, SETTINGS & AUDIT LOGS
  // ==========================================

  router.get('/admission-cards', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const [cards, studentRows] = await Promise.all([
        db.select().from(admissionCards).orderBy(desc(admissionCards.issuedAt)),
        db.select().from(students).where(isNull(students.deletedAt)),
      ]);
      const stMap = new Map(studentRows.map((s) => [s.id, s]));
      res.json(
        cards.map((c) => ({
          ...c,
          student: stMap.get(c.studentId) || null,
        }))
      );
    } catch {
      res.status(500).json({ error: 'Failed to load admission cards' });
    }
  });

  router.post('/admission-cards/generate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        studentIds: z.array(z.number()).optional(),
        academicYear: z.string().default('2026/2027'),
        semester: z.string().default('Ganjil'),
        sessionLabel: z.string().default('Sesi 1 — Ruang Utama'),
        cardWidthMm: z.number().min(60).max(210).default(95),
        cardHeightMm: z.number().min(40).max(297).default(60),
        paperSize: z.enum(['A4', 'F4', 'Letter']).default('A4'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid admission card configuration' });

      const targetStudents = parsed.data.studentIds?.length
        ? await db.select().from(students).where(inArray(students.id, parsed.data.studentIds))
        : await db.select().from(students).where(isNull(students.deletedAt));

      const results = [];
      for (const st of targetStudents) {
        const participantNumber = st.studentNumber;
        const qrPayload = JSON.stringify({
          school: 'SMP Kartini 1 Batam',
          participantNumber,
          name: st.fullName,
          class: st.className,
          academicYear: parsed.data.academicYear,
        });

        const [card] = await db
          .insert(admissionCards)
          .values({
            studentId: st.id,
            participantNumber,
            academicYear: parsed.data.academicYear,
            semester: parsed.data.semester,
            sessionLabel: parsed.data.sessionLabel,
            qrPayload,
            cardWidthMm: parsed.data.cardWidthMm,
            cardHeightMm: parsed.data.cardHeightMm,
            paperSize: parsed.data.paperSize,
          })
          .onConflictDoUpdate({
            target: admissionCards.participantNumber,
            set: {
              academicYear: parsed.data.academicYear,
              semester: parsed.data.semester,
              sessionLabel: parsed.data.sessionLabel,
              qrPayload,
              cardWidthMm: parsed.data.cardWidthMm,
              cardHeightMm: parsed.data.cardHeightMm,
              paperSize: parsed.data.paperSize,
              issuedAt: new Date(),
            },
          })
          .returning();

        results.push({ ...card, student: st });
      }

      res.json(results);
    } catch (err) {
      console.error('Admission card generation error:', err);
      res.status(500).json({ error: 'Failed to generate admission cards' });
    }
  });

  router.get('/settings', requireAuth, async (_req, res) => {
    try {
      res.json(await getPortalSettings());
    } catch {
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  router.put('/settings', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const current = await getPortalSettings();
      const updated = { ...current, ...req.body };
      await db
        .insert(systemSettings)
        .values({
          settingKey: 'portal_config',
          settingValue: updated,
          updatedByProfileId: req.authUser!.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.settingKey,
          set: {
            settingValue: updated,
            updatedByProfileId: req.authUser!.id,
            updatedAt: new Date(),
          },
        });

      await writeAuditLog({
        actorProfileId: req.authUser!.id,
        actorName: req.authUser!.fullName,
        actorRole: 'admin',
        action: 'UPDATE_SYSTEM_SETTINGS',
        resourceType: 'system_settings',
      });

      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to save system settings' });
    }
  });

  router.get('/audit-logs', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to load audit logs' });
    }
  });

  return router;
}
