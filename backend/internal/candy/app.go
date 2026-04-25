package candy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type App struct {
	cfg               Config
	store             *Store
	box               SecretBox
	sessions          *SessionManager
	locks             sync.Map
	dummyPasswordHash string
}

func NewApp(cfg Config) (*App, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		return nil, err
	}
	box := NewSecretBox(cfg.AppSecret)
	store, err := NewStore(context.Background(), cfg, box)
	if err != nil {
		return nil, err
	}
	dummyPasswordHash, err := HashPassword("dummy-password-never-used")
	if err != nil {
		store.Close()
		return nil, err
	}
	return &App{
		cfg:               cfg,
		store:             store,
		box:               box,
		sessions:          NewSessionManager(),
		dummyPasswordHash: dummyPasswordHash,
	}, nil
}

func (a *App) Close() error {
	return a.store.Close()
}

func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/auth/login", a.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", a.requireAuth(a.handleLogout))
	mux.HandleFunc("GET /api/auth/me", a.requireAuth(a.handleMe))

	mux.HandleFunc("GET /api/environments", a.requireAuth(a.handleListEnvironments))
	mux.HandleFunc("POST /api/environments", a.requireAuth(a.handleCreateEnvironment))
	mux.HandleFunc("PUT /api/environments/{id}", a.requireAuth(a.handleUpdateEnvironment))
	mux.HandleFunc("DELETE /api/environments/{id}", a.requireAuth(a.handleDeleteEnvironment))

	mux.HandleFunc("GET /api/repository-sources", a.requireAuth(a.handleListRepositorySources))
	mux.HandleFunc("POST /api/repository-sources", a.requireAuth(a.handleCreateRepositorySource))
	mux.HandleFunc("PUT /api/repository-sources/{id}", a.requireAuth(a.handleUpdateRepositorySource))
	mux.HandleFunc("DELETE /api/repository-sources/{id}", a.requireAuth(a.handleDeleteRepositorySource))

	mux.HandleFunc("GET /api/runners", a.requireAuth(a.handleListRunners))
	mux.HandleFunc("POST /api/runners", a.requireAuth(a.handleCreateRunner))
	mux.HandleFunc("PUT /api/runners/{id}", a.requireAuth(a.handleUpdateRunner))
	mux.HandleFunc("DELETE /api/runners/{id}", a.requireAuth(a.handleDeleteRunner))
	mux.HandleFunc("POST /api/runners/{id}/test", a.requireAuth(a.handleTestRunner))

	mux.HandleFunc("GET /api/repositories", a.requireAuth(a.handleListRepositories))
	mux.HandleFunc("POST /api/repositories", a.requireAuth(a.handleCreateRepository))
	mux.HandleFunc("GET /api/repositories/{id}", a.requireAuth(a.handleGetRepository))
	mux.HandleFunc("PUT /api/repositories/{id}", a.requireAuth(a.handleUpdateRepository))
	mux.HandleFunc("DELETE /api/repositories/{id}", a.requireAuth(a.handleDeleteRepository))
	mux.HandleFunc("POST /api/repositories/{id}/trigger", a.requireAuth(a.handleManualTrigger))

	mux.HandleFunc("GET /api/secrets", a.requireAuth(a.handleListSecrets))
	mux.HandleFunc("POST /api/secrets", a.requireAuth(a.handleCreateSecret))
	mux.HandleFunc("PUT /api/secrets/{id}", a.requireAuth(a.handleUpdateSecret))
	mux.HandleFunc("DELETE /api/secrets/{id}", a.requireAuth(a.handleDeleteSecret))

	mux.HandleFunc("GET /api/jobs", a.requireAuth(a.handleListJobs))
	mux.HandleFunc("GET /api/jobs/{id}", a.requireAuth(a.handleGetJob))
	mux.HandleFunc("GET /api/jobs/{id}/logs", a.requireAuth(a.handleJobLogs))

	mux.HandleFunc("POST /webhooks/{id}", a.handleWebhook)
	mux.HandleFunc("/", a.serveFrontend)
	return mux
}

func (a *App) repoLock(repositoryID int64) *sync.Mutex {
	value, _ := a.locks.LoadOrStore(repositoryID, &sync.Mutex{})
	return value.(*sync.Mutex)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func decodeJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dst)
}

func pathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func pathPublicID(r *http.Request) (string, error) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		return "", errors.New("invalid id")
	}
	return id, nil
}

func requiredEnvironmentID(r *http.Request) (string, error) {
	environmentID := strings.TrimSpace(r.URL.Query().Get("environmentId"))
	if environmentID == "" {
		return "", errors.New("environmentId is required")
	}
	return environmentID, nil
}

func (a *App) serveFrontend(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/webhooks/") {
		writeError(w, http.StatusNotFound, fmt.Errorf("route not found: %s %s", r.Method, r.URL.Path))
		return
	}
	path := filepath.Clean(r.URL.Path)
	if path == "." || path == "/" {
		path = "index.html"
	} else {
		path = strings.TrimPrefix(path, "/")
	}
	fullPath := filepath.Join(a.cfg.FrontendDir, path)
	if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, fullPath)
		return
	}
	indexPath := filepath.Join(a.cfg.FrontendDir, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		http.ServeFile(w, r, indexPath)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintln(w, "Candy backend is running. Build the frontend or use the Vite dev server for the admin UI.")
}
