// Strictly holds tokens in JS memory (never in localStorage or sessionStorage)
let staffToken: string | null = null;
let studentToken: string | null = null;
let firebaseTokenGetter: (() => Promise<string | null>) | null = null;

export function setStaffToken(token: string | null) {
  staffToken = token;
}

export function getStaffToken(): string | null {
  return staffToken;
}

export function setFirebaseTokenGetter(getter: (() => Promise<string | null>) | null) {
  firebaseTokenGetter = getter;
}

export function setStudentToken(token: string | null) {
  studentToken = token;
}

export function getStudentToken(): string | null {
  return studentToken;
}

export async function getActiveAuthHeader(): Promise<string | null> {
  if (staffToken) return `Bearer ${staffToken}`;
  if (firebaseTokenGetter) {
    const fbToken = await firebaseTokenGetter();
    if (fbToken) return `Bearer ${fbToken}`;
  }
  return null;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}${cleanPath}`;
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function wsUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    const parsed = new URL(API_BASE_URL);
    const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${parsed.host}${normalized}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${normalized}`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    let msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as any).error)
        : `Request failed (${res.status})`;
    if (res.status === 404 && !contentType.includes('application/json') && !API_BASE_URL) {
      msg = 'Backend API tidak tersedia pada hosting statis. Hubungkan VITE_API_BASE_URL atau jalankan aplikasi pada server Node.js (Cloud Run / VPS).';
    }
    const err = new Error(msg) as Error & { status?: number; payload?: unknown };
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  mode: 'staff' | 'student' | 'public' = 'staff'
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (mode === 'staff') {
    const auth = await getActiveAuthHeader();
    if (auth) headers.set('Authorization', auth);
  } else if (mode === 'student' && studentToken) {
    headers.set('Authorization', `Bearer ${studentToken}`);
  }

  const res = await fetch(apiUrl(path), {
    ...options,
    headers,
  });
  return handleResponse<T>(res);
}

export async function uploadMediaFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{
  storageUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  mediaType: 'image' | 'audio' | 'video';
}> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File exceeds the 10 MB maximum upload limit.');
  }

  const auth = await getActiveAuthHeader();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/media/upload'));
    if (auth) xhr.setRequestHeader('Authorization', auth);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed);
        } else {
          reject(new Error(parsed?.error || 'Upload failed'));
        }
      } catch {
        reject(new Error('Invalid upload server response'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during file upload'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
