package candy

import (
	"bytes"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"
)

func TestVerifyGitHubSignature(t *testing.T) {
	secret := "top-secret"
	body := []byte(`{"ref":"refs/heads/main"}`)
	req := httptest.NewRequest("POST", "/webhooks/wh_test", nil)
	req.Header.Set("X-Hub-Signature-256", "sha256="+hmacSHA256Hex(secret, body))

	if err := verifyGitHubSignature(secret, req, body); err != nil {
		t.Fatalf("expected signature to verify: %v", err)
	}

	req.Header.Set("X-Hub-Signature-256", "sha256=bad")
	if err := verifyGitHubSignature(secret, req, body); err == nil {
		t.Fatal("expected invalid signature to fail")
	}
}

func TestVerifyGiteeSignature(t *testing.T) {
	secret := "top-secret"
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	token := url.QueryEscape(hmacSHA256Base64(secret, timestamp+"\n"+secret))
	req := httptest.NewRequest("POST", "/webhooks/wh_test", nil)
	req.Header.Set("X-Gitee-Timestamp", timestamp)
	req.Header.Set("X-Gitee-Token", token)

	if err := verifyGiteeSignature(secret, req); err != nil {
		t.Fatalf("expected signature to verify: %v", err)
	}

	req.Header.Set("X-Gitee-Token", "bad")
	if err := verifyGiteeSignature(secret, req); err == nil {
		t.Fatal("expected invalid signature to fail")
	}
}

func TestCommitFallbacks(t *testing.T) {
	payload := pushPayload{
		After: "after-sha",
		Commits: []pushCommit{
			{ID: "first"},
			{ID: "last"},
		},
	}
	if got := commitSHA(payload); got != "after-sha" {
		t.Fatalf("commitSHA() = %q", got)
	}
}

func TestGitLabPushWebhookQueuesDeployment(t *testing.T) {
	app := newTestApp(t)
	ctx := t.Context()

	env, err := mustEnvironmentBySlug(ctx, app.store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug() error = %v", err)
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
	req := httptest.NewRequest("POST", "/webhooks/"+repo.WebhookID, bytes.NewReader(body))
	req.SetPathValue("id", repo.WebhookID)
	req.Header.Set("X-Gitlab-Event", "Push Hook")
	req.Header.Set("X-Gitlab-Token", "gitlab-secret")
	req.Header.Set("X-Request-Id", "gitlab-delivery-1")

	rec := httptest.NewRecorder()
	app.handleWebhook(rec, req)

	if rec.Code != 202 {
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

func TestGitLabWebhookRejectsMissingToken(t *testing.T) {
	req := httptest.NewRequest("POST", "/webhooks/wh_test", nil)
	req.Header.Set("X-Gitlab-Event", "Push Hook")
	if err := verifyGitLabToken("gitlab-secret", req); err == nil {
		t.Fatal("expected missing token to fail")
	}
}

func TestGitLabWebhookRejectsInvalidToken(t *testing.T) {
	req := httptest.NewRequest("POST", "/webhooks/wh_test", nil)
	req.Header.Set("X-Gitlab-Event", "Push Hook")
	req.Header.Set("X-Gitlab-Token", "wrong")
	if err := verifyGitLabToken("gitlab-secret", req); err == nil {
		t.Fatal("expected invalid token to fail")
	}
}
