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
  read_by_therapist?: boolean;
  read_by_patient?: boolean;
};

export type ChatViewerRole = 'therapist' | 'patient';

export function messageIsReadForViewer(
  row: Pick<
    ChatMessageRow,
    'from_patient' | 'ai_clinical_alert' | 'read_by_therapist' | 'read_by_patient'
  >,
  viewer: ChatViewerRole
): boolean {
  if (viewer === 'therapist') {
    if (typeof row.read_by_therapist === 'boolean') return row.read_by_therapist;
    return !row.from_patient && !row.ai_clinical_alert;
  }
  if (typeof row.read_by_patient === 'boolean') return row.read_by_patient;
  return row.from_patient;
}

export function chatRowToMessage(row: ChatMessageRow, viewer?: ChatViewerRole): Message {
  const base = {
    id: row.id,
    patientId: row.patient_id,
    content: row.content ?? '',
    timestamp: row.created_at,
    fromPatient: row.from_patient,
    aiClinicalAlert: row.ai_clinical_alert,
  };
  return {
    ...base,
    isRead: viewer ? messageIsReadForViewer(row, viewer) : false,
  };
}

/** Default read state when hydrating without DB read columns (legacy). */
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
      isRead: readById.get(m.id) ?? existing?.isRead ?? m.isRead ?? defaultIsReadForViewer(m, viewer),
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

export function countUnreadForPatient(messages: Message[], patientId: string): number {
  return messages.filter(
    (m) => m.patientId === patientId && !m.isRead && !m.fromPatient
  ).length;
}

const CHAT_SELECT =
  'id, patient_id, therapist_id, content, from_patient, ai_clinical_alert, created_at, read_by_therapist, read_by_patient';

/** PostgREST sort column on `public.chat_messages` — must stay the full name, never `_at`. */
const CHAT_ORDER_COLUMN = 'created_at' as const;

const CHAT_SELECT_LEGACY =
  'id, patient_id, therapist_id, content, from_patient, ai_clinical_alert, created_at';

const CHAT_DEFAULT_LIMIT = 500;

function isMissingChatReadColumnError(message: string): boolean {
  return /read_by_therapist|read_by_patient|column.*does not exist/i.test(message);
}

export async function fetchChatMessages(
  client: SupabaseClient,
  opts?: { patientId?: string; limit?: number; viewer?: ChatViewerRole }
): Promise<{ ok: true; messages: Message[] } | { ok: false; message: string }> {
  const patientId = opts?.patientId?.trim();
  const limit = opts?.limit ?? CHAT_DEFAULT_LIMIT;
  const viewer = opts?.viewer ?? 'therapist';

  const runSelect = async (selectCols: string) => {
    let q = client
      .from('chat_messages')
      .select(selectCols)
      .order(CHAT_ORDER_COLUMN, { ascending: true })
      .limit(limit);
    if (patientId) {
      q = q.eq('patient_id', patientId);
    }
    return q;
  };

  let { data, error } = await runSelect(CHAT_SELECT);
  if (error && isMissingChatReadColumnError(error.message)) {
    ({ data, error } = await runSelect(CHAT_SELECT_LEGACY));
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  const rows = (data ?? []) as ChatMessageRow[];
  return { ok: true, messages: rows.map((row) => chatRowToMessage(row, viewer)) };
}

export async function markChatMessagesRead(
  client: SupabaseClient,
  messageIds: string[],
  viewer: ChatViewerRole
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ids = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: true };

  const column = viewer === 'therapist' ? 'read_by_therapist' : 'read_by_patient';
  const { error } = await client.from('chat_messages').update({ [column]: true }).in('id', ids);

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
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
      read_by_therapist: true,
      read_by_patient: false,
    })
    .select(CHAT_SELECT)
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data) {
    return { ok: false, message: 'insert_returned_no_row' };
  }

  return { ok: true, message: chatRowToMessage(data as ChatMessageRow, 'therapist') };
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
      read_by_patient: true,
      read_by_therapist: false,
    })
    .select(CHAT_SELECT)
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data) {
    return { ok: false, message: 'insert_returned_no_row' };
  }

  return { ok: true, message: chatRowToMessage(data as ChatMessageRow, 'patient') };
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
        opts.onInsert(chatRowToMessage(row, opts.viewer));
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
