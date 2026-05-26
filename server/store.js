import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const dataFile = path.resolve(rootDir, process.env.DATA_FILE || './data/store.json');
export const uploadDir = path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads');

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
const hashPassword = (password) => crypto.createHash('sha256').update(String(password)).digest('hex');

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

const seed = () => ({
  users: [
    {
      id: 'u_admin',
      name: '系统管理员',
      account: 'admin',
      role: 'super_admin',
      department: '培训中心',
      position: '管理员',
      feishuUserId: 'ou_admin',
      status: 'active',
      passwordHash: hashPassword('admin123'),
      initialPassword: 'admin123',
      createdAt: now()
    }
  ],
  documents: [],
  knowledgePoints: [],
  questions: [],
  learningPlans: [],
  progress: [],
  learningRecords: [],
  examTasks: [],
  examAttempts: [],
  violations: [],
  pushRecords: [],
  auditLogs: []
});

export function ensureStore() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(seed(), null, 2));
  }
}

export function readStore() {
  ensureStore();
  const store = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  let changed = false;

  for (const key of [
    'users',
    'documents',
    'knowledgePoints',
    'questions',
    'learningPlans',
    'progress',
    'learningRecords',
    'examTasks',
    'examAttempts',
    'violations',
    'pushRecords',
    'auditLogs'
  ]) {
    if (!Array.isArray(store[key])) {
      store[key] = [];
      changed = true;
    }
  }

  const demoIds = {
    users: new Set(['u_001', 'u_002']),
    documents: new Set(['doc_seed']),
    knowledgePoints: new Set(['kp_001', 'kp_002', 'kp_003']),
    questions: new Set(['q_001', 'q_002', 'q_003']),
    learningPlans: new Set(['plan_001']),
    progress: new Set(['pg_001', 'pg_002']),
    learningRecords: new Set(['lr_001']),
    examTasks: new Set(['exam_001']),
    pushRecords: new Set(['push_001'])
  };

  for (const [key, ids] of Object.entries(demoIds)) {
    const next = store[key].filter((item) => !ids.has(item.id));
    if (next.length !== store[key].length) {
      store[key] = next;
      changed = true;
    }
  }

  for (const plan of store.learningPlans) {
    if (!plan.questionCount) {
      plan.questionCount = 5;
      changed = true;
    }
    if (!plan.passScore) {
      plan.passScore = 60;
      changed = true;
    }
    if (!plan.durationMinutes) {
      plan.durationMinutes = 30;
      changed = true;
    }
  }

  for (const user of store.users) {
    if (!user.passwordHash) {
      const fallback = user.role === 'learner' ? '123456' : 'admin123';
      user.passwordHash = hashPassword(user.initialPassword || fallback);
      user.initialPassword = user.initialPassword || fallback;
      changed = true;
    }
  }

  if (changed) writeStore(store);
  return store;
}

export function writeStore(store) {
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

export function mutateStore(mutator) {
  const store = readStore();
  const result = mutator(store, { now, id });
  writeStore(store);
  return result;
}

export function logAudit(store, action, actorId, detail = {}) {
  store.auditLogs.unshift({
    id: id('log'),
    action,
    actorId,
    detail,
    createdAt: now()
  });
}

export { hashPassword, id, now, sanitizeUser };
