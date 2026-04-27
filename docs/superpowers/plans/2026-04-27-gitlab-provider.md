# GitLab Provider Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class GitLab provider support across source selection, webhook verification, push event handling, and documentation.

**Architecture:** Extend the existing provider branching model in place instead of introducing a new adapter layer. Keep the change additive: backend webhook/provider logic gains a GitLab branch, frontend provider selectors gain a GitLab option, and docs gain GitLab setup guidance.

**Tech Stack:** Go, SQLite-backed backend, React/Vite frontend, existing webhook tests, README docs

---

### Task 1: Add failing backend coverage for GitLab webhook behavior

**Files:**
- Modify: `backend/internal/candy/webhook_test.go`
- Check: `backend/internal/candy/webhook.go`

- [ ] **Step 1: Add a test for accepted GitLab push webhooks**

Add a test that creates a GitLab-backed environment repository, sends a push webhook with a matching `X-Gitlab-Token`, and asserts the request is accepted and a job is queued.

```go
func TestGitLabPushWebhookQueuesDeployment(t *testing.T) {
	ctx := context.Background()
	app := newTestApp(t)

	env, err := app.store.getEnvironmentBySlug(ctx, "production")
	if err != nil {
		t.Fatalf("getEnvironmentBySlug() error = %v", err)
	}
	source, err := app.store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "gitlab-source",
		Provider:  "gitlab",
		RepoURL:   "git@gitlab.com:team/app.git",
		DeployKey: "PRIVATE KEY",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}
	repo, err := app.store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentID:      env.ID,
		RepositorySourceID: source.ID,
		Branch:             "main",
		WorkDir:            "/srv/app",
		DeployScript:       "echo deploy",
		WebhookSecret:      "gitlab-secret",
		CleanWorktree:      true,
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository() error = %v", err)
	}

	body := []byte(`{
		"ref":"refs/heads/main",
		"after":"0123456789abcdef0123456789abcdef01234567",
		"user_name":"alice",
		"commits":[{"id":"0123456789abcdef0123456789abcdef01234567","message":"ship it","author":{"name":"alice"}}]
	}`)
	req := httptest.NewRequest(http.MethodPost, "/webhooks/"+repo.WebhookID, bytes.NewReader(body))
	req.SetPathValue("id", repo.WebhookID)
	req.Header.Set("X-Gitlab-Event", "Push Hook")
	req.Header.Set("X-Gitlab-Token", "gitlab-secret")
	req.Header.Set("X-Request-Id", "gitlab-delivery-1")

	rec := httptest.NewRecorder()
	app.handleWebhook(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	jobs, err := app.store.ListJobs(ctx, repo.InternalID)
	if err != nil {
		t.Fatalf("ListJobs() error = %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("jobs len = %d, want 1", len(jobs))
	}
	if jobs[0].Provider != "gitlab" {
		t.Fatalf("provider = %q, want gitlab", jobs[0].Provider)
	}
	if jobs[0].DeliveryID != "gitlab-delivery-1" {
		t.Fatalf("delivery = %q, want gitlab-delivery-1", jobs[0].DeliveryID)
	}
}
```

- [ ] **Step 2: Add rejection tests for missing and invalid GitLab tokens**

Add two focused tests that prove GitLab requests are rejected when `X-Gitlab-Token` is absent or mismatched.

```go
func TestGitLabWebhookRejectsMissingToken(t *testing.T) { /* same setup, no X-Gitlab-Token, expect 401 */ }

func TestGitLabWebhookRejectsInvalidToken(t *testing.T) { /* same setup, wrong token, expect 401 */ }
```

- [ ] **Step 3: Run webhook tests to verify they fail for missing GitLab support**

Run: `env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestGitLab'`

Expected: FAIL with unsupported provider / missing GitLab handling assertions.


### Task 2: Implement GitLab backend provider support

**Files:**
- Modify: `backend/internal/candy/webhook.go`
- Modify: `backend/internal/candy/store.go`
- Modify: `backend/internal/candy/api.go`

- [ ] **Step 1: Extend provider normalization to accept GitLab**

Update the shared provider normalization branch so `gitlab` survives normalization instead of collapsing to another provider.

```go
func normalizeProvider(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "gitee":
		return "gitee"
	case "gitlab":
		return "gitlab"
	case "generic":
		return "generic"
	default:
		return "github"
	}
}
```

- [ ] **Step 2: Add GitLab detection, event, delivery, and verification branches**

Extend the webhook helpers in `webhook.go` to recognize GitLab headers and validate `X-Gitlab-Token` with constant-time comparison.

