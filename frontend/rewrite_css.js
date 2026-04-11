const fs = require('fs');

const css = \`:root {
  --brand-blue: #2fa8f4;
  --brand-blue-dark: #1b8cd2;
  --brand-blue-soft: #eaf5ff;
  --brand-red: #f22645;
  --brand-red-dark: #d41834;
  --brand-red-soft: #ffeef1;

  --bg: #f4f7f9;
  --surface: #ffffff;
  --surface-raised: #f8fafc;

  --border: #d1d9e0;
  --border-strong: #aebbc7;

  --ink: #1a232c;
  --muted: #5c6a77;
  --faint: #98a7b5;

  --success: #10b981;
  --success-soft: #d1fae5;
  --success-text: #047857;

  --warning: #f59e0b;
  --warning-soft: #fef3c7;
  --warning-text: #b45309;

  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;

  --shadow-sm: 0 2px 4px rgba(26,35,44,.04);
  --shadow: 0 8px 24px rgba(26,35,44,.06);
  --shadow-lg: 0 20px 48px rgba(26,35,44,.08);

  color: var(--ink);
  background: var(--bg);
  font-family: "PingFang SC", "Microsoft YaHei", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; }
button, input, select, textarea { font: inherit; }
h1, h2, h3 { line-height: 1.25; margin-top: 0; color: var(--ink); }
h1 { font-size: clamp(1.8rem, 3vw, 2.4rem); margin-bottom: 0; font-weight: 800; }
h2 { font-size: 1.35rem; margin-bottom: 0; font-weight: 700; }
p { margin-top: 0; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.9em; }

/* ── Inputs ── */
input, select, textarea {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  min-width: 0;
  outline: none;
  padding: 10px 14px;
  transition: border-color 120ms, box-shadow 120ms;
  width: 100%;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--brand-blue);
  box-shadow: 0 0 0 3px var(--brand-blue-soft);
}
input:disabled, textarea:disabled, select:disabled {
  background: var(--surface-raised);
  color: var(--faint);
  cursor: not-allowed;
}
textarea { min-height: 108px; resize: vertical; }
textarea.script {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.95rem;
  min-height: 160px;
}

/* ── Buttons ── */
button {
  align-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  font-size: 1rem;
  font-weight: 600;
  gap: 6px;
  justify-content: center;
  min-height: 38px;
  padding: 0 16px;
  transition: all 120ms;
  white-space: nowrap;
}
button:disabled { cursor: not-allowed; opacity: .6; }

.primary-action { background: var(--brand-blue); color: #fff; }
.primary-action:hover:not(:disabled) { background: var(--brand-blue-dark); box-shadow: 0 4px 12px rgba(47,168,244,.2); }

.secondary-action { background: var(--surface); border: 1px solid var(--border-strong); color: var(--ink); }
.secondary-action:hover:not(:disabled) { background: var(--surface-raised); border-color: var(--muted); }

.danger-action { background: var(--brand-red-soft); color: var(--brand-red-dark); }
.danger-action:hover:not(:disabled) { background: #ffdbe0; }

.text-action { background: transparent; color: var(--muted); padding: 4px 8px; min-height: auto; }
.text-action:hover { color: var(--ink); background: var(--border); }

/* ── Utilities ── */
.centered { align-items: center; display: flex; justify-content: center; min-height: 100vh; }
.eyebrow { color: var(--brand-blue-dark); font-size: 0.875rem; font-weight: 700; letter-spacing: .05em; margin: 0 0 6px; text-transform: uppercase; }
.hint { color: var(--muted); font-size: 0.95rem; line-height: 1.5; }

/* ── Boot ── */
.boot-card { align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); display: flex; gap: 16px; padding: 24px 32px; font-size: 1.1rem; }

/* ── Auth ── */
.auth-page { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(400px, 0.8fr); min-height: 100vh; }

.auth-visual {
  background: linear-gradient(145deg, rgba(47, 168, 244, 0.08), rgba(242, 38, 69, 0.05)), #ffffff;
  min-height: 100vh;
  overflow: hidden;
  position: relative;
  border-right: 1px solid var(--border);
}
.auth-logo-art {
  border-radius: var(--radius);
  box-shadow: 0 24px 60px rgba(0,0,0,.08);
  max-width: min(720px, 65vw);
  object-fit: contain;
  opacity: 0.85;
  position: absolute;
  right: clamp(-100px, -6vw, -20px);
  top: 80px;
  width: 50vw;
  z-index: 0;
}
.auth-visual-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: flex-end;
  max-width: 680px;
  padding: 64px;
  position: relative;
  z-index: 2;
}
.auth-visual-content h1 { color: var(--ink); margin: auto 0 16px; max-width: 580px; text-shadow: 0 2px 10px rgba(255,255,255,0.8); }
.auth-visual-content p { color: var(--muted); font-size: 1.15rem; margin-bottom: 32px; max-width: 480px; font-weight: 500; }
.auth-metrics { display: flex; flex-wrap: wrap; gap: 10px; }
.auth-metrics span {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 0.95rem;
  font-weight: 600;
  padding: 8px 14px;
  box-shadow: var(--shadow-sm);
}

.auth-panel { align-self: center; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); justify-self: center; max-width: 440px; padding: 40px; width: calc(100% - 48px); border: 1px solid var(--border); }
.auth-panel h2 { font-size: 1.8rem; margin-bottom: 28px; }
.auth-field { display: grid; gap: 8px; margin-bottom: 20px; }
.auth-field span { color: var(--ink); font-size: 0.95rem; font-weight: 600; }
.auth-field input { min-height: 44px; font-size: 1rem; }
.auth-panel .primary-action { height: 46px; margin-top: 8px; width: 100%; font-size: 1.1rem; }
.auth-panel .hint { margin-top: 24px; text-align: center; }

/* ── Brand ── */
.brand-lockup { align-items: center; display: flex; gap: 12px; }
.brand-lockup strong { color: var(--ink); display: block; font-size: 1.05rem; line-height: 1.2; }
.brand-lockup span { color: var(--muted); display: block; font-size: 0.85rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.brand-mark { background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); display: inline-flex; flex-shrink: 0; height: 38px; object-fit: contain; padding: 4px; width: 56px; box-shadow: var(--shadow-sm); }

/* ── App shell ── */
.app-shell { display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: 100vh; }

/* ── Sidebar ── */
.sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; height: 100vh; padding: 24px 16px; position: sticky; top: 0; }
.sidebar .brand-lockup { margin-bottom: 32px; padding: 0 8px; }
.side-nav { display: flex; flex-direction: column; flex: 1; gap: 4px; }
.side-nav a, .side-nav button { align-items: center; background: transparent; border-radius: var(--radius-sm); color: var(--muted); display: flex; font-size: 1.05rem; font-weight: 600; gap: 12px; padding: 12px 14px; text-decoration: none; transition: all 120ms; width: 100%; border: 0; }
.side-nav a:hover, .side-nav button:hover { background: var(--bg); color: var(--ink); }
.side-nav a.active { background: var(--brand-blue-soft); color: var(--brand-blue-dark); }
.side-nav-divider { border: 0; border-top: 1px solid var(--border); margin: 12px 0; }
.side-footer { border-top: 1px solid var(--border); margin-top: auto; padding-top: 16px; }
.side-status { align-items: center; border-radius: var(--radius-sm); display: flex; gap: 12px; padding: 12px; background: var(--bg); border: 1px solid var(--border); }
.side-status strong { color: var(--ink); display: block; font-size: 0.95rem; margin-bottom: 2px; }
.side-status p { color: var(--muted); font-size: 0.85rem; margin: 0; }
.status-dot { background: var(--success); border-radius: 999px; box-shadow: 0 0 0 3px var(--success-soft); display: inline-block; flex-shrink: 0; height: 10px; width: 10px; }

/* ── Workspace ── */
.workspace { align-content: start; display: grid; gap: 24px; margin: 0 auto; max-width: 1440px; padding: 32px; width: 100%; }
.workspace-topbar { align-items: center; display: flex; justify-content: space-between; }
.workspace-topbar h1 { font-size: 1.6rem; }
.workspace-actions, .panel-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; }
.operator-menu { align-items: center; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); display: flex; gap: 12px; padding: 4px 4px 4px 16px; box-shadow: var(--shadow-sm); }
.operator-menu span { font-size: 0.95rem; font-weight: 600; }

/* ── Toast ── */
.toast-stack { display: grid; gap: 12px; position: fixed; right: 24px; top: 24px; width: 380px; z-index: 999; }
.toast { align-items: flex-start; animation: toastIn 200ms cubic-bezier(0.16, 1, 0.3, 1); background: var(--surface); border: 1px solid var(--border-strong); border-left: 5px solid var(--brand-blue); border-radius: var(--radius); box-shadow: var(--shadow-lg); display: flex; gap: 16px; justify-content: space-between; padding: 16px 20px; font-size: 1rem; font-weight: 500; }
.toast.error { border-left-color: var(--brand-red); }
@keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }

/* ── Hero panel ── */
.hero-panel { align-items: center; background: var(--surface); border: 1px solid var(--border); border-top: 4px solid var(--brand-blue); border-radius: var(--radius-lg); box-shadow: var(--shadow); display: flex; gap: 24px; justify-content: space-between; padding: 28px 32px; }
.hero-panel h2 { font-size: clamp(1.4rem, 2.2vw, 2rem); margin-bottom: 8px; }
.hero-panel p { color: var(--muted); margin-bottom: 0; font-size: 1.05rem; }

/* ── Metrics ── */
.metric-grid { display: grid; gap: 16px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.metric { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 24px; }
.metric-label { color: var(--muted); display: block; font-size: 0.9rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 8px; }
.metric-value { display: block; font-size: 2.4rem; font-weight: 800; line-height: 1.1; margin: 0 0 8px; color: var(--ink); }
.metric-caption { color: var(--faint); font-size: 0.9rem; margin: 0; }
.metric.danger .metric-value { color: var(--brand-red); }

/* ── Config drawer ── */
.config-drawer { display: grid; gap: 20px; }
.config-drawer.onboarding { align-items: start; grid-template-columns: minmax(280px, 0.45fr) minmax(0, 1fr); }
.config-drawer:not(.onboarding) .config-panel { max-width: 960px; }

.onboarding-copy { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--brand-red); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 28px; }
.onboarding-copy h2 { font-size: 1.4rem; margin-bottom: 12px; }
.onboarding-copy p:not(.eyebrow) { color: var(--muted); margin-bottom: 20px; font-size: 1.05rem; }

/* ── Panels ── */
.config-panel, .resource-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 28px; }
.primary-config { min-width: 0; }
.panel-title { align-items: center; display: flex; justify-content: space-between; margin-bottom: 20px; }

/* ── Forms ── */
.field { display: grid; gap: 8px; margin-bottom: 16px; }
.field > span { color: var(--ink); font-size: 0.95rem; font-weight: 600; }
.form-grid { display: grid; gap: 16px; }
.form-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-error { background: var(--brand-red-soft); border: 1px solid #fecaca; border-radius: var(--radius-sm); color: var(--danger-text); font-size: 0.95rem; padding: 12px 16px; font-weight: 500; }
.switch-row { align-items: center; display: flex; gap: 12px; margin: 0 0 16px; }
.switch-row input { accent-color: var(--brand-blue); width: auto; transform: scale(1.1); }
.switch-row span { color: var(--ink); font-size: 1rem; font-weight: 600; }

/* ── Repo list ── */
.repo-list { display: grid; gap: 12px; }
.repo-row { border: 1px solid var(--border); border-radius: var(--radius); display: grid; grid-template-columns: minmax(0, 1fr) auto; overflow: hidden; transition: box-shadow 120ms; background: var(--surface); box-shadow: var(--shadow-sm); }
.repo-row:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }
.repo-main { min-width: 0; padding: 16px 20px; }
.repo-heading { align-items: center; display: flex; gap: 12px; margin-bottom: 6px; }
.repo-heading strong { font-size: 1.1rem; }
.repo-meta { color: var(--muted); font-size: 0.95rem; margin-bottom: 12px; font-weight: 500; }
.repo-code-block { display: grid; gap: 6px; }
.repo-main code { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); display: block; font-size: 0.9rem; max-width: 820px; overflow-wrap: anywhere; padding: 8px 12px; color: var(--ink); }
.row-actions { align-content: center; border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--bg); }

/* ── Runner list ── */
.runner-list { border-top: 1px solid var(--border); display: grid; gap: 10px; margin-top: 20px; padding-top: 20px; }
.runner-item { align-items: center; border: 1px solid var(--border); border-radius: var(--radius); display: flex; gap: 16px; justify-content: space-between; padding: 14px 20px; background: var(--surface); box-shadow: var(--shadow-sm); }
.runner-item strong { font-size: 1.05rem; }
.runner-item p { color: var(--muted); font-size: 0.95rem; margin: 4px 0 0; }
.runner-item .row-actions { border-left: 0; flex-direction: row; padding: 0; background: transparent; }

/* ── Activity ── */
.activity-grid { display: grid; gap: 24px; grid-template-columns: minmax(360px, 0.8fr) minmax(0, 1.2fr); }
.job-list { display: grid; gap: 8px; }
.job { align-items: flex-start; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--ink); cursor: pointer; display: grid; gap: 6px; justify-items: start; padding: 14px 16px; text-align: left; transition: all 120ms; box-shadow: var(--shadow-sm); }
.job:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }
.job.active { background: var(--brand-blue-soft); border-color: var(--brand-blue); box-shadow: inset 4px 0 0 var(--brand-blue); }
.job-title { font-size: 1rem; font-weight: 700; }
.job-meta { color: var(--muted); font-size: 0.9rem; font-weight: 500; }

/* ── Logs ── */
.logs { background: #1e293b; border-radius: var(--radius); color: #f8fafc; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.95rem; line-height: 1.6; margin: 0; max-height: 700px; min-height: 400px; overflow: auto; padding: 20px; white-space: pre-wrap; word-break: break-all; border: 1px solid var(--ink); box-shadow: inset 0 2px 8px rgba(0,0,0,0.2); }
.log-line { display: block; }
.log-line.stderr { color: #fca5a5; }
.log-line.system { color: #94a3b8; font-style: italic; }
.log-line.stdout { color: #e2e8f0; }

/* ── Empty state ── */
.empty-state { border: 2px dashed var(--border-strong); border-radius: var(--radius); display: grid; gap: 8px; justify-items: start; padding: 28px; background: var(--surface-raised); }
.empty-state.compact { border-left: 0; border-right: 0; border-top: 1px solid var(--border); border-bottom: 0; border-radius: 0; margin-top: 16px; padding: 20px 0 0; background: transparent; border-style: solid; }
.empty-state strong { font-size: 1.1rem; color: var(--ink); }
.empty-state p { color: var(--muted); font-size: 1rem; margin-bottom: 0; }

/* ── Status badges ── */
.status { border-radius: 999px; display: inline-flex; font-size: 0.85rem; font-weight: 700; letter-spacing: .03em; padding: 4px 12px; text-transform: uppercase; width: max-content; }
.status.succeeded { background: var(--success-soft); color: var(--success-text); }
.status.failed { background: var(--danger-soft); color: var(--danger-text); }
.status.running, .status.queued { background: var(--warning-soft); color: var(--warning-text); }
.status.ignored, .status.idle { background: var(--border); color: var(--muted); }

/* ── Responsive ── */
@media (max-width: 1180px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { align-items: center; flex-direction: row; gap: 16px; height: auto; overflow-x: auto; padding: 16px 20px; position: static; border-right: 0; border-bottom: 1px solid var(--border); }
  .sidebar .brand-lockup { margin-bottom: 0; }
  .side-nav { align-items: center; flex-direction: row; flex: unset; margin-left: auto; }
  .side-nav-divider, .side-footer { display: none; }
  .config-drawer.onboarding, .activity-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .auth-page { grid-template-columns: 1fr; }
  .auth-visual { min-height: 32vh; border-right: 0; border-bottom: 1px solid var(--border); }
  .auth-visual-content { padding: 32px; }
  .auth-visual-content h1 { font-size: 1.8rem; }
  .auth-panel { margin: 24px 0 40px; border: 0; box-shadow: none; padding: 24px; }
  .metric-grid, .form-grid.two { grid-template-columns: 1fr; }
  .workspace { padding: 20px; }
  .workspace-topbar { flex-direction: column; align-items: flex-start; gap: 16px; }
  .hero-panel { flex-direction: column; align-items: flex-start; }
  .repo-row { grid-template-columns: 1fr; }
  .row-actions { border-left: 0; border-top: 1px solid var(--border); flex-direction: row; flex-wrap: wrap; padding: 12px 16px; }
  .operator-menu { width: 100%; justify-content: space-between; }
  .workspace-actions { justify-content: flex-start; width: 100%; }
  .toast-stack { right: 16px; width: calc(100vw - 32px); }
}
@media (max-width: 620px) {
  .sidebar { align-items: flex-start; flex-direction: column; }
  .side-nav { margin-left: 0; width: 100%; overflow-x: auto; }
  .workspace-actions, .panel-actions { display: grid; grid-template-columns: 1fr; width: 100%; }
  .config-panel, .onboarding-copy, .resource-panel, .hero-panel { padding: 20px; }
}
\`;

fs.writeFileSync('/Users/ezmo/Projects/Private/candy/frontend/src/styles.css', css);
console.log('CSS Re-written!');
