import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureStore, hashPassword, logAudit, mutateStore, now, readStore, sanitizeUser, uploadDir } from './store.js';
import { generateFromFile } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 3001);
const upload = multer({ dest: uploadDir });

ensureStore();

app.use(cors({ origin: process.env.APP_ORIGIN || true }));
app.use((_req, res, next) => {
  res.charset = 'utf-8';
  next();
});
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(uploadDir));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'dist')));
}

const actor = (req) => req.header('x-user-id') || 'u_admin';
const sanitizeLearner = (user) => sanitizeUser(user);
const collectionMap = {
  users: 'users',
  documents: 'documents',
  knowledgePoints: 'knowledgePoints',
  questions: 'questions',
  learningPlans: 'learningPlans',
  progress: 'progress',
  learningRecords: 'learningRecords',
  examTasks: 'examTasks',
  examAttempts: 'examAttempts',
  violations: 'violations',
  pushRecords: 'pushRecords',
  auditLogs: 'auditLogs'
};
const stageOrder = ['L1', 'L2', 'L3', 'L4'];

function userFromRequest(req, store) {
  return store.users.find((user) => user.id === actor(req));
}

function learnerRows(store) {
  return store.users
    .filter((user) => user.role === 'learner')
    .map((user) => {
      const progress = currentProgressFor(store, user);
      const exams = store.examTasks.filter((item) => item.userId === user.id);
      const latestExam = exams[0];
      const violations = store.violations.filter((item) => item.userId === user.id);
      const stage = progress?.stage || user.stage || 'L1';
      const completion = stageLearningCompletion(store, user, stage);
      const latestAttempt = store.examAttempts.find((item) => item.userId === user.id);
      return {
        ...sanitizeLearner(user),
        progressPercent: completion.percent || progress?.percent || 0,
        learningStatus: progress?.status || 'not_started',
        currentStage: stage,
        difficulty: progress?.difficulty || user.difficulty || 'L1',
        latestExamStatus: latestExam?.status || 'none',
        latestScore: latestAttempt?.score ?? null,
        stageKnowledgeTotal: completion.total,
        stageKnowledgeCompleted: completion.completed,
        violationCount: violations.length
      };
    });
}

function summary(store) {
  const learners = learnerRows(store);
  const completed = learners.filter((item) => item.learningStatus === 'completed').length;
  const pendingExams = store.examTasks.filter((item) => item.status === 'pending').length;
  const passed = store.examTasks.filter((item) => item.status === 'passed').length;
  const failed = store.examTasks.filter((item) => item.status === 'failed').length;
  const totalDone = passed + failed;

  return {
    learners: learners.length,
    learning: learners.filter((item) => item.learningStatus === 'learning').length,
    completed,
    overdue: learners.filter((item) => item.learningStatus === 'overdue').length,
    pendingExams,
    passed,
    failed,
    violations: store.violations.length,
    averageScore:
      store.examAttempts.length === 0
        ? 0
        : Math.round(store.examAttempts.reduce((sum, item) => sum + item.score, 0) / store.examAttempts.length),
    passRate: totalDone === 0 ? 0 : Math.round((passed / totalDone) * 100),
    workflow: [
      { key: 'upload', label: '上传知识库文档', count: store.documents.length },
      { key: 'ai', label: 'AI 生成待审核', count: store.knowledgePoints.filter((item) => item.status === 'pending_review').length },
      { key: 'approve', label: '管理员审核发布', count: store.knowledgePoints.filter((item) => item.status === 'approved').length },
      { key: 'plan', label: '配置学习计划', count: store.learningPlans.length },
      { key: 'push', label: '飞书推送记录', count: store.pushRecords.length },
      { key: 'exam', label: '阶段考试任务', count: store.examTasks.length }
    ]
  };
}

function visibleForDepartment(item, department) {
  return !item.department || item.department === '全公司' || item.department === department;
}

function planVisibleForUser(plan, user) {
  return !plan.targetDepartment || plan.targetDepartment === '全公司' || plan.targetDepartment === user.department;
}

function plansForUser(store, user) {
  return store.learningPlans.filter((plan) => plan.status === 'active' && planVisibleForUser(plan, user));
}

function planForUserStage(store, user, stage) {
  return plansForUser(store, user).find((plan) => (plan.stages || []).includes(stage)) || null;
}

