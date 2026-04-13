import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const emptyRunner = {
  name: '',
  mode: 'local',
  host: '',
  port: '22',
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

const LOCALE_STORAGE_KEY = 'candy.locale';

const I18N = {
  en: {
    app: {
      subtitle: 'Candy-Sweet Delivery',
      booting: 'Connecting to Candy Sweet Delivery...',
      product: 'Candy',
      productDescription: 'Continuous Deployment System'
    },
    common: {
      back: 'Back',
      cancel: 'Cancel',
      close: 'Close',
      copy: 'Copy',
      copied: 'Copied',
      create: 'Create',
      delete: 'Delete',
      edit: 'Edit',
      logout: 'Logout',
      loading: 'Loading...',
      saving: 'Saving...',
      trigger: 'Trigger',
      test: 'Test',
      update: 'Update',
      localRunner: 'Local Runner',
      noScript: 'No script configured',
      noData: '-',
      noCommitMessage: 'No commit message',
      notSet: 'Not set',
      latest: 'latest'
    },
    locale: {
      switchLabel: 'Switch language',
      english: 'EN',
      chinese: '中文'
    },
    errors: {
      invalidJson: 'The interface returned invalid JSON: HTTP {status}',
      nonJson: 'The interface returned a non-JSON response: {value}',
      copyFailed: 'Copy failed. Please copy it manually.'
    },
    status: {
      succeeded: 'Succeeded',
      failed: 'Failed',
      running: 'Running',
      queued: 'Queued',
      ignored: 'Ignored',
      idle: 'Idle'
    },
    provider: {
      github: 'GitHub',
      gitee: 'Gitee',
      generic: 'Auto-detect'
    },
    runnerMode: {
      local: 'Local Runner',
      ssh: 'SSH Runner'
    },
    notifications: {
      copiedLabel: '{label} copied',
      repoDeleted: 'Repository deleted',
      runnerDeleted: 'Runner deleted',
      queued: '{name} added to the queue',
      localRunnerNoTest: 'The local Runner does not need a connection test.',
      runnerConnected: '{name} connection is healthy',
      repoSaved: 'Repository configuration updated',
      repoCreated: 'Repository created',
      runnerSaved: 'Runner configuration updated',
      runnerCreated: 'Runner created',
      directoryCopied: 'Directory command copied',
      sshCopied: 'SSH command copied',
      installCopied: 'Installation command copied',
      secretCopied: 'Webhook secret copied',
      webhookCopied: 'Webhook URL copied',
      noRunnerToTest: 'Save the Runner first, then run the connection test.'
    },
    auth: {
      title: 'Sign in to the console',
      username: 'Username',
      password: 'Password',
      submit: 'Sign in',
      submitting: 'Signing in...',
      hintPrefix: 'The default super administrator username is ',
      hintSuffix: '. The password is configured on the server. Failed sign-ins trigger a temporary lock to prevent brute-force attacks.'
    },
    dashboard: {
      tabs: {
        overview: 'Overview',
        repositories: 'Repos',
        runners: 'Runners',
        logs: 'Logs'
      },
      metrics: {
        totalRepos: 'Total repositories',
        totalReposCaption: 'Webhook enabled',
        successRate: 'Success rate',
        successRateCaption: '{successful} / {total} runs',
        successRateEmpty: 'No records yet',
        executors: 'Execution targets',
        executorsCaption: 'including the local Runner'
      },
      recent: {
        kicker: '最近发布',
        title: 'Recent deployments',
        description: 'Newest deployment activity in reverse chronological order.',
        emptyTitle: 'No deployment records yet',
        emptyBody: 'Once a push Webhook arrives or a manual trigger runs, the latest status appears here.'
      },
      repositories: {
        kicker: '仓库',
        title: 'Git repositories',
        description: 'Manage repository URLs, trigger branches, Webhooks, and deployment scripts.',
        add: 'Add repository',
        emptyTitle: 'No repositories yet',
        emptyBody: 'After connecting the first Git repository, the system will generate a Webhook URL and track deployment status.'
      },
      runners: {
        kicker: 'Runner',
        title: 'Runner pool',
        description: 'The local Runner is used by default. Add SSH Runners to distribute code and run scripts.',
        add: 'Add Runner',
        emptyTitle: 'Using the local Runner by default',
        emptyBody: 'Add an SSH Runner if you need remote execution.'
      },
      logs: {
        filterPlaceholder: 'Filter by repository...',
        dateAny: 'Any date',
        dateClear: 'Clear',
        dateToday: 'Today',
        datePrevMonth: 'Previous month',
        dateNextMonth: 'Next month',
        datePickerLabel: 'Select date',
        dateTriggerLabel: 'Deployment date',
        selectedKicker: 'Deployment',
        historyKicker: 'Deployment History',
        historyTitle: 'Deployment history',
        historyDescription: 'Click any item to view logs.',
        emptyTitle: 'No matching records',
        emptyBody: 'Adjust the filters and take another look at recent deployments.',
        noLogs: 'No logs yet.',
        backToHistory: 'Back to history'
      }
    },
    repository: {
      back: 'Back',
      titleCreate: 'Add repository',
      titleEdit: 'Edit repository',
      description: 'Configure the Git repository, Webhook, and deployment script.',
      basicKicker: 'Basic Information',
      basicTitle: 'Basic information',
      basicDescription: 'Repository name, platform, and trigger branch.',
      name: 'Repository name',
      platform: 'Platform',
      branch: 'Default branch',
      providerGithub: 'GitHub',
      providerGitee: 'Gitee',
      providerGeneric: 'Auto-detect',
      configKicker: 'Repository Configuration',
      configTitle: 'Repository configuration',
      configDescription: 'Use the SSH URL to fetch code and store the deployment key.',
      sshUrl: 'Repository SSH URL',
      deploymentKey: 'Deployment key (private key)',
      deploymentKeyHelp: 'Used by the central service to fetch repository code over SSH.',
      deploymentKeyPlaceholderNew: '-----BEGIN OPENSSH PRIVATE KEY-----',
      deploymentKeyPlaceholderEdit: 'Leave blank to keep unchanged',
      workDir: 'Working directory',
      runnerKicker: 'Runner Selection',
      runnerTitle: 'Execution target',
      runnerDescription: 'The backend currently assigns a single Runner, so this control is single-select.',
      localRunnerTitle: 'Local Runner',
      localRunnerDescription: 'Runs on the machine hosting the deployment service by default.',
      noRunnerTitle: 'No additional Runners yet',
      noRunnerBody: 'You can save the repository first, or add a remote Runner on the Runner page.',
      webhookKicker: 'Webhook Configuration',
      webhookTitle: 'Webhook configuration',
      webhookDescription: 'After saving, a Webhook URL for GitHub / Gitee will be generated.',
      webhookSecret: 'Webhook secret',
      webhookSecretHelp: 'Used to verify the Webhook signature.',
      webhookUrl: 'Webhook URL',
      webhookUrlHelpNew: 'A copyable URL will be generated after creation.',
      webhookUrlHelpEdit: 'Copy it into the repository platform to trigger deployment.',
      webhookUrlPending: 'Save the repository to generate a Webhook URL.',
      webhookSecretState: 'Generated / copyable',
      regenerate: 'Regenerate',
      deploymentKicker: 'Deployment Script',
      deploymentTitle: 'Deployment script',
      deploymentDescription: 'The script runs inside the selected Runner’s working directory.',
      bashScript: 'Bash script',
      cleanWorktree: 'Clean worktree before deployment',
      saveCreate: 'Create repository',
      saveUpdate: 'Update repository',
      cancel: 'Cancel'
    },
    runner: {
      back: 'Back',
      titleCreate: 'Add Runner',
      titleEdit: 'Edit Runner',
      description: 'Configure the execution target, SSH access, and working directory.',
      basicKicker: 'Basic Information',
      basicTitle: 'Basic information',
      basicDescription: 'Runner name and execution mode.',
      name: 'Runner name',
      mode: 'Execution mode',
      modeLocal: 'Local',
      modeSsh: 'SSH',
      sshKicker: 'SSH Configuration',
      sshTitle: 'SSH configuration',
      sshDescription: 'When the Runner lives on a remote machine, the central service distributes code and runs scripts over SSH / scp.',
      host: 'Host',
      port: 'Port',
      username: 'Username',
      workRoot: 'Remote root directory',
      privateKey: 'Runner SSH key',
      privateKeyHelp: 'Only SSH Runners need this. Leave blank to use the system’s default SSH config.',
      privateKeyPlaceholderNew: '-----BEGIN OPENSSH PRIVATE KEY-----',
      privateKeyPlaceholderEdit: 'Leave blank to keep unchanged',
      privateKeyConfigured: 'SSH key configured',
      privateKeyEmpty: 'SSH key empty',
      testConnection: 'Test SSH connection',
      specsKicker: 'Runner Specifications',
      specsTitle: 'Runner specifications',
      specsDescription: 'Keep the environment checks and preparation steps from the reference design.',
      specGitTitle: 'Git',
      specGitDescription: 'Used to fetch repository code.',
      specSshTitle: 'SSH',
      specSshDescription: 'Used to connect to the remote Runner machine.',
      specShellTitle: 'Shell',
      specShellDescription: 'Used to execute deployment scripts.',
      specDiskTitle: 'At least 10 GB free',
      specDiskDescription: 'Leave enough space for multiple repositories.',
      setupKicker: 'Setup Instructions',
      setupTitle: 'Initialization commands',
      setupDescription: 'Deployment directory, authorized keys, and baseline tools.',
      step1Title: '1. Create the working directory',
      step2Title: '2. Add the SSH public key',
      step3Title: '3. Install the base tools',
      step1Copied: 'Directory command copied',
      step2Copied: 'SSH command copied',
      step3Copied: 'Installation command copied',
      saveCreate: 'Create Runner',
      saveUpdate: 'Update Runner',
      cancel: 'Cancel'
    },
    notFound: {
      title: 'Page not found',
      description: 'The address you visited does not map to a page.',
      back: 'Back to dashboard'
    },
    labels: {
      runner: 'Runner',
      duration: 'Duration',
      status: 'Status',
      repositoryUrl: 'Repository URL',
      webhookUrl: 'Webhook URL',
      deploymentKey: 'Deployment key',
      deploymentScript: 'Deployment script',
      webhookAddress: 'Webhook address',
      webhookSecret: 'Webhook secret',
      runnerRoot: 'Remote root directory',
      updatedAt: 'Updated at',
      repository: 'Repository'
    },
    cards: {
      lastDeployment: 'Recent deployment',
      waitingFirstTrigger: 'Waiting for the first trigger',
      noDeployment: 'No deployment yet',
      noLogsTitle: 'No logs yet',
      noLogsBody: 'Select a deployment record and stdout / stderr will appear here.'
    },
    page: {
      deployment: 'Deployment'
    }
  },
  zh: {
    app: {
      subtitle: 'Candy-Sweet Delivery',
      booting: '正在连接 Candy Deploy',
      product: 'Candy',
      productDescription: '持续部署系统'
    },
    common: {
      back: '返回',
      cancel: '取消',
      close: '关闭',
      copy: '复制',
      copied: '已复制',
      create: '创建',
      delete: '删除',
      edit: '编辑',
      logout: '退出',
      loading: '加载中...',
      saving: '保存中...',
      trigger: '触发',
      test: '测试',
      update: '更新',
      localRunner: '本机 Runner',
      noScript: '未配置脚本',
      noData: '-',
      noCommitMessage: '无提交信息',
      notSet: '未设置',
      latest: '最新'
    },
    locale: {
      switchLabel: '切换语言',
      english: 'EN',
      chinese: '中文'
    },
    errors: {
      invalidJson: '接口返回了无法解析的 JSON：HTTP {status}',
      nonJson: '接口返回了非 JSON 响应：{value}',
      copyFailed: '复制失败，请手动复制。'
    },
    status: {
      succeeded: '已成功',
      failed: '已失败',
      running: '运行中',
      queued: '已排队',
      ignored: '已忽略',
      idle: '空闲'
    },
    provider: {
      github: 'GitHub',
      gitee: 'Gitee',
      generic: '自动识别'
    },
    runnerMode: {
      local: '本机 Runner',
      ssh: 'SSH Runner'
    },
    notifications: {
      copiedLabel: '{label} 已复制',
      repoDeleted: '仓库已删除',
      runnerDeleted: 'Runner 已删除',
      queued: '{name} 已进入队列',
      localRunnerNoTest: '本机 Runner 无需测试连接。',
      runnerConnected: '{name} 连接正常',
      repoSaved: '仓库配置已更新',
      repoCreated: '仓库已创建',
      runnerSaved: 'Runner 配置已更新',
      runnerCreated: 'Runner 已创建',
      directoryCopied: '目录命令已复制',
      sshCopied: 'SSH 命令已复制',
      installCopied: '安装命令已复制',
      secretCopied: 'Webhook 密钥已复制',
      webhookCopied: 'Webhook 地址已复制',
      noRunnerToTest: '请先保存 Runner，再进行连接测试。'
    },
    auth: {
      title: '登录控制台',
      username: '用户名',
      password: '密码',
      submit: '登录',
      submitting: '登录中...',
      hintPrefix: '默认超级管理员用户名为 ',
      hintSuffix: '，密码由服务端配置。登录失败会触发临时锁定，防止暴力破解。'
    },
    dashboard: {
    tabs: {
      overview: '总览',
      repositories: '仓库',
      runners: 'Runners',
      logs: '日志'
    },
      metrics: {
        totalRepos: '总仓库数',
        totalReposCaption: '已接入 Webhook',
        successRate: '成功率',
        successRateCaption: '{successful} / {total} 次',
        successRateEmpty: '暂无记录',
        executors: 'Runner',
        executorsCaption: '含本机 Runner'
      },
      recent: {
        kicker: '最近发布',
        title: '最近发布',
        description: '按时间倒序展示最新的部署活动。',
        emptyTitle: '还没有部署记录',
        emptyBody: '收到 push Webhook 或手动触发后，这里会记录最新状态。'
      },
      repositories: {
        kicker: '仓库',
        title: 'Git 仓库',
        description: '管理仓库地址、触发分支、Webhook 和部署脚本。',
        add: '添加仓库',
        emptyTitle: '还没有仓库',
        emptyBody: '接入第一个 Git 仓库后，系统会自动生成 Webhook 地址并记录部署状态。'
      },
      runners: {
        kicker: 'Runner',
        title: 'Runner 池',
        description: '默认使用本机 Runner，也可以增加 SSH Runner 负责分发代码和执行脚本。',
        add: '添加 Runner',
        emptyTitle: '默认使用本机 Runner',
        emptyBody: '需要远端执行时，再添加 SSH Runner 即可。'
      },
      logs: {
        filterPlaceholder: '按仓库筛选...',
        dateAny: '任意日期',
        dateClear: '清除',
        dateToday: '今天',
        datePrevMonth: '上个月',
        dateNextMonth: '下个月',
        datePickerLabel: '选择日期',
        dateTriggerLabel: '部署日期',
        selectedKicker: '部署',
        historyKicker: '部署历史',
        historyTitle: '部署历史',
        historyDescription: '点击任意条目查看日志。',
        emptyTitle: '没有匹配的记录',
        emptyBody: '调整筛选条件后，再看看最近的部署。',
        noLogs: '暂无日志。',
        backToHistory: '返回历史'
      }
    },
    repository: {
      back: '返回',
      titleCreate: '添加仓库',
      titleEdit: '编辑仓库',
      description: '配置 Git 仓库、Webhook 和部署脚本。',
      basicKicker: '基础信息',
      basicTitle: '基础信息',
      basicDescription: '仓库名称、平台与触发分支。',
      name: '仓库名称',
      platform: '平台',
      branch: '默认分支',
      providerGithub: 'GitHub',
      providerGitee: 'Gitee',
      providerGeneric: '自动识别',
      configKicker: '仓库配置',
      configTitle: '仓库配置',
      configDescription: '使用 SSH 地址拉取代码，并保存 deployment key。',
      sshUrl: '仓库 SSH 地址',
      deploymentKey: '部署密钥（私钥）',
      deploymentKeyHelp: '用于中心服务通过 SSH 拉取仓库代码。',
      deploymentKeyPlaceholderNew: '-----BEGIN OPENSSH PRIVATE KEY-----',
      deploymentKeyPlaceholderEdit: '留空表示不修改',
      workDir: '工作目录',
      runnerKicker: 'Runner',
      runnerTitle: 'Runner',
      runnerDescription: '当前后端按单 Runner 分配，这里做成单选。',
      localRunnerTitle: '本机 Runner',
      localRunnerDescription: '默认使用部署服务所在机器执行。',
      noRunnerTitle: '当前没有额外 Runner',
      noRunnerBody: '可以先保存仓库，或者去 Runner 页面添加远端 Runner。',
      webhookKicker: 'Webhook 配置',
      webhookTitle: 'Webhook 配置',
      webhookDescription: '保存后会生成用于 GitHub / Gitee 的 Webhook 地址。',
      webhookSecret: 'Webhook 密钥',
      webhookSecretHelp: '用于验证 Webhook 签名。',
      webhookUrl: 'Webhook 地址',
      webhookUrlHelpNew: '创建完成后会生成可复制地址。',
      webhookUrlHelpEdit: '复制到仓库平台即可触发发布。',
      webhookUrlPending: '保存仓库后生成 Webhook 地址。',
      webhookSecretState: '已生成 / 可复制',
      regenerate: '重生成',
      deploymentKicker: '部署脚本',
      deploymentTitle: '部署脚本',
      deploymentDescription: '脚本会在对应 Runner 的工作目录内执行。',
      bashScript: 'Bash 脚本',
      cleanWorktree: '部署前清理 worktree',
      saveCreate: '创建仓库',
      saveUpdate: '更新仓库',
      cancel: '取消'
    },
    runner: {
      back: '返回',
      titleCreate: '添加 Runner',
      titleEdit: '编辑 Runner',
      description: '配置 Runner、SSH 访问和工作目录。',
      basicKicker: '基础信息',
      basicTitle: '基础信息',
      basicDescription: 'Runner 名称与执行模式。',
      name: 'Runner 名称',
      mode: '运行模式',
      modeLocal: '本机',
      modeSsh: 'SSH',
      sshKicker: 'SSH 配置',
      sshTitle: 'SSH 配置',
      sshDescription: '当 Runner 运行在远端机器时，中心服务通过 SSH / scp 分发代码并执行脚本。',
      host: '主机',
      port: '端口',
      username: '用户名',
      workRoot: '远端根目录',
      privateKey: 'Runner SSH 密钥',
      privateKeyHelp: 'SSH Runner 才需要填，留空则使用系统默认 ssh 配置。',
      privateKeyPlaceholderNew: '-----BEGIN OPENSSH PRIVATE KEY-----',
      privateKeyPlaceholderEdit: '留空表示不修改',
      privateKeyConfigured: 'SSH Key 已配置',
      privateKeyEmpty: 'SSH Key 为空',
      testConnection: '测试 SSH 连接',
      specsKicker: 'Runner 规格',
      specsTitle: 'Runner 规格',
      specsDescription: '按参考设计保留环境检查和部署前准备说明。',
      specGitTitle: 'Git',
      specGitDescription: '用于拉取仓库代码。',
      specSshTitle: 'SSH',
      specSshDescription: '用于连接远端 Runner 机器。',
      specShellTitle: 'Shell',
      specShellDescription: '用于执行部署脚本。',
      specDiskTitle: '至少 10GB 可用空间',
      specDiskDescription: '建议为多个仓库预留足够空间。',
      setupKicker: '初始化命令',
      setupTitle: '初始化命令',
      setupDescription: '部署目录、授权密钥和基础工具。',
      step1Title: '1. 创建工作目录',
      step2Title: '2. 添加 SSH 公钥',
      step3Title: '3. 安装基础工具',
      step1Copied: '目录命令已复制',
      step2Copied: 'SSH 命令已复制',
      step3Copied: '安装命令已复制',
      saveCreate: '创建 Runner',
      saveUpdate: '更新 Runner',
      cancel: '取消'
    },
    notFound: {
      title: '页面不存在',
      description: '你访问的地址没有对应的页面。',
      back: '回到控制台'
    },
    labels: {
      runner: 'Runner',
      duration: '时长',
      status: '状态',
      repositoryUrl: '仓库地址',
      webhookUrl: 'Webhook 地址',
      deploymentKey: '部署密钥',
      deploymentScript: '部署脚本',
      webhookAddress: 'Webhook 地址',
      webhookSecret: 'Webhook 密钥',
      runnerRoot: '远端根目录',
      updatedAt: '更新时间',
      repository: '仓库'
    },
    cards: {
      lastDeployment: '最近发布',
      waitingFirstTrigger: '等待第一次触发',
      noDeployment: '暂无记录',
      noLogsTitle: '暂无日志',
      noLogsBody: '选择一条部署记录后，这里会显示 stdout 和 stderr。'
    },
    page: {
      deployment: '部署'
    }
  }
};

const I18NContext = createContext(null);

function readInitialLocale() {
  if (typeof window === 'undefined') {
    return 'en';
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

function getRuntimeLocale() {
  if (typeof window === 'undefined') {
    return 'en';
  }

  return window.__candyLocale === 'zh' ? 'zh' : 'en';
}

function resolvePath(object, path) {
  return path.split('.').reduce((value, key) => (value && value[key] != null ? value[key] : undefined), object);
}

function formatTemplate(template, values = {}) {
  if (typeof template === 'function') {
    return template(values);
  }

  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

function translate(locale, path, values) {
  const source = I18N[locale] || I18N.en;
  const fallback = resolvePath(I18N.en, path);
  const template = resolvePath(source, path) ?? fallback ?? path;
  return formatTemplate(template, values);
}

function useI18n() {
  const context = useContext(I18NContext);

  if (!context) {
    throw new Error('I18N context missing');
  }

  return context;
}

async function api(path, options = {}) {
  const locale = getRuntimeLocale();
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
        throw new Error(translate(locale, 'errors.invalidJson', { status: response.status }));
      }
    }
  }

  if (!response.ok) {
    const message = data?.error || text.trim() || response.statusText || `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (text && !parsedJSON) {
    throw new Error(translate(locale, 'errors.nonJson', { value: text.trim().slice(0, 120) }));
  }

  return data;
}

function useRouteState() {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname || '/',
    search: window.location.search || ''
  }));

  useEffect(() => {
    const onPopState = () => {
      setLocation({
        pathname: window.location.pathname || '/',
        search: window.location.search || ''
      });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (replace) {
      window.history.replaceState({}, '', to);
    } else {
      window.history.pushState({}, '', to);
    }
    setLocation({
      pathname: window.location.pathname || '/',
      search: window.location.search || ''
    });
  }, []);

  return [location, navigate];
}

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') {
    return '/dashboard';
  }
  return pathname.replace(/\/+$/, '') || '/';
}

const ANSI_ESCAPE_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const ANSI_COLOR_FRAGMENT = /\[(?:\d{1,3}(?:;\d{1,3})*)m/g;

function sanitizeLogLine(line) {
  return String(line || '')
    .replace(ANSI_ESCAPE_SEQUENCE, '')
    .replace(ANSI_COLOR_FRAGMENT, '')
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
}

function randomSecret(length = 24) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  }
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function statusMeta(locale, status) {
  switch (status) {
    case 'succeeded':
      return { label: translate(locale, 'status.succeeded'), tone: 'success' };
    case 'failed':
      return { label: translate(locale, 'status.failed'), tone: 'danger' };
    case 'running':
      return { label: translate(locale, 'status.running'), tone: 'running' };
    case 'queued':
      return { label: translate(locale, 'status.queued'), tone: 'queued' };
    case 'ignored':
      return { label: translate(locale, 'status.ignored'), tone: 'muted' };
    case 'idle':
    default:
      return { label: translate(locale, 'status.idle'), tone: 'muted' };
  }
}

function providerLabel(locale, provider) {
  switch (provider) {
    case 'gitee':
      return translate(locale, 'provider.gitee');
    case 'generic':
      return translate(locale, 'provider.generic');
    default:
      return translate(locale, 'provider.github');
  }
}

function runnerModeLabel(locale, mode) {
  return mode === 'ssh' ? translate(locale, 'runnerMode.ssh') : translate(locale, 'runnerMode.local');
}

function shortSha(value, locale = getRuntimeLocale()) {
  return value ? value.slice(0, 8) : translate(locale, 'common.latest');
}

function formatTime(value, locale = getRuntimeLocale()) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function getLocaleTag(locale = getRuntimeLocale()) {
  return locale === 'zh' ? 'zh-CN' : 'en-US';
}

function parseDateKey(value) {
  if (!value) {
    return null;
  }

  const parts = String(value).split('-').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateKey(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return toDateKey(value);
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return toDateKey(date);
}

function formatDateLabel(value, locale = getRuntimeLocale()) {
  const date = value instanceof Date ? value : parseDateKey(value) || new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(getLocaleTag(locale), locale === 'zh'
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatMonthLabel(date, locale = getRuntimeLocale()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    year: 'numeric',
    month: 'long'
  }).format(date);
}

function weekStartIndex(locale = getRuntimeLocale()) {
  return locale === 'zh' ? 1 : 0;
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function isSameMonth(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth();
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarWeeks(viewDate, startOnMonday = false) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const offset = (firstWeekday - (startOnMonday ? 1 : 0) + 7) % 7;
  const gridStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - offset);
  return Array.from({ length: 42 }, (_, index) => new Date(
    gridStart.getFullYear(),
    gridStart.getMonth(),
    gridStart.getDate() + index
  ));
}

function formatDuration(startedAt, finishedAt, locale = getRuntimeLocale()) {
  if (!startedAt || !finishedAt) {
    return '-';
  }
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '-';
  }
  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return locale === 'zh'
      ? `${minutes}分${seconds.toString().padStart(2, '0')}秒`
      : `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return locale === 'zh' ? `${seconds}秒` : `${seconds}s`;
}

function firstLine(value) {
  if (!value) {
    return '';
  }
  return value.split('\n').map((item) => item.trim()).find(Boolean) || '';
}

function createRepoForm(repo) {
  if (!repo) {
    return { ...emptyRepo, webhookSecret: randomSecret() };
  }

  return {
    name: repo.name || '',
    provider: repo.provider || 'github',
    repoUrl: repo.repoUrl || '',
    webhookSecret: repo.webhookSecret || randomSecret(),
    branch: repo.branch || 'main',
    workDir: repo.workDir || '',
    deployKey: '',
    deployScript: repo.deployScript || emptyRepo.deployScript,
    runnerId: repo.runnerId ? String(repo.runnerId) : null,
    cleanWorktree: repo.cleanWorktree ?? true
  };
}

function createRunnerForm(runner) {
  if (!runner) {
    return { ...emptyRunner };
  }

  return {
    name: runner.name || '',
    mode: runner.mode || 'local',
    host: runner.host || '',
    port: runner.port ? String(runner.port) : '22',
    username: runner.username || '',
    workRoot: runner.workRoot || '',
    privateKey: ''
  };
}

function App() {
  const [location, navigate] = useRouteState();
  const pathname = normalizePathname(location.pathname);
  const [locale, setLocale] = useState(readInitialLocale);

  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [runners, setRunners] = useState([]);
  const [repos, setRepos] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const clearMessages = useCallback(() => {
    setNotice('');
    setError('');
  }, []);

  const showNotice = useCallback((message) => {
    setNotice(message);
    setError('');
  }, []);

  const showError = useCallback((message) => {
    setError(message);
    setNotice('');
  }, []);

  const t = useCallback((key, values) => translate(locale, key, values), [locale]);
  const i18nValue = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__candyLocale = locale;
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // Ignore storage failures and keep the in-memory locale.
      }
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    }
  }, [locale]);

  const refreshData = useCallback(async () => {
    const [runnerData, repoData, jobData] = await Promise.all([
      api('/api/runners'),
      api('/api/repositories'),
      api('/api/jobs')
    ]);
    setRunners(runnerData || []);
    setRepos(repoData || []);
    setJobs(jobData || []);
  }, []);

  const loadJobLogs = useCallback(async (job) => {
    setSelectedJob(job);
    setLogs([]);
    const data = await api(`/api/jobs/${job.id}/logs`);
    setLogs(data || []);
  }, []);

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((data) => {
        if (active) {
          setUser(data);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setBooting(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (booting) {
      return;
    }

    if (!user) {
      if (pathname !== '/login') {
        navigate('/login', { replace: true });
      }
      return;
    }

    if (pathname === '/login' || pathname === '/') {
      navigate('/dashboard', { replace: true });
    }
  }, [booting, user, pathname, navigate]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let active = true;
    refreshData().catch((err) => {
      if (active) {
        showError(err.message);
      }
    });

    const timer = window.setInterval(() => {
      refreshData().catch(() => {});
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user, refreshData, showError]);

  async function handleLoginSuccess(data) {
    clearMessages();
    setUser(data);
    navigate('/dashboard', { replace: true });
  }

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // 忽略登出失败，前端直接回到登录页即可。
    }
    clearMessages();
    setSelectedJob(null);
    setLogs([]);
    setRunners([]);
    setRepos([]);
    setJobs([]);
    setUser(null);
    navigate('/login', { replace: true });
  }

  async function handleRepositorySaved(message) {
    showNotice(message);
    await refreshData();
    navigate('/dashboard?tab=repositories', { replace: true });
  }

  async function handleRunnerSaved(message) {
    showNotice(message);
    await refreshData();
    navigate('/dashboard?tab=runners', { replace: true });
  }

  if (booting) {
    return (
      <I18NContext.Provider value={i18nValue}>
        <main className="boot-screen">
          <Card className="boot-card">
            <BrandMark size="lg" />
            <strong>{t('app.booting')}</strong>
          </Card>
        </main>
      </I18NContext.Provider>
    );
  }

  if (!user) {
    return (
      <I18NContext.Provider value={i18nValue}>
        <LoginPage
          onLogin={handleLoginSuccess}
          error={error}
          setError={showError}
        />
      </I18NContext.Provider>
    );
  }

  if (pathname === '/dashboard') {
    return (
      <I18NContext.Provider value={i18nValue}>
        <DashboardPage
          user={user}
          runners={runners}
          repos={repos}
          jobs={jobs}
          selectedJob={selectedJob}
          logs={logs}
          notice={notice}
          error={error}
          clearMessages={clearMessages}
          setNotice={showNotice}
          setError={showError}
          navigate={navigate}
          search={location.search}
          refreshData={refreshData}
          loadJobLogs={loadJobLogs}
          onLogout={handleLogout}
        />
      </I18NContext.Provider>
    );
  }

  if (pathname === '/add-repository') {
    return (
      <I18NContext.Provider value={i18nValue}>
        <RepositoryPage
          repos={repos}
          runners={runners}
          notice={notice}
          error={error}
          clearMessages={clearMessages}
          setNotice={showNotice}
          setError={showError}
          navigate={navigate}
          search={location.search}
          onSaved={handleRepositorySaved}
        />
      </I18NContext.Provider>
    );
  }

  if (pathname === '/add-runner') {
    return (
      <I18NContext.Provider value={i18nValue}>
        <RunnerPage
          runners={runners}
          notice={notice}
          error={error}
          clearMessages={clearMessages}
          setNotice={showNotice}
          setError={showError}
          navigate={navigate}
          search={location.search}
          onSaved={handleRunnerSaved}
        />
      </I18NContext.Provider>
    );
  }

  return (
    <I18NContext.Provider value={i18nValue}>
      <NotFoundPage navigate={navigate} />
    </I18NContext.Provider>
  );
}

