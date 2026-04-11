import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const emptyRunner = {
  name: '',
  mode: 'local',
  host: '',
  port: 22,
  username: '',
  workRoot: '',
  privateKey: ''
};

const emptyRepo = {
  name: '',
  provider: 'github',
  repoUrl: '',
  webhookSecret: '',
  branch: 'main',
  workDir: '',
  deployKey: '',
  deployScript: 'set -e\nnpm ci\nnpm run build\n',
  runnerId: null,
  cleanWorktree: true
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let data = null;
  let parsedJSON = false;
  if (text) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
        parsedJSON = true;
      } catch {
        throw new Error(`接口返回了无法解析的 JSON：HTTP ${response.status}`);
      }
    }
  }
  if (!response.ok) {
    const message = data?.error || text.trim() || response.statusText || `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (text && !parsedJSON) {
    throw new Error(`接口返回了非 JSON 响应：${text.trim().slice(0, 120)}`);
  }
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <main className="centered">
        <div className="boot-card">
          <BrandMark />
          <strong>正在连接 Candy Deploy</strong>
        </div>
      </main>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} error={error} setError={setError} />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

function Login({ onLogin, error, setError }) {
  const [form, setForm] = useState({ username: 'super_admin', password: '' });
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <img
          className="auth-logo-art"
          src="/brand/candy-wordmark.png"
          alt="Candy"
        />
        <div className="auth-visual-content">
          <BrandLockup />
          <h1>把每次发布放进一条清晰的流水线。</h1>
          <p>从 webhook 到远端 Runner，每一步都有记录。</p>
          <div className="auth-metrics" aria-label="deployment safeguards">
            <span>Signature</span>
            <span>Queue</span>
            <span>SSH Runner</span>
          </div>
        </div>
      </section>

      <form className="auth-panel" onSubmit={submit}>
        <p className="eyebrow">Secure console</p>
        <h2>登录控制台</h2>
        <label className="auth-field">
          <span>用户名</span>
          <input
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label className="auth-field">
          <span>密码</span>
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoFocus
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" disabled={loading}>{loading ? '登录中...' : '登录'}</button>
        <p className="hint">默认超级管理员为 super_admin；密码必须通过 CANDY_ADMIN_PASSWORD 设置。</p>
      </form>
    </main>
  );
}

function Dashboard({ user, onLogout }) {
  const [runners, setRunners] = useState([]);
  const [repos, setRepos] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [runnerForm, setRunnerForm] = useState(emptyRunner);
  const [repoForm, setRepoForm] = useState(emptyRepo);
  const [editingRunnerId, setEditingRunnerId] = useState(null);
  const [editingRepoId, setEditingRepoId] = useState(null);
  const [configPanel, setConfigPanel] = useState('');
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const hasRepositories = repos.length > 0;
  const activeConfigPanel = configPanel || (dashboardLoaded && !hasRepositories ? 'repo' : '');

  const stats = useMemo(() => {
    const running = jobs.filter((job) => job.status === 'running' || job.status === 'queued').length;
    const failed = jobs.filter((job) => job.status === 'failed').length;
    const succeeded = jobs.filter((job) => job.status === 'succeeded').length;
    const lastJob = jobs[0];
    return {
      repositories: repos.length,
      runners: runners.length + 1,
      running,
      failed,
      succeeded,
      lastStatus: lastJob?.status || 'idle',
      lastRepo: lastJob?.repositoryName || '暂无发布'
    };
  }, [jobs, repos, runners]);

  async function refresh() {
    const [runnerData, repoData, jobData] = await Promise.all([
      api('/api/runners'),
      api('/api/repositories'),
      api('/api/jobs')
    ]);
    setRunners(runnerData || []);
    setRepos(repoData || []);
    setJobs(jobData || []);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setDashboardLoaded(true));
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadLogs(job) {
    setSelectedJob(job);
    const data = await api(`/api/jobs/${job.id}/logs`);
    setLogs(data || []);
  }

  async function saveRunner(event) {
    event.preventDefault();
    setError('');
    const payload = {
      name: runnerForm.name,
      mode: runnerForm.mode,
      host: runnerForm.host,
      port: Number(runnerForm.port || 22),
      username: runnerForm.username,
      workRoot: runnerForm.workRoot,
      privateKey: runnerForm.privateKey
    };
    try {
      if (editingRunnerId) {
        await api(`/api/runners/${editingRunnerId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/runners', { method: 'POST', body: JSON.stringify(payload) });
      }
      setRunnerForm(emptyRunner);
      setEditingRunnerId(null);
      setNotice('Runner 已保存');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveRepo(event) {
    event.preventDefault();
    setError('');
    const payload = {
      name: repoForm.name,
      provider: repoForm.provider,
      repoUrl: repoForm.repoUrl,
      webhookSecret: repoForm.webhookSecret,
      branch: repoForm.branch,
      workDir: repoForm.workDir,
      deployKey: repoForm.deployKey,
      deployScript: repoForm.deployScript,
      runnerId: repoForm.runnerId ? Number(repoForm.runnerId) : null,
      cleanWorktree: repoForm.cleanWorktree
    };
    try {
      if (editingRepoId) {
        await api(`/api/repositories/${editingRepoId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/repositories', { method: 'POST', body: JSON.stringify(payload) });
      }
      setRepoForm(emptyRepo);
      setEditingRepoId(null);
      setConfigPanel('');
      setNotice('仓库配置已保存');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    onLogout();
  }

  async function copyValue(value, label) {
    await navigator.clipboard?.writeText(value || '');
    setNotice(`${label} 已复制`);
  }

  function openRepositoryForm() {
    setEditingRepoId(null);
    setRepoForm(emptyRepo);
    setConfigPanel('repo');
  }

  function openRunnerPanel() {
    setConfigPanel('runner');
  }

  function closeConfigPanel() {
    setConfigPanel('');
    setEditingRepoId(null);
    setRepoForm(emptyRepo);
    setEditingRunnerId(null);
    setRunnerForm(emptyRunner);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandLockup />
        <nav className="side-nav" aria-label="main navigation">
          <a href="#overview" className="active">总览</a>
          <a href="#repositories">仓库</a>
          <button type="button" onClick={openRunnerPanel}>Runner</button>
          <a href="#activity">部署</a>
        </nav>
        <div className="side-card">
          <span className="status-dot"></span>
          <strong>Webhook ready</strong>
          <p>签名校验和任务队列已启用。</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">Deployment operations</p>
            <h1>发布控制台</h1>
          </div>
          <div className="workspace-actions">
            <button type="button" className="secondary-action" onClick={openRepositoryForm}>接入仓库</button>
            <button type="button" className="secondary-action" onClick={openRunnerPanel}>Runner</button>
            <div className="operator-menu">
              <span>{user.username}</span>
              <button type="button" className="secondary-action" onClick={logout}>退出</button>
            </div>
          </div>
        </header>

        {(error || notice) && (
          <div className={error ? 'toast error' : 'toast'}>
            <span>{error || notice}</span>
            <button type="button" className="text-action" onClick={() => { setError(''); setNotice(''); }}>关闭</button>
          </div>
        )}

        <section className="hero-panel" id="overview">
          <div>
            <p className="eyebrow">Pipeline health</p>
            <h2>{stats.lastRepo}</h2>
            <p>最近 200 次部署中，成功 {stats.succeeded} 次，失败 {stats.failed} 次。</p>
          </div>
          <Status status={stats.lastStatus} />
        </section>

        <section className="metric-grid" aria-label="deployment metrics">
          <Metric label="仓库" value={stats.repositories} caption="已接入 webhook" />
          <Metric label="执行端" value={stats.runners} caption="含本机 Runner" />
          <Metric label="队列" value={stats.running} caption="运行中或待执行" />
          <Metric label="失败" value={stats.failed} caption="最近 200 次" tone="danger" />
        </section>

        {activeConfigPanel && (
          <section className={hasRepositories ? 'config-drawer' : 'config-drawer onboarding'} id="configuration">
            {!hasRepositories && activeConfigPanel === 'repo' && (
              <div className="onboarding-copy">
                <p className="eyebrow">First repository</p>
                <h2>先接入一个 Git 仓库。</h2>
                <p>完成仓库接入后，首页会切换为仓库资产和部署活动视图；后续新增仓库或 Runner 都从顶部入口展开。</p>
                <button type="button" className="secondary-action" onClick={openRunnerPanel}>先配置 Runner</button>
              </div>
            )}
            {activeConfigPanel === 'repo' ? (
              <RepositoryForm
                runners={runners}
                editingRepoId={editingRepoId}
                repoForm={repoForm}
                saveRepo={saveRepo}
                setEditingRepoId={setEditingRepoId}
                setRepoForm={setRepoForm}
                onCancel={hasRepositories ? closeConfigPanel : undefined}
              />
            ) : (
              <RunnerForm
                runnerForm={runnerForm}
                runners={runners}
                editingRunnerId={editingRunnerId}
                refresh={refresh}
                saveRunner={saveRunner}
                setRunnerForm={setRunnerForm}
                setEditingRunnerId={setEditingRunnerId}
                setError={setError}
                setNotice={setNotice}
                onCancel={closeConfigPanel}
              />
            )}
          </section>
        )}

        <section className="resource-panel" id="repositories">
          <PanelTitle
            title="仓库资产"
            kicker="Repositories"
            action={<button type="button" className="secondary-action" onClick={openRepositoryForm}>接入仓库</button>}
          />
          <RepositoryTable
            repos={repos}
            onCopy={copyValue}
            onEdit={(repo) => {
              setEditingRepoId(repo.id);
              setRepoForm({ ...emptyRepo, ...repo, deployKey: '' });
              setConfigPanel('repo');
            }}
            onTrigger={async (repo) => {
              await api(`/api/repositories/${repo.id}/trigger`, { method: 'POST', body: '{}' });
              setNotice(`${repo.name} 已进入队列`);
              await refresh();
            }}
            onDelete={async (repo) => {
              await api(`/api/repositories/${repo.id}`, { method: 'DELETE' });
              await refresh();
            }}
          />
        </section>

        <section className="activity-grid" id="activity">
          <div className="resource-panel">
            <PanelTitle title="部署活动" kicker="Activity" />
            <JobList jobs={jobs} onSelect={loadLogs} selectedJob={selectedJob} />
          </div>
          <div className="resource-panel">
            <PanelTitle title={selectedJob ? `日志 #${selectedJob.id}` : '执行日志'} kicker="Logs" />
            <LogPanel logs={logs} />
          </div>
        </section>
      </main>
    </div>
  );
}

function RepositoryForm({ runners, editingRepoId, repoForm, saveRepo, setEditingRepoId, setRepoForm, onCancel }) {
  const titleAction = (
    <div className="panel-actions">
      {editingRepoId && (
        <button type="button" className="secondary-action" onClick={() => { setEditingRepoId(null); setRepoForm(emptyRepo); }}>取消编辑</button>
      )}
      {onCancel && <button type="button" className="text-action" onClick={onCancel}>收起</button>}
    </div>
  );

  return (
    <form className="config-panel primary-config" onSubmit={saveRepo}>
      <PanelTitle
        title={editingRepoId ? '编辑仓库' : '接入仓库'}
        kicker="Repository"
        action={(editingRepoId || onCancel) ? titleAction : undefined}
      />
      <div className="form-grid two">
        <Field label="名称">
          <input value={repoForm.name} onChange={(e) => setRepoForm({ ...repoForm, name: e.target.value })} />
        </Field>
        <Field label="平台">
          <select value={repoForm.provider} onChange={(e) => setRepoForm({ ...repoForm, provider: e.target.value })}>
            <option value="github">GitHub</option>
            <option value="gitee">Gitee</option>
            <option value="generic">自动识别</option>
          </select>
        </Field>
      </div>
      <Field label="Git SSH 地址">
        <input value={repoForm.repoUrl} onChange={(e) => setRepoForm({ ...repoForm, repoUrl: e.target.value })} placeholder="git@github.com:org/repo.git" />
      </Field>
      <div className="form-grid two">
        <Field label="触发分支">
          <input value={repoForm.branch} onChange={(e) => setRepoForm({ ...repoForm, branch: e.target.value })} />
        </Field>
        <Field label="执行端">
          <select value={repoForm.runnerId || ''} onChange={(e) => setRepoForm({ ...repoForm, runnerId: e.target.value || null })}>
            <option value="">本机 Runner</option>
            {runners.map((runner) => <option key={runner.id} value={runner.id}>{runner.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="工作目录">
        <input value={repoForm.workDir} onChange={(e) => setRepoForm({ ...repoForm, workDir: e.target.value })} placeholder="/srv/apps/example" />
      </Field>
      <Field label="Webhook Secret">
        <input value={repoForm.webhookSecret} onChange={(e) => setRepoForm({ ...repoForm, webhookSecret: e.target.value })} placeholder={editingRepoId ? '留空表示不修改' : '留空自动生成'} />
      </Field>
      <Field label="Deployment Key">
        <textarea value={repoForm.deployKey} onChange={(e) => setRepoForm({ ...repoForm, deployKey: e.target.value })} placeholder={editingRepoId ? '留空表示不修改' : '-----BEGIN OPENSSH PRIVATE KEY-----'} />
      </Field>
      <Field label="部署脚本">
        <textarea className="script" value={repoForm.deployScript} onChange={(e) => setRepoForm({ ...repoForm, deployScript: e.target.value })} />
      </Field>
      <label className="switch-row">
        <input type="checkbox" checked={repoForm.cleanWorktree} onChange={(e) => setRepoForm({ ...repoForm, cleanWorktree: e.target.checked })} />
        <span>部署前清理 worktree</span>
      </label>
      <button className="primary-action">{editingRepoId ? '保存仓库' : '创建仓库'}</button>
    </form>
  );
}

function RunnerForm({ runnerForm, runners, editingRunnerId, refresh, saveRunner, setRunnerForm, setEditingRunnerId, setError, setNotice, onCancel }) {
  const titleAction = (
    <div className="panel-actions">
      {editingRunnerId && (
        <button type="button" className="secondary-action" onClick={() => { setEditingRunnerId(null); setRunnerForm(emptyRunner); }}>取消编辑</button>
      )}
      {onCancel && <button type="button" className="text-action" onClick={onCancel}>收起</button>}
    </div>
  );

  return (
    <form className="config-panel" id="runners" onSubmit={saveRunner}>
      <PanelTitle
        title={editingRunnerId ? '编辑 Runner' : 'Runner 池'}
        kicker="Runners"
        action={(editingRunnerId || onCancel) ? titleAction : undefined}
      />
      <div className="form-grid two">
        <Field label="名称">
          <input value={runnerForm.name} onChange={(e) => setRunnerForm({ ...runnerForm, name: e.target.value })} />
        </Field>
        <Field label="模式">
          <select value={runnerForm.mode} onChange={(e) => setRunnerForm({ ...runnerForm, mode: e.target.value })}>
            <option value="local">本机</option>
            <option value="ssh">SSH</option>
          </select>
        </Field>
      </div>
      <div className="form-grid two">
        <Field label="Host">
          <input value={runnerForm.host} onChange={(e) => setRunnerForm({ ...runnerForm, host: e.target.value })} disabled={runnerForm.mode !== 'ssh'} />
        </Field>
        <Field label="Port">
          <input value={runnerForm.port} onChange={(e) => setRunnerForm({ ...runnerForm, port: e.target.value })} disabled={runnerForm.mode !== 'ssh'} />
        </Field>
      </div>
      <Field label="用户名">
        <input value={runnerForm.username} onChange={(e) => setRunnerForm({ ...runnerForm, username: e.target.value })} disabled={runnerForm.mode !== 'ssh'} />
      </Field>
      <Field label="远端根目录">
        <input value={runnerForm.workRoot} onChange={(e) => setRunnerForm({ ...runnerForm, workRoot: e.target.value })} placeholder="/srv/apps，可选" disabled={runnerForm.mode !== 'ssh'} />
      </Field>
      <Field label="Runner SSH Key">
        <textarea value={runnerForm.privateKey} onChange={(e) => setRunnerForm({ ...runnerForm, privateKey: e.target.value })} placeholder={editingRunnerId ? '留空表示不修改' : '可留空使用系统 ssh 配置'} disabled={runnerForm.mode !== 'ssh'} />
      </Field>
      <button className="primary-action">{editingRunnerId ? '保存 Runner' : '添加 Runner'}</button>
      <RunnerList
        runners={runners}
        onEdit={(runner) => {
          setEditingRunnerId(runner.id);
          setRunnerForm({ ...emptyRunner, ...runner, privateKey: '' });
        }}
        onTest={async (runner) => {
          setError('');
          try {
            await api(`/api/runners/${runner.id}/test`, { method: 'POST', body: '{}' });
            setNotice(`${runner.name} 连接正常`);
          } catch (err) {
            setError(err.message);
          }
        }}
        onDelete={async (runner) => {
          await api(`/api/runners/${runner.id}`, { method: 'DELETE' });
          await refresh();
        }}
      />
    </form>
  );
}

function Field({ children, label }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PanelTitle({ title, kicker, action }) {
  return (
    <div className="panel-title">
      <div>
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, caption, tone }) {
  return (
    <article className={tone === 'danger' ? 'metric danger' : 'metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}

function RepositoryTable({ repos, onCopy, onEdit, onTrigger, onDelete }) {
  if (!repos.length) {
    return <EmptyState title="还没有仓库" body="接入第一个 Git 仓库，系统将生成 webhook 地址并记录部署状态。" />;
  }
  return (
    <div className="repo-list">
      {repos.map((repo) => (
        <article className="repo-row" key={repo.id}>
          <div className="repo-main">
            <div className="repo-heading">
              <strong>{repo.name}</strong>
              <Status status={repo.lastJobStatus} />
            </div>
            <p>{repo.provider} · {repo.branch} · {repo.runnerName || '本机 Runner'}</p>
            <code>{repo.repoUrl}</code>
            <code>{repo.webhookUrl}</code>
            <code>secret: {repo.webhookSecret}</code>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-action" onClick={() => onCopy(repo.webhookUrl, 'Webhook 地址')}>复制地址</button>
            <button type="button" className="secondary-action" onClick={() => onCopy(repo.webhookSecret, 'Webhook 密钥')}>复制密钥</button>
            <button type="button" className="secondary-action" onClick={() => onTrigger(repo)}>触发</button>
            <button type="button" className="secondary-action" onClick={() => onEdit(repo)}>编辑</button>
            <button type="button" className="danger-action" onClick={() => onDelete(repo)}>删除</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function RunnerList({ runners, onEdit, onTest, onDelete }) {
  if (!runners.length) {
    return <EmptyState compact title="本机 Runner 已就绪" body="添加 SSH Runner 后，可把代码分发到远端执行。" />;
  }
  return (
    <div className="runner-list">
      {runners.map((runner) => (
        <article className="runner-item" key={runner.id}>
          <div>
            <strong>{runner.name}</strong>
            <p>{runner.mode === 'ssh' ? `${runner.username}@${runner.host}:${runner.port}` : '本机执行'}</p>
          </div>
          <div className="row-actions">
            {runner.mode === 'ssh' && <button type="button" className="secondary-action" onClick={() => onTest(runner)}>测试</button>}
            <button type="button" className="secondary-action" onClick={() => onEdit(runner)}>编辑</button>
            <button type="button" className="danger-action" onClick={() => onDelete(runner)}>删除</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function JobList({ jobs, onSelect, selectedJob }) {
  if (!jobs.length) {
    return <EmptyState title="还没有部署记录" body="收到 push webhook 或手动触发后，执行结果会进入审计记录。" />;
  }
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <button
          type="button"
          className={selectedJob?.id === job.id ? 'job active' : 'job'}
          key={job.id}
          onClick={() => onSelect(job)}
        >
          <span>#{job.id} {job.repositoryName}</span>
          <Status status={job.status} />
          <small>{job.branch} · {shortSha(job.commitSha)} · {formatTime(job.createdAt)}</small>
        </button>
      ))}
    </div>
  );
}

function LogPanel({ logs }) {
  if (!logs.length) {
    return <EmptyState title="选择一条记录" body="stdout、stderr 和系统步骤会按时间顺序归档。" />;
  }
  return (
    <pre className="logs">
      {logs.map((line) => `[${line.stream}] ${line.line}`).join('\n')}
    </pre>
  );
}

function EmptyState({ title, body, compact }) {
  return (
    <div className={compact ? 'empty-state compact' : 'empty-state'}>
      <span></span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function Status({ status }) {
  if (!status || status === 'idle') {
    return <span className="status idle">idle</span>;
  }
  return <span className={`status ${status}`}>{status}</span>;
}

function BrandMark() {
  return <img className="brand-mark" src="/brand/candy-mark.png" alt="Candy" />;
}

function BrandLockup() {
  return (
    <div className="brand-lockup">
      <BrandMark />
      <div>
        <strong>Candy Deploy</strong>
        <span>Release Operations</span>
      </div>
    </div>
  );
}

function shortSha(value) {
  return value ? value.slice(0, 8) : 'latest';
}

function formatTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

createRoot(document.getElementById('root')).render(<App />);