```go
func detectProvider(r *http.Request) string {
	if r.Header.Get("X-Gitee-Event") != "" || r.Header.Get("X-Gitee-Token") != "" {
		return "gitee"
	}
	if r.Header.Get("X-Gitlab-Event") != "" || r.Header.Get("X-Gitlab-Token") != "" {
		return "gitlab"
	}
	return "github"
}

func verifyWebhookSignature(provider, secret string, r *http.Request, body []byte) error {
	if strings.TrimSpace(secret) == "" {
		return errors.New("webhook secret is not configured")
	}
	switch provider {
	case "gitee":
		return verifyGiteeSignature(secret, r)
	case "gitlab":
		return verifyGitLabToken(secret, r)
	default:
		return verifyGitHubSignature(secret, r, body)
	}
}

func verifyGitLabToken(secret string, r *http.Request) error {
	token := strings.TrimSpace(r.Header.Get("X-Gitlab-Token"))
	if token == "" {
		return errors.New("missing X-Gitlab-Token")
	}
	if subtle.ConstantTimeCompare([]byte(secret), []byte(token)) != 1 {
		return errors.New("invalid GitLab token")
	}
	return nil
}
```

- [ ] **Step 3: Teach webhook helpers about GitLab push semantics**

Update GitLab event parsing and delivery ID extraction without changing GitHub/Gitee behavior.

```go
func webhookEvent(provider string, r *http.Request, payload pushPayload) string {
	switch provider {
	case "gitee":
		if event := r.Header.Get("X-Gitee-Event"); event != "" {
			return event
		}
		return payload.HookName
	case "gitlab":
		return r.Header.Get("X-Gitlab-Event")
	default:
		return r.Header.Get("X-GitHub-Event")
	}
}

func webhookDeliveryID(provider string, repositoryID int64, r *http.Request, body []byte) string {
	for _, header := range []string{"X-GitHub-Delivery", "X-Gitee-Delivery", "X-Gitee-Event-ID", "X-Request-Id"} {
		if value := r.Header.Get(header); value != "" {
			return value
		}
	}
	// existing hash fallback remains unchanged
}

func isPushEvent(provider, event string, payload pushPayload) bool {
	event = strings.ToLower(strings.TrimSpace(event))
	switch provider {
	case "gitee":
		return strings.Contains(event, "push") || payload.HookName == "push_hooks"
	case "gitlab":
		return event == strings.ToLower("Push Hook")
	default:
		return event == "push"
	}
}
```

- [ ] **Step 4: Run targeted backend tests**

Run: `env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestGitLab|TestWebhook'`

Expected: PASS


### Task 3: Add GitLab to frontend provider selection

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Add GitLab translation keys and label rendering**

Extend both locale dictionaries and `providerLabel(...)` so GitLab renders naturally in all existing provider displays.

```jsx
provider: {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
  generic: 'Auto-detect'
}
```

- [ ] **Step 2: Add GitLab to provider select options**

Extend the provider option list used by the repository source form.

```jsx
const providerOptions = useMemo(() => ([
  { value: 'github', label: t('repository.providerGithub'), badge: 'GH' },
  { value: 'gitee', label: t('repository.providerGitee'), badge: 'GI' },
  { value: 'gitlab', label: t('repository.providerGitlab'), badge: 'GL' },
  { value: 'generic', label: t('repository.providerGeneric'), badge: '::' }
]), [t]);
```

- [ ] **Step 3: Build the frontend**

Run: `npm run build`

Expected: PASS


### Task 4: Update README guidance for GitLab

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`

- [ ] **Step 1: Add GitLab to feature bullets**

Update the supported-provider bullets so GitLab appears alongside GitHub and Gitee.

```md
- GitHub `X-Hub-Signature-256` verification.
- Gitee `X-Gitee-Token` + `X-Gitee-Timestamp` signature verification.
- GitLab `X-Gitlab-Token` verification.
```

- [ ] **Step 2: Add GitLab webhook setup instructions**

Extend the webhook setup section in both READMEs with a GitLab paragraph that explains URL, push event selection, and secret token behavior.

```md
- GitLab: set the Webhook URL to `https://your-host/webhooks/{webhookId}`, set the Secret Token to the value shown in Candy, and select the Push events trigger.
```

- [ ] **Step 3: Read both README sections back for consistency**

Run:

```bash
sed -n '20,60p' README.md
sed -n '20,60p' README.zh.md
sed -n '190,230p' README.md
sed -n '190,230p' README.zh.md
```

Expected: both languages mention GitLab consistently and only describe `X-Gitlab-Token` for GitLab.


### Task 5: Run full verification

**Files:**
- Check: `backend/internal/candy/webhook_test.go`
- Check: `frontend/src/main.jsx`
- Check: `README.md`
- Check: `README.zh.md`

- [ ] **Step 1: Run backend package tests**

Run: `env GOCACHE=/tmp/candy-go-build go test ./internal/candy`

Expected: PASS

- [ ] **Step 2: Run frontend production build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Do a final keyword sweep**

Run:

```bash
rg -n "gitlab|X-Gitlab-Token|Push Hook" backend/internal/candy frontend/src README.md README.zh.md
```

Expected: GitLab appears in webhook logic, UI labels, and docs without stray placeholder text.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/candy/webhook.go \
        backend/internal/candy/webhook_test.go \
        backend/internal/candy/store.go \
        backend/internal/candy/api.go \
        frontend/src/main.jsx \
        README.md README.zh.md \
        docs/superpowers/specs/2026-04-27-gitlab-provider-design.md \
        docs/superpowers/plans/2026-04-27-gitlab-provider.md
git commit -m "feat: add gitlab provider support"
```
