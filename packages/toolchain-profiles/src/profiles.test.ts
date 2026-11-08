import { describe, expect, it } from 'vitest';
import { detectToolchain, profileFor } from './index';

describe('toolchain profiles', () => {
  it('detects JavaScript and .NET projects deterministically', () => {
    expect(detectToolchain(['package.json', 'tsconfig.json'])[0].kind).toBe('JAVASCRIPT_TYPESCRIPT');
    expect(detectToolchain(['App.csproj'])[0].kind).toBe('DOTNET');
    expect(profileFor('PYTHON')?.commands.TEST?.command).toBe('python');
  });
});
