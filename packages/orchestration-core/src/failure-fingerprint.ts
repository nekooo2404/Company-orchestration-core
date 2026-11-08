import { createHash } from 'node:crypto';

export interface FingerprintInput {
  errorClass: string;
  commandName: string;
  exitCode?: number;
  message: string;
}

export type NormalizedFailure = FingerprintInput;

const MAX_MESSAGE_LENGTH = 240;

export const normalizeFailure = (failure: FingerprintInput): NormalizedFailure => {
  const message = failure.message
    .replace(/\b(?:19|20)\d\d-\d\d-\d\d[T ][\d:.+-]+Z?\b/gi, '<timestamp>')
    .replace(/\b(request[_-]?id|trace[_-]?id|attempt[_-]?id|session[_-]?id)\s*[:=]\s*[^\s,;]+/gi, '$1=<id>')
    .replace(/\b(token|password|passwd|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);

  return {
    errorClass: failure.errorClass.trim().toLowerCase().slice(0, 80),
    commandName: failure.commandName.trim().toLowerCase().slice(0, 120),
    ...(failure.exitCode === undefined ? {} : { exitCode: failure.exitCode }),
    message
  };
};

export const failureFingerprint = (failure: FingerprintInput): string => {
  const normalized = normalizeFailure(failure);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};