function LoginPage({ onLogin, error, setError }) {
  const { t } = useI18n();
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
      await onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-backdrop" aria-hidden="true">
        <span className="auth-orb auth-orb-primary" />
        <span className="auth-orb auth-orb-secondary" />
      </div>

      <section className="auth-inner">
        <div className="auth-toolbar">
          <LocaleSwitch />
        </div>
        <div className="auth-brand">
          <BrandMark size="xl" />
          <h1>{t('app.product')}</h1>
          <p>{t('app.productDescription')}</p>
        </div>

        <Card className="auth-card">
          <SectionTitle
            title={t('auth.title')}
          />

          <form className="auth-form" onSubmit={submit}>
            <Field label={t('auth.username')}>
              <input
                autoComplete="username"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                className="input"
              />
            </Field>

            <Field label={t('auth.password')}>
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="input"
                autoFocus
              />
            </Field>

            {error && <div className="form-error">{error}</div>}

            <Button type="submit" variant="primary" className="btn-wide" disabled={loading}>
              {loading ? t('auth.submitting') : t('auth.submit')}
            </Button>

            <p className="auth-hint">
              {t('auth.hintPrefix')}
              <strong>super_admin</strong>
              {t('auth.hintSuffix')}
            </p>
          </form>
        </Card>
      </section>
    </main>
  );
}

