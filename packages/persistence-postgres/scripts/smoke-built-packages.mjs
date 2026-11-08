import { TaskSchema } from '@aicompany/contracts';
import { transitionTask, SessionManagerLauncher } from '@aicompany/orchestration-core';
import { PostgresStore } from '@aicompany/persistence-postgres';

if (typeof TaskSchema.parse !== 'function' || typeof transitionTask !== 'function' ||
    typeof SessionManagerLauncher !== 'function' || typeof PostgresStore !== 'function') {
  throw new Error('Built package exports are incomplete');
}
