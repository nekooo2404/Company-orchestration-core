import { spawn } from 'node:child_process';
import { env } from 'node:process';

const connectionString = env.DATABASE_URL;
const output = env.BACKUP_FILE;
if (!connectionString || !output) {
  throw new Error('DATABASE_URL and BACKUP_FILE are required');
}

await new Promise((resolve, reject) => {
  const child = spawn('pg_dump', ['--format=custom', '--file', output, connectionString], { stdio: 'inherit', shell: false, windowsHide: true });
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}`)));
});
