import { describe, expect, it } from 'vitest';
import { isWebPushEndpoint } from '../../supabase/functions/_shared/webPushEndpointAllowlist.ts';

describe('isWebPushEndpoint allowlist', () => {
  it('allows FCM / Apple / Mozilla hosts', () => {
    expect(isWebPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isWebPushEndpoint('https://web.push.apple.com/xxx')).toBe(true);
    expect(isWebPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xxx')).toBe(true);
  });

  it('rejects non-https and private/metadata hosts', () => {
    expect(isWebPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isWebPushEndpoint('https://127.0.0.1/push')).toBe(false);
    expect(isWebPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isWebPushEndpoint('https://evil.example.com/push')).toBe(false);
    expect(isWebPushEndpoint('https://metadata.google.internal/')).toBe(false);
  });
});
