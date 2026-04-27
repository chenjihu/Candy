package candy

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func newTestApp(t *testing.T) *App {
	t.Helper()

	tempDir := t.TempDir()
	app, err := NewApp(Config{
		DBPath:        filepath.Join(tempDir, "candy.db"),
		DataDir:       tempDir,
		FrontendDir:   tempDir,
		PublicURL:     "https://deploy.example.com",
		AppSecret:     "test-secret",
		AdminUsername: "super_admin",
		AdminPassword: "strong-password",
	})
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	t.Cleanup(func() {
		_ = app.Close()
	})

	return app
}

func authenticateRequest(t *testing.T, app *App, req *http.Request) {
	t.Helper()

	rec := httptest.NewRecorder()
	if err := app.sessions.Create(rec, "super_admin"); err != nil {
		t.Fatalf("sessions.Create() error = %v", err)
	}

	for _, cookie := range rec.Result().Cookies() {
		req.AddCookie(cookie)
	}
}

func TestListRepositoriesRequiresEnvironmentID(t *testing.T) {
	app := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/repositories", nil)
	rec := httptest.NewRecorder()

	authenticateRequest(t, app, req)
	app.requireAuth(app.handleListRepositories)(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSecretScopeUsesEnvironmentRepositoryID(t *testing.T) {
	app := newTestApp(t)
	ctx := t.Context()

	env, err := mustEnvironmentBySlug(ctx, app.store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(production) error = %v", err)
	}

	source, err := app.store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "frontend",
		Provider:  "github",
		RepoURL:   "git@example.com:org/frontend.git",
		DeployKey: "private-key",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}
	repo, err := app.store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentID:      env.ID,
		RepositorySourceID: source.ID,
		Branch:             "main",
		WorkDir:            "/srv/frontend",
		DeployScript:       "echo ok",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository() error = %v", err)
	}

	body, err := json.Marshal(Secret{
		Name:         "API_TOKEN",
		Value:        "secret-value",
		RepositoryID: repo.ID,
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createReq := httptest.NewRequest(http.MethodPost, "/api/secrets?environmentId="+env.ID, bytes.NewReader(body))
	createRec := httptest.NewRecorder()
	authenticateRequest(t, app, createReq)
	app.requireAuth(app.handleCreateSecret)(createRec, createReq)

	if createRec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d body=%s", createRec.Code, http.StatusCreated, createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/secrets?environmentId="+env.ID, nil)
	listRec := httptest.NewRecorder()
	authenticateRequest(t, app, listReq)
	app.requireAuth(app.handleListSecrets)(listRec, listReq)

	if listRec.Code != http.StatusOK {
		t.Fatalf("list status = %d, want %d body=%s", listRec.Code, http.StatusOK, listRec.Body.String())
	}

	var secrets []Secret
	if err := json.Unmarshal(listRec.Body.Bytes(), &secrets); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(secrets) != 1 {
		t.Fatalf("len(secrets) = %d, want 1", len(secrets))
	}
	if secrets[0].RepositoryID != repo.ID {
		t.Fatalf("secret repositoryId = %q, want %q", secrets[0].RepositoryID, repo.ID)
	}
}

func TestDeleteRepositoryRemovesOrphanRepositorySource(t *testing.T) {
	app := newTestApp(t)
	ctx := t.Context()

	env, err := mustEnvironmentBySlug(ctx, app.store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(production) error = %v", err)
	}

	source, err := app.store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "api",
		Provider:  "github",
		RepoURL:   "git@example.com:org/api.git",
		DeployKey: "private-key",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}
	repo, err := app.store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentID:      env.ID,
		RepositorySourceID: source.ID,
		Branch:             "main",
		WorkDir:            "/srv/api",
		DeployScript:       "echo ok",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/repositories/"+repo.ID, nil)
	req.SetPathValue("id", repo.ID)
	rec := httptest.NewRecorder()
	authenticateRequest(t, app, req)
	app.requireAuth(app.handleDeleteRepository)(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("delete status = %d, want %d body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	if _, err := app.store.getRepositorySourceRecordByResourceID(ctx, source.ID, false); err == nil {
		t.Fatal("expected repository source to be removed after last binding deletion")
	}
}

func TestDeleteRepositoryKeepsSharedRepositorySource(t *testing.T) {
	app := newTestApp(t)
	ctx := t.Context()

	production, err := mustEnvironmentBySlug(ctx, app.store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(production) error = %v", err)
	}
	testingEnv, err := mustEnvironmentBySlug(ctx, app.store, "testing")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(testing) error = %v", err)
	}

	source, err := app.store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "web",
		Provider:  "github",
		RepoURL:   "git@example.com:org/web.git",
		DeployKey: "private-key",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}
	repoA, err := app.store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentID:      production.ID,
		RepositorySourceID: source.ID,
		Branch:             "main",
		WorkDir:            "/srv/web-prod",
		DeployScript:       "echo prod",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository(prod) error = %v", err)
	}
	if _, err := app.store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentID:      testingEnv.ID,
		RepositorySourceID: source.ID,
		Branch:             "testing",
		WorkDir:            "/srv/web-testing",
		DeployScript:       "echo testing",
	}); err != nil {
		t.Fatalf("CreateEnvironmentRepository(testing) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/repositories/"+repoA.ID, nil)
	req.SetPathValue("id", repoA.ID)
	rec := httptest.NewRecorder()
	authenticateRequest(t, app, req)
	app.requireAuth(app.handleDeleteRepository)(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("delete status = %d, want %d body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	if _, err := app.store.getRepositorySourceRecordByResourceID(ctx, source.ID, false); err != nil {
		t.Fatalf("expected shared repository source to remain, got err=%v", err)
	}
}
