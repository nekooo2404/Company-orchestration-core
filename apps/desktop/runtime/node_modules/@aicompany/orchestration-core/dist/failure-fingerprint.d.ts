export interface FingerprintInput {
    errorClass: string;
    commandName: string;
    exitCode?: number;
    message: string;
}
export type NormalizedFailure = FingerprintInput;
export declare const normalizeFailure: (failure: FingerprintInput) => NormalizedFailure;
export declare const failureFingerprint: (failure: FingerprintInput) => string;
//# sourceMappingURL=failure-fingerprint.d.ts.map