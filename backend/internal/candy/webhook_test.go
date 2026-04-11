package candy

import (
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"
)

func TestVerifyGitHubSignature(t *testing.T) {
	secret := "top-secret"
	body := []byte(`{"ref":"refs/heads/main"}`)
	req := httptest.NewRequest("POST", "/webhooks/1", nil)
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
	req := httptest.NewRequest("POST", "/webhooks/1", nil)
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
