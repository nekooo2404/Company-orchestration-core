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
});