function DashboardPage({
  user,
  runners,
  repos,
  jobs,
  selectedJob,
  logs,
  notice,
  error,
  clearMessages,
  setNotice,
  setError,
  navigate,
  search,
  loadJobLogs,
  onLogout
}) {
  const { t, locale } = useI18n();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const requestedTab = params.get('tab') || 'overview';
  const [tab, setTab] = useState(requestedTab);
  const [jobFilter, setJobFilter] = useState('');
  const [jobDate, setJobDate] = useState('');

  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  const completedJobs = jobs.filter((job) => job.status === 'succeeded' || job.status === 'failed');
  const successfulJobs = jobs.filter((job) => job.status === 'succeeded').length;
  const successRate = completedJobs.length ? Math.round((successfulJobs / completedJobs.length) * 100) : 0;
  const activeRunners = Math.max(1, runners.length + 1);
  const recentJobs = jobs.slice(0, 5);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const haystack = `${job.repositoryName} ${job.runnerName || ''} ${job.commitMessage || ''}`.toLowerCase();
      const textMatch = !jobFilter || haystack.includes(jobFilter.trim().toLowerCase());
      const dateMatch = !jobDate || formatDateKey(job.createdAt) === jobDate;
      return textMatch && dateMatch;
    });
  }, [jobs, jobDate, jobFilter]);

  function changeTab(nextTab) {
    setTab(nextTab);
    navigate(`/dashboard?tab=${nextTab}`, { replace: true });
  }

  async function openJob(job) {
    try {
      await loadJobLogs(job);
      changeTab('logs');
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyValue(value, label) {
    try {
      await navigator.clipboard?.writeText(value || '');
      setNotice(t('notifications.copiedLabel', { label }));
    } catch {
      setError(t('errors.copyFailed'));
    }
  }

  async function deleteRepository(id) {
    try {
      await api(`/api/repositories/${id}`, { method: 'DELETE' });
      setNotice(t('notifications.repoDeleted'));
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRunner(id) {
    try {
      await api(`/api/runners/${id}`, { method: 'DELETE' });
      setNotice(t('notifications.runnerDeleted'));
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function triggerRepository(repo) {
    try {
      await api(`/api/repositories/${repo.id}/trigger`, { method: 'POST', body: '{}' });
      setNotice(t('notifications.queued', { name: repo.name }));
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function testRunner(runner) {
    if (runner.mode !== 'ssh') {
      setNotice(t('notifications.localRunnerNoTest'));
      return;
    }

    try {
      await api(`/api/runners/${runner.id}/test`, { method: 'POST', body: '{}' });
      setNotice(t('notifications.runnerConnected', { name: runner.name }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="content-width topbar-inner">
          <BrandLockup />
          <div className="topbar-actions">
            <LocaleSwitch />
            <Button
              variant="ghost"
              className="dashboard-logout-desktop"
              onClick={onLogout}
            >
              {t('common.logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="content-width page-main">
        {(notice || error) && (
          <FeedbackBar
            error={error}
            notice={notice}
            onClose={clearMessages}
          />
        )}

        <div className="tabs">
          {[
            { value: 'overview', label: t('dashboard.tabs.overview') },
            { value: 'repositories', label: t('dashboard.tabs.repositories') },
            { value: 'runners', label: t('dashboard.tabs.runners') },
            { value: 'logs', label: t('dashboard.tabs.logs') }
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={tab === item.value ? 'tab-button active' : 'tab-button'}
              onClick={() => changeTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <section className="section-stack">
            <div className="metrics-grid">
              <MetricCard
                label={t('dashboard.metrics.totalRepos')}
                value={repos.length}
                caption={t('dashboard.metrics.totalReposCaption')}
                tone="primary"
              />
              <MetricCard
                label={t('dashboard.metrics.successRate')}
                value={jobs.length ? `${successRate}%` : '—'}
                caption={
                  completedJobs.length
                    ? t('dashboard.metrics.successRateCaption', {
                      successful: successfulJobs,
                      total: completedJobs.length
                    })
                    : t('dashboard.metrics.successRateEmpty')
                }
                tone="success"
              />
              <MetricCard
                label={t('dashboard.metrics.executors')}
                value={activeRunners}
                caption={t('dashboard.metrics.executorsCaption')}
                tone="secondary"
              />
            </div>

            <Card className="panel-card">
              <SectionTitle
                kicker={t('dashboard.recent.kicker')}
                title={t('dashboard.recent.title')}
                description={t('dashboard.recent.description')}
              />

              {recentJobs.length ? (
                <div className="job-list">
                  {recentJobs.map((job) => (
                    <DeploymentRow
                      key={job.id}
                      job={job}
                      onClick={() => openJob(job)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t('dashboard.recent.emptyTitle')}
                  body={t('dashboard.recent.emptyBody')}
                />
              )}
            </Card>
          </section>
        )}

        {tab === 'repositories' && (
          <section className="section-stack">
            <SectionTitle
              kicker={t('dashboard.repositories.kicker')}
              title={t('dashboard.repositories.title')}
              description={t('dashboard.repositories.description')}
              action={(
                <Button type="button" onClick={() => navigate('/add-repository')}>
                  {t('dashboard.repositories.add')}
                </Button>
              )}
            />

            {repos.length ? (
              <div className="repo-list">
                {repos.map((repo) => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    onCopy={copyValue}
                    onEdit={() => navigate(`/add-repository?edit=true&id=${repo.id}`)}
                    onTrigger={() => triggerRepository(repo)}
                    onDelete={() => deleteRepository(repo.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('dashboard.repositories.emptyTitle')}
                body={t('dashboard.repositories.emptyBody')}
                action={(
                  <Button type="button" onClick={() => navigate('/add-repository')}>
                    {t('dashboard.repositories.add')}
                  </Button>
                )}
              />
            )}
          </section>
        )}

        {tab === 'runners' && (
          <section className="section-stack">
            <SectionTitle
              kicker={t('dashboard.runners.kicker')}
              title={t('dashboard.runners.title')}
              description={t('dashboard.runners.description')}
              action={(
                <Button type="button" onClick={() => navigate('/add-runner')}>
                  {t('dashboard.runners.add')}
                </Button>
              )}
            />

            {runners.length ? (
              <div className="runner-list">
                {runners.map((runner) => (
                  <RunnerCard
                    key={runner.id}
                    runner={runner}
                    onEdit={() => navigate(`/add-runner?edit=true&id=${runner.id}`)}
                    onTest={() => testRunner(runner)}
                    onDelete={() => deleteRunner(runner.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('dashboard.runners.emptyTitle')}
                body={t('dashboard.runners.emptyBody')}
                action={(
                  <Button type="button" onClick={() => navigate('/add-runner')}>
                    {t('dashboard.runners.add')}
                  </Button>
                )}
              />
            )}
          </section>
        )}

        {tab === 'logs' && (
          <section className="section-stack">
            <div className="job-tools">
              <input
                className="input"
                placeholder={t('dashboard.logs.filterPlaceholder')}
                value={jobFilter}
                onChange={(event) => setJobFilter(event.target.value)}
              />
              <DateFilterPicker value={jobDate} onChange={setJobDate} />
            </div>

            {selectedJob ? (
              <Card className="panel-card">
                <div className="log-head">
                  <div>
                    <h2>#{selectedJob.id} {selectedJob.repositoryName}</h2>
                    <p className="panel-description">
                      {selectedJob.branch} · {shortSha(selectedJob.commitSha, locale)} · {selectedJob.commitMessage || t('common.noCommitMessage')}
                    </p>
                  </div>
                  <Status status={selectedJob.status} />
                </div>

                <div className="detail-grid">
                  <DetailCard label={t('labels.runner')} value={selectedJob.runnerName || t('common.localRunner')} />
                  <DetailCard label={t('labels.duration')} value={formatDuration(selectedJob.startedAt, selectedJob.finishedAt, locale)} />
                  <DetailCard label={t('labels.status')} value={statusMeta(locale, selectedJob.status).label} />
                </div>

                <div className="log-shell">
                  {logs.length ? (
                    logs.map((line) => (
                      <div
                        key={line.id}
                        className={line.stream === 'stderr' ? 'log-line stderr' : 'log-line stdout'}
                      >
                        <span className="log-tag">[{line.stream}]</span>
                        <span>{sanitizeLogLine(line.line)}</span>
                      </div>
                  ))
                ) : (
                    <div className="log-empty">{t('dashboard.logs.noLogs')}</div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="btn-wide"
                  onClick={() => {
                    setSelectedJob(null);
                    setLogs([]);
                  }}
                >
                  {t('dashboard.logs.backToHistory')}
                </Button>
              </Card>
            ) : (
              <Card className="panel-card">
                <SectionTitle
                  kicker={t('dashboard.logs.historyKicker')}
                  title={t('dashboard.logs.historyTitle')}
                  description={t('dashboard.logs.historyDescription')}
                />

                {filteredJobs.length ? (
                  <div className="job-list">
                    {filteredJobs.map((job) => (
                      <DeploymentRow
                        key={job.id}
                        job={job}
                        onClick={() => openJob(job)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={t('dashboard.logs.emptyTitle')}
                    body={t('dashboard.logs.emptyBody')}
                  />
                )}
              </Card>
            )}
          </section>
        )}
      </main>

      <footer className="dashboard-footer">
        <div className="content-width dashboard-footer-inner">
          <Button
            type="button"
            variant="outline"
            className="dashboard-logout-mobile btn-wide"
            onClick={onLogout}
          >
            {t('common.logout')}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function RepositoryPage({
  repos,
  runners,
  notice,
  error,
  clearMessages,
  setNotice,
  setError,
  navigate,
  search,
  onSaved
}) {
  const { t, locale } = useI18n();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const editId = params.get('id');
  const isEditMode = params.get('edit') === 'true';
  const editingRepo = useMemo(
    () => repos.find((repo) => String(repo.id) === String(editId)),
    [editId, repos]
  );

  const [form, setForm] = useState(() => createRepoForm(editingRepo));
  const [copied, setCopied] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(createRepoForm(editingRepo));
  }, [editingRepo, editId]);

  function regenerateSecret() {
    setForm({ ...form, webhookSecret: randomSecret() });
  }

  async function copyValue(value, key) {
    try {
      await navigator.clipboard?.writeText(value || '');
      setCopied(key);
      setNotice(
        t('notifications.copiedLabel', {
          label: key === 'webhook' ? t('repository.webhookUrl') : t('repository.webhookSecret')
        })
      );
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      setError(t('errors.copyFailed'));
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    clearMessages();

    try {
      const payload = {
        name: form.name,
        provider: form.provider,
        repoUrl: form.repoUrl,
        webhookSecret: form.webhookSecret,
        branch: form.branch,
        workDir: form.workDir,
        deployKey: form.deployKey,
        deployScript: form.deployScript,
        runnerId: form.runnerId ? Number(form.runnerId) : null,
        cleanWorktree: form.cleanWorktree
      };

      if (editingRepo) {
        await api(`/api/repositories/${editingRepo.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/repositories', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      await onSaved(isEditMode ? t('notifications.repoSaved') : t('notifications.repoCreated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const webhookUrl = editingRepo?.webhookUrl || '';

  return (
    <div className="page-shell">
      <header className="subpage-header">
        <div className="content-width subpage-header-inner">
          <div className="subpage-header-actions">
            <LocaleSwitch />
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard?tab=repositories', { replace: true })}>
              {t('repository.back')}
            </Button>
          </div>
          <div className="subpage-title">
            <h1>{isEditMode ? t('repository.titleEdit') : t('repository.titleCreate')}</h1>
            <p>{t('repository.description')}</p>
          </div>
        </div>
      </header>

      <main className="content-width content-width-narrow page-main">
        {(notice || error) && (
          <FeedbackBar
            error={error}
            notice={notice}
            onClose={clearMessages}
          />
        )}

        <form className="form-stack" onSubmit={submit}>
          <Card className="panel-card">
            <SectionTitle
              kicker={t('repository.basicKicker')}
              title={t('repository.basicTitle')}
              description={t('repository.basicDescription')}
            />
            <div className="form-grid two">
              <Field label={t('repository.name')}>
                <input
                  className="input"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="frontend-app"
                  required
                />
              </Field>

              <Field label={t('repository.platform')}>
                <select
                  className="input"
                  value={form.provider}
                  onChange={(event) => setForm({ ...form, provider: event.target.value })}
                >
                  <option value="github">{t('repository.providerGithub')}</option>
                  <option value="gitee">{t('repository.providerGitee')}</option>
                  <option value="generic">{t('repository.providerGeneric')}</option>
                </select>
              </Field>
            </div>

            <Field label={t('repository.branch')}>
              <input
                className="input"
                value={form.branch}
                onChange={(event) => setForm({ ...form, branch: event.target.value })}
                placeholder="main"
              />
            </Field>
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('repository.configKicker')}
              title={t('repository.configTitle')}
              description={t('repository.configDescription')}
            />

            <Field label={t('repository.sshUrl')}>
              <input
                className="input"
                value={form.repoUrl}
                onChange={(event) => setForm({ ...form, repoUrl: event.target.value })}
                placeholder="git@github.com:org/repo.git"
                required
              />
            </Field>

            <Field label={t('repository.deploymentKey')} help={t('repository.deploymentKeyHelp')}>
              <textarea
                className="textarea mono"
                value={form.deployKey}
                onChange={(event) => setForm({ ...form, deployKey: event.target.value })}
                placeholder={isEditMode ? t('repository.deploymentKeyPlaceholderEdit') : t('repository.deploymentKeyPlaceholderNew')}
                rows={6}
              />
            </Field>

            <Field label={t('repository.workDir')}>
              <input
                className="input"
                value={form.workDir}
                onChange={(event) => setForm({ ...form, workDir: event.target.value })}
                placeholder="/srv/apps/example"
                required
              />
            </Field>
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('repository.runnerKicker')}
              title={t('repository.runnerTitle')}
              description={t('repository.runnerDescription')}
            />

            <div className="radio-list">
              <label className={!form.runnerId ? 'radio-card active' : 'radio-card'}>
                <input
                  type="radio"
                  name="runnerId"
                checked={!form.runnerId}
                  onChange={() => setForm({ ...form, runnerId: null })}
                />
                <div>
                  <strong>{t('repository.localRunnerTitle')}</strong>
                  <p>{t('repository.localRunnerDescription')}</p>
                </div>
              </label>

              {runners.map((runner) => (
                <label
                  key={runner.id}
                  className={String(form.runnerId) === String(runner.id) ? 'radio-card active' : 'radio-card'}
                >
                  <input
                    type="radio"
                    name="runnerId"
                  checked={String(form.runnerId) === String(runner.id)}
                  onChange={() => setForm({ ...form, runnerId: String(runner.id) })}
                />
                <div>
                  <strong>{runner.name}</strong>
                  <p>
                      {runnerModeLabel(locale, runner.mode)} ·{' '}
                      {runner.mode === 'ssh'
                        ? `${runner.username}@${runner.host}:${runner.port}`
                        : t('common.localRunner')}
                  </p>
                </div>
              </label>
            ))}
            </div>

            {!runners.length && (
              <EmptyState
                compact
                title={t('repository.noRunnerTitle')}
                body={t('repository.noRunnerBody')}
              />
            )}
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('repository.webhookKicker')}
              title={t('repository.webhookTitle')}
              description={t('repository.webhookDescription')}
            />

            <div className="stack-gap">
              <Field label={t('repository.webhookSecret')} help={t('repository.webhookSecretHelp')}>
                <div className="copy-row">
                  <input
                    className="input mono"
                    value={form.webhookSecret}
                    readOnly
                  />
                  <Button type="button" variant="secondary" onClick={regenerateSecret}>
                    {t('repository.regenerate')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => copyValue(form.webhookSecret, 'secret')}>
                    {copied === 'secret' ? t('common.copied') : t('common.copy')}
                  </Button>
                </div>
              </Field>

              <Field
                label={t('repository.webhookUrl')}
                help={editingRepo ? t('repository.webhookUrlHelpEdit') : t('repository.webhookUrlHelpNew')}
              >
                <div className="copy-row">
                <div className="copy-box mono">
                    {webhookUrl || t('repository.webhookUrlPending')}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!webhookUrl}
                    onClick={() => copyValue(webhookUrl, 'webhook')}
                  >
                    {copied === 'webhook' ? t('common.copied') : t('common.copy')}
                  </Button>
                </div>
              </Field>
            </div>
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('repository.deploymentKicker')}
              title={t('repository.deploymentTitle')}
              description={t('repository.deploymentDescription')}
            />

            <Field label={t('repository.bashScript')}>
              <textarea
                className="textarea script mono"
                value={form.deployScript}
                onChange={(event) => setForm({ ...form, deployScript: event.target.value })}
                rows={12}
                required
              />
            </Field>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.cleanWorktree}
                onChange={(event) => setForm({ ...form, cleanWorktree: event.target.checked })}
              />
              <span>{t('repository.cleanWorktree')}</span>
            </label>
          </Card>

          <div className="form-actions">
            <Button type="submit" disabled={submitting}>
              {submitting ? t('common.saving') : (isEditMode ? t('repository.saveUpdate') : t('repository.saveCreate'))}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/dashboard?tab=repositories', { replace: true })}
            >
              {t('repository.cancel')}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function RunnerPage({
  runners,
  notice,
  error,
  clearMessages,
  setNotice,
  setError,
  navigate,
  search,
  onSaved
}) {
  const { t, locale } = useI18n();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const editId = params.get('id');
  const isEditMode = params.get('edit') === 'true';
  const editingRunner = useMemo(
    () => runners.find((runner) => String(runner.id) === String(editId)),
    [editId, runners]
  );

  const [form, setForm] = useState(() => createRunnerForm(editingRunner));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(createRunnerForm(editingRunner));
  }, [editingRunner, editId]);

  async function testConnection() {
    if (!editingRunner) {
      setNotice(t('notifications.noRunnerToTest'));
      return;
    }

    if (form.mode !== 'ssh') {
      setNotice(t('notifications.localRunnerNoTest'));
      return;
    }

    try {
      await api(`/api/runners/${editingRunner.id}/test`, { method: 'POST', body: '{}' });
      setNotice(t('notifications.runnerConnected', { name: editingRunner.name }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    clearMessages();

    try {
      const payload = {
        name: form.name,
        mode: form.mode,
        host: form.host,
        port: Number(form.port || 22),
        username: form.username,
        workRoot: form.workRoot,
        privateKey: form.privateKey
      };

      if (editingRunner) {
        await api(`/api/runners/${editingRunner.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/runners', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      await onSaved(isEditMode ? t('notifications.runnerSaved') : t('notifications.runnerCreated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const workRoot = form.workRoot || '/opt/deployments';

  return (
    <div className="page-shell">
      <header className="subpage-header">
        <div className="content-width subpage-header-inner">
          <div className="subpage-header-actions">
            <LocaleSwitch />
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard?tab=runners', { replace: true })}>
              {t('runner.back')}
            </Button>
          </div>
          <div className="subpage-title">
            <h1>{isEditMode ? t('runner.titleEdit') : t('runner.titleCreate')}</h1>
            <p>{t('runner.description')}</p>
          </div>
        </div>
      </header>

      <main className="content-width content-width-narrow page-main">
        {(notice || error) && (
          <FeedbackBar
            error={error}
            notice={notice}
            onClose={clearMessages}
          />
        )}

        <form className="form-stack" onSubmit={submit}>
          <Card className="panel-card">
            <SectionTitle
              kicker={t('runner.basicKicker')}
              title={t('runner.basicTitle')}
              description={t('runner.basicDescription')}
            />

            <div className="form-grid two">
              <Field label={t('runner.name')}>
                <input
                  className="input"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="runner-prod-1"
                  required
                />
              </Field>

              <Field label={t('runner.mode')}>
                <select
                  className="input"
                  value={form.mode}
                  onChange={(event) => setForm({ ...form, mode: event.target.value })}
                >
                  <option value="local">{t('runner.modeLocal')}</option>
                  <option value="ssh">{t('runner.modeSsh')}</option>
                </select>
              </Field>
            </div>
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('runner.sshKicker')}
              title={t('runner.sshTitle')}
              description={t('runner.sshDescription')}
            />

            <div className="form-grid two">
              <Field label={t('runner.host')}>
                <input
                  className="input"
                  value={form.host}
                  onChange={(event) => setForm({ ...form, host: event.target.value })}
                  placeholder="runner.example.com"
                  disabled={form.mode !== 'ssh'}
                />
              </Field>

              <Field label={t('runner.port')}>
                <input
                  className="input"
                  value={form.port}
                  onChange={(event) => setForm({ ...form, port: event.target.value })}
                  placeholder="22"
                  disabled={form.mode !== 'ssh'}
                />
              </Field>
            </div>

            <Field label={t('runner.username')}>
              <input
                className="input"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="root"
                disabled={form.mode !== 'ssh'}
              />
            </Field>

            <Field label={t('runner.workRoot')}>
              <input
                className="input"
                value={form.workRoot}
                onChange={(event) => setForm({ ...form, workRoot: event.target.value })}
                placeholder="/opt/deployments"
                disabled={form.mode !== 'ssh'}
              />
            </Field>

            <Field label={t('runner.privateKey')} help={t('runner.privateKeyHelp')}>
              <textarea
                className="textarea mono"
                value={form.privateKey}
                onChange={(event) => setForm({ ...form, privateKey: event.target.value })}
                placeholder={isEditMode ? t('runner.privateKeyPlaceholderEdit') : t('runner.privateKeyPlaceholderNew')}
                rows={6}
                disabled={form.mode !== 'ssh'}
              />
            </Field>

            <Button type="button" variant="outline" onClick={testConnection} className="btn-inline">
              {t('runner.testConnection')}
            </Button>
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('runner.specsKicker')}
              title={t('runner.specsTitle')}
              description={t('runner.specsDescription')}
            />

            <div className="spec-list">
              <SpecRow
                badge="Git"
                title={t('runner.specGitTitle')}
                description={t('runner.specGitDescription')}
              />
              <SpecRow
                badge="SSH"
                title={t('runner.specSshTitle')}
                description={t('runner.specSshDescription')}
              />
              <SpecRow
                badge="Shell"
                title={t('runner.specShellTitle')}
                description={t('runner.specShellDescription')}
              />
              <SpecRow
                badge="Disk"
                title={t('runner.specDiskTitle')}
                description={t('runner.specDiskDescription')}
              />
            </div>
          </Card>

          <Card className="panel-card">
            <SectionTitle
              kicker={t('runner.setupKicker')}
              title={t('runner.setupTitle')}
              description={t('runner.setupDescription')}
            />

            <div className="stack-gap">
              <CommandBlock
                title={t('runner.step1Title')}
                command={`mkdir -p ${workRoot}`}
                onCopy={() => setNotice(t('runner.step1Copied'))}
              />

              <CommandBlock
                title={t('runner.step2Title')}
                command="mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys"
                onCopy={() => setNotice(t('runner.step2Copied'))}
              />

              <CommandBlock
                title={t('runner.step3Title')}
                command="apt-get update && apt-get install -y git curl"
                onCopy={() => setNotice(t('runner.step3Copied'))}
              />
            </div>
          </Card>

          <div className="form-actions">
            <Button type="submit" disabled={submitting}>
              {submitting ? t('common.saving') : (isEditMode ? t('runner.saveUpdate') : t('runner.saveCreate'))}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/dashboard?tab=runners', { replace: true })}
            >
              {t('runner.cancel')}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function NotFoundPage({ navigate }) {
  const { t } = useI18n();
  return (
    <main className="auth-screen">
      <section className="auth-inner">
        <div className="auth-toolbar">
          <LocaleSwitch />
        </div>
        <Card className="auth-card">
          <SectionTitle
            title={t('notFound.title')}
            description={t('notFound.description')}
          />
          <div className="form-actions">
            <Button type="button" onClick={() => navigate('/dashboard', { replace: true })}>
              {t('notFound.back')}
            </Button>
          </div>
        </Card>
      </section>
    </main>
  );
}

function BrandMark({ size = 'md' }) {
  return <img className={`brand-mark brand-mark-${size}`} src="/brand/candy-mark.png" alt="Candy" />;
}

function BrandLockup({ subtitle = 'Candy-Sweet Delivery' }) {
  return (
    <div className="brand-lockup">
      <BrandMark size="md" />
      <div className="brand-lockup-copy">
        <strong>Candy</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
}

function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="locale-switch" role="group" aria-label={t('locale.switchLabel')}>
      <button
        type="button"
        className={locale === 'en' ? 'locale-button active' : 'locale-button'}
        onClick={() => setLocale('en')}
      >
        {t('locale.english')}
      </button>
      <button
        type="button"
        className={locale === 'zh' ? 'locale-button active' : 'locale-button'}
        onClick={() => setLocale('zh')}
      >
        {t('locale.chinese')}
      </button>
    </div>
  );
}

function DateFilterPicker({ value, onChange }) {
  const { locale, t } = useI18n();
  const containerRef = useRef(null);
  const selectedDate = useMemo(() => parseDateKey(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selectedDate || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    const base = selectedDate || new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [selectedDate, value]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const weekStart = weekStartIndex(locale);
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(getLocaleTag(locale), { weekday: 'short' });
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(2023, 0, 1 + ((weekStart + index) % 7));
      return formatter.format(date);
    });
  }, [locale, weekStart]);

  const calendarDays = useMemo(() => buildCalendarWeeks(viewMonth, weekStart === 1), [viewMonth, weekStart]);
  const selectedKey = selectedDate ? toDateKey(selectedDate) : '';
  const todayKey = toDateKey(new Date());
  const triggerLabel = selectedDate ? formatDateLabel(selectedDate, locale) : t('dashboard.logs.dateAny');

  function closeAndSelect(date) {
    onChange(toDateKey(date));
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(false);
  }

  return (
    <div className="date-filter" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        className={`date-filter-trigger ${selectedDate ? '' : 'empty'}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('dashboard.logs.dateTriggerLabel')}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="date-filter-trigger-text">{triggerLabel}</span>
        <span className="date-filter-trigger-caret">▾</span>
      </Button>

      {open && (
        <div className="date-picker-panel" role="dialog" aria-label={t('dashboard.logs.datePickerLabel')}>
          <div className="date-picker-header">
            <button
              type="button"
              className="date-picker-nav"
              aria-label={t('dashboard.logs.datePrevMonth')}
              onClick={() => setViewMonth((current) => shiftMonth(current, -1))}
            >
              ‹
            </button>
            <strong>{formatMonthLabel(viewMonth, locale)}</strong>
            <button
              type="button"
              className="date-picker-nav"
              aria-label={t('dashboard.logs.dateNextMonth')}
              onClick={() => setViewMonth((current) => shiftMonth(current, 1))}
            >
              ›
            </button>
          </div>

          <div className="date-picker-weekdays">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="date-picker-days" role="grid" aria-label={formatMonthLabel(viewMonth, locale)}>
            {calendarDays.map((date) => {
              const isSelected = selectedKey === toDateKey(date);
              const isCurrentMonth = isSameMonth(date, viewMonth);
              const isToday = todayKey === toDateKey(date);
              return (
                <button
                  key={toDateKey(date)}
                  type="button"
                  className={[
                    'date-picker-day',
                    isCurrentMonth ? '' : 'muted',
                    isSelected ? 'selected' : '',
                    isToday ? 'today' : ''
                  ].filter(Boolean).join(' ')}
                  aria-pressed={isSelected}
                  onClick={() => closeAndSelect(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="date-picker-footer">
            <button
              type="button"
              className="date-picker-link"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {t('dashboard.logs.dateClear')}
            </button>
            <button
              type="button"
              className="date-picker-link"
              onClick={() => {
                const today = new Date();
                closeAndSelect(today);
              }}
            >
              {t('dashboard.logs.dateToday')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

function Badge({ tone = 'muted', className = '', children }) {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>;
}

function Card({ as: Tag = 'section', className = '', children }) {
  return <Tag className={`card ${className}`.trim()}>{children}</Tag>;
}

function SectionTitle({ title, description, action }) {
  return (
    <div className="section-head">
      <div className="section-head-copy">
        <h2>{title}</h2>
        {description && <p className="panel-description">{description}</p>}
      </div>
      {action && <div className="section-head-actions">{action}</div>}
    </div>
  );
}

function Field({ label, help, className = '', children }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
      {help && <small className="field-help">{help}</small>}
    </label>
  );
}

function EmptyState({ title, body, compact = false, action }) {
  return (
    <div className={compact ? 'empty-state compact' : 'empty-state'}>
      <span className="empty-dot" />
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

function FeedbackBar({ error, notice, onClose }) {
  const { t } = useI18n();
  return (
    <div className={error ? 'toast error' : 'toast'}>
      <span>{error || notice}</span>
      <Button type="button" variant="text" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );
}

function Status({ status }) {
  const { locale } = useI18n();
  const meta = statusMeta(locale, status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function MetricCard({ label, value, caption, tone }) {
  return (
    <Card className={`metric-card metric-${tone || 'primary'}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </Card>
  );
}

function DeploymentRow({ job, onClick }) {
  const { locale, t } = useI18n();
  return (
    <button type="button" className="history-row" onClick={onClick}>
      <div className="history-main">
        <div className="history-top">
          <strong>{job.repositoryName}</strong>
          <Status status={job.status} />
        </div>
        <small>
          {job.branch} · {shortSha(job.commitSha, locale)} · {job.commitMessage || t('common.noCommitMessage')}
        </small>
      </div>
      <div className="history-meta">
        <span>{job.runnerName || t('common.localRunner')}</span>
        <small>{formatTime(job.createdAt, locale)}</small>
      </div>
    </button>
  );
}

function RepoCard({ repo, onCopy, onEdit, onTrigger, onDelete }) {
  const { locale, t } = useI18n();
  return (
    <Card className="repo-card">
      <div className="repo-top">
        <div>
          <strong>{repo.name}</strong>
          <p>{providerLabel(locale, repo.provider)} · {repo.branch} · {repo.runnerName || t('common.localRunner')}</p>
        </div>
        <Status status={repo.lastJobStatus} />
      </div>

      <div className="repo-grid">
        <MetaBlock
          label={t('labels.repositoryUrl')}
          value={repo.repoUrl}
        />
        <MetaBlock
          label={t('labels.webhookUrl')}
          value={repo.webhookUrl}
        />
        <MetaBlock
          label={t('labels.deploymentKey')}
          value={repo.webhookSecret ? t('repository.webhookSecretState') : t('common.notSet')}
        />
        <MetaBlock
          label={t('labels.deploymentScript')}
          value={scriptPreview(repo.deployScript, locale)}
        />
      </div>

      <div className="repo-footer">
        <div className="repo-last">
          <span>{t('cards.lastDeployment')}</span>
          <strong>
            {repo.lastJobStatus
              ? `${statusMeta(locale, repo.lastJobStatus).label} · ${shortSha(repo.lastJobCommit, locale)}`
              : t('cards.noDeployment')}
          </strong>
          <p>{repo.lastJobFinished ? formatTime(repo.lastJobFinished, locale) : t('cards.waitingFirstTrigger')}</p>
        </div>

        <div className="repo-actions">
          <Button type="button" variant="secondary" size="sm" onClick={() => onCopy(repo.webhookUrl, t('labels.webhookUrl'))}>
            {t('common.copy')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onCopy(repo.webhookSecret, t('labels.webhookSecret'))}>
            {t('common.copy')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onTrigger}>
            {t('common.trigger')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
            {t('common.edit')}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RunnerCard({ runner, onEdit, onTest, onDelete }) {
  const { locale, t } = useI18n();
  return (
    <Card className="runner-card">
      <div className="runner-top">
        <div>
          <strong>{runner.name}</strong>
          <p>
            {runner.mode === 'ssh'
              ? `${runner.username}@${runner.host}:${runner.port}`
              : t('common.localRunner')}
          </p>
        </div>
        <div className="runner-badges">
          <Badge tone={runner.mode === 'ssh' ? 'secondary' : 'muted'}>
            {runnerModeLabel(locale, runner.mode)}
          </Badge>
          <Badge tone={runner.hasPrivateKey ? 'success' : 'muted'}>
            {runner.hasPrivateKey ? t('runner.privateKeyConfigured') : t('runner.privateKeyEmpty')}
          </Badge>
        </div>
      </div>

        <div className="runner-meta">
        <div>
          <span>{t('labels.runnerRoot')}</span>
          <strong>{runner.workRoot || t('common.notSet')}</strong>
        </div>
        <div>
          <span>{t('labels.updatedAt')}</span>
          <strong>{formatTime(runner.updatedAt, locale)}</strong>
        </div>
      </div>

      <div className="repo-actions">
        {runner.mode === 'ssh' && (
          <Button type="button" variant="secondary" size="sm" onClick={onTest}>
            {t('common.test')}
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          {t('common.edit')}
        </Button>
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          {t('common.delete')}
        </Button>
      </div>
    </Card>
  );
}

function MetaBlock({ label, value }) {
  return (
    <div className="meta-block">
      <span>{label}</span>
      <code>{value || '-'}</code>
    </div>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="detail-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LogViewer({ logs }) {
  const { t } = useI18n();
  if (!logs.length) {
    return (
      <div className="log-empty-wrap">
        <EmptyState
          title={t('cards.noLogsTitle')}
          body={t('cards.noLogsBody')}
        />
      </div>
    );
  }

  return (
    <div className="log-shell">
      {logs.map((line) => (
        <div
          key={line.id}
          className={line.stream === 'stderr' ? 'log-line stderr' : 'log-line stdout'}
        >
          <span className="log-tag">[{line.stream}]</span>
          <span>{sanitizeLogLine(line.line)}</span>
        </div>
      ))}
    </div>
  );
}

function SpecRow({ badge, title, description }) {
  return (
    <div className="spec-row">
      <Badge tone="secondary">{badge}</Badge>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function CommandBlock({ title, command, onCopy }) {
  const { t } = useI18n();
  async function copyCommand() {
    try {
      await navigator.clipboard?.writeText(command || '');
      onCopy?.();
    } catch {
      onCopy?.();
    }
  }

  return (
    <div className="command-block">
      <div className="command-head">
        <strong>{title}</strong>
        <Button type="button" variant="outline" size="sm" onClick={copyCommand}>
          {t('common.copy')}
        </Button>
      </div>
      <div className="copy-box mono">{command}</div>
    </div>
  );
}

function scriptPreview(script, locale = getRuntimeLocale()) {
  const line = firstLine(script);
  if (!line) {
    return translate(locale, 'common.noScript');
  }
  return line.length > 64 ? `${line.slice(0, 61)}…` : line;
}

createRoot(document.getElementById('root')).render(<App />);
