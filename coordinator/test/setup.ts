import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

// Isolates each test file onto its own throwaway SQLite file so scenarios
// (dedup, workload-based technician matching, daily counts) never bleed into
// each other. Must run before anything imports src/db/index.ts.
process.env.COORDINATOR_DB_PATH = path.join(os.tmpdir(), `ruzik-coordinator-test-${randomUUID()}.db`);