function currentProgressFor(store, user) {
  const rows = store.progress
    .filter((item) => item.userId === user.id)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  return rows.find((item) => ['learning', 'not_started'].includes(item.status)) || rows[0] || null;
}

function availableKnowledgeFor(store, user, stage) {
  if (!user) return [];
  return store.knowledgePoints.filter(
    (item) => item.status === 'approved' && item.stage === stage && visibleForDepartment(item, user.department)
  );
}

function stageLearningCompletion(store, user, stage) {
  const available = availableKnowledgeFor(store, user, stage);
  const availableIds = new Set(available.map((item) => item.id));
  const completedIds = new Set(
    store.learningRecords
      .filter((item) => item.userId === user?.id && item.stage === stage && item.status === 'completed' && availableIds.has(item.knowledgePointId))
      .map((item) => item.knowledgePointId)
  );
  return {
    total: available.length,
    completed: completedIds.size,
    percent: available.length === 0 ? 0 : Math.round((completedIds.size / available.length) * 100),
    complete: available.length > 0 && completedIds.size === available.length
  };
}

function examQuestionPayload(store, questionId) {
  const question = store.questions.find((item) => item.id === questionId);
  if (!question) return null;
  const knowledgePoint = store.knowledgePoints.find((item) => item.id === question.knowledgePointId);
  return { ...question, knowledgePoint };
}

function ensureExamForProgress(store, helpers, progress) {
  const learner = store.users.find((user) => user.id === progress.userId);
  const completion = stageLearningCompletion(store, learner, progress.stage);
  if (!completion.complete) {
    store.examTasks = store.examTasks.filter(
      (item) => !(item.userId === progress.userId && item.stage === progress.stage && item.planId === progress.planId && item.status === 'pending')
    );
    return null;
  }

  const existingExam = store.examTasks.find(
    (item) => item.userId === progress.userId && item.stage === progress.stage && item.planId === progress.planId && item.status === 'pending'
  );
  if (existingExam) return existingExam;

  const plan = store.learningPlans.find((item) => item.id === progress.planId);
  const questionCount = Math.max(1, Number(plan?.questionCount || 5));
  const availableKnowledgeIds = new Set(availableKnowledgeFor(store, learner, progress.stage).map((item) => item.id));
  const questions = store.questions
    .filter((question) => {
      const kp = store.knowledgePoints.find((item) => item.id === question.knowledgePointId);
      return (
        question.status === 'approved' &&
        question.stage === progress.stage &&
        visibleForDepartment(question, learner?.department) &&
        availableKnowledgeIds.has(question.knowledgePointId) &&
        kp?.stage === progress.stage &&
        kp?.status === 'approved'
      );
    })
    .map((question) => question.id)
    .slice(0, questionCount);
  const exam = {
    id: helpers.id('exam'),
    userId: progress.userId,
    planId: progress.planId,
    stage: progress.stage,
    difficulty: progress.difficulty,
    status: 'pending',
    passScore: Number(plan?.passScore || 60),
    durationMinutes: Number(plan?.durationMinutes || 30),
    questionCount,
    questionIds: questions,
    createdAt: helpers.now()
  };
  store.examTasks.unshift(exam);
  store.pushRecords.unshift({
    id: helpers.id('push'),
    userId: progress.userId,
    channel: 'feishu',
    title: '学习完成，阶段考试已生成',
    content: `${progress.stage} 阶段考试已生成，请进入浏览器考试。`,
    status: process.env.FEISHU_WEBHOOK_URL ? 'ready_to_send' : 'mock_sent',
    createdAt: helpers.now()
  });
  return exam;
}

function createOrResetProgress(store, helpers, { user, plan, stage, status = 'learning' }) {
  let progress = store.progress.find((item) => item.userId === user.id && item.planId === plan?.id && item.stage === stage);
  if (!progress) {
    progress = {
      id: helpers.id('pg'),
      userId: user.id,
      planId: plan?.id || null,
      stage,
      difficulty: stage,
      status,
      percent: 0,
      effectiveSeconds: 0,
      lastPosition: null,
      retryCount: 0,
      createdAt: helpers.now()
    };
    store.progress.unshift(progress);
  }
  progress.status = status;
  progress.percent = 0;
  progress.effectiveSeconds = status === 'learning' ? 0 : progress.effectiveSeconds || 0;
  progress.lastPosition = null;
  progress.updatedAt = helpers.now();
  return progress;
}

