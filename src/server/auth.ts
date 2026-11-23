import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { profiles, roles, subjects, teachers, teacherSubjects } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { AuthUser } from '../types/exam.ts';

const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET && process.env.AUTH_SESSION_SECRET.length >= 16
    ? process.env.AUTH_SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const INITIAL_ADMIN_EMAIL = (
  process.env.INITIAL_ADMIN_EMAIL || 'mess.televisi@gmail.com'
).toLowerCase();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

interface SignedPayload {
  type: 'staff' | 'student';
  profileId?: number;
  attemptId?: number;
  studentId?: number;
  scheduleId?: number;
  role?: 'admin' | 'teacher' | 'student';
  exp: number;
}

export function signSessionToken(payload: Omit<SignedPayload, 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const fullPayload: SignedPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `krt.${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SignedPayload | null {
  if (!token.startsWith('krt.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function buildAuthUser(profileId: number): Promise<AuthUser | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile || !profile.isActive) return null;

  if (profile.role === 'admin') {
    const allSubjects = await db.select().from(subjects);
    return {
      id: profile.id,
      uid: profile.uid,
      role: 'admin',
      username: profile.username,
      email: profile.email,
      fullName: profile.fullName,
      teacherId: null,
      subjectIds: allSubjects.map((s) => s.id),
      subjectNames: allSubjects.map((s) => s.name),
    };
  }

  const [teacher] = await db
    .select()
    .from(teachers)
    .where(eq(teachers.profileId, profile.id))
    .limit(1);

  if (!teacher || !teacher.isActive) return null;

  const assigned = await db
    .select({
      subjectId: subjects.id,
      subjectName: subjects.name,
    })
    .from(teacherSubjects)
    .innerJoin(subjects, eq(teacherSubjects.subjectId, subjects.id))
    .where(eq(teacherSubjects.teacherId, teacher.id));

  return {
    id: profile.id,
    uid: profile.uid,
    role: 'teacher',
    username: profile.username,
    email: profile.email,
    fullName: profile.fullName,
    teacherId: teacher.id,
    subjectIds: assigned.map((a) => a.subjectId),
    subjectNames: assigned.map((a) => a.subjectName),
  };
}

export async function syncFirebaseUserToProfile(uid: string, email: string, displayName?: string): Promise<AuthUser | null> {
  const normalizedEmail = email.toLowerCase();

  const existingByUid = await db
    .select()
    .from(profiles)
    .where(eq(profiles.uid, uid))
    .limit(1);

  if (existingByUid.length > 0) {
    await db
      .update(profiles)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(profiles.id, existingByUid[0].id));
    return buildAuthUser(existingByUid[0].id);
  }

  const existingByEmail = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);

  if (existingByEmail.length > 0) {
    await db
      .update(profiles)
      .set({ uid, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(profiles.id, existingByEmail[0].id));
    return buildAuthUser(existingByEmail[0].id);
  }

  // Only auto-provision initial Admin if email matches INITIAL_ADMIN_EMAIL
  if (normalizedEmail === INITIAL_ADMIN_EMAIL) {
    const [adminRole] = await db.select().from(roles).where(eq(roles.name, 'admin')).limit(1);
    const [inserted] = await db
      .insert(profiles)
      .values({
        uid,
        roleId: adminRole?.id ?? null,
        role: 'admin',
        username: 'admin',
        email: normalizedEmail,
        fullName: displayName || 'Administrator SMP Kartini 1 Batam',
        isActive: true,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profiles.email,
        set: { uid, lastLoginAt: new Date(), updatedAt: new Date() },
      })
      .returning();

    return buildAuthUser(inserted.id);
  }

  return null;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  studentSession?: {
    attemptId: number;
    studentId: number;
    scheduleId: number;
  };
}

export async function authenticateStaffToken(bearerToken: string): Promise<AuthUser | null> {
  if (bearerToken.startsWith('krt.')) {
    const payload = verifySessionToken(bearerToken);
    if (!payload || payload.type !== 'staff' || !payload.profileId) return null;
    return buildAuthUser(payload.profileId);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(bearerToken);
    if (!decoded.email) return null;
    return syncFirebaseUserToProfile(decoded.uid, decoded.email, decoded.name);
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const user = await authenticateStaffToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired authentication session' });
  }
  req.authUser = user;
  next();
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required' });
  }
  next();
};

export const requireStudentSession = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Student exam session required' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (
    !payload ||
    payload.type !== 'student' ||
    !payload.attemptId ||
    !payload.studentId ||
    !payload.scheduleId
  ) {
    return res.status(401).json({ error: 'Invalid or expired exam session' });
  }
  req.studentSession = {
    attemptId: payload.attemptId,
    studentId: payload.studentId,
    scheduleId: payload.scheduleId,
  };
  next();
};

export function assertSubjectAccess(user: AuthUser, subjectId: number): boolean {
  if (user.role === 'admin') return true;
  return user.subjectIds.includes(subjectId);
}
