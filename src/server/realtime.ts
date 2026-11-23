import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticateStaffToken } from './auth.ts';
import type { AuthUser } from '../types/exam.ts';

interface MonitoringClient {
  ws: WebSocket;
  user: AuthUser;
  examId?: number;
}

const monitoringClients = new Set<MonitoringClient>();

export function setupWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/ws/monitoring') {
      return;
    }

    const token = url.searchParams.get('token') || '';
    const user = await authenticateStaffToken(token);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const examIdParam = url.searchParams.get('examId');
    const examId = examIdParam ? Number(examIdParam) : undefined;

    wss.handleUpgrade(request, socket, head, (ws) => {
      const client: MonitoringClient = { ws, user, examId };
      monitoringClients.add(client);

      ws.send(
        JSON.stringify({
          type: 'monitoring:connected',
          timestamp: new Date().toISOString(),
        })
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; examId?: number };
          if (msg.type === 'subscribe:exam') {
            client.examId = msg.examId ? Number(msg.examId) : undefined;
          }
        } catch {
          // Ignore malformed control messages
        }
      });

      ws.on('close', () => {
        monitoringClients.delete(client);
      });
    });
  });
}

export function broadcastMonitoringEvent(
  subjectId: number,
  examId: number,
  event: {
    type: string;
    payload: Record<string, unknown>;
  }
) {
  const serialized = JSON.stringify({
    ...event,
    examId,
    subjectId,
    timestamp: new Date().toISOString(),
  });

  for (const client of monitoringClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (client.user.role !== 'admin' && !client.user.subjectIds.includes(subjectId)) {
      continue;
    }
    if (client.examId && client.examId !== examId) {
      continue;
    }
    client.ws.send(serialized);
  }
}