function resetStageLearningAfterFailure(store, helpers, exam) {
  const user = store.users.find((item) => item.id === exam.userId);
  const plan = store.learningPlans.find((item) => item.id === exam.planId);
  if (!user || !plan) return null;

  store.learningRecords = store.learningRecords.filter(
    (item) => !(item.userId === user.id && item.planId === plan.id && item.stage === exam.stage)
  );
  const progress = createOrResetProgress(store, helpers, { user, plan, stage: exam.stage, status: 'learning' });
  progress.retryCount = Number(progress.retryCount || 0) + 1;
  user.stage = exam.stage;
  user.difficulty = exam.difficulty || exam.stage;

  store.pushRecords.unshift({
    id: helpers.id('push'),
    userId: user.id,
    channel: 'system',
    title: '考试未通过，已重新推送学习计划',
    content: `${exam.stage} 阶段考试未通过，请重新完成本阶段全部知识点后再参加考试。`,
    status: 'created',
    createdAt: helpers.now()
  });
  return progress;
}

function pushNextStageAfterPass(store, helpers, exam) {
  const user = store.users.find((item) => item.id === exam.userId);
  const plan = store.learningPlans.find((item) => item.id === exam.planId);
  if (!user || !plan) return null;

  const stages = (plan.stages?.length ? plan.stages : stageOrder).filter(Boolean);
  const currentIndex = stages.indexOf(exam.stage);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] : stageOrder[stageOrder.indexOf(exam.stage) + 1];
  if (!nextStage) {
    store.pushRecords.unshift({
      id: helpers.id('push'),
      userId: user.id,
      channel: 'system',
      title: '全部阶段已完成',
      content: `${exam.stage} 阶段考试已通过，当前学习计划已完成全部阶段。`,
      status: 'created',
      createdAt: helpers.now()
    });
    return null;
  }

  const nextProgress = createOrResetProgress(store, helpers, { user, plan, stage: nextStage, status: 'learning' });
  user.stage = nextStage;
  user.difficulty = nextStage;
  store.pushRecords.unshift({
    id: helpers.id('push'),
    userId: user.id,
    channel: 'system',
    title: '考试通过，已推送下一阶段学习计划',
    content: `${exam.stage} 阶段考试已通过，${nextStage} 阶段学习计划已开放，请完成该阶段全部知识点。`,
    status: 'created',
    createdAt: helpers.now()
  });
  return nextProgress;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: now() });
});

app.post('/api/auth/login', (req, res) => {
  const { account, password } = req.body || {};
  const store = readStore();
  const user = store.users.find((item) => item.account === account && item.status === 'active');
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  res.json({
    user: sanitizeUser(user),
    token: Buffer.from(`${user.id}:${Date.now()}`).toString('base64')
  });
});

app.get('/api/me', (req, res) => {
  const store = readStore();
  const user = userFromRequest(req, store);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(sanitizeUser(user));
});

app.get('/api/summary', (_req, res) => {
  res.json(summary(readStore()));
});

app.get('/api/learners', (_req, res) => {
  res.json(learnerRows(readStore()));
});

app.post('/api/learners', (req, res) => {
  const created = mutateStore((store, helpers) => {
    const user = {
      id: helpers.id('u'),
      role: 'learner',
      status: 'active',
      stage: 'L1',
      difficulty: 'L1',
      initialPassword: req.body.initialPassword || '123456',
      passwordHash: hashPassword(req.body.initialPassword || '123456'),
      createdAt: helpers.now(),
      ...req.body
    };
    delete user.password;
    store.users.push(user);
    store.progress.push({
      id: helpers.id('pg'),
      userId: user.id,
      planId: store.learningPlans[0]?.id || null,
      stage: 'L1',
      difficulty: 'L1',
      status: 'not_started',
      percent: 0,
      effectiveSeconds: 0,
      lastPosition: null,
      updatedAt: helpers.now()
    });
    logAudit(store, 'learner.create', actor(req), { userId: user.id });
    return sanitizeUser(user);
  });
  res.status(201).json(created);
});

