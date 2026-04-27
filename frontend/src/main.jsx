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
  sourceMode: 'new',
  repositorySourceId: '',
  sourceName: '',
  provider: 'github',
  repoUrl: '',
  webhookSecret: '',
  branch: 'main',
  workDir: '',
  deployKey: '',
  deployScript: 'set -e\nnpm ci\nnpm run build\n',
  runnerId: '',
  cleanWorktree: true
};

const emptySecret = {
  name: '',
  value: '',
  repositoryId: ''
};

const FEEDBACK_AUTO_CLOSE_MS = 4000;
const ENVIRONMENT_COLOR_OPTIONS = ['#D83B53', '#1F8E5E', '#2C99F0', '#B27300', '#7C3AED'];

const LOCALE_STORAGE_KEY = 'candy.locale';
const SELECTED_ENVIRONMENT_STORAGE_KEY = 'candy.selectedEnvironmentId';

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
      clear: 'Clear',
      close: 'Close',
      current: 'Current',
      copy: 'Copy',
      copied: 'Copied',
      create: 'Create',
      delete: 'Delete',
      edit: 'Edit',
      logout: 'Logout',
      loading: 'Loading...',
      saving: 'Saving...',
      save: 'Save',
      trigger: 'Trigger',
      test: 'Test',
      update: 'Update',
      localRunner: 'Local Runner',
      noScript: 'No script configured',
      noData: '-',
      noCommitMessage: 'No commit message',
      notSet: 'Not set',
      latest: 'latest',
      search: 'Search'
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
    select: {
      noResults: 'No matching options',
      placeholder: 'Select an option'
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
      gitlab: 'GitLab',
      generic: 'Auto-detect'
    },
    runnerMode: {
      local: 'Local Runner',
      ssh: 'SSH Runner'
    },
    notifications: {
      copiedLabel: '{label} copied',
      environmentCreated: 'Environment created',
      environmentUpdated: 'Environment updated',
      environmentDeleted: 'Environment deleted',
      repoDeleted: 'Repository deleted',
      runnerDeleted: 'Runner deleted',
      queued: '{name} added to the queue',
      localRunnerNoTest: 'The local Runner does not need a connection test.',
      runnerConnected: '{name} connection is healthy',
      repoSaved: 'Repository configuration updated',
      repoCreated: 'Repository created',
      runnerSaved: 'Runner configuration updated',
      runnerCreated: 'Runner created',
      secretCreated: 'Secret created',
      secretSaved: 'Secret updated',
      secretDeleted: 'Secret deleted',
      directoryCopied: 'Directory command copied',
      sshCopied: 'SSH command copied',
      installCopied: 'Installation command copied',
      secretCopied: 'Webhook secret copied',
      webhookCopied: 'Webhook URL copied',
      noRunnerToTest: 'Save the Runner first, then run the connection test.'
    },
    confirms: {
      deleteRepositoryTitle: 'Delete repository binding',
      deleteRepositoryBody: 'This will remove the current environment binding for {name}. Repo-scoped Secrets and deployment history will also be removed.',
      deleteRepositoryConfirm: 'Delete repository',
      deleteRunnerTitle: 'Delete Runner',
      deleteRunnerBody: 'This will permanently remove {name}. Repository bindings that used this Runner will fall back to no assigned Runner.',
      deleteRunnerConfirm: 'Delete Runner',
      deleteSecretTitle: 'Delete Secret',
      deleteSecretBody: 'This will permanently remove the Secret {name}. Future deployments will no longer receive this environment variable.',
      deleteSecretConfirm: 'Delete Secret',
      deleteEnvironmentTitle: 'Delete environment',
      deleteEnvironmentBody: 'This will permanently remove {name}, including its repository bindings, scoped Secrets, deployment history, and any repository sources left without bindings.',
      deleteEnvironmentConfirm: 'Delete environment'
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
      header: {
        environment: 'Environment',
        environmentEmpty: 'No environments',
        manageEnvironments: 'Manage environments'
      },
      tabs: {
        overview: 'Overview',
        repositories: 'Repos',
        runners: 'Runners',
        secrets: 'Secrets',
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
      secrets: {
        title: 'Secrets',
        description: 'Inject encrypted values into deployments as environment variables.',
        add: 'Add Secret',
        edit: 'Update Secret',
        emptyTitle: 'No Secrets yet',
        emptyBody: 'Add API keys, tokens, or passwords that deployment scripts and applications can read from the environment.',
        name: 'Variable name',
        value: 'Value',
        valueEditHelp: 'Leave blank to keep the existing value.',
        scope: 'Scope',
        globalScope: 'Global',
        globalDescription: 'Available to every repository.',
        repositoryScope: 'Repository',
        repositoryPlaceholder: 'All repositories',
        cancelEdit: 'Cancel edit',
        availableLabel: 'Available secrets',
        availableEmpty: 'No secrets available',
        scopeRepo: 'repo',
        scopeGlobal: 'global'
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
    environments: {
      title: 'Manage environments',
      description: 'Create, edit, and remove deployment environments.',
      create: 'New environment',
      empty: 'No environments',
      name: 'Name',
      slug: 'Slug',
      descriptionLabel: 'Description',
      color: 'Color',
      saveCreate: 'Create environment',
      saveUpdate: 'Save changes',
      delete: 'Delete environment',
      cannotDelete: 'Delete is available only for empty environments.',
      slugHelp: 'For stable environment identification.',
      productionHint: 'Built-in production environment',
      testingHint: 'Built-in testing environment'
    },
    repository: {
      back: 'Back',
      titleCreate: 'Add repository',
      titleEdit: 'Edit repository',
      description: 'Bind a repository source to the selected environment and configure deployment details.',
      basicKicker: 'Basic Information',
      basicTitle: 'Environment binding',
      basicDescription: 'These settings belong to the selected environment only.',
      platform: 'Source provider',
      branch: 'Default branch',
      providerGithub: 'GitHub',
      providerGitee: 'Gitee',
      providerGitlab: 'GitLab',
      providerGeneric: 'Auto-detect',
      sourceKicker: 'Repository Source',
      sourceTitle: 'Repository source',
      sourceDescription: 'Repository sources are global and can be reused across environments.',
      sourceMode: 'Source mode',
      sourceModeExisting: 'Use existing source',
      sourceModeNew: 'Create source',
      sourceSelect: 'Repository source',
      sourceSelectPlaceholder: 'Choose a repository source',
      sourceName: 'Source name',
      sourceSharedHelp: 'The selected source keeps the shared repository URL and deployment key.',
      sourceEmptyTitle: 'No repository sources yet',
      sourceEmptyBody: 'Create a source here, then bind it to the selected environment.',
      sourceSummary: 'Selected source',
      sourceCreateSummary: 'New source details',
      configKicker: 'Source Details',
      configTitle: 'Source details',
      configDescription: 'Use the SSH URL to fetch code and store the shared deployment key.',
      sshUrl: 'Repository SSH URL',
      deploymentKey: 'Deployment key (private key)',
      deploymentKeyHelp: 'Used by the central service to fetch repository code over SSH. This value is shared by every environment bound to the same source.',
      deploymentKeyPlaceholderNew: '-----BEGIN OPENSSH PRIVATE KEY-----',
      deploymentKeyPlaceholderEdit: 'Leave blank to keep unchanged',
      deploymentKeyConfigured: 'Configured',
      deploymentKeyMissing: 'Not configured',
      bindingEnvironment: 'Environment',
      bindingEnvironmentHelp: 'This binding will be created in the selected environment.',
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
      noEnvironmentSelected: 'Select an environment before saving a repository binding.',
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
      environment: 'Environment',
      runner: 'Runner',
      repositorySource: 'Repository source',
      secretScope: 'Scope',
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
      clear: '清空',
      close: '关闭',
      current: '当前',
      copy: '复制',
      copied: '已复制',
      create: '创建',
      delete: '删除',
      edit: '编辑',
      logout: '退出',
      loading: '加载中...',
      saving: '保存中...',
      save: '保存',
      trigger: '触发',
      test: '测试',
      update: '更新',
      localRunner: '本机 Runner',
      noScript: '未配置脚本',
      noData: '-',
      noCommitMessage: '无提交信息',
      notSet: '未设置',
      latest: '最新',
      search: '搜索'
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
    select: {
      noResults: '没有匹配项',
      placeholder: '请选择'
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
      gitlab: 'GitLab',
      generic: '自动识别'
    },
    runnerMode: {
      local: '本机 Runner',
      ssh: 'SSH Runner'
    },
    notifications: {
      copiedLabel: '{label} 已复制',
      environmentCreated: '环境已创建',
      environmentUpdated: '环境已更新',
      environmentDeleted: '环境已删除',
      repoDeleted: '仓库已删除',
      runnerDeleted: 'Runner 已删除',
      queued: '{name} 已进入队列',
      localRunnerNoTest: '本机 Runner 无需测试连接。',
      runnerConnected: '{name} 连接正常',
      repoSaved: '仓库配置已更新',
      repoCreated: '仓库已创建',
      runnerSaved: 'Runner 配置已更新',
      runnerCreated: 'Runner 已创建',
      secretCreated: 'Secret 已创建',
      secretSaved: 'Secret 已更新',
      secretDeleted: 'Secret 已删除',
      directoryCopied: '目录命令已复制',
      sshCopied: 'SSH 命令已复制',
      installCopied: '安装命令已复制',
      secretCopied: 'Webhook 密钥已复制',
      webhookCopied: 'Webhook 地址已复制',
      noRunnerToTest: '请先保存 Runner，再进行连接测试。'
    },
    confirms: {
      deleteRepositoryTitle: '删除仓库绑定',
      deleteRepositoryBody: '这会移除 {name} 在当前环境下的仓库绑定。该仓库下的作用域 Secrets 和部署历史也会一并删除。',
      deleteRepositoryConfirm: '删除仓库',
      deleteRunnerTitle: '删除 Runner',
      deleteRunnerBody: '这会永久删除 {name}。原先使用这个 Runner 的仓库绑定会变成未分配 Runner。',
      deleteRunnerConfirm: '删除 Runner',
      deleteSecretTitle: '删除 Secret',
      deleteSecretBody: '这会永久删除 Secret {name}。后续部署将不再注入这个环境变量。',
      deleteSecretConfirm: '删除 Secret',
      deleteEnvironmentTitle: '删除环境',
      deleteEnvironmentBody: '这会永久删除 {name}，包括其中的仓库绑定、作用域 Secrets、部署历史，以及因此失去绑定的 repository source。',
      deleteEnvironmentConfirm: '删除环境'
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
    header: {
      environment: '环境',
      environmentEmpty: '暂无环境',
      manageEnvironments: '管理环境'
    },
    tabs: {
      overview: '总览',
      repositories: '仓库',
      runners: 'Runners',
      secrets: 'Secrets',
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
      secrets: {
        title: 'Secrets',
        description: '以环境变量方式向部署过程注入加密保存的敏感值。',
        add: '添加 Secret',
        edit: '更新 Secret',
        emptyTitle: '还没有 Secret',
        emptyBody: '添加 API Key、Token 或密码，部署脚本和应用可以从环境变量中读取。',
        name: '变量名',
        value: '值',
        valueEditHelp: '留空表示不修改已有值。',
        scope: '作用域',
        globalScope: '全局',
        globalDescription: '对所有仓库生效。',
        repositoryScope: '仓库',
        repositoryPlaceholder: '全部仓库',
        cancelEdit: '取消编辑',
        availableLabel: '可用 Secrets',
        availableEmpty: '暂无可用 Secret',
        scopeRepo: '仓库',
        scopeGlobal: '全局'
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
    environments: {
      title: '管理环境',
      description: '创建、编辑和删除部署环境。',
      create: '新建环境',
      empty: '暂无环境',
      name: '名称',
      slug: '标识',
      descriptionLabel: '描述',
      color: '颜色',
      saveCreate: '创建环境',
      saveUpdate: '保存修改',
      delete: '删除环境',
      cannotDelete: '只有空环境才允许删除。',
      slugHelp: '用于系统内部稳定识别环境。',
      productionHint: '系统内置的生产环境',
      testingHint: '系统内置的测试环境'
    },
    repository: {
      back: '返回',
      titleCreate: '添加仓库',
      titleEdit: '编辑仓库',
      description: '把仓库源绑定到当前环境，并配置该环境下的部署细节。',
      basicKicker: '基础信息',
      basicTitle: '环境绑定',
      basicDescription: '这里的设置只作用于当前选中的环境。',
      platform: '仓库源平台',
      branch: '默认分支',
      providerGithub: 'GitHub',
      providerGitee: 'Gitee',
      providerGitlab: 'GitLab',
      providerGeneric: '自动识别',
      sourceKicker: '仓库源',
      sourceTitle: '仓库源',
      sourceDescription: '仓库源是全局资源，可以被多个环境复用。',
      sourceMode: '仓库源模式',
      sourceModeExisting: '使用已有仓库源',
      sourceModeNew: '创建新仓库源',
      sourceSelect: '仓库源',
      sourceSelectPlaceholder: '选择仓库源',
      sourceName: '仓库源名称',
      sourceSharedHelp: '选中的仓库源会复用共享的仓库地址和部署密钥。',
      sourceEmptyTitle: '还没有仓库源',
      sourceEmptyBody: '可以先在这里创建一个仓库源，再绑定到当前环境。',
      sourceSummary: '已选仓库源',
      sourceCreateSummary: '新仓库源信息',
      configKicker: '仓库源详情',
      configTitle: '仓库源详情',
      configDescription: '使用 SSH 地址拉取代码，并保存共享的 deployment key。',
      sshUrl: '仓库 SSH 地址',
      deploymentKey: '部署密钥（私钥）',
      deploymentKeyHelp: '用于中心服务通过 SSH 拉取仓库代码。同一个仓库源绑定到多个环境时会共享这个值。',
      deploymentKeyPlaceholderNew: '-----BEGIN OPENSSH PRIVATE KEY-----',
      deploymentKeyPlaceholderEdit: '留空表示不修改',
      deploymentKeyConfigured: '已配置',
      deploymentKeyMissing: '未配置',
      bindingEnvironment: '环境',
      bindingEnvironmentHelp: '这个绑定会创建在当前选中的环境中。',
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
      noEnvironmentSelected: '保存仓库绑定前请先选择环境。',
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
      environment: '环境',
      runner: 'Runner',
      repositorySource: '仓库源',
      secretScope: '作用域',
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

function readStoredEnvironmentId() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(SELECTED_ENVIRONMENT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function getRuntimeLocale() {
  if (typeof window === 'undefined') {
    return 'en';
  }

  return window.__candyLocale === 'zh' ? 'zh' : 'en';
}

function normalizeEnvironmentColor(value) {
  const trimmed = String(value || '').trim();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return '#EF3150';
  }
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function environmentShellStyle(environment) {
  const color = normalizeEnvironmentColor(environment?.color);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return {
    '--environment-accent': color,
    '--environment-accent-soft': `rgba(${red}, ${green}, ${blue}, 0.08)`,
    '--environment-accent-strong': `rgba(${red}, ${green}, ${blue}, 0.18)`,
    '--environment-accent-line': `rgba(${red}, ${green}, ${blue}, 0.16)`
  };
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

function slugifyEnvironmentName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
    case 'gitlab':
      return translate(locale, 'provider.gitlab');
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

function maskSecret(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= 4) {
    return '••••';
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}••••${text.slice(-2)}`;
  }
  return `${text.slice(0, 4)}••••••${text.slice(-4)}`;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect
        x="7"
        y="3"
        width="8"
        height="10"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 7H4.5A2.5 2.5 0 0 0 2 9.5v4A2.5 2.5 0 0 0 4.5 16h4A2.5 2.5 0 0 0 11 13.5V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M3.75 6L8 10.25L12.25 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className={className}>
      <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13.5 13.5L17 17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M3.5 8.25L6.5 11.25L12.5 5.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M4 4L12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 4L4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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

function createRepoForm(repo, repositorySources = []) {
  const matchedSource = repo
    ? repositorySources.find((source) => source.id === repo.repositorySourceId)
    : repositorySources[0] || null;

  if (!repo) {
    return {
      ...emptyRepo,
      sourceMode: matchedSource ? 'existing' : 'new',
      repositorySourceId: matchedSource?.id || '',
      provider: matchedSource?.provider || emptyRepo.provider,
      repoUrl: matchedSource?.repoUrl || '',
      webhookSecret: randomSecret(),
      runnerId: ''
    };
  }

  return {
    sourceMode: matchedSource ? 'existing' : 'new',
    repositorySourceId: repo.repositorySourceId || matchedSource?.id || '',
    sourceName: matchedSource?.name || repo.name || '',
    provider: matchedSource?.provider || repo.provider || 'github',
    repoUrl: matchedSource?.repoUrl || repo.repoUrl || '',
    webhookSecret: repo.webhookSecret || randomSecret(),
    branch: repo.branch || 'main',
    workDir: repo.workDir || '',
    deployKey: '',
    deployScript: repo.deployScript || emptyRepo.deployScript,
    runnerId: repo.runnerId ? String(repo.runnerId) : '',
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
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(readStoredEnvironmentId);
  const [repositorySources, setRepositorySources] = useState([]);
  const [runners, setRunners] = useState([]);
  const [repos, setRepos] = useState([]);
  const [secrets, setSecrets] = useState([]);
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
  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvironmentId) || null,
    [environments, selectedEnvironmentId]
  );
  const selectedEnvironmentIdRef = useRef(selectedEnvironmentId);

  useEffect(() => {
    selectedEnvironmentIdRef.current = selectedEnvironmentId;
  }, [selectedEnvironmentId]);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (selectedEnvironmentId) {
        window.localStorage.setItem(SELECTED_ENVIRONMENT_STORAGE_KEY, selectedEnvironmentId);
      } else {
        window.localStorage.removeItem(SELECTED_ENVIRONMENT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures and keep the in-memory selection.
    }
  }, [selectedEnvironmentId]);

  useEffect(() => {
    if (!notice && !error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearMessages();
    }, FEEDBACK_AUTO_CLOSE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice, error, clearMessages]);

  const refreshData = useCallback(async (preferredEnvironmentId) => {
    const environmentData = await api('/api/environments');
    const nextEnvironments = Array.isArray(environmentData) ? environmentData : [];
    setEnvironments(nextEnvironments);

    const requestedEnvironmentId = preferredEnvironmentId
      || selectedEnvironmentIdRef.current
      || readStoredEnvironmentId();
    const nextEnvironment = nextEnvironments.find((environment) => environment.id === requestedEnvironmentId)
      || nextEnvironments[0]
      || null;
    const nextEnvironmentId = nextEnvironment?.id || '';

    if (nextEnvironmentId !== selectedEnvironmentIdRef.current) {
      setSelectedEnvironmentId(nextEnvironmentId);
    }

    const sourcePromise = api('/api/repository-sources');

    if (!nextEnvironmentId) {
      const sourceData = await sourcePromise;
      setRepositorySources(Array.isArray(sourceData) ? sourceData : []);
      setRunners([]);
      setRepos([]);
      setSecrets([]);
      setJobs([]);
      setSelectedJob(null);
      setLogs([]);
      return;
    }

    const query = `?environmentId=${encodeURIComponent(nextEnvironmentId)}`;
    const [runnerData, repoData, secretData, jobData, sourceData] = await Promise.all([
      api(`/api/runners${query}`),
      api(`/api/repositories${query}`),
      api(`/api/secrets${query}`),
      api(`/api/jobs${query}`),
      sourcePromise
    ]);

    const nextJobs = Array.isArray(jobData) ? jobData : [];
    setRepositorySources(Array.isArray(sourceData) ? sourceData : []);
    setRunners(Array.isArray(runnerData) ? runnerData : []);
    setRepos(Array.isArray(repoData) ? repoData : []);
    setSecrets(Array.isArray(secretData) ? secretData : []);
    setJobs(nextJobs);
    setSelectedJob((current) => {
      if (!current) {
        return null;
      }
      const nextJob = nextJobs.find((job) => job.id === current.id) || null;
      if (!nextJob) {
        setLogs([]);
      }
      return nextJob;
    });
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
    refreshData(selectedEnvironmentId).catch((err) => {
      if (active) {
        showError(err.message);
      }
    });

    return () => {
      active = false;
    };
  }, [user, refreshData, showError]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      refreshData(selectedEnvironmentId).catch(() => {});
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [user, refreshData, selectedEnvironmentId]);

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
    setEnvironments([]);
    setRepositorySources([]);
    setSelectedEnvironmentId('');
    setRunners([]);
    setRepos([]);
    setSecrets([]);
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

  async function handleEnvironmentChange(nextEnvironmentId) {
    clearMessages();
    setSelectedJob(null);
    setLogs([]);
    setSelectedEnvironmentId(nextEnvironmentId);

    try {
      await refreshData(nextEnvironmentId);
    } catch (err) {
      showError(err.message);
    }
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
          environments={environments}
          selectedEnvironment={selectedEnvironment}
          selectedEnvironmentId={selectedEnvironmentId}
          runners={runners}
          repos={repos}
          secrets={secrets}
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
          onEnvironmentChange={handleEnvironmentChange}
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
          repositorySources={repositorySources}
          runners={runners}
          selectedEnvironment={selectedEnvironment}
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
          selectedEnvironment={selectedEnvironment}
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
  environments,
  selectedEnvironment,
  selectedEnvironmentId,
  runners,
  repos,
  secrets,
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
  refreshData,
  loadJobLogs,
  onEnvironmentChange,
  onLogout
}) {
  const { t, locale } = useI18n();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const requestedTab = params.get('tab') || 'overview';
  const [tab, setTab] = useState(requestedTab);
  const [jobFilter, setJobFilter] = useState('');
  const [jobDate, setJobDate] = useState('');
  const [secretForm, setSecretForm] = useState(emptySecret);
  const [editingSecretId, setEditingSecretId] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [environmentModalOpen, setEnvironmentModalOpen] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState(selectedEnvironmentId);
  const [environmentForm, setEnvironmentForm] = useState({
    name: '',
    slug: '',
    description: '',
    color: ENVIRONMENT_COLOR_OPTIONS[0]
  });
  const [environmentSaving, setEnvironmentSaving] = useState(false);

  useEffect(() => {
    if (!environmentModalOpen) {
      return;
    }
    if (!editingEnvironmentId) {
      return;
    }
    const match = environments.find((environment) => environment.id === editingEnvironmentId) || null;
    if (!match) {
      return;
    }
    setEnvironmentForm({
      name: match?.name || '',
      slug: match?.slug || '',
      description: match?.description || '',
      color: match?.color || ENVIRONMENT_COLOR_OPTIONS[0]
    });
  }, [editingEnvironmentId, environmentModalOpen, environments]);

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

  function requestConfirmation(config) {
    setPendingConfirmation(config);
  }

  function requestDeleteRepository(repo) {
    requestConfirmation({
      title: t('confirms.deleteRepositoryTitle'),
      body: t('confirms.deleteRepositoryBody', { name: repo.name || 'Repository' }),
      confirmLabel: t('confirms.deleteRepositoryConfirm'),
      action: async () => {
        await api(`/api/repositories/${repo.id}`, { method: 'DELETE' });
        setNotice(t('notifications.repoDeleted'));
        await refreshData();
      }
    });
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation?.action) {
      return;
    }
    setConfirmingAction(true);
    try {
      await pendingConfirmation.action();
      setPendingConfirmation(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmingAction(false);
    }
  }

  function requestDeleteRunner(runner) {
    requestConfirmation({
      title: t('confirms.deleteRunnerTitle'),
      body: t('confirms.deleteRunnerBody', { name: runner.name || 'Runner' }),
      confirmLabel: t('confirms.deleteRunnerConfirm'),
      action: async () => {
        await api(`/api/runners/${runner.id}`, { method: 'DELETE' });
        setNotice(t('notifications.runnerDeleted'));
        await refreshData();
      }
    });
  }

  async function saveSecret(event) {
    event.preventDefault();
    try {
      const query = selectedEnvironmentId
        ? `?environmentId=${encodeURIComponent(selectedEnvironmentId)}`
        : '';
      const payload = {
        name: secretForm.name.trim().toUpperCase(),
        value: secretForm.value,
        repositoryId: secretForm.repositoryId || null
      };
      if (editingSecretId) {
        await api(`/api/secrets/${editingSecretId}${query}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setNotice(t('notifications.secretSaved'));
      } else {
        await api(`/api/secrets${query}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setNotice(t('notifications.secretCreated'));
      }
      setSecretForm(emptySecret);
      setEditingSecretId(null);
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  function requestDeleteSecret(secret) {
    requestConfirmation({
      title: t('confirms.deleteSecretTitle'),
      body: t('confirms.deleteSecretBody', { name: secret.name || 'Secret' }),
      confirmLabel: t('confirms.deleteSecretConfirm'),
      action: async () => {
        const query = selectedEnvironmentId
          ? `?environmentId=${encodeURIComponent(selectedEnvironmentId)}`
          : '';
        await api(`/api/secrets/${secret.id}${query}`, { method: 'DELETE' });
        setNotice(t('notifications.secretDeleted'));
        if (editingSecretId === secret.id) {
          setSecretForm(emptySecret);
          setEditingSecretId(null);
        }
        await refreshData();
      }
    });
  }

  function editSecret(secret) {
    setEditingSecretId(secret.id);
    setSecretForm({
      name: secret.name || '',
      value: '',
      repositoryId: secret.repositoryId ? String(secret.repositoryId) : ''
    });
  }

  function cancelSecretEdit() {
    setSecretForm(emptySecret);
    setEditingSecretId(null);
  }

  function openEnvironmentManager() {
    const nextEditingId = selectedEnvironmentId || environments[0]?.id || '';
    const match = environments.find((environment) => environment.id === nextEditingId) || null;
    setEditingEnvironmentId(nextEditingId);
    setEnvironmentForm({
      name: match?.name || '',
      slug: match?.slug || '',
      description: match?.description || '',
      color: match?.color || ENVIRONMENT_COLOR_OPTIONS[0]
    });
    setEnvironmentModalOpen(true);
  }

  function selectEnvironmentForEdit(environment) {
    setEditingEnvironmentId(environment.id);
    setEnvironmentForm({
      name: environment.name || '',
      slug: environment.slug || '',
      description: environment.description || '',
      color: environment.color || ENVIRONMENT_COLOR_OPTIONS[0]
    });
  }

  function startCreateEnvironment() {
    setEditingEnvironmentId('');
    setEnvironmentForm({
      name: '',
      slug: '',
      description: '',
      color: ENVIRONMENT_COLOR_OPTIONS[1]
    });
  }

  async function saveEnvironment(event) {
    event.preventDefault();
    setEnvironmentSaving(true);

    const payload = {
      name: environmentForm.name.trim(),
      slug: slugifyEnvironmentName(environmentForm.slug || environmentForm.name),
      description: environmentForm.description.trim(),
      color: environmentForm.color
    };

    try {
      if (editingEnvironmentId) {
        await api(`/api/environments/${editingEnvironmentId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setNotice(t('notifications.environmentUpdated'));
        await refreshData(editingEnvironmentId);
      } else {
        const created = await api('/api/environments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setNotice(t('notifications.environmentCreated'));
        await refreshData(created?.id);
        setEditingEnvironmentId(created?.id || '');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setEnvironmentSaving(false);
    }
  }

  function requestDeleteEnvironment() {
    if (!editingEnvironmentId) {
      return;
    }
    const environment = environments.find((item) => item.id === editingEnvironmentId);
    requestConfirmation({
      title: t('confirms.deleteEnvironmentTitle'),
      body: t('confirms.deleteEnvironmentBody', {
        name: environment?.name || environment?.slug || 'Environment'
      }),
      confirmLabel: t('confirms.deleteEnvironmentConfirm'),
      action: async () => {
        await api(`/api/environments/${editingEnvironmentId}`, { method: 'DELETE' });
        setNotice(t('notifications.environmentDeleted'));
        setEnvironmentModalOpen(false);
        await refreshData();
      }
    });
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
    <div className="dashboard-shell environment-shell" style={environmentShellStyle(selectedEnvironment)}>
      <header className="topbar">
        <div className="content-width topbar-inner">
          <BrandLockup />
          <div className="topbar-actions">
            <EnvironmentSwitcher
              environments={environments}
              selectedEnvironmentId={selectedEnvironmentId}
              onChange={onEnvironmentChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="environment-manage-button"
              onClick={openEnvironmentManager}
            >
              {t('dashboard.header.manageEnvironments')}
            </Button>
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
            { value: 'secrets', label: t('dashboard.tabs.secrets') },
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
                    secrets={secrets}
                    onCopy={copyValue}
                    onEdit={() => navigate(`/add-repository?edit=true&id=${repo.id}`)}
                    onTrigger={() => triggerRepository(repo)}
                    onDelete={() => requestDeleteRepository(repo)}
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
                    onDelete={() => requestDeleteRunner(runner)}
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

        {tab === 'secrets' && (
          <section className="section-stack">
            <SectionTitle
              title={t('dashboard.secrets.title')}
              description={t('dashboard.secrets.description')}
            />

            <Card className="panel-card">
              <form className="form-grid two" onSubmit={saveSecret}>
                <Field label={t('dashboard.secrets.name')}>
                  <input
                    className="input mono"
                    value={secretForm.name}
                    placeholder="DATABASE_URL"
                    onChange={(event) => setSecretForm({ ...secretForm, name: event.target.value.toUpperCase() })}
                  />
                </Field>

                <Field
                  label={t('dashboard.secrets.value')}
                  help={editingSecretId ? t('dashboard.secrets.valueEditHelp') : ''}
                >
                  <input
                    className="input mono"
                    type="password"
                    value={secretForm.value}
                    autoComplete="off"
                    onChange={(event) => setSecretForm({ ...secretForm, value: event.target.value })}
                  />
                </Field>

                <Field label={t('dashboard.secrets.scope')}>
                  <Select
                    value={secretForm.repositoryId}
                    onChange={(nextValue) => setSecretForm({ ...secretForm, repositoryId: nextValue })}
                    options={[
                      { value: '', label: t('dashboard.secrets.repositoryPlaceholder'), badge: 'ALL' },
                      ...repos.map((repo) => ({ value: repo.id, label: repo.name, badge: 'REPO' }))
                    ]}
                  />
                </Field>

                <div className="form-actions secret-form-actions">
                  <Button type="submit">
                    {editingSecretId ? t('dashboard.secrets.edit') : t('dashboard.secrets.add')}
                  </Button>
                  {editingSecretId && (
                    <Button type="button" variant="outline" onClick={cancelSecretEdit}>
                      {t('dashboard.secrets.cancelEdit')}
                    </Button>
                  )}
                </div>
              </form>
            </Card>

            {secrets.length ? (
              <div className="secret-list">
                {secrets.map((secret) => (
                  <SecretCard
                    key={secret.id}
                    secret={secret}
                    onEdit={() => editSecret(secret)}
                    onDelete={() => requestDeleteSecret(secret)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('dashboard.secrets.emptyTitle')}
                body={t('dashboard.secrets.emptyBody')}
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

      {environmentModalOpen && (
        <EnvironmentManagerModal
          environments={environments}
          selectedEnvironmentId={selectedEnvironmentId}
          editingEnvironmentId={editingEnvironmentId}
          form={environmentForm}
          saving={environmentSaving}
          onClose={() => setEnvironmentModalOpen(false)}
          onSelectEnvironment={selectEnvironmentForEdit}
          onCreateNew={startCreateEnvironment}
          onFormChange={setEnvironmentForm}
          onSave={saveEnvironment}
          onDelete={requestDeleteEnvironment}
        />
      )}

      {pendingConfirmation && (
        <ConfirmationModal
          tone="danger"
          title={pendingConfirmation.title}
          body={pendingConfirmation.body}
          confirmLabel={pendingConfirmation.confirmLabel}
          confirming={confirmingAction}
          onClose={() => !confirmingAction && setPendingConfirmation(null)}
          onConfirm={confirmPendingAction}
        />
      )}
    </div>
  );
}

function RepositoryPage({
  repos,
  repositorySources,
  runners,
  selectedEnvironment,
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
  const [editingRepo, setEditingRepo] = useState(null);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const formInitialized = useRef(false);

  const [form, setForm] = useState(() => createRepoForm(null, repositorySources));
  const [copied, setCopied] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selectedSource = useMemo(
    () => repositorySources.find((source) => source.id === form.repositorySourceId) || null,
    [form.repositorySourceId, repositorySources]
  );
  const providerOptions = useMemo(() => ([
    { value: 'github', label: t('repository.providerGithub'), badge: 'GH' },
    { value: 'gitee', label: t('repository.providerGitee'), badge: 'GI' },
    { value: 'gitlab', label: t('repository.providerGitlab'), badge: 'GL' },
    { value: 'generic', label: t('repository.providerGeneric'), badge: '::' }
  ]), [t]);
  const repositorySourceOptions = useMemo(
    () => repositorySources.map((source) => ({
      value: source.id,
      label: source.name,
      provider: providerLabel(locale, source.provider),
      description: source.repoUrl,
      hasDeployKey: source.hasDeployKey
    })),
    [locale, repositorySources]
  );

  // Fetch single repository detail (with webhookSecret) once when entering edit mode.
  useEffect(() => {
    if (!editId) {
      return;
    }
    let active = true;
    setLoadingRepo(true);
    api(`/api/repositories/${editId}`)
      .then((data) => {
        if (active) setEditingRepo(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingRepo(false);
      });
    return () => {
      active = false;
    };
  }, [editId, setError]);

  // Initialize the form exactly once per editId, after repo detail and sources are loaded.
  useEffect(() => {
    if (formInitialized.current) {
      return;
    }
    if (editId) {
      if (!editingRepo || repositorySources.length === 0) {
        return;
      }
      setForm(createRepoForm(editingRepo, repositorySources));
      formInitialized.current = true;
    } else {
      setForm(createRepoForm(null, repositorySources));
      formInitialized.current = true;
    }
  }, [editId, editingRepo, repositorySources]);

  function regenerateSecret() {
    setForm((current) => ({ ...current, webhookSecret: randomSecret() }));
  }

  function switchSourceMode(nextMode) {
    setForm((current) => {
      if (nextMode === 'existing') {
        return {
          ...current,
          sourceMode: 'existing',
          repositorySourceId: current.repositorySourceId || repositorySources[0]?.id || ''
        };
      }

      const source = repositorySources.find((item) => item.id === current.repositorySourceId);
      return {
        ...current,
        sourceMode: 'new',
        repositorySourceId: '',
        sourceName: current.sourceName || source?.name || editingRepo?.name || '',
        provider: current.provider || source?.provider || editingRepo?.provider || 'github',
        repoUrl: current.repoUrl || source?.repoUrl || editingRepo?.repoUrl || ''
      };
    });
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
      if (!selectedEnvironment?.id) {
        throw new Error(t('repository.noEnvironmentSelected'));
      }

      let repositorySourceId = form.repositorySourceId;

      if (form.sourceMode === 'new') {
        const createdSource = await api('/api/repository-sources', {
          method: 'POST',
          body: JSON.stringify({
            name: form.sourceName.trim(),
            provider: form.provider,
            repoUrl: form.repoUrl.trim(),
            deployKey: form.deployKey
          })
        });
        repositorySourceId = createdSource?.id || '';
      } else if (form.sourceMode === 'existing' && form.deployKey.trim() && repositorySourceId) {
        const existingSource = repositorySources.find((s) => s.id === repositorySourceId);
        if (existingSource) {
          await api(`/api/repository-sources/${repositorySourceId}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: existingSource.name,
              provider: existingSource.provider,
              repoUrl: existingSource.repoUrl,
              deployKey: form.deployKey
            })
          });
        }
      }

      const payload = {
        environmentId: selectedEnvironment.id,
        repositorySourceId,
        webhookSecret: form.webhookSecret,
        branch: form.branch,
        workDir: form.workDir,
        deployScript: form.deployScript,
        runnerId: form.runnerId || '',
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
    <div className="page-shell environment-shell" style={environmentShellStyle(selectedEnvironment)}>
      <header className="subpage-header">
        <div className="content-width subpage-header-inner">
          <div className="subpage-title">
            <h1>{isEditMode ? t('repository.titleEdit') : t('repository.titleCreate')}</h1>
            <p>{t('repository.description')}</p>
            {selectedEnvironment && (
              <EnvironmentBadge environment={selectedEnvironment} />
            )}
          </div>
          <div className="subpage-header-actions">
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard?tab=repositories', { replace: true })}>
              {t('repository.back')}
            </Button>
            <LocaleSwitch />
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
              title={t('repository.sourceTitle')}
              description={t('repository.sourceDescription')}
            />

            <div className="radio-list source-mode-list">
              <label className={form.sourceMode === 'existing' ? 'radio-card active' : 'radio-card'}>
                <input
                  type="radio"
                  name="sourceMode"
                  checked={form.sourceMode === 'existing'}
                  onChange={() => switchSourceMode('existing')}
                />
                <div>
                  <strong>{t('repository.sourceModeExisting')}</strong>
                  <p>{t('repository.sourceSharedHelp')}</p>
                </div>
              </label>

              <label className={form.sourceMode === 'new' ? 'radio-card active' : 'radio-card'}>
                <input
                  type="radio"
                  name="sourceMode"
                  checked={form.sourceMode === 'new'}
                  onChange={() => switchSourceMode('new')}
                />
                <div>
                  <strong>{t('repository.sourceModeNew')}</strong>
                  <p>{t('repository.sourceEmptyBody')}</p>
                </div>
              </label>
            </div>

            {form.sourceMode === 'existing' ? (
              <div className="stack-gap">
                <Field label={t('repository.sourceSelect')}>
                  <Select
                    variant="rich"
                    searchable
                    clearable
                    value={form.repositorySourceId}
                    placeholder={t('repository.sourceSelectPlaceholder')}
                    onChange={(nextValue) => setForm((current) => ({ ...current, repositorySourceId: nextValue }))}
                    options={repositorySourceOptions}
                    getOptionSearchText={(option) => [option.label, option.provider, option.description].join(' ')}
                    renderValue={(option) => (
                      <span className="select-value-rich">
                        <span className="select-value-text">
                          <strong>{option.label}</strong>
                          <small>{option.provider}</small>
                        </span>
                      </span>
                    )}
                    renderOption={(option, state) => (
                      <span className="select-option-rich">
                        <span className="select-option-copy">
                          <strong>{option.label}</strong>
                          <small>{option.provider} · {option.description}</small>
                        </span>
                        <span className="select-option-side">
                          {option.hasDeployKey ? <Badge tone="success">KEY</Badge> : null}
                          {state.selected ? <CheckIcon className="select-check" /> : null}
                        </span>
                      </span>
                    )}
                  />
                </Field>

                {selectedSource ? (
                  <div className="source-summary">
                    <div className="source-summary-head">
                      <strong>{t('repository.sourceSummary')}</strong>
                      <Badge tone={selectedSource.hasDeployKey ? 'success' : 'muted'}>
                        {selectedSource.hasDeployKey ? t('repository.deploymentKeyConfigured') : t('repository.deploymentKeyMissing')}
                      </Badge>
                    </div>
                    <div className="source-summary-grid">
                      <DetailCard label={t('repository.sourceName')} value={selectedSource.name} />
                      <DetailCard label={t('repository.platform')} value={providerLabel(locale, selectedSource.provider)} />
                      <DetailCard label={t('repository.sshUrl')} value={selectedSource.repoUrl} />
                    </div>
                    <Field label={t('repository.deploymentKey')} help={t('repository.deploymentKeyHelp')}>
                      <textarea
                        className="textarea mono"
                        value={form.deployKey}
                        onChange={(event) => setForm((current) => ({ ...current, deployKey: event.target.value }))}
                        placeholder={selectedSource.hasDeployKey ? t('repository.deploymentKeyPlaceholderEdit') : t('repository.deploymentKeyPlaceholderNew')}
                        rows={6}
                      />
                    </Field>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title={t('repository.sourceEmptyTitle')}
                    body={t('repository.sourceEmptyBody')}
                  />
                )}
              </div>
            ) : (
              <div className="stack-gap">
                <div className="form-grid two">
                  <Field label={t('repository.sourceName')}>
                    <input
                      className="input"
                      value={form.sourceName}
                      onChange={(event) => setForm((current) => ({ ...current, sourceName: event.target.value }))}
                      placeholder="frontend-app"
                      required={form.sourceMode === 'new'}
                    />
                  </Field>

                  <Field label={t('repository.platform')}>
                    <Select
                      value={form.provider}
                      onChange={(nextValue) => setForm((current) => ({ ...current, provider: nextValue }))}
                      options={providerOptions}
                    />
                  </Field>
                </div>

                <Field label={t('repository.sshUrl')}>
                  <input
                    className="input"
                    value={form.repoUrl}
                    onChange={(event) => setForm((current) => ({ ...current, repoUrl: event.target.value }))}
                    placeholder="git@github.com:org/repo.git"
                    required={form.sourceMode === 'new'}
                  />
                </Field>

                <Field label={t('repository.deploymentKey')} help={t('repository.deploymentKeyHelp')}>
                  <textarea
                    className="textarea mono"
                    value={form.deployKey}
                    onChange={(event) => setForm((current) => ({ ...current, deployKey: event.target.value }))}
                    placeholder={isEditMode ? t('repository.deploymentKeyPlaceholderEdit') : t('repository.deploymentKeyPlaceholderNew')}
                    rows={6}
                  />
                </Field>
              </div>
            )}
          </Card>

          <Card className="panel-card">
            <SectionTitle
              title={t('repository.basicTitle')}
              description={t('repository.basicDescription')}
            />

            <div className="form-grid two">
              <Field label={t('repository.bindingEnvironment')} help={t('repository.bindingEnvironmentHelp')}>
                <input
                  className="input"
                  value={selectedEnvironment?.name || t('dashboard.header.environmentEmpty')}
                  readOnly
                  disabled
                />
              </Field>

              <Field label={t('repository.branch')}>
                <input
                  className="input"
                  value={form.branch}
                  onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))}
                  placeholder="main"
                  required
                />
                <small className="field-help" aria-hidden="true">&nbsp;</small>
              </Field>
            </div>

            <Field label={t('repository.workDir')}>
              <input
                className="input"
                value={form.workDir}
                onChange={(event) => setForm((current) => ({ ...current, workDir: event.target.value }))}
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
                  onChange={() => setForm((current) => ({ ...current, runnerId: '' }))}
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
                    onChange={() => setForm((current) => ({ ...current, runnerId: String(runner.id) }))}
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
                    onChange={(event) => setForm((current) => ({ ...current, webhookSecret: event.target.value }))}
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
                onChange={(event) => setForm((current) => ({ ...current, deployScript: event.target.value }))}
                rows={12}
                required
              />
            </Field>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.cleanWorktree}
                onChange={(event) => setForm((current) => ({ ...current, cleanWorktree: event.target.checked }))}
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
  selectedEnvironment,
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
  const runnerModeOptions = useMemo(() => ([
    { value: 'local', label: t('runner.modeLocal'), badge: 'L' },
    { value: 'ssh', label: t('runner.modeSsh'), badge: 'SSH' }
  ]), [t]);

  return (
    <div className="page-shell environment-shell" style={environmentShellStyle(selectedEnvironment)}>
      <header className="subpage-header">
        <div className="content-width subpage-header-inner">
          <div className="subpage-title">
            <h1>{isEditMode ? t('runner.titleEdit') : t('runner.titleCreate')}</h1>
            <p>{t('runner.description')}</p>
            {selectedEnvironment && (
              <EnvironmentBadge environment={selectedEnvironment} />
            )}
          </div>
          <div className="subpage-header-actions">
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard?tab=runners', { replace: true })}>
              {t('runner.back')}
            </Button>
            <LocaleSwitch />
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
                <Select
                  value={form.mode}
                  onChange={(nextValue) => setForm({ ...form, mode: nextValue })}
                  options={runnerModeOptions}
                />
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

function EnvironmentSwitcher({ environments, selectedEnvironmentId, onChange }) {
  const { t } = useI18n();
  const environmentOptions = useMemo(
    () => environments.map((environment) => ({
      value: environment.id,
      label: environment.name,
      color: environment.color || '#ef3150',
      meta: environment.slug || ''
    })),
    [environments]
  );

  return (
    <label className="environment-switcher">
      <span className="environment-switcher-label">{t('dashboard.header.environment')}</span>
      <Select
        variant="rich"
        className="environment-switcher-select"
        triggerClassName="environment-switcher-trigger"
        menuClassName="environment-switcher-menu"
        value={selectedEnvironmentId}
        onChange={onChange}
        placeholder={t('dashboard.header.environmentEmpty')}
        disabled={!environments.length}
        options={environmentOptions}
        renderValue={(option) => (
          <span className="environment-select-value">
            <span className="select-color-dot" style={{ '--dot-color': option.color }} />
            <strong>{option.label}</strong>
          </span>
        )}
        renderOption={(option, state) => (
          <span className="environment-select-option">
            <span className="environment-select-copy">
              <span className="select-color-dot" style={{ '--dot-color': option.color }} />
              <span>
                <strong>{option.label}</strong>
                {option.meta ? <small>{option.meta}</small> : null}
              </span>
            </span>
            {state.selected ? <CheckIcon className="select-check" /> : null}
          </span>
        )}
      />
    </label>
  );
}

function EnvironmentBadge({ environment }) {
  if (!environment) {
    return null;
  }

  return (
    <span className="environment-badge">
      <span className="environment-badge-dot" aria-hidden="true" />
      {environment.name}
    </span>
  );
}

function EnvironmentManagerModal({
  environments,
  selectedEnvironmentId,
  editingEnvironmentId,
  form,
  saving,
  onClose,
  onSelectEnvironment,
  onCreateNew,
  onFormChange,
  onSave,
  onDelete
}) {
  const { t } = useI18n();
  const isEditingExisting = Boolean(editingEnvironmentId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-shell environment-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{t('environments.title')}</h2>
            <p className="panel-description">{t('environments.description')}</p>
          </div>
          <Button
            type="button"
            variant="text"
            className="modal-close"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <span className="modal-close-text">{t('common.close')}</span>
            <CloseIcon className="modal-close-icon" />
          </Button>
        </div>

        <div className="environment-manager">
          <div className="environment-list">
            <div className="section-head-actions">
              <Button type="button" variant="outline" size="sm" onClick={onCreateNew}>
                {t('environments.create')}
              </Button>
            </div>
            {environments.length ? environments.map((environment) => (
              <button
                key={environment.id}
                type="button"
                className={`environment-list-item ${editingEnvironmentId === environment.id ? 'active' : ''}`.trim()}
                onClick={() => onSelectEnvironment(environment)}
              >
                <span className="environment-list-main">
                  <span className="select-color-dot" style={{ '--dot-color': environment.color || '#D83B53' }} />
                  <span>
                    <strong>{environment.name}</strong>
                    <small>{environment.slug}</small>
                  </span>
                </span>
                {selectedEnvironmentId === environment.id ? <Badge tone="secondary">{t('common.current')}</Badge> : null}
              </button>
            )) : (
              <EmptyState compact title={t('environments.empty')} body={t('dashboard.header.environmentEmpty')} />
            )}
          </div>

          <Card className="panel-card environment-editor">
            <form className="form-stack" onSubmit={onSave}>
              <div className="form-grid two environment-form-grid">
                <Field label={t('environments.name')} help=" ">
                  <input
                    className="input"
                    value={form.name}
                    onChange={(event) => onFormChange((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Production"
                    required
                  />
                </Field>

                <Field label={t('environments.slug')} help={t('environments.slugHelp')}>
                  <input
                    className="input mono"
                    value={form.slug}
                    onChange={(event) => onFormChange((current) => ({ ...current, slug: slugifyEnvironmentName(event.target.value) }))}
                    placeholder="production"
                    required
                  />
                </Field>
              </div>

              <Field label={t('environments.descriptionLabel')}>
                <input
                  className="input"
                  value={form.description}
                  onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))}
                  placeholder=""
                />
              </Field>

              <Field label={t('environments.color')}>
                <div className="color-swatch-row">
                  {ENVIRONMENT_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${form.color === color ? 'active' : ''}`.trim()}
                      style={{ '--swatch-color': color }}
                      onClick={() => onFormChange((current) => ({ ...current, color }))}
                      aria-label={color}
                    />
                  ))}
                </div>
              </Field>

              <div className="environment-hint">
                {form.slug === 'production' ? t('environments.productionHint') : null}
                {form.slug === 'testing' ? t('environments.testingHint') : null}
              </div>

              <div className="form-actions">
                <Button type="submit" disabled={saving}>
                  {saving ? t('common.saving') : (isEditingExisting ? t('environments.saveUpdate') : t('environments.saveCreate'))}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={onDelete}
                  disabled={!isEditingExisting}
                  title={isEditingExisting ? '' : t('environments.cannotDelete')}
                >
                  {t('environments.delete')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ConfirmationModal({
  tone = 'danger',
  title,
  body,
  confirmLabel,
  confirming = false,
  onClose,
  onConfirm
}) {
  const { t } = useI18n();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-shell confirmation-modal confirmation-modal-${tone}`.trim()}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p className="panel-description">{body}</p>
          </div>
          <Button
            type="button"
            variant="text"
            className="modal-close"
            onClick={onClose}
            disabled={confirming}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <span className="modal-close-text">{t('common.close')}</span>
            <CloseIcon className="modal-close-icon" />
          </Button>
        </div>

        <div className="confirmation-modal-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={confirming}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={confirming}>
            {confirming ? t('common.loading') : confirmLabel}
          </Button>
        </div>
      </div>
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

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  variant = 'compact',
  searchable = false,
  clearable = false,
  className = '',
  menuClassName = '',
  triggerClassName = '',
  renderOption,
  renderValue,
  getOptionSearchText
}) {
  const { t } = useI18n();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value]
  );
  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return options;
    }

    return options.filter((option) => {
      const haystack = (getOptionSearchText?.(option) || [
        option.label,
        option.description,
        option.meta,
        option.badge
      ].filter(Boolean).join(' ')).toLowerCase();
      return haystack.includes(keyword);
    });
  }, [getOptionSearchText, options, query]);
  const [highlightedIndex, setHighlightedIndex] = useState(() => {
    if (!selectedOption) {
      return 0;
    }
    return Math.max(0, filteredOptions.findIndex((option) => String(option.value) === String(selectedOption.value)));
  });

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (searchable) {
      searchRef.current?.focus();
      return;
    }
    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, open, searchable]);

  useEffect(() => {
    const selectedIndex = selectedOption
      ? filteredOptions.findIndex((option) => String(option.value) === String(selectedOption.value))
      : -1;
    setHighlightedIndex(Math.max(0, selectedIndex));
  }, [filteredOptions, selectedOption]);

  function closeMenu() {
    setOpen(false);
    setQuery('');
  }

  function selectValue(nextValue) {
    onChange?.(nextValue);
    closeMenu();
  }

  function moveHighlight(direction) {
    if (!filteredOptions.length) {
      return;
    }
    setHighlightedIndex((current) => {
      const nextIndex = current + direction;
      if (nextIndex < 0) {
        return filteredOptions.length - 1;
      }
      if (nextIndex >= filteredOptions.length) {
        return 0;
      }
      return nextIndex;
    });
  }

  function handleTriggerKeyDown(event) {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions[highlightedIndex];
      if (option) {
        selectValue(option.value);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  return (
    <div
      ref={rootRef}
      className={`select select-${variant} ${open ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className={`select-trigger ${triggerClassName}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="select-trigger-value">
          {selectedOption
            ? (renderValue ? renderValue(selectedOption) : <DefaultSelectValue option={selectedOption} />)
            : <span className="select-placeholder">{placeholder || t('select.placeholder')}</span>}
        </span>
        <span className="select-trigger-icon" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div className={`select-menu ${menuClassName}`.trim()} onKeyDown={handleMenuKeyDown}>
          {searchable && (
            <div className="select-search-shell">
              <SearchIcon className="select-search-icon" />
              <input
                ref={searchRef}
                className="select-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('common.search')}
              />
            </div>
          )}

          <div className="select-options" role="listbox">
            {filteredOptions.length ? (
              filteredOptions.map((option, index) => {
                const selected = String(option.value) === String(value);
                const highlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`select-option ${selected ? 'selected' : ''} ${highlighted ? 'highlighted' : ''}`.trim()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectValue(option.value)}
                  >
                    {renderOption
                      ? renderOption(option, { selected, highlighted })
                      : <DefaultSelectOption option={option} selected={selected} />}
                  </button>
                );
              })
            ) : (
              <div className="select-empty">{t('select.noResults')}</div>
            )}
          </div>

          {clearable && value ? (
            <div className="select-menu-footer">
              <button
                type="button"
                className="select-clear"
                onClick={() => selectValue('')}
              >
                {t('common.clear')}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DefaultSelectValue({ option }) {
  return (
    <span className="select-value-default">
      {option.color ? <span className="select-color-dot" style={{ '--dot-color': option.color }} /> : null}
      {option.badge ? <span className="select-inline-badge">{option.badge}</span> : null}
      <span>{option.label}</span>
    </span>
  );
}

function DefaultSelectOption({ option, selected }) {
  return (
    <span className="select-option-default">
      <span className="select-option-main">
        {option.color ? <span className="select-color-dot" style={{ '--dot-color': option.color }} /> : null}
        {option.badge ? <span className="select-inline-badge">{option.badge}</span> : null}
        <span>{option.label}</span>
      </span>
      {selected ? <CheckIcon className="select-check" /> : null}
    </span>
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

function RepoCard({ repo, secrets = [], onCopy, onEdit, onTrigger, onDelete }) {
  const { locale, t } = useI18n();
  const availableSecrets = useMemo(() => {
    return secrets.filter((s) => !s.repositoryId || String(s.repositoryId) === String(repo.id));
  }, [secrets, repo.id]);
  return (
    <Card className="repo-card">
      <div className="repo-top">
        <div>
          <strong>{repo.name}</strong>
          <p>{providerLabel(locale, repo.provider)} · {repo.branch} · {repo.runner || repo.runnerName || t('common.localRunner')}</p>
        </div>
        <Status status={repo.lastJobStatus} />
      </div>

      <div className="repo-grid">
        <MetaBlock
          label={t('labels.repositorySource')}
          value={repo.name}
        />
        <MetaBlock
          label={t('labels.repositoryUrl')}
          value={repo.repoUrl}
        />
        <MetaBlock
          label={t('labels.deploymentKey')}
          value={repo.hasDeployKey ? t('repository.deploymentKeyConfigured') : t('repository.deploymentKeyMissing')}
        />
        <MetaBlock
          label={t('labels.webhookUrl')}
          value={repo.webhookUrl}
          copyValue={repo.webhookUrl}
          onCopy={onCopy}
        />
        <MetaBlock
          label={t('labels.webhookSecret')}
          value={repo.hasWebhookSecret ? t('repository.deploymentKeyConfigured') : t('repository.deploymentKeyMissing')}
        />
      </div>

      <div className="repo-secrets">
        <span className="repo-secrets-label">{t('dashboard.secrets.availableLabel')}</span>
        {availableSecrets.length ? (
          <div className="repo-secrets-list">
            {availableSecrets.map((s) => (
              <span key={s.id} className={`secret-chip${s.repositoryId ? ' scoped' : ''}`}>
                <code>{s.name}</code>
                <em>{s.repositoryId ? t('dashboard.secrets.scopeRepo') : t('dashboard.secrets.scopeGlobal')}</em>
              </span>
            ))}
          </div>
        ) : (
          <span className="repo-secrets-empty">{t('dashboard.secrets.availableEmpty')}</span>
        )}
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

function SecretCard({ secret, onEdit, onDelete }) {
  const { t } = useI18n();
  return (
    <Card className="secret-card">
      <div className="secret-main">
        <div>
          <strong className="mono">{secret.name}</strong>
          <p>{secret.repository || t('dashboard.secrets.globalDescription')}</p>
        </div>
        <code>{secret.maskedValue || '••••'}</code>
      </div>
      <div className="repo-actions">
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

function MetaBlock({ label, value, copyValue, onCopy }) {
  const { t } = useI18n();
  const canCopy = Boolean(copyValue);
  const ariaLabel = `${t('common.copy')} ${label}`;
  return (
    <div className="meta-block">
      <span>{label}</span>
      {canCopy ? (
        <div className="meta-block-copy">
          <code>{value || '-'}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="icon-button"
            aria-label={ariaLabel}
            title={ariaLabel}
            onClick={() => onCopy(copyValue, label)}
          >
            <CopyIcon />
          </Button>
        </div>
      ) : (
        <code>{value || '-'}</code>
      )}
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
