import type { ToolchainDetection, ToolchainKind } from './types.js';
import { TOOLCHAIN_PROFILES } from './profiles.js';

export const detectToolchain = (files: readonly string[]): ToolchainDetection[] => TOOLCHAIN_PROFILES.map((profile) => {
  const evidence = profile.detectFiles.filter((pattern) => pattern.startsWith('*.') ? files.some((file) => file.endsWith(pattern.slice(1))) : files.includes(pattern));
  return { kind: profile.kind, confidence: evidence.length / profile.detectFiles.length, evidence, profile };
}).filter((item) => item.evidence.length > 0).sort((left, right) => right.confidence - left.confidence);

export const profileFor = (kind: ToolchainKind) => TOOLCHAIN_PROFILES.find((profile) => profile.kind === kind) ?? null;