app.post('/api/learners/import', (req, res) => {
  const rows = String(req.body.csv || '')
    .split(/\r?\n/)
    .map((line) => line.split(',').map((item) => item.trim()))
    .filter((cols) => cols.length >= 3);

  const imported = mutateStore((store, helpers) => {
    const users = rows.map(([name, account, department, position = '学员', feishuUserId = '']) => ({
      id: helpers.id('u'),
      name,
      account,
      department,
      position,
      feishuUserId,
      role: 'learner',
      status: 'active',
      stage: 'L1',
      difficulty: 'L1',
      initialPassword: '123456',
      passwordHash: hashPassword('123456'),
      createdAt: helpers.now()
    }));
    store.users.push(...users);
    users.forEach((user) => {
      store.progress.push({
        id: helpers.id('pg'),
        userId: user.id,
        planId: store.learningPlans[0]?.id || null,
        stage: 'L1',
        difficulty: 'L1',
        status: 'not_started',
        percent: 0,
        effectiveSeconds: 0,
        lastPosition: null,
        updatedAt: helpers.now()
      });
    });
    logAudit(store, 'learner.import', actor(req), { count: users.length });
    return users.map(sanitizeUser);
  });
  res.status(201).json({ imported: imported.length, users: imported });
});

app.get('/api/knowledge', (_req, res) => {
  const store = readStore();
  res.json({
    documents: store.documents.map((item) => ({ department: '全公司', ...item })),
    knowledgePoints: store.knowledgePoints.map((item) => ({ department: '全公司', ...item })),
    questions: store.questions.map((item) => ({ department: '全公司', ...item }))
  });
});

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const documentId = idForDocument();
  let generated;
  try {
    generated = await generateFromFile(req.file, documentId);
  } catch (error) {
    return res.status(400).json({ error: error.message || '文档解析失败，请检查文件内容后重试。' });
  }
  const result = mutateStore((store, helpers) => {
    const department = req.body.department || '全公司';
    const document = {
      id: documentId,
      title: req.body.title || req.file.originalname,
      department,
      type: path.extname(req.file.originalname).replace('.', '') || 'file',
      status: generated.aiError ? 'processed_with_fallback' : 'processed',
      filePath: req.file.path,
      originalName: req.file.originalname,
      uploadedBy: actor(req),
      aiProvider: generated.provider,
      aiModel: generated.model,
      aiError: generated.aiError,
      createdAt: helpers.now()
    };
    generated.knowledgePoints.forEach((item) => {
      item.department = department;
    });
    generated.questions.forEach((item) => {
      item.department = department;
    });
    store.documents.unshift(document);
    store.knowledgePoints.unshift(...generated.knowledgePoints);
    store.questions.unshift(...generated.questions);
    logAudit(store, 'document.upload.generate', actor(req), {
      documentId: document.id,
      knowledgePoints: generated.knowledgePoints.length,
      questions: generated.questions.length
    });
    return { document, ...generated };
  });

  res.status(201).json(result);
});

