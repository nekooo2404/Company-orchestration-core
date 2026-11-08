import { spawn } from 'node:child_process';
import { env } from 'node:process';

const connectionString = env.DATABASE_URL;
const input = env.BACKUP_FILE;
if (!connectionString || !input) throw new Error('DATABASE_URL and BACKUP_FILE are required');
if (env.CONFIRM_RESTORE !== 'YES') throw new Error('Set CONFIRM_RESTORE=YES to restore a database backup');

await new Promise((resolve, reject) => {
  const child = spawn('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', connectionString, input], { stdio: 'inherit', shell: false, windowsHide: true });
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`pg_restore exited with ${code}`)));
});
