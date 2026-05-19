import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Message } from '../types';

/** Row shape from `public.chat_messages`. */
export type ChatMessageRow = {
  id: string;
  patient_id: string;
  therapist_id: string;
  content: string;
  from_patient: boolean;
  ai_clinical_alert: boolean;
  created_at: string;
};

export type ChatViewerRole = 'therapist' | 'patient';

export function chatRowToMessage(row: ChatMessageRow): Message {
  return {
    id: row.id,
    patientId: row.patient_id,
    content: row.content ?? '',
    timestamp: row.created_at,
    isRead: false,
    fromPatient: row.from_patient,
    aiClinicalAlert: row.ai_clinical_alert,
  };
}

/** Default read state when hydrating from DB (local `markMessageRead` still overrides by id). */
export function defaultIsReadForViewer(m: Message, viewer: ChatViewerRole): boolean {
  if (viewer === 'therapist') {
    return !m.fromPatient && !m.aiClinicalAlert;
  }
  return m.fromPatient;
}

export function mergeChatMessages(
  prev: Message[],
  incoming: Message[],
  viewer: ChatViewerRole
): Message[] {
  const readById = new Map(prev.filter((m) => m.isRead).map((m) => [m.id, true]));
  const byId = new Map<string, Message>();
  for (const m of prev) {
    byId.set(m.id, m);
  }
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(m.id, {
      ...m,
      isRead: readById.get(m.id) ?? existing?.isRead ?? defaultIsReadForViewer(m, viewer),
    });
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function mergeChatMessage(
  prev: Message[],
  incoming: Message,
  viewer: ChatViewerRole
): Message[] {
  return mergeChatMessages(prev, [incoming], viewer);
}

export function countUnreadForTherapist(messages: Message[], patientId: string): number {
  return messages.filter(
    (m) =>
      m.patientId === patientId &&
      !m.isRead &&
      (m.fromPatient || m.aiClinicalAlert)
  ).length;
}

export async function fetchChatMessages(
  client: SupabaseClient,
  opts?: { patientId?: string; limit?: number }
): Promise<{ ok: true; messages: Message[] } | { ok: false; message: string }> {
  let q = client
    .from('chat_messages')
    .select('id, patient_id, therapist_id, content, from_patient, ai_clinical_alert, created_at')
    .order('created_at', { ascending: true });

  const patientId = opts?.patientId?.trim();
  if (patientId) {
    q = q.eq('patient_id', patientId);
  }

  const limit = opts?.limit ?? 500;
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    return { ok: false, message: error.message };
  }

  const rows = (data ?? []) as ChatMessageRow[];
  return { ok: true, messages: rows.map(chatRowToMessage) };
}

export async function insertTherapistChatMessage(
  client: SupabaseClient,
  params: {
    patientId: string;
    therapistId: string;
    content: string;
  }
): Promise<{ ok: true; message: Message } | { ok: false; message: string }> {
  const pid = params.patientId.trim();
  const body = params.content.trim();
  const therapistRowId = params.therapistId.trim();
  if (!pid || !body || !therapistRowId) {
    return { ok: false, message: 'empty_patient_content_or_therapist' };
  }

  const { data, error } = await client
    .from('chat_messages')
    .insert({
      patient_id: pid,
      therapist_id: therapistRowId,
      content: body,
      from_patient: false,
      ai_clinical_alert: false,
    })
    .select('id, patient_id, therapist_id, content, from_patient, ai_clinical_alert, created_at')
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data) {
    return { ok: false, message: 'insert_returned_no_row' };
  }

  const msg = chatRowToMessage(data as ChatMessageRow);
  msg.isRead = true;
  return { ok: true, message: msg };
}

export async function insertPatientChatMessage(
  client: SupabaseClient,
  params: {
    patientId: string;
    therapistId: string;
    content: string;
  }
): Promise<{ ok: true; message: Message } | { ok: false; message: string }> {
  const pid = params.patientId.trim();
  const body = params.content.trim();
  const therapistId = params.therapistId.trim();
  if (!pid || !body || !therapistId) {
    return { ok: false, message: 'empty_patient_content_or_therapist' };
  }

  const { data, error } = await client
    .from('chat_messages')
    .insert({
      patient_id: pid,
      therapist_id: therapistId,
      content: body,
      from_patient: true,
      ai_clinical_alert: false,
    })
    .select('id, patient_id, therapist_id, content, from_patient, ai_clinical_alert, created_at')
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data) {
    return { ok: false, message: 'insert_returned_no_row' };
  }

  const msg = chatRowToMessage(data as ChatMessageRow);
  msg.isRead = true;
  return { ok: true, message: msg };
}

export type ChatRealtimeSubscription = {
  unsubscribe: () => void;
};

/**
 * Supabase Realtime on `chat_messages` INSERT. RLS scopes rows to therapist or patient session.
 */
export function subscribeChatMessages(
  client: SupabaseClient,
  opts: {
    patientId?: string;
    viewer: ChatViewerRole;
    onInsert: (message: Message) => void;
  }
): ChatRealtimeSubscription {
  const filter = opts.patientId?.trim()
    ? `patient_id=eq.${opts.patientId.trim()}`
    : undefined;

  const channel: RealtimeChannel = client
    .channel(`chat_messages:${opts.viewer}:${opts.patientId ?? 'all'}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        ...(filter ? { filter } : {}),
      },
      (payload) => {
        const row = payload.new as ChatMessageRow | null;
        if (!row?.id) return;
        const msg = chatRowToMessage(row);
        msg.isRead = defaultIsReadForViewer(msg, opts.viewer);
        opts.onInsert(msg);
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      void client.removeChannel(channel);
    },
  };
}

const THERAPIST_MESSAGE_PUSH_BODY = 'המטפל שלך שלח לך הודעה';

/**
 * Placeholder for FCM / Expo push. Production delivery is via DB webhook → `notify-new-message` Edge Function.
 * Wire Firebase/Expo here when client-side or direct API sends are needed.
 */
export async function sendPushNotification(
  patientId: string,
  messageText?: string
): Promise<void> {
  if (import.meta.env.DEV) {
    console.log('[sendPushNotification] placeholder', {
      patientId,
      body: messageText?.trim() || THERAPIST_MESSAGE_PUSH_BODY,
    });
  }
  // Future: Expo Push API / FCM using patients.push_token
}
