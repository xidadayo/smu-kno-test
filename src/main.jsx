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
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  Users
} from 'lucide-react';
import './styles.css';

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const navItems = [
  { key: 'dashboard', label: '总览', icon: LayoutDashboard },
  { key: 'learners', label: '账号', icon: Users },
  { key: 'knowledge', label: '知识库', icon: BookOpen },
  { key: 'review', label: 'AI 审核', icon: Bot },
  { key: 'plans', label: '计划', icon: ListChecks },
  { key: 'learn', label: '学习端', icon: GraduationCap },
  { key: 'exam', label: '考试端', icon: ClipboardCheck },
  { key: 'monitor', label: '监控', icon: ShieldAlert }
];

function useSystemData() {
  const [data, setData] = useState({
    summary: null,
    learners: [],
    knowledge: { documents: [], knowledgePoints: [], questions: [] },
    plans: [],
    exams: [],
    violations: [],
    pushes: []
  });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [summary, learners, knowledge, plans, exams, violations, pushes] = await Promise.all([
      api('/api/summary'),
      api('/api/learners'),
      api('/api/knowledge'),
      api('/api/plans'),
      api('/api/exams'),
      api('/api/violations'),
      api('/api/push-records')
    ]);
    setData({ summary, learners, knowledge, plans, exams, violations, pushes });
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  return { data, loading, refresh };
}

