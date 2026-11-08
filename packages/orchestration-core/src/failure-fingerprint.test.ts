import { describe, expect, it } from 'vitest';
import { failureFingerprint, normalizeFailure } from './failure-fingerprint';

describe('failure fingerprint', () => {
  it('normalizes equivalent failures and excludes attempt-specific identifiers', () => {
    const first = {
      errorClass: ' TypeError ', commandName: ' build ', exitCode: 2,
      message: 'failed at 2026-11-08T10:00:00Z request_id=abc123\n  invalid module',
      attemptId: 'attempt-1', taskId: 'task-1'
    };
    const second = {
      ...first,
      message: 'failed at 2026-11-08T10:04:00Z request_id=xyz999 invalid module',
      attemptId: 'attempt-2'
    };

    expect(failureFingerprint(first)).toBe(failureFingerprint(second));
  });

  it('bounds normalized message content and redacts common secret values', () => {
    const normalized = normalizeFailure({
      errorClass: 'Error', commandName: 'deploy', message: 'token=supersecret ' + 'x'.repeat(1000)
    });

    expect(normalized.message).not.toContain('supersecret');
    expect(normalized.message.length).toBeLessThanOrEqual(240);
    expect(failureFingerprint({ errorClass: 'Error', commandName: 'deploy', message: 'a' }))
      .not.toBe(failureFingerprint({ errorClass: 'Error', commandName: 'deploy', message: 'b' }));
  });

  it('redacts bearer tokens and quoted secret fields before truncating', () => {
    const normalized = normalizeFailure({
      errorClass: 'RequestError',
      commandName: 'publish',
      message: 'Authorization: Bearer bearer-secret password="json-secret" api_key=plain-secret private_key: \'pem-secret\' ' + 'x'.repeat(400)
    });

    expect(normalized.message).toContain('Authorization: Bearer <redacted>');
    expect(normalized.message).toContain('password="<redacted>"');
    expect(normalized.message).toContain('api_key=<redacted>');
    expect(normalized.message).toContain("private_key: '<redacted>'");
    expect(normalized.message).not.toMatch(/bearer-secret|json-secret|plain-secret|pem-secret/);
    expect(normalized.message.length).toBeLessThanOrEqual(240);
  });

  it('redacts JSON-like access, token and private key values while preserving non-secret shape', () => {
    const normalized = normalizeFailure({
      errorClass: 'TypeError',
      commandName: 'build',
      message: 'failed at 2026-11-08T10:04:00Z request_id=xyz999 attempt_id=attempt-2 {"access_token":"json-token","token":"quoted-token","private_key":"quoted-key"} invalid module'
    });

    expect(normalized.message).toBe(
      'failed at <timestamp> request_id=<id> attempt_id=<id> {"access_token":"<redacted>","token":"<redacted>","private_key":"<redacted>"} invalid module'
    );
  });
});
