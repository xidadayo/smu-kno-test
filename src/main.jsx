import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Database,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  Users
} from 'lucide-react';
import './styles.css';

const storedUser = () => {
  try {
    return JSON.parse(localStorage.getItem('smu-user') || 'null');
  } catch {
    return null;
  }
};

const api = async (path, options = {}) => {
  const user = storedUser();
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  if (user?.id) headers['x-user-id'] = user.id;
  const res = await fetch(path, { headers, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const adminNav = [
  { key: 'dashboard', label: '总览', icon: LayoutDashboard },
  { key: 'learners', label: '账号', icon: Users },
  { key: 'knowledge', label: '知识库', icon: BookOpen },
  { key: 'review', label: 'AI 审核', icon: Bot },
  { key: 'plans', label: '计划', icon: ListChecks },
  { key: 'monitor', label: '监控', icon: ShieldAlert },
  { key: 'data', label: '数据', icon: Database }
];

const learnerNav = [
  { key: 'learn', label: '我的学习', icon: GraduationCap },
  { key: 'exam', label: '我的考试', icon: ClipboardCheck }
];

function useSystemData(user) {
  const [data, setData] = useState({
    summary: null,
    learners: [],
    knowledge: { documents: [], knowledgePoints: [], questions: [] },
    plans: [],
    exams: [],
    violations: [],
    pushes: [],
    adminCollections: {},
    myLearning: null,
    myExams: []
  });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    if (user.role === 'learner') {
      const [myLearning, myExams] = await Promise.all([api('/api/my/learning'), api('/api/my/exams')]);
      setData((current) => ({ ...current, myLearning, myExams }));
    } else {
      const [summary, learners, knowledge, plans, exams, violations, pushes, adminCollections] = await Promise.all([
        api('/api/summary'),
        api('/api/learners'),
        api('/api/knowledge'),
        api('/api/plans'),
        api('/api/exams'),
        api('/api/violations'),
        api('/api/push-records'),
        api('/api/admin/collections')
      ]);
      setData({ summary, learners, knowledge, plans, exams, violations, pushes, adminCollections, myLearning: null, myExams: [] });
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [user?.id]);

  return { data, loading, refresh };
}

function App() {
  const [user, setUser] = useState(storedUser);
  const [active, setActive] = useState(user?.role === 'learner' ? 'learn' : 'dashboard');
  const { data, loading, refresh } = useSystemData(user);

  useEffect(() => {
    if (!user) return;
    setActive(user.role === 'learner' ? 'learn' : 'dashboard');
  }, [user?.id]);

  if (!user) return <Login onLogin={setUser} />;

  const navItems = user.role === 'learner' ? learnerNav : adminNav;
  const page = {
    dashboard: <Dashboard data={data} loading={loading} onRefresh={refresh} />,
    learners: <Learners data={data} onRefresh={refresh} />,
    knowledge: <Knowledge data={data} onRefresh={refresh} />,
    review: <Review data={data} onRefresh={refresh} />,
    plans: <Plans data={data} onRefresh={refresh} />,
    learn: <LearningDesk data={data} user={user} onRefresh={refresh} />,
    exam: <ExamDesk data={data} user={user} onRefresh={refresh} />,
    monitor: <Monitor data={data} />
    ,
    data: <DataCenter data={data} onRefresh={refresh} />
  }[active];

  const logout = () => {
    localStorage.removeItem('smu-user');
    setUser(null);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">知</div>
          <div>
            <strong>知识库考核</strong>
            <span>SMU Training OS</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={active === item.key ? 'active' : ''} key={item.key} onClick={() => setActive(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="account-box">
          <strong>{user.name}</strong>
          <span>{roleText(user.role)} · {user.account}</span>
          <button onClick={logout}>
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{navItems.find((item) => item.key === active)?.label}</h1>
            <p>{user.role === 'learner' ? '查看个人学习任务、完成阶段学习并参加考试。' : '上传知识库、审核 AI 内容、追踪学习进度并生成阶段考试。'}</p>
          </div>
          <div className="top-actions">
            {user.role !== 'learner' && (
              <label className="search">
                <Search size={16} />
                <input placeholder="搜索学员、知识点、考试" />
              </label>
            )}
            <button className="icon-button" onClick={refresh} title="刷新">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>
        {page}
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ account, password })
      });
      localStorage.setItem('smu-user', JSON.stringify(result.user));
      onLogin(result.user);
    } catch {
      setError('账号或密码错误');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">知</div>
        <h1>知识库学习与考核系统</h1>
        <p>管理员审核 AI 生成内容；学员登录后只进入自己的学习与考试。</p>
        <form onSubmit={submit}>
          <label>
            <span>账号</span>
            <input value={account} onChange={(event) => setAccount(event.target.value)} />
          </label>
          <label>
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? '登录中...' : '登录'}</button>
        </form>
        <div className="login-hints">
          <span>管理员：admin / admin123</span>
          <span>学员：SMU1001 / 123456</span>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ data, loading, onRefresh }) {
  const s = data.summary || {};
  const cards = [
    ['总学员', s.learners, Users, 'active'],
    ['学习完成', s.completed, CheckCircle2, 'success'],
    ['待考试', s.pendingExams, ClipboardCheck, 'warning'],
    ['通过率', `${s.passRate || 0}%`, BarChart3, 'info'],
    ['违规记录', s.violations, ShieldAlert, 'danger']
  ];

  return (
    <section className="page-grid">
      <div className="content-stack wide">
        <div className="kpi-grid">
          {cards.map(([label, value, Icon, tone]) => (
            <article className={`kpi ${tone}`} key={label}>
              <Icon size={20} />
              <span>{label}</span>
              <strong>{loading ? '...' : value}</strong>
            </article>
          ))}
        </div>

        <Panel title="学员阶段视图" action={<button onClick={onRefresh}>刷新数据</button>}>
          <DataTable
            columns={['姓名', '部门', '阶段', '难度', '学习进度', '考试', '违规']}
            rows={data.learners.map((item) => [
              item.name,
              item.department,
              item.currentStage,
              item.difficulty,
              <Progress value={item.progressPercent} />,
              statusText(item.latestExamStatus),
              item.violationCount
            ])}
          />
        </Panel>
      </div>

      <aside className="right-rail">
        <Panel title="业务闭环">
          <div className="workflow">
            {(s.workflow || []).map((item, index) => (
              <div className="workflow-step" key={item.key}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.count} 条记录</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="飞书推送">
          <div className="event-list">
            {data.pushes.slice(0, 4).map((push) => (
              <div className="event-item" key={push.id}>
                <Bell size={16} />
                <div>
                  <strong>{push.title}</strong>
                  <span>{push.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </section>
  );
}

function Learners({ data, onRefresh }) {
  const [form, setForm] = useState({ name: '', account: '', department: '', position: '', feishuUserId: '', initialPassword: '123456' });
  const [csv, setCsv] = useState('王一,SMU1003,运营部,质检专员,ou_demo');

  const create = async (event) => {
    event.preventDefault();
    await api('/api/learners', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', account: '', department: '', position: '', feishuUserId: '', initialPassword: '123456' });
    onRefresh();
  };

  const importCsv = async () => {
    await api('/api/learners/import', { method: 'POST', body: JSON.stringify({ csv }) });
    onRefresh();
  };

  return (
    <section className="page-grid">
      <Panel title="创建学员账号">
        <form className="form-grid" onSubmit={create}>
          {['name', 'account', 'department', 'position', 'feishuUserId', 'initialPassword'].map((key) => (
            <label key={key}>
              <span>{fieldLabel(key)}</span>
              <input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== 'feishuUserId'} />
            </label>
          ))}
          <button className="primary" type="submit">
            <Plus size={16} />
            创建账号
          </button>
        </form>
      </Panel>

      <Panel title="CSV 批量导入">
        <textarea value={csv} onChange={(event) => setCsv(event.target.value)} />
        <button className="primary" onClick={importCsv}>
          <Upload size={16} />
          批量导入
        </button>
      </Panel>

      <Panel title="账号列表" className="wide-panel">
        <DataTable
          columns={['姓名', '账号', '初始密码', '部门', '岗位', '飞书 ID', '状态']}
          rows={data.learners.map((item) => [item.name, item.account, item.initialPassword || '已设置', item.department, item.position, item.feishuUserId || '-', item.status])}
        />
      </Panel>
    </section>
  );
}

function Knowledge({ data, onRefresh }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('全公司');
  const [busy, setBusy] = useState(false);
  const departments = useMemo(() => ['全公司', ...new Set(data.learners.map((item) => item.department).filter(Boolean))], [data.learners]);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title || file.name);
    fd.append('department', department);
    await api('/api/documents/upload', { method: 'POST', body: fd });
    setBusy(false);
    setFile(null);
    setTitle('');
    onRefresh();
  };

  return (
    <section className="content-stack">
      <Panel title="上传知识库文档">
        <form className="upload-box" onSubmit={upload}>
          <FileUp size={28} />
          <input placeholder="文档标题" value={title} onChange={(event) => setTitle(event.target.value)} />
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            {departments.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0])} />
          <button className="primary" disabled={!file || busy}>
            {busy ? 'DeepSeek 生成中...' : '上传并生成待审核内容'}
          </button>
        </form>
      </Panel>

      <Panel title="知识库文档">
        <DataTable
          columns={['标题', '归属部门', '类型', '状态', 'AI 模型', '上传时间']}
          rows={data.knowledge.documents.map((doc) => [doc.title, doc.department || '全公司', doc.type, doc.status, doc.aiModel || '-', formatTime(doc.createdAt)])}
        />
      </Panel>
    </section>
  );
}

function Review({ data, onRefresh }) {
  const review = async (kind, id, status) => {
    await api(`/api/${kind}/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
    onRefresh();
  };

  return (
    <section className="page-grid">
      <Panel title="知识点审核" className="wide-panel">
        <div className="review-list">
          {data.knowledge.knowledgePoints.map((kp) => (
            <ReviewItem key={kp.id} item={kp} onApprove={() => review('knowledge', kp.id, 'approved')} />
          ))}
        </div>
      </Panel>

      <Panel title="题库审核">
        <div className="review-list compact">
          {data.knowledge.questions.map((q) => (
            <ReviewItem key={q.id} item={q} title={q.title} meta={`${q.type} · ${q.difficulty} · ${q.score} 分`} onApprove={() => review('questions', q.id, 'approved')} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

function Plans({ data, onRefresh }) {
  const [form, setForm] = useState({
    name: '阶段学习计划',
    targetDepartment: '运营部',
    pushMode: 'progressive',
    pushCycle: 'daily',
    completionRule: 90,
    questionCount: 5,
    passScore: 60,
    durationMinutes: 30,
    autoExam: true
  });

  const create = async (event) => {
    event.preventDefault();
    await api('/api/plans', { method: 'POST', body: JSON.stringify({ ...form, stages: ['L1', 'L2', 'L3'] }) });
    onRefresh();
  };

  return (
    <section className="page-grid">
      <Panel title="新建学习计划">
        <form className="form-grid" onSubmit={create}>
          <label>
            <span>计划名称</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            <span>学习对象</span>
            <input value={form.targetDepartment} onChange={(event) => setForm({ ...form, targetDepartment: event.target.value })} />
          </label>
          <label>
            <span>推送模式</span>
            <select value={form.pushMode} onChange={(event) => setForm({ ...form, pushMode: event.target.value })}>
              <option value="fixed">固定难度</option>
              <option value="progressive">递进难度</option>
              <option value="personalized">个性化难度</option>
            </select>
          </label>
          <label>
            <span>完成条件</span>
            <input type="number" value={form.completionRule} onChange={(event) => setForm({ ...form, completionRule: Number(event.target.value) })} />
          </label>
          <label>
            <span>考试题目数量</span>
            <input type="number" min="1" value={form.questionCount} onChange={(event) => setForm({ ...form, questionCount: Number(event.target.value) })} />
          </label>
          <label>
            <span>及格分</span>
            <input type="number" min="1" value={form.passScore} onChange={(event) => setForm({ ...form, passScore: Number(event.target.value) })} />
          </label>
          <label>
            <span>考试时长</span>
            <input type="number" min="1" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} />
          </label>
          <button className="primary">保存计划</button>
        </form>
      </Panel>

      <Panel title="计划列表" className="wide-panel">
        <DataTable
          columns={['计划', '对象', '阶段', '模式', '题数', '及格分', '自动考试', '状态']}
          rows={data.plans.map((plan) => [
            plan.name,
            plan.targetDepartment,
            (plan.stages || []).join(' / '),
            plan.pushMode,
            plan.questionCount || 5,
            plan.passScore || 60,
            plan.autoExam ? '开启' : '关闭',
            plan.status
          ])}
        />
      </Panel>
    </section>
  );
}

function LearningDesk({ data, user, onRefresh }) {
  const learning = data.myLearning;
  const plan = learning?.plans?.[0];
  const progress = learning?.progress?.[0];
  const approved = learning?.knowledgePoints || [];
  const records = learning?.learningRecords || [];
  const completedIds = useMemo(() => new Set(records.filter((item) => item.status === 'completed').map((item) => item.knowledgePointId)), [records]);
  const firstUnlearnedIndex = Math.max(0, approved.findIndex((item) => !completedIds.has(item.id)));
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const percent = approved.length === 0 ? 0 : Math.round((completedIds.size / approved.length) * 100);
  const currentIndex = Math.min(page, Math.max(approved.length - 1, 0));
  const current = approved[currentIndex];
  const isCompleted = current ? completedIds.has(current.id) : false;

  useEffect(() => {
    if (firstUnlearnedIndex >= 0) setPage(firstUnlearnedIndex);
  }, [firstUnlearnedIndex, approved.length]);

  const complete = async () => {
    if (!current) return;
    setReading(false);
    const effectiveSeconds = Math.max(30, Math.round((Date.now() - startedAt) / 1000));
    await api(`/api/my/knowledge/${current.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        planId: plan?.id,
        effectiveSeconds,
        startedAt: new Date(startedAt).toISOString()
      })
    });
    await onRefresh();
    setStartedAt(Date.now());
    setPage((value) => Math.min(value + 1, Math.max(approved.length - 1, 0)));
  };

  if (!learning || !plan) return <EmptyState text="暂无学习计划，请联系管理员分配计划。" />;
  if (approved.length === 0) return <EmptyState text="当前阶段暂无可学习知识点，请联系管理员审核并发布知识库。" />;

  return (
    <section className="page-grid">
      <Panel title={`${user.name} 的阶段学习`} className="wide-panel">
        <div className="learner-summary">
          <Progress value={percent} />
          <span>第 {currentIndex + 1} / {approved.length} 个知识点 · 已完成 {completedIds.size} 个 · 当前阶段 {progress?.stage || user.stage || 'L1'}</span>
        </div>
        <article className="learning-card single-learning-card">
          <span>{current.stage}</span>
          <h3>{current.title}</h3>
          <p>{current.summary}</p>
          <small>来源: {current.sourceLocation} · 预计 {current.estimatedMinutes} 分钟 · {isCompleted ? '已学习' : '未学习'}</small>
        </article>
        <div className="pager">
          {approved.map((kp, index) => (
            <button className={index === currentIndex ? 'active' : ''} key={kp.id} onClick={() => setPage(index)}>
              {index + 1}
              {completedIds.has(kp.id) ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <div className="action-row">
          <button onClick={() => { setReading(true); setStartedAt(Date.now()); }}>开始学习</button>
          <button disabled={isCompleted} className="primary" onClick={complete}>
            <CheckCircle2 size={16} />
            {isCompleted ? '本知识点已完成' : '完成本知识点，学习下一个'}
          </button>
        </div>
        {reading && <div className="result">学习计时中：系统会记录阅读进度、有效学习时长和当前位置。</div>}
        {percent >= 100 && <div className="result">本阶段知识点已全部学习完成，系统已生成或保留阶段考试任务。</div>}
      </Panel>

      <Panel title="学习完成规则">
        <div className="rule-list">
          <p>一次只学习一个知识点，完成后进入下一个。</p>
          <p>每个知识点都会保存个人学习记录和有效学习时长。</p>
          <p>当前阶段全部知识点完成后自动生成考试任务。</p>
        </div>
      </Panel>
    </section>
  );
}

function ExamDesk({ data, user, onRefresh }) {
  const pendingFirst = useMemo(() => [...(data.myExams || [])].sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending'))[0], [data.myExams]);
  const exam = pendingFirst;
  const [answers, setAnswers] = useState({});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!exam || exam.status !== 'pending') return;
    const record = (type, message) =>
      api(`/api/exams/${exam.id}/violation`, {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, type, message, severity: type === 'hidden' ? 'critical' : 'warning' })
      }).then(onRefresh);
    const onHidden = () => document.hidden && record('hidden', '考试页进入后台或切换标签');
    const onBlur = () => record('blur', '窗口失焦');
    const onCopy = (event) => {
      event.preventDefault();
      record('copy', '尝试复制考试内容');
    };
    const onContext = (event) => {
      event.preventDefault();
      record('contextmenu', '尝试打开右键菜单');
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [exam?.id, exam?.status]);

  const submit = async () => {
    const payload = {
      answers,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000)
    };
    const response = await api(`/api/exams/${exam.id}/submit`, { method: 'POST', body: JSON.stringify(payload) });
    setResult(response.attempt);
    setStartedAt(Date.now());
    onRefresh();
  };

  if (!exam) return <EmptyState text="暂无考试任务。完成学习后会自动生成阶段考试。" />;

  return (
    <section className="page-grid">
      <Panel title={`${user.name} · ${exam.stage} 阶段考试`} className="wide-panel">
        <div className="exam-meta">
          <span>时长 {exam.durationMinutes} 分钟</span>
          <span>及格 {exam.passScore} 分</span>
          <span>状态 {statusText(exam.status)}</span>
        </div>
        {exam.status === 'pending' ? (
          <>
            <div className="question-list">
              {exam.questions.map((question) => (
                <article className="question" key={question.id}>
                  <h3>{question.title}</h3>
                  {question.options.map((option) => (
                    <label key={option}>
                      <input
                        type={question.type === 'multi' ? 'checkbox' : 'radio'}
                        name={question.id}
                        checked={(answers[question.id] || []).includes(option)}
                        onChange={(event) => {
                          const next =
                            question.type === 'multi'
                              ? event.target.checked
                                ? [...(answers[question.id] || []), option]
                                : (answers[question.id] || []).filter((item) => item !== option)
                              : [option];
                          setAnswers({ ...answers, [question.id]: next });
                        }}
                      />
                      {option}
                    </label>
                  ))}
                </article>
              ))}
            </div>
            <button className="primary" onClick={submit}>提交考试</button>
          </>
        ) : (
          <div className="result">本场考试已提交，得分 {exam.score || result?.score || 0}，结果 {statusText(exam.status)}。</div>
        )}
        {result && <div className="result">本次得分 {result.score}，结果 {statusText(result.status)}</div>}
      </Panel>

      <Panel title="防离开规则">
        <div className="rule-list danger">
          <p>离开考试界面 1 次：警告。</p>
          <p>离开考试界面 2 次：记录违规。</p>
          <p>离开考试界面 3 次：可自动交卷。</p>
          <p>复制、右键、窗口失焦都会记录。</p>
        </div>
      </Panel>
    </section>
  );
}

function Monitor({ data }) {
  const attempts = data.adminCollections?.examAttempts || [];
  return (
    <section className="page-grid">
      <Panel title="违规记录" className="wide-panel">
        <DataTable
          columns={['学员', '类型', '说明', '级别', '时间']}
          rows={data.violations.map((item) => [item.user?.name || item.userId, item.type, item.message, item.severity, formatTime(item.createdAt)])}
        />
      </Panel>

      <Panel title="考试结果" className="wide-panel">
        <DataTable
          columns={['学员', '考试', '题数', '正确', '得分', '结果', '用时', '提交时间']}
          rows={attempts.map((attempt) => {
            const exam = data.exams.find((item) => item.id === attempt.examId);
            return [
              exam?.user?.name || attempt.userId,
              exam ? `${exam.stage} 阶段考试` : attempt.examId,
              attempt.questionCount || exam?.questionIds?.length || 0,
              attempt.correctCount ?? '-',
              attempt.score,
              statusText(attempt.status),
              `${attempt.durationSeconds || 0} 秒`,
              formatTime(attempt.createdAt)
            ];
          })}
        />
      </Panel>

      <Panel title="监控说明">
        <div className="rule-list">
          <p>浏览器无法绝对禁止离开页面，但可以检测、记录、警告和触发自动交卷。</p>
          <p>所有违规事件都会进入审计链路，供阅卷老师和管理员复核。</p>
        </div>
      </Panel>
    </section>
  );
}

const collectionLabels = {
  users: '账号',
  documents: '知识库文档',
  knowledgePoints: '知识点',
  questions: '题库',
  learningPlans: '学习计划',
  progress: '学习进度',
  learningRecords: '学习记录',
  examTasks: '考试任务',
  examAttempts: '考试提交',
  violations: '违规记录',
  pushRecords: '推送记录',
  auditLogs: '审计日志'
};

function DataCenter({ data, onRefresh }) {
  const collections = data.adminCollections || {};
  const names = Object.keys(collectionLabels).filter((name) => Array.isArray(collections[name]));
  const [activeCollection, setActiveCollection] = useState(names[0] || 'users');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const records = collections[activeCollection] || [];

  useEffect(() => {
    if (!names.includes(activeCollection) && names[0]) setActiveCollection(names[0]);
  }, [names.join('|')]);

  const startEdit = (record) => {
    setEditing(record.id);
    setDraft(JSON.stringify(record, null, 2));
  };

  const saveEdit = async () => {
    const payload = JSON.parse(draft);
    await api(`/api/admin/${activeCollection}/${editing}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setEditing(null);
    setDraft('');
    onRefresh();
  };

  const deleteRecord = async (record) => {
    if (!window.confirm(`确认删除 ${record.name || record.title || record.id}？`)) return;
    await api(`/api/admin/${activeCollection}/${record.id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <section className="data-center">
      <Panel title="数据集合">
        <div className="collection-tabs">
          {names.map((name) => (
            <button className={activeCollection === name ? 'active' : ''} key={name} onClick={() => setActiveCollection(name)}>
              {collectionLabels[name]}
              <span>{collections[name]?.length || 0}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={`${collectionLabels[activeCollection]}维护`}>
        <div className="record-list">
          {records.map((record) => (
            <article className="record-row" key={record.id}>
              <div>
                <strong>{record.name || record.title || record.account || record.id}</strong>
                <span>{record.department || record.status || record.role || record.type || record.createdAt || '-'}</span>
              </div>
              <div className="row-actions">
                <button onClick={() => startEdit(record)}>编辑</button>
                <button className="danger-button" onClick={() => deleteRecord(record)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      {editing && (
        <Panel title="编辑 JSON">
          <textarea className="json-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="action-row">
            <button className="primary" onClick={saveEdit}>保存修改</button>
            <button onClick={() => setEditing(null)}>取消</button>
          </div>
        </Panel>
      )}
    </section>
  );
}

function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ value }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.min(100, value)}%` }} />
      <strong>{Math.min(100, value)}%</strong>
    </div>
  );
}

function ReviewItem({ item, title, meta, onApprove }) {
  return (
    <article className="review-item">
      <div>
        <h3>{title || item.title}</h3>
        <p>{item.summary || item.analysis}</p>
        <small>{meta || `${item.department || '全公司'} · ${item.stage} · ${item.difficulty} · 置信度 ${Math.round(item.confidence * 100)}% · ${item.generatedBy || 'AI'}`}</small>
      </div>
      <button disabled={item.status === 'approved'} onClick={onApprove}>
        {item.status === 'approved' ? '已通过' : '通过'}
      </button>
    </article>
  );
}

function EmptyState({ text }) {
  return (
    <section className="empty">
      <AlertTriangle size={28} />
      <p>{text}</p>
    </section>
  );
}

function fieldLabel(key) {
  return {
    name: '姓名',
    account: '登录账号',
    department: '部门',
    position: '岗位',
    feishuUserId: '飞书 User ID',
    initialPassword: '初始密码'
  }[key];
}

function roleText(role) {
  return {
    super_admin: '超级管理员',
    admin: '管理员',
    learner: '学员'
  }[role] || role;
}

function statusText(status) {
  return {
    none: '无',
    pending: '待考试',
    passed: '已通过',
    failed: '未通过',
    learning: '学习中',
    completed: '已完成',
    not_started: '未开始'
  }[status] || status;
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

createRoot(document.getElementById('root')).render(<App />);
