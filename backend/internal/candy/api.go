package candy

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (a *App) handleListRunners(w http.ResponseWriter, r *http.Request) {
	runners, err := a.store.ListRunners(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, runners)
}

func (a *App) handleCreateRunner(w http.ResponseWriter, r *http.Request) {
	var runner Runner
	if err := decodeJSON(r, &runner); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateRunner(runner); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := a.store.CreateRunner(r.Context(), runner)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *App) handleUpdateRunner(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var runner Runner
	if err := decodeJSON(r, &runner); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateRunner(runner); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := a.store.UpdateRunner(r.Context(), id, runner)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleDeleteRunner(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.store.DeleteRunner(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleTestRunner(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	runner, err := a.store.GetRunner(r.Context(), id, true)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	tester := NewDeployer(a)
	if err := tester.TestRunner(r.Context(), runner); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleListRepositories(w http.ResponseWriter, r *http.Request) {
	repos, err := a.store.ListRepositories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, repos)
}

func (a *App) handleGetRepository(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	repo, err := a.store.GetRepository(r.Context(), id, false)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, repo)
}

func (a *App) handleCreateRepository(w http.ResponseWriter, r *http.Request) {
	var repo Repository
	if err := decodeJSON(r, &repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateRepository(repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := a.store.CreateRepository(r.Context(), repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *App) handleUpdateRepository(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var repo Repository
	if err := decodeJSON(r, &repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateRepository(repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := a.store.UpdateRepository(r.Context(), id, repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleDeleteRepository(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.store.DeleteRepository(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleManualTrigger(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var req struct {
		CommitSHA string `json:"commitSha"`
	}
	if r.Body != nil {
		_ = decodeJSON(r, &req)
	}
	repo, err := a.store.GetRepository(r.Context(), id, false)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	token, err := randomToken(12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	job, err := a.store.CreateJob(r.Context(), DeployJob{
		RepositoryID:  repo.ID,
		RunnerID:      repo.RunnerID,
		Provider:      repo.Provider,
		Event:         "manual",
		DeliveryID:    "manual-" + token,
		Branch:        repo.Branch,
		CommitSHA:     strings.TrimSpace(req.CommitSHA),
		CommitMessage: "manual deployment",
		CommitAuthor:  "admin",
		Status:        "queued",
		TriggeredAt:   time.Now(),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

func (a *App) handleListJobs(w http.ResponseWriter, r *http.Request) {
	var repositoryID int64
	if raw := r.URL.Query().Get("repositoryId"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, errors.New("invalid repositoryId"))
			return
		}
		repositoryID = id
	}
	jobs, err := a.store.ListJobs(r.Context(), repositoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, jobs)
}

func (a *App) handleGetJob(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	job, err := a.store.GetJob(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (a *App) handleJobLogs(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	logs, err := a.store.ListJobLogs(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

func validateRunner(runner Runner) error {
	if strings.TrimSpace(runner.Name) == "" {
		return errors.New("Runner name is required")
	}
	mode := normalizeRunnerMode(runner.Mode)
	if mode == "ssh" {
		if strings.TrimSpace(runner.Host) == "" {
			return errors.New("SSH Runner host is required")
		}
		if strings.TrimSpace(runner.Username) == "" {
			return errors.New("SSH Runner username is required")
		}
	}
	return nil
}

func validateRepository(repo Repository) error {
	if strings.TrimSpace(repo.Name) == "" {
		return errors.New("repository name is required")
	}
	if strings.TrimSpace(repo.RepoURL) == "" {
		return errors.New("repository URL is required")
	}
	if strings.TrimSpace(repo.Branch) == "" {
		return errors.New("trigger branch is required")
	}
	if strings.TrimSpace(repo.WorkDir) == "" {
		return errors.New("work directory is required")
	}
	if strings.TrimSpace(repo.DeployScript) == "" {
		return errors.New("deploy script is required")
	}
	return nil
}
