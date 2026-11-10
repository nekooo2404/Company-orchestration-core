import { createHash } from 'node:crypto';
const MAX_MESSAGE_LENGTH = 240;
const SECRET_KEY_PATTERN = '(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key|token)';
const redactSecrets = (message) => {
    let redacted = message.replace(/\bBearer\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi, 'Bearer <redacted>');
    redacted = redacted
        .replace(new RegExp(`"(${SECRET_KEY_PATTERN})"(\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, 'gi'), '"$1"$2"<redacted>"')
        .replace(new RegExp(`'(${SECRET_KEY_PATTERN})'(\\s*:\\s*)'(?:\\\\.|[^'\\\\])*'`, 'gi'), "'$1'$2'<redacted>'")
        .replace(new RegExp(`\\b(${SECRET_KEY_PATTERN})\\b(\\s*[:=]\\s*)"(?:\\\\.|[^"\\\\])*"`, 'gi'), '$1$2"<redacted>"')
        .replace(new RegExp(`\\b(${SECRET_KEY_PATTERN})\\b(\\s*[:=]\\s*)'(?:\\\\.|[^'\\\\])*'`, 'gi'), "$1$2'<redacted>'")
        .replace(new RegExp(`\\b(${SECRET_KEY_PATTERN})\\b(\\s*[:=]\\s*)([^\\s,;}\\]"']+)`, 'gi'), '$1$2<redacted>');
    return redacted;
};
export const normalizeFailure = (failure) => {
    const message = redactSecrets(failure.message)
        .replace(/\b(?:19|20)\d\d-\d\d-\d\d[T ][\d:.+-]+Z?\b/gi, '<timestamp>')
        .replace(/\b(request[_-]?id|trace[_-]?id|attempt[_-]?id|session[_-]?id)\s*[:=]\s*[^\s,;]+/gi, '$1=<id>')
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
export const failureFingerprint = (failure) => {
    const normalized = normalizeFailure(failure);
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};
//# sourceMappingURL=failure-fingerprint.js.map