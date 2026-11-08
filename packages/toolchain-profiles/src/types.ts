export type ToolchainKind = 'JAVASCRIPT_TYPESCRIPT' | 'PYTHON' | 'DOTNET' | 'JAVA';
export type ToolchainCapability = 'INSTALL' | 'BUILD' | 'TEST' | 'LINT' | 'SECURITY_SCAN' | 'DEPLOY';

export interface ToolchainProfile {
  kind: ToolchainKind;
  displayName: string;
  detectFiles: string[];
  commands: Partial<Record<ToolchainCapability, { command: string; args: string[] }>>;
  allowedCommands: string[];
}

export interface ToolchainDetection { kind: ToolchainKind; confidence: number; evidence: string[]; profile: ToolchainProfile }
