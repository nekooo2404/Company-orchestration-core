import { spawn } from 'node:child_process';
const DEFAULT_ALLOWED_COMMANDS = new Set([
    'bash', 'cargo', 'dotnet', 'git', 'gradle', 'java', 'mvn', 'node', 'npm', 'pnpm', 'python', 'python3', 'pwsh'
]);
const SAFE_ENV_KEYS = new Set(['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'CI', 'NODE_ENV', 'ELECTRON_RUN_AS_NODE']);
const appendBounded = (chunks, chunk, limit) => {
    const current = Buffer.byteLength(chunks.join(''));
    if (current >= limit)
        return;
    const remaining = limit - current;
    chunks.push(Buffer.from(chunk).subarray(0, remaining).toString('utf8'));
};
export class ProcessToolRunner {
    workspace;
    descriptors;
    quota;
    allowedCommands;
    active = new Map();
    constructor(workspace, descriptors, quota, allowedCommands = DEFAULT_ALLOWED_COMMANDS) {
        this.workspace = workspace;
        this.descriptors = descriptors;
        this.quota = quota;
        this.allowedCommands = allowedCommands;
        if (!Number.isInteger(quota.maxConcurrentProcesses) || quota.maxConcurrentProcesses < 1)
            throw new Error('maxConcurrentProcesses must be positive');
        if (quota.maxOutputBytes < 1 || quota.timeoutMs < 1 || quota.maxFileBytes < 1)
            throw new Error('Execution quotas must be positive');
    }
    async run(projectId, spec) {
        const executable = spec.command.trim();
        if (!this.allowedCommands.has(executable))
            throw new Error(`Command is not allowed: ${executable}`);
        if (spec.network === true && !this.quota.allowNetwork)
            throw new Error('Network access is disabled by project quota');
        const descriptor = this.descriptors.get(projectId);
        if (!descriptor)
            throw new Error(`Workspace ${projectId} is not registered`);
        const current = this.active.get(projectId) ?? 0;
        if (current >= this.quota.maxConcurrentProcesses)
            throw new Error('Project process quota exhausted');
        this.active.set(projectId, current + 1);
        const cwd = await this.workspace.assertSafe(descriptor, spec.cwd ?? '.');
        const startedAt = Date.now();
        const stdout = [];
        const stderr = [];
        try {
            return await new Promise((resolve, reject) => {
                const child = spawn(executable, [...spec.args], { cwd, shell: false, env: Object.fromEntries(Object.entries({ PATH: process.env.PATH ?? '', ...spec.env }).filter(([key]) => SAFE_ENV_KEYS.has(key))) });
                let timedOut = false;
                let forceTimer;
                const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); forceTimer = setTimeout(() => { if (!child.killed)
                    child.kill('SIGKILL'); }, 250); }, this.quota.timeoutMs);
                child.stdout.on('data', (chunk) => appendBounded(stdout, chunk, this.quota.maxOutputBytes));
                child.stderr.on('data', (chunk) => appendBounded(stderr, chunk, this.quota.maxOutputBytes));
                child.once('error', (error) => { clearTimeout(timer); if (forceTimer)
                    clearTimeout(forceTimer); reject(error); });
                child.once('close', (exitCode, signal) => {
                    clearTimeout(timer);
                    if (forceTimer)
                        clearTimeout(forceTimer);
                    resolve({ exitCode, signal, stdout: stdout.join(''), stderr: stderr.join(''), durationMs: Date.now() - startedAt, timedOut });
                });
            });
        }
        finally {
            const next = (this.active.get(projectId) ?? 1) - 1;
            if (next === 0)
                this.active.delete(projectId);
            else
                this.active.set(projectId, next);
        }
    }
}
export class DockerToolRunner {
    workspace;
    descriptors;
    quota;
    image;
    dockerExecutable;
    allowedCommands;
    constructor(workspace, descriptors, quota, image = 'node:22-bookworm-slim', dockerExecutable = 'docker', allowedCommands = DEFAULT_ALLOWED_COMMANDS) {
        this.workspace = workspace;
        this.descriptors = descriptors;
        this.quota = quota;
        this.image = image;
        this.dockerExecutable = dockerExecutable;
        this.allowedCommands = allowedCommands;
    }
    async run(projectId, spec) {
        if (!this.allowedCommands.has(spec.command.trim()))
            throw new Error(`Command is not allowed: ${spec.command}`);
        if (spec.network === true && !this.quota.allowNetwork)
            throw new Error('Network access is disabled by project quota');
        const descriptor = this.descriptors.get(projectId);
        if (!descriptor)
            throw new Error(`Workspace ${projectId} is not registered`);
        const root = await this.workspace.assertSafe(descriptor, '.');
        const args = [
            'run', '--rm', `--network=${this.quota.allowNetwork ? 'bridge' : 'none'}`,
            '--cpus', String(this.quota.maxCpuCores ?? 1), '--memory', `${this.quota.maxMemoryMb ?? 512}m`,
            '--pids-limit', String(this.quota.maxPids ?? 128), '-v', `${root}:/workspace`, '-w', '/workspace',
            this.image, spec.command, ...spec.args
        ];
        return this.runProcess(this.dockerExecutable, args);
    }
    async runProcess(command, args) {
        const startedAt = Date.now();
        const stdout = [];
        const stderr = [];
        return new Promise((resolve, reject) => {
            const child = spawn(command, [...args], { shell: false, env: { PATH: process.env.PATH ?? '' } });
            let timedOut = false;
            let forceTimer;
            const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); forceTimer = setTimeout(() => { if (!child.killed)
                child.kill('SIGKILL'); }, 250); }, this.quota.timeoutMs);
            child.stdout.on('data', (chunk) => appendBounded(stdout, chunk, this.quota.maxOutputBytes));
            child.stderr.on('data', (chunk) => appendBounded(stderr, chunk, this.quota.maxOutputBytes));
            child.once('error', (error) => { clearTimeout(timer); if (forceTimer)
                clearTimeout(forceTimer); reject(error); });
            child.once('close', (exitCode, signal) => { clearTimeout(timer); if (forceTimer)
                clearTimeout(forceTimer); resolve({ exitCode, signal, stdout: stdout.join(''), stderr: stderr.join(''), durationMs: Date.now() - startedAt, timedOut }); });
        });
    }
}
//# sourceMappingURL=runner.js.map