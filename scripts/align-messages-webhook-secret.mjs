/**
 * Operator checklist: chat notify webhook secret must match Edge Function env.
 *
 * After rotating INTERNAL_MESSAGES_WEBHOOK_SECRET in the Supabase dashboard:
 *
 *   update private.app_config
 *     set value = '<same secret>', updated_at = now()
 *   where key = 'internal_messages_webhook_secret';
 *
 * Never commit the secret. Never put service_role JWTs in trigger definitions.
 *
 * Verify (SQL Editor):
 *   select key, length(btrim(value)) as len,
 *          (value not in ('CHANGE_ME','') and length(btrim(value)) > 8) as ok
 *   from private.app_config
 *   where key in ('edge_functions_base_url','internal_messages_webhook_secret');
 *
 * Then POST a test to notify-new-message with header x-webhook-secret.
 */
console.log(
  [
    'Physio-Shield webhook secret alignment',
    '1) Set Edge Function secret INTERNAL_MESSAGES_WEBHOOK_SECRET',
    '2) Mirror the same value into private.app_config.internal_messages_webhook_secret',
    '3) Confirm trg_chat_messages_notify_new_message is the only chat_messages notify trigger',
    '4) Rotate service_role if it was ever embedded in an old Dashboard webhook trigger',
  ].join('\n')
);
