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
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(uploadDir));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'dist')));
}

const actor = (req) => req.header('x-user-id') || 'u_admin';
const sanitizeLearner = (user) => sanitizeUser(user);

function userFromRequest(req, store) {
  return store.users.find((user) => user.id === actor(req));
}

function learnerRows(store) {
  return store.users
    .filter((user) => user.role === 'learner')
    .map((user) => {
      const progress = store.progress.find((item) => item.userId === user.id);
      const exams = store.examTasks.filter((item) => item.userId === user.id);
      const latestExam = exams.at(-1);
      const violations = store.violations.filter((item) => item.userId === user.id);
      return {
        ...sanitizeLearner(user),
        progressPercent: progress?.percent || 0,
        learningStatus: progress?.status || 'not_started',
        currentStage: progress?.stage || user.stage || 'L1',
        difficulty: progress?.difficulty || user.difficulty || 'L1',
        latestExamStatus: latestExam?.status || 'none',
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
  const generated = await generateFromFile(req.file, documentId);
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

    progress.percent = Math.min(100, Number(req.body.percent ?? progress.percent));
    progress.effectiveSeconds += Number(req.body.effectiveSeconds || 0);
    progress.lastPosition = req.body.lastPosition || progress.lastPosition;
    progress.status = progress.percent >= 90 ? 'completed' : 'learning';
    progress.updatedAt = helpers.now();

    if (progress.status === 'completed') {
      const existingExam = store.examTasks.find((item) => item.userId === progress.userId && item.stage === progress.stage);
      if (!existingExam) {
        const learner = store.users.find((user) => user.id === progress.userId);
        const questions = store.questions
          .filter((question) => question.status === 'approved' && question.stage === progress.stage && visibleForDepartment(question, learner?.department))
          .map((question) => question.id)
          .slice(0, 5);
        const exam = {
          id: helpers.id('exam'),
          userId: progress.userId,
          planId: progress.planId,
          stage: progress.stage,
          difficulty: progress.difficulty,
          status: 'pending',
          passScore: 60,
          durationMinutes: 30,
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
      }
    }

    logAudit(store, 'progress.update', actor(req), { progressId: progress.id, percent: progress.percent });
    return progress;
  });
  res.json(updated);
});

app.get('/api/exams', (_req, res) => {
  const store = readStore();
  res.json(
    store.examTasks.map((exam) => ({
      ...exam,
      user: sanitizeUser(store.users.find((user) => user.id === exam.userId)),
      questions: exam.questionIds.map((qid) => store.questions.find((question) => question.id === qid)).filter(Boolean)
    }))
  );
});

app.get('/api/my/learning', (req, res) => {
  const store = readStore();
  const user = userFromRequest(req, store);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const progress = store.progress.filter((item) => item.userId === user.id);
  const planIds = new Set(progress.map((item) => item.planId));
  const plans = store.learningPlans.filter((item) => planIds.has(item.id) || item.status === 'active');
  const currentStage = progress[0]?.stage || user.stage || 'L1';
  res.json({
    user: sanitizeUser(user),
    progress,
    plans,
    knowledgePoints: store.knowledgePoints.filter((item) => item.status === 'approved' && item.stage === currentStage && visibleForDepartment(item, user.department))
  });
});

app.get('/api/my/exams', (req, res) => {
  const store = readStore();
  const user = userFromRequest(req, store);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(
    store.examTasks
      .filter((exam) => exam.userId === user.id)
      .map((exam) => ({
        ...exam,
        user: sanitizeUser(user),
        questions: exam.questionIds.map((qid) => store.questions.find((question) => question.id === qid)).filter(Boolean)
      }))
  );
});

app.post('/api/exams/:id/submit', (req, res) => {
  const result = mutateStore((store, helpers) => {
    const exam = store.examTasks.find((item) => item.id === req.params.id);
    if (!exam) return null;
    const questions = exam.questionIds.map((qid) => store.questions.find((question) => question.id === qid)).filter(Boolean);
    const answers = req.body.answers || {};
    const score = questions.reduce((sum, question) => {
      const given = Array.isArray(answers[question.id]) ? answers[question.id] : [answers[question.id]].filter(Boolean);
      const correct = question.answer.every((item) => given.includes(item)) && given.length === question.answer.length;
      return sum + (correct ? question.score : 0);
    }, 0);
    exam.status = score >= exam.passScore ? 'passed' : 'failed';
    exam.submittedAt = helpers.now();
    exam.score = score;
    const attempt = {
      id: helpers.id('attempt'),
      examId: exam.id,
      userId: exam.userId,
      answers,
      score,
      status: exam.status,
      durationSeconds: Number(req.body.durationSeconds || 0),
      createdAt: helpers.now()
    };
    store.examAttempts.unshift(attempt);
    logAudit(store, 'exam.submit', actor(req), { examId: exam.id, score });
    return { exam, attempt };
  });
  if (!result) return res.status(404).json({ error: 'exam not found' });
  res.json(result);
});

app.post('/api/exams/:id/violation', (req, res) => {
  const created = mutateStore((store, helpers) => {
    const exam = store.examTasks.find((item) => item.id === req.params.id);
    const violation = {
      id: helpers.id('vio'),
      examId: req.params.id,
      userId: exam?.userId || req.body.userId,
      type: req.body.type || 'unknown',
      message: req.body.message || '',
      severity: req.body.severity || 'warning',
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

if (process.env.NODE_ENV === 'production') {
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`SMU knowledge system listening on http://localhost:${port}`);
});
