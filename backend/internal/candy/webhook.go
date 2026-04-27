package candy

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type pushPayload struct {
	Ref        string       `json:"ref"`
	After      string       `json:"after"`
	HookName   string       `json:"hook_name"`
	HeadCommit *pushCommit  `json:"head_commit"`
	Commits    []pushCommit `json:"commits"`
	UserName   string       `json:"user_name"`
	Sender     *struct {
		Login string `json:"login"`
		Name  string `json:"name"`
	} `json:"sender"`
	Pusher *struct {
		Name string `json:"name"`
	} `json:"pusher"`
}

type pushCommit struct {
	ID      string `json:"id"`
	Message string `json:"message"`
	Author  struct {
		Name     string `json:"name"`
		Username string `json:"username"`
		Email    string `json:"email"`
	} `json:"author"`
}

func (a *App) handleWebhook(w http.ResponseWriter, r *http.Request) {
	webhookID := strings.TrimSpace(r.PathValue("id"))
	if webhookID == "" {
		writeError(w, http.StatusBadRequest, errors.New("invalid id"))
		return
	}
	repo, err := a.store.getEnvironmentRepositoryRecordByWebhookID(r.Context(), webhookID, true)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("environment repository not found"))
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	provider := normalizeProvider(repo.Provider)
	if provider == "generic" {
		provider = detectProvider(r)
	}
	if err := verifyWebhookSignature(provider, repo.WebhookSecret, r, body); err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}

	var payload pushPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	event := webhookEvent(provider, r, payload)
	if !isPushEvent(provider, event, payload) {
		writeJSON(w, http.StatusAccepted, map[string]any{"status": "ignored", "reason": "event is not push"})
		return
	}
	branch := strings.TrimPrefix(payload.Ref, "refs/heads/")
	if branch == "" {
		writeJSON(w, http.StatusAccepted, map[string]any{"status": "ignored", "reason": "missing branch"})
		return
	}
	if branch != repo.Branch {
		writeJSON(w, http.StatusAccepted, map[string]any{
			"status": "ignored",
			"reason": "branch does not match trigger branch",
			"branch": branch,
		})
		return
	}

	deliveryID := webhookDeliveryID(provider, repo.InternalID, r, body)
	job, err := a.store.CreateJob(r.Context(), DeployJob{
		EnvironmentRepositoryID: repo.InternalID,
		RepositoryID:            repo.ID,
		RepositoryName:          repo.Name,
		RunnerID:                repo.RunnerInternalID,
		RunnerName:              repo.Runner,
		Provider:                provider,
		Event:                   event,
		DeliveryID:              deliveryID,
		Branch:                  branch,
		CommitSHA:               commitSHA(payload),
		CommitMessage:           commitMessage(payload),
		CommitAuthor:            commitAuthor(payload),
		Status:                  "queued",
		TriggeredAt:             time.Now(),
	})
	if errors.Is(err, ErrDuplicateDelivery) {
		writeJSON(w, http.StatusAccepted, map[string]any{"status": "duplicate", "job": job})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "queued", "job": job})
}

func detectProvider(r *http.Request) string {
	if r.Header.Get("X-Gitee-Event") != "" || r.Header.Get("X-Gitee-Token") != "" {
		return "gitee"
	}
	if r.Header.Get("X-Gitlab-Event") != "" || r.Header.Get("X-Gitlab-Token") != "" {
		return "gitlab"
	}
	return "github"
}

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
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%x", provider, repositoryID, sha256.Sum256(body))))
	return hex.EncodeToString(sum[:])
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

func verifyGitHubSignature(secret string, r *http.Request, body []byte) error {
	signature := r.Header.Get("X-Hub-Signature-256")
	if signature == "" {
		return errors.New("missing X-Hub-Signature-256")
	}
	const prefix = "sha256="
	if !strings.HasPrefix(signature, prefix) {
		return errors.New("invalid GitHub signature format")
	}
	expected := hmacSHA256Hex(secret, body)
	actual := strings.TrimPrefix(signature, prefix)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) != 1 {
		return errors.New("invalid GitHub signature")
	}
	return nil
}

func verifyGiteeSignature(secret string, r *http.Request) error {
	token := strings.TrimSpace(r.Header.Get("X-Gitee-Token"))
	if token == "" {
		return errors.New("missing X-Gitee-Token")
	}
	timestamp := strings.TrimSpace(r.Header.Get("X-Gitee-Timestamp"))
	if timestamp == "" {
		return errors.New("missing X-Gitee-Timestamp")
	}
	if err := verifyTimestamp(timestamp); err != nil {
		return err
	}
	expected := hmacSHA256Base64(secret, timestamp+"\n"+secret)
	if subtle.ConstantTimeCompare([]byte(url.QueryEscape(expected)), []byte(token)) == 1 {
		return nil
	}
	if subtle.ConstantTimeCompare([]byte(expected), []byte(token)) != 1 {
		return errors.New("invalid Gitee signature")
	}
	return nil
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

func verifyTimestamp(value string) error {
	raw, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return errors.New("invalid X-Gitee-Timestamp")
	}
	var t time.Time
	if raw > 1_000_000_000_000 {
		t = time.UnixMilli(raw)
	} else {
		t = time.Unix(raw, 0)
	}
	now := time.Now()
	if t.Before(now.Add(-1*time.Hour)) || t.After(now.Add(10*time.Minute)) {
		return errors.New("X-Gitee-Timestamp is outside the accepted window")
	}
	return nil
}

func isPushEvent(provider, event string, payload pushPayload) bool {
	event = strings.ToLower(strings.TrimSpace(event))
	if provider == "gitee" {
		return strings.Contains(event, "push") || payload.HookName == "push_hooks"
	}
	if provider == "gitlab" {
		return event == strings.ToLower("Push Hook")
	}
	return event == "push"
}

func commitSHA(payload pushPayload) string {
	if payload.HeadCommit != nil && payload.HeadCommit.ID != "" {
		return payload.HeadCommit.ID
	}
	if payload.After != "" && payload.After != "0000000000000000000000000000000000000000" {
		return payload.After
	}
	if len(payload.Commits) > 0 {
		return payload.Commits[len(payload.Commits)-1].ID
	}
	return ""
}

func commitMessage(payload pushPayload) string {
	if payload.HeadCommit != nil {
		return payload.HeadCommit.Message
	}
	if len(payload.Commits) > 0 {
		return payload.Commits[len(payload.Commits)-1].Message
	}
	return ""
}

func commitAuthor(payload pushPayload) string {
	if payload.HeadCommit != nil {
		if payload.HeadCommit.Author.Username != "" {
			return payload.HeadCommit.Author.Username
		}
		if payload.HeadCommit.Author.Name != "" {
			return payload.HeadCommit.Author.Name
		}
	}
	if payload.Pusher != nil && payload.Pusher.Name != "" {
		return payload.Pusher.Name
	}
	if payload.Sender != nil {
		if payload.Sender.Login != "" {
			return payload.Sender.Login
		}
		if payload.Sender.Name != "" {
			return payload.Sender.Name
		}
	}
	if payload.UserName != "" {
		return payload.UserName
	}
	return ""
}