function App() {
  const [active, setActive] = useState('dashboard');
  const { data, loading, refresh } = useSystemData();

  const page = {
    dashboard: <Dashboard data={data} loading={loading} onRefresh={refresh} />,
    learners: <Learners data={data} onRefresh={refresh} />,
    knowledge: <Knowledge data={data} onRefresh={refresh} />,
    review: <Review data={data} onRefresh={refresh} />,
    plans: <Plans data={data} onRefresh={refresh} />,
    learn: <LearningDesk data={data} onRefresh={refresh} />,
    exam: <ExamDesk data={data} onRefresh={refresh} />,
    monitor: <Monitor data={data} />
  }[active];

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
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{navItems.find((item) => item.key === active)?.label}</h1>
            <p>上传知识库、审核 AI 内容、追踪学习进度并生成阶段考试。</p>
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={16} />
              <input placeholder="搜索学员、知识点、考试" />
            </label>
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
  const [form, setForm] = useState({ name: '', account: '', department: '', position: '', feishuUserId: '' });
  const [csv, setCsv] = useState('王一,SMU1003,运营部,质检专员,ou_demo');

  const create = async (event) => {
    event.preventDefault();
    await api('/api/learners', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', account: '', department: '', position: '', feishuUserId: '' });
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
          {['name', 'account', 'department', 'position', 'feishuUserId'].map((key) => (
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
          columns={['姓名', '账号', '部门', '岗位', '飞书 ID', '状态']}
          rows={data.learners.map((item) => [item.name, item.account, item.department, item.position, item.feishuUserId || '-', item.status])}
        />
      </Panel>
    </section>
  );
}

function Knowledge({ data, onRefresh }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title || file.name);
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
          <input type="file" onChange={(event) => setFile(event.target.files?.[0])} />
          <button className="primary" disabled={!file || busy}>
            {busy ? '生成中...' : '上传并模拟 AI 生成'}
          </button>
        </form>
      </Panel>

      <Panel title="知识库文档">
        <DataTable
          columns={['标题', '类型', '状态', '上传时间']}
          rows={data.knowledge.documents.map((doc) => [doc.title, doc.type, doc.status, formatTime(doc.createdAt)])}
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
          <button className="primary">保存计划</button>
        </form>
      </Panel>

      <Panel title="计划列表" className="wide-panel">
        <DataTable
          columns={['计划', '对象', '阶段', '模式', '自动考试', '状态']}
          rows={data.plans.map((plan) => [
            plan.name,
            plan.targetDepartment,
            (plan.stages || []).join(' / '),
            plan.pushMode,
            plan.autoExam ? '开启' : '关闭',
            plan.status
          ])}
        />
      </Panel>
    </section>
  );
}

function LearningDesk({ data, onRefresh }) {
  const learner = data.learners[0];
  const plan = data.plans[0];
  const approved = data.knowledge.knowledgePoints.filter((item) => item.status === 'approved');

  const complete = async () => {
    await api('/api/progress', {
      method: 'POST',
      body: JSON.stringify({
        userId: learner.id,
        planId: plan.id,
        stage: 'L1',
        difficulty: 'L1',
        percent: 95,
        effectiveSeconds: 300,
        lastPosition: approved[0]?.id
      })
    });
    onRefresh();
  };

  if (!learner || !plan) return <EmptyState text="请先创建学员和学习计划。" />;

  return (
    <section className="page-grid">
      <Panel title={`${learner.name} 的学习任务`} className="wide-panel">
        <div className="learning-cards">
          {approved.map((kp) => (
            <article className="learning-card" key={kp.id}>
              <span>{kp.stage}</span>
              <h3>{kp.title}</h3>
              <p>{kp.summary}</p>
              <small>来源: {kp.sourceLocation} · 预计 {kp.estimatedMinutes} 分钟</small>
            </article>
          ))}
        </div>
        <button className="primary" onClick={complete}>
          <CheckCircle2 size={16} />
          模拟完成阶段学习并触发考试
        </button>
      </Panel>

      <Panel title="完成规则">
        <div className="rule-list">
          <p>阅读进度达到 90% 以上。</p>
          <p>记录有效学习时长和当前阅读位置。</p>
          <p>阶段知识点完成后自动生成考试任务。</p>
        </div>
      </Panel>
    </section>
  );
}

function ExamDesk({ data, onRefresh }) {
  const exam = data.exams[0];
  const [answers, setAnswers] = useState({});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!exam) return;
    const record = (type, message) =>
      api(`/api/exams/${exam.id}/violation`, {
        method: 'POST',
        body: JSON.stringify({ type, message, severity: type === 'hidden' ? 'critical' : 'warning' })
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
  }, [exam?.id]);

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
      <Panel title={`${exam.user?.name || '学员'} · ${exam.stage} 阶段考试`} className="wide-panel">
        <div className="exam-meta">
          <span>时长 {exam.durationMinutes} 分钟</span>
          <span>及格 {exam.passScore} 分</span>
          <span>状态 {statusText(exam.status)}</span>
        </div>
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
                      const next = question.type === 'multi'
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
        <button className="primary" onClick={submit}>
          提交考试
        </button>
        {result && <div className="result">本次得分 {result.score}，结果 {statusText(result.status)}</div>}
      </Panel>

      <Panel title="防离开规则">
        <div className="rule-list danger">
          <p>离开考试界面 1 次: 警告。</p>
          <p>离开考试界面 2 次: 记录违规。</p>
          <p>离开考试界面 3 次: 可自动交卷。</p>
          <p>复制、右键、窗口失焦都会记录。</p>
        </div>
      </Panel>
    </section>
  );
}

function Monitor({ data }) {
  return (
    <section className="page-grid">
      <Panel title="违规记录" className="wide-panel">
        <DataTable
          columns={['学员', '类型', '说明', '级别', '时间']}
          rows={data.violations.map((item) => [item.user?.name || item.userId, item.type, item.message, item.severity, formatTime(item.createdAt)])}
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
      <span style={{ width: `${value}%` }} />
      <strong>{value}%</strong>
    </div>
  );
}

function ReviewItem({ item, title, meta, onApprove }) {
  return (
    <article className="review-item">
      <div>
        <h3>{title || item.title}</h3>
        <p>{item.summary || item.analysis}</p>
        <small>{meta || `${item.stage} · ${item.difficulty} · 置信度 ${Math.round(item.confidence * 100)}%`}</small>
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
    feishuUserId: '飞书 User ID'
  }[key];
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
