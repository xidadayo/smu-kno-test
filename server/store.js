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
    },
    {
      id: 'u_001',
      name: '林夏',
      account: 'SMU1001',
      role: 'learner',
      department: '运营部',
      position: '客服专员',
      feishuUserId: 'ou_linxia',
      status: 'active',
      stage: 'L2',
      difficulty: 'L2',
      passwordHash: hashPassword('123456'),
      initialPassword: '123456',
      createdAt: now()
    },
    {
      id: 'u_002',
      name: '周南',
      account: 'SMU1002',
      role: 'learner',
      department: '销售部',
      position: '渠道经理',
      feishuUserId: 'ou_zhounan',
      status: 'active',
      stage: 'L1',
      difficulty: 'L1',
      passwordHash: hashPassword('123456'),
      initialPassword: '123456',
      createdAt: now()
    }
  ],
  documents: [
    {
      id: 'doc_seed',
      title: '订单质量要求手册',
      department: '全公司',
      type: 'markdown',
      status: 'processed',
      uploadedBy: 'u_admin',
      createdAt: now()
    }
  ],
  knowledgePoints: [
    {
      id: 'kp_001',
      documentId: 'doc_seed',
      title: '基础质检术语',
      department: '全公司',
      summary: '解释缺陷等级、抽检比例、返工闭环等入门概念。',
      keywords: ['质检', '缺陷', '抽检'],
      stage: 'L1',
      difficulty: 'L1',
      sourceLocation: '第 1 章',
      estimatedMinutes: 12,
      confidence: 0.92,
      status: 'approved'
    },
    {
      id: 'kp_002',
      documentId: 'doc_seed',
      title: '异常订单处理流程',
      department: '运营部',
      summary: '覆盖跨部门通知、补充证据、客户确认和复检节点。',
      keywords: ['异常', '复检', '流程'],
      stage: 'L3',
      difficulty: 'L3',
      sourceLocation: '第 4 章',
      estimatedMinutes: 22,
      confidence: 0.84,
      status: 'pending_review'
    },
    {
      id: 'kp_003',
      documentId: 'doc_seed',
      title: '抽检比例基础',
      department: '全公司',
      summary: '学习如何理解抽检比例、样本数量和基础质检判定关系。',
      keywords: ['抽检', '样本', '比例'],
      stage: 'L1',
      difficulty: 'L1',
      sourceLocation: '第 2 章',
      estimatedMinutes: 10,
      confidence: 0.9,
      status: 'approved'
    }
  ],
  questions: [
    {
      id: 'q_001',
      knowledgePointId: 'kp_001',
      type: 'single',
      department: '全公司',
      title: '缺陷等级通常用于判断什么？',
      options: ['员工绩效', '问题严重程度', '产品颜色', '发货路线'],
      answer: ['问题严重程度'],
      analysis: '缺陷等级用于区分问题严重程度，并决定处理策略。',
      stage: 'L1',
      difficulty: 'L1',
      score: 10,
      confidence: 0.9,
      status: 'approved'
    },
    {
      id: 'q_002',
      knowledgePointId: 'kp_002',
      type: 'judge',
      department: '运营部',
      title: '异常订单只需要销售部单独处理即可。',
      options: ['正确', '错误'],
      answer: ['错误'],
      analysis: '异常订单通常需要运营、质检、销售等角色协同。',
      stage: 'L3',
      difficulty: 'L3',
      score: 10,
      confidence: 0.78,
      status: 'pending_review'
    },
    {
      id: 'q_003',
      knowledgePointId: 'kp_003',
      type: 'single',
      department: '全公司',
      title: '抽检比例主要影响什么？',
      options: ['样本数量', '员工姓名', '登录方式', '菜单颜色'],
      answer: ['样本数量'],
      analysis: '抽检比例会影响样本数量，并进一步影响质检覆盖范围。',
      stage: 'L1',
      difficulty: 'L1',
      score: 10,
      confidence: 0.9,
      status: 'approved'
    }
  ],
  learningPlans: [
    {
      id: 'plan_001',
      name: '新员工质检入门计划',
      targetDepartment: '运营部',
      stages: ['L1', 'L2'],
      pushMode: 'progressive',
      pushCycle: 'daily',
      autoExam: true,
      completionRule: 90,
      questionCount: 5,
      passScore: 60,
      durationMinutes: 30,
      status: 'active',
      createdAt: now()
    }
  ],
  progress: [
    {
      id: 'pg_001',
      userId: 'u_001',
      planId: 'plan_001',
      stage: 'L1',
      difficulty: 'L1',
      status: 'learning',
      percent: 50,
      effectiveSeconds: 1860,
      lastPosition: 'kp_001',
      updatedAt: now()
    },
    {
      id: 'pg_002',
      userId: 'u_002',
      planId: 'plan_001',
      stage: 'L1',
      difficulty: 'L1',
      status: 'learning',
      percent: 62,
      effectiveSeconds: 760,
      lastPosition: 'kp_001',
      updatedAt: now()
    }
  ],
  learningRecords: [
    {
      id: 'lr_001',
      userId: 'u_001',
      planId: 'plan_001',
      knowledgePointId: 'kp_001',
      stage: 'L1',
      difficulty: 'L1',
      status: 'completed',
      effectiveSeconds: 1860,
      startedAt: now(),
      completedAt: now()
    }
  ],
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
  store.learningRecords = store.learningRecords || [];
  let changed = false;
  for (const plan of store.learningPlans || []) {
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
  for (const user of store.users || []) {
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
