package candy

import (
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