function idForDocument() {
  return `doc_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

app.patch('/api/knowledge/:id/review', (req, res) => {
  const updated = mutateStore((store) => {
    const item = store.knowledgePoints.find((kp) => kp.id === req.params.id);
    if (!item) return null;
    item.status = req.body.status || 'approved';
    item.reviewedAt = now();
    item.reviewedBy = actor(req);
    logAudit(store, 'knowledge.review', actor(req), { id: item.id, status: item.status });
    return item;
  });
  if (!updated) return res.status(404).json({ error: 'knowledge point not found' });
  res.json(updated);
});

app.patch('/api/questions/:id/review', (req, res) => {
  const updated = mutateStore((store) => {
    const item = store.questions.find((question) => question.id === req.params.id);
    if (!item) return null;
    item.status = req.body.status || 'approved';
    item.reviewedAt = now();
    item.reviewedBy = actor(req);
    logAudit(store, 'question.review', actor(req), { id: item.id, status: item.status });
    return item;
  });
  if (!updated) return res.status(404).json({ error: 'question not found' });
  res.json(updated);
});

app.get('/api/plans', (_req, res) => {
  res.json(readStore().learningPlans);
});

app.post('/api/plans', (req, res) => {
  const created = mutateStore((store, helpers) => {
    const plan = {
      id: helpers.id('plan'),
      status: 'active',
      createdAt: helpers.now(),
      ...req.body
    };
    store.learningPlans.unshift(plan);
    logAudit(store, 'plan.create', actor(req), { planId: plan.id });
    return plan;
  });
  res.status(201).json(created);
});

app.post('/api/progress', (req, res) => {
  const updated = mutateStore((store, helpers) => {
    let progress = store.progress.find((item) => item.userId === req.body.userId && item.planId === req.body.planId);
    if (!progress) {
      progress = {
        id: helpers.id('pg'),
        userId: req.body.userId,
        planId: req.body.planId,
        stage: req.body.stage || 'L1',
        difficulty: req.body.difficulty || 'L1',
        status: 'learning',
        percent: 0,
        effectiveSeconds: 0,
        lastPosition: null
      };
      store.progress.push(progress);
    }

    const learner = store.users.find((user) => user.id === progress.userId);
    const completion = stageLearningCompletion(store, learner, progress.stage);
    progress.percent = completion.total > 0 ? completion.percent : Math.min(100, Number(req.body.percent ?? progress.percent));
    progress.effectiveSeconds += Number(req.body.effectiveSeconds || 0);
    progress.lastPosition = req.body.lastPosition || progress.lastPosition;
    progress.status = completion.complete ? 'completed' : 'learning';
    progress.updatedAt = helpers.now();

    if (progress.status === 'completed') {
      ensureExamForProgress(store, helpers, progress);
    }

    logAudit(store, 'progress.update', actor(req), { progressId: progress.id, percent: progress.percent });
    return progress;
  });
  res.json(updated);
});

app.get('/api/exams', (_req, res) => {
  const store = readStore();
  res.json(
    store.examTasks
      .filter((exam) => {
        if (exam.status !== 'pending') return true;
        const user = store.users.find((item) => item.id === exam.userId);
        return stageLearningCompletion(store, user, exam.stage).complete;
      })
      .map((exam) => ({
        ...exam,
        user: sanitizeUser(store.users.find((user) => user.id === exam.userId)),
        questions: exam.questionIds.map((qid) => examQuestionPayload(store, qid)).filter(Boolean)
      }))
  );
});

app.get('/api/my/learning', (req, res) => {
  const store = readStore();
  const user = userFromRequest(req, store);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const progress = store.progress
    .filter((item) => item.userId === user.id)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const plans = plansForUser(store, user);
  const currentProgress = currentProgressFor(store, user);
  const firstPlanStage = plans[0]?.stages?.[0];
  const currentStage = currentProgress?.stage || user.stage || firstPlanStage || 'L1';
  const knowledgePoints = availableKnowledgeFor(store, user, currentStage);
  res.json({
    user: sanitizeUser(user),
    progress,
    plans,
    learningRecords: store.learningRecords.filter((item) => item.userId === user.id),
    knowledgePoints
  });
});

app.post('/api/my/knowledge/:id/complete', (req, res) => {
  const result = mutateStore((store, helpers) => {
    const user = userFromRequest(req, store);
    if (!user) return null;
    const kp = store.knowledgePoints.find((item) => item.id === req.params.id && item.status === 'approved');
    if (!kp || !visibleForDepartment(kp, user.department)) return null;

    const body = req.body || {};
    const plan = body.planId
      ? store.learningPlans.find((item) => item.id === body.planId)
      : planForUserStage(store, user, kp.stage) || plansForUser(store, user)[0];
    if (!plan || !planVisibleForUser(plan, user)) return null;
    const planId = plan.id;
    let record = store.learningRecords.find((item) => item.userId === user.id && item.knowledgePointId === kp.id);
    if (!record) {
      record = {
        id: helpers.id('lr'),
        userId: user.id,
        planId,
        knowledgePointId: kp.id,
        stage: kp.stage,
        difficulty: kp.difficulty,
        status: 'completed',
        effectiveSeconds: Number(body.effectiveSeconds || 180),
        startedAt: body.startedAt || helpers.now(),
        completedAt: helpers.now()
      };
      store.learningRecords.unshift(record);
    } else {
      record.status = 'completed';
      record.effectiveSeconds += Number(body.effectiveSeconds || 180);
      record.completedAt = helpers.now();
    }

    let progress = store.progress.find((item) => item.userId === user.id && item.planId === planId && item.stage === kp.stage);
    if (!progress) {
      progress = {
        id: helpers.id('pg'),
        userId: user.id,
        planId,
        stage: kp.stage,
        difficulty: kp.difficulty,
        status: 'learning',
        percent: 0,
        effectiveSeconds: 0,
        lastPosition: null,
        retryCount: 0,
        createdAt: helpers.now()
      };
      store.progress.unshift(progress);
    }

    const completion = stageLearningCompletion(store, user, kp.stage);
    progress.percent = completion.percent;
    progress.effectiveSeconds += Number(body.effectiveSeconds || 180);
    progress.lastPosition = kp.id;
    progress.status = completion.complete ? 'completed' : 'learning';
    progress.updatedAt = helpers.now();

    let exam = null;
    if (progress.status === 'completed') {
      exam = ensureExamForProgress(store, helpers, progress);
    }

    logAudit(store, 'learning.knowledge.complete', actor(req), { knowledgePointId: kp.id, progressId: progress.id });
    return { record, progress, exam };
  });
  if (!result) return res.status(404).json({ error: 'knowledge point not found or not visible' });
  res.json(result);
});

app.get('/api/my/exams', (req, res) => {
  const store = readStore();
  const user = userFromRequest(req, store);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(
    store.examTasks
      .filter((exam) => exam.userId === user.id)
      .filter((exam) => exam.status !== 'pending' || stageLearningCompletion(store, user, exam.stage).complete)
      .map((exam) => ({
        ...exam,
        user: sanitizeUser(user),
        questions: exam.questionIds.map((qid) => examQuestionPayload(store, qid)).filter(Boolean)
      }))
  );
});

app.post('/api/exams/:id/submit', (req, res) => {
  const result = mutateStore((store, helpers) => {
    const exam = store.examTasks.find((item) => item.id === req.params.id);
    if (!exam) return null;
    const questions = exam.questionIds.map((qid) => store.questions.find((question) => question.id === qid)).filter(Boolean);
    const body = req.body || {};
    const answers = body.answers || {};
    const graded = questions.map((question) => {
      const given = Array.isArray(answers[question.id]) ? answers[question.id] : [answers[question.id]].filter(Boolean);
      const correct = question.answer.every((item) => given.includes(item)) && given.length === question.answer.length;
      return { question, given, correct };
    });
    const rawScore = graded.reduce((sum, item) => sum + (item.correct ? Number(item.question.score || 0) : 0), 0);
    const maxScore = questions.reduce((sum, question) => sum + Number(question.score || 0), 0);
    const score = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
    const correctCount = graded.filter((item) => item.correct).length;
    exam.status = score >= Number(exam.passScore || 60) ? 'passed' : 'failed';
    exam.submittedAt = helpers.now();
    exam.score = score;
    exam.rawScore = rawScore;
    exam.maxScore = maxScore;
    const attempt = {
      id: helpers.id('attempt'),
      examId: exam.id,
      userId: exam.userId,
      answers,
      score,
      rawScore,
      maxScore,
      status: exam.status,
      durationSeconds: Number(body.durationSeconds || 0),
      questionCount: questions.length,
      correctCount,
      createdAt: helpers.now()
    };
    store.examAttempts.unshift(attempt);
    if (exam.status === 'passed') {
      pushNextStageAfterPass(store, helpers, exam);
    } else {
      resetStageLearningAfterFailure(store, helpers, exam);
    }
    logAudit(store, 'exam.submit', actor(req), { examId: exam.id, score });
    return { exam, attempt };
  });
  if (!result) return res.status(404).json({ error: 'exam not found' });
  res.json(result);
});

app.post('/api/exams/:id/violation', (req, res) => {
  const created = mutateStore((store, helpers) => {
    const exam = store.examTasks.find((item) => item.id === req.params.id);
    const body = req.body || {};
    const violation = {
      id: helpers.id('vio'),
      examId: req.params.id,
      userId: exam?.userId || body.userId,
      type: body.type || 'unknown',
      message: body.message || '',
      severity: body.severity || 'warning',
      createdAt: helpers.now()
    };
    store.violations.unshift(violation);
    logAudit(store, 'exam.violation', actor(req), violation);
    return violation;
  });
  res.status(201).json(created);
});

app.get('/api/violations', (_req, res) => {
  const store = readStore();
  res.json(
    store.violations.map((item) => ({
      ...item,
      user: sanitizeUser(store.users.find((user) => user.id === item.userId)),
      exam: store.examTasks.find((exam) => exam.id === item.examId)
    }))
  );
});

app.get('/api/audit-logs', (_req, res) => {
  res.json(readStore().auditLogs.slice(0, 80));
});

app.get('/api/push-records', (_req, res) => {
  res.json(readStore().pushRecords);
});

app.get('/api/admin/collections', (_req, res) => {
  const store = readStore();
  res.json(
    Object.fromEntries(
      Object.entries(collectionMap).map(([key, storeKey]) => [
        key,
        storeKey === 'users' ? store[storeKey].map(sanitizeUser) : store[storeKey]
      ])
    )
  );
});

app.patch('/api/admin/:collection/:id', (req, res) => {
  const storeKey = collectionMap[req.params.collection];
  if (!storeKey) return res.status(404).json({ error: 'collection not found' });

  const updated = mutateStore((store) => {
    const list = store[storeKey];
    const item = list.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    const next = { ...req.body };
    delete next.id;
    delete next.passwordHash;
    Object.assign(item, next, { updatedAt: now() });
    if (storeKey === 'users' && next.initialPassword) {
      item.passwordHash = hashPassword(next.initialPassword);
    }
    logAudit(store, 'admin.collection.update', actor(req), { collection: req.params.collection, id: req.params.id });
    return storeKey === 'users' ? sanitizeUser(item) : item;
  });

  if (!updated) return res.status(404).json({ error: 'record not found' });
  res.json(updated);
});

app.delete('/api/admin/:collection/:id', (req, res) => {
  const storeKey = collectionMap[req.params.collection];
  if (!storeKey) return res.status(404).json({ error: 'collection not found' });
  if (storeKey === 'users' && req.params.id === 'u_admin') {
    return res.status(400).json({ error: 'default admin cannot be deleted' });
  }

  const deleted = mutateStore((store) => {
    const list = store[storeKey];
    const index = list.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) return null;
    const [item] = list.splice(index, 1);

    if (storeKey === 'users') {
      store.progress = store.progress.filter((entry) => entry.userId !== item.id);
      store.learningRecords = store.learningRecords.filter((entry) => entry.userId !== item.id);
      store.examTasks = store.examTasks.filter((entry) => entry.userId !== item.id);
      store.examAttempts = store.examAttempts.filter((entry) => entry.userId !== item.id);
      store.violations = store.violations.filter((entry) => entry.userId !== item.id);
      store.pushRecords = store.pushRecords.filter((entry) => entry.userId !== item.id);
    }

    if (storeKey === 'documents') {
      const kpIds = new Set(store.knowledgePoints.filter((entry) => entry.documentId === item.id).map((entry) => entry.id));
      const questionIds = new Set(store.questions.filter((entry) => kpIds.has(entry.knowledgePointId)).map((entry) => entry.id));
      store.knowledgePoints = store.knowledgePoints.filter((entry) => entry.documentId !== item.id);
      store.learningRecords = store.learningRecords.filter((entry) => !kpIds.has(entry.knowledgePointId));
      store.questions = store.questions.filter((entry) => !kpIds.has(entry.knowledgePointId));
      store.examTasks.forEach((exam) => {
        exam.questionIds = (exam.questionIds || []).filter((questionId) => !questionIds.has(questionId));
      });
    }

    if (storeKey === 'knowledgePoints') {
      const questionIds = new Set(store.questions.filter((entry) => entry.knowledgePointId === item.id).map((entry) => entry.id));
      store.questions = store.questions.filter((entry) => entry.knowledgePointId !== item.id);
      store.learningRecords = store.learningRecords.filter((entry) => entry.knowledgePointId !== item.id);
      store.examTasks.forEach((exam) => {
        exam.questionIds = (exam.questionIds || []).filter((questionId) => !questionIds.has(questionId));
      });
    }

    if (storeKey === 'questions') {
      store.examTasks.forEach((exam) => {
        exam.questionIds = (exam.questionIds || []).filter((questionId) => questionId !== item.id);
      });
    }

    if (storeKey === 'learningPlans') {
      store.progress = store.progress.filter((entry) => entry.planId !== item.id);
      store.examTasks = store.examTasks.filter((entry) => entry.planId !== item.id);
    }

    logAudit(store, 'admin.collection.delete', actor(req), { collection: req.params.collection, id: req.params.id });
    return item;
  });

  if (!deleted) return res.status(404).json({ error: 'record not found' });
  res.json({ deleted: true, id: req.params.id });
});

if (process.env.NODE_ENV === 'production') {
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`SMU knowledge system listening on http://localhost:${port}`);
});
