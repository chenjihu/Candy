package candy

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var envNamePattern = regexp.MustCompile(`^[A-Z_][A-Z0-9_]*$`)

func (a *App) handleListEnvironments(w http.ResponseWriter, r *http.Request) {
	environments, err := a.store.ListEnvironments(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, environments)
}

func (a *App) handleCreateEnvironment(w http.ResponseWriter, r *http.Request) {
	var env Environment
	if err := decodeJSON(r, &env); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateEnvironment(env); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := a.store.CreateEnvironment(r.Context(), env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *App) handleUpdateEnvironment(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var env Environment
	if err := decodeJSON(r, &env); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateEnvironment(env); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := a.updateEnvironment(r.Context(), resourceID, env)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("environment not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleDeleteEnvironment(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.deleteEnvironment(r.Context(), resourceID); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("environment not found"))
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
	} else {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func (a *App) handleListRepositorySources(w http.ResponseWriter, r *http.Request) {
	sources, err := a.store.ListRepositorySources(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sources)
}

func (a *App) handleCreateRepositorySource(w http.ResponseWriter, r *http.Request) {
	var source RepositorySource
	if err := decodeJSON(r, &source); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateRepositorySource(source); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := a.store.CreateRepositorySource(r.Context(), source)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *App) handleUpdateRepositorySource(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var source RepositorySource
	if err := decodeJSON(r, &source); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateRepositorySource(source); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := a.updateRepositorySource(r.Context(), resourceID, source)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("repository source not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleDeleteRepositorySource(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.deleteRepositorySource(r.Context(), resourceID); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("repository source not found"))
	} else if err != nil {
		writeError(w, http.StatusBadRequest, err)
	} else {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func (a *App) handleListRunners(w http.ResponseWriter, r *http.Request) {
	env, status, err := a.requireEnvironment(r.Context(), r)
	if err != nil {
		writeError(w, status, err)
		return
	}
	runners, err := a.listRunnersForEnvironment(r.Context(), env.ID)
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
	env, status, err := a.requireEnvironment(r.Context(), r)
	if err != nil {
		writeError(w, status, err)
		return
	}
	repositories, err := a.store.ListEnvironmentRepositories(r.Context(), env.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, repositories)
}

func (a *App) handleGetRepository(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	repository, err := a.store.getEnvironmentRepositoryRecordByResourceID(r.Context(), resourceID, false)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("repository not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, repository.EnvironmentRepository)
}

func (a *App) handleCreateRepository(w http.ResponseWriter, r *http.Request) {
	var repo EnvironmentRepository
	if err := decodeJSON(r, &repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	runnerID, err := parseRunnerID(repo.RunnerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	repo.RunnerInternalID = runnerID
	if err := validateEnvironmentRepository(repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := a.store.CreateEnvironmentRepository(r.Context(), repo)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("related environment or repository source not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *App) handleUpdateRepository(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var repo EnvironmentRepository
	if err := decodeJSON(r, &repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	runnerID, err := parseRunnerID(repo.RunnerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	repo.RunnerInternalID = runnerID
	if err := validateEnvironmentRepository(repo); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := a.updateEnvironmentRepository(r.Context(), resourceID, repo)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("repository not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleDeleteRepository(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.deleteEnvironmentRepository(r.Context(), resourceID); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("repository not found"))
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
	} else {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func (a *App) handleListSecrets(w http.ResponseWriter, r *http.Request) {
	env, status, err := a.requireEnvironment(r.Context(), r)
	if err != nil {
		writeError(w, status, err)
		return
	}
	secrets, err := a.listSecretsForEnvironment(r.Context(), env.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, secrets)
}

func (a *App) handleCreateSecret(w http.ResponseWriter, r *http.Request) {
	env, status, err := a.requireEnvironment(r.Context(), r)
	if err != nil {
		writeError(w, status, err)
		return
	}
	var secret Secret
	if err := decodeJSON(r, &secret); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.resolveSecretRepositoryScope(r.Context(), env.ID, &secret); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateSecret(secret, true); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := a.store.CreateSecret(r.Context(), secret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *App) handleUpdateSecret(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	env, status, err := a.requireEnvironment(r.Context(), r)
	if err != nil {
		writeError(w, status, err)
		return
	}
	var secret Secret
	if err := decodeJSON(r, &secret); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.resolveSecretRepositoryScope(r.Context(), env.ID, &secret); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := validateSecret(secret, false); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := a.store.UpdateSecret(r.Context(), id, secret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleDeleteSecret(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := a.store.DeleteSecret(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleManualTrigger(w http.ResponseWriter, r *http.Request) {
	resourceID, err := pathResourceID(r)
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
	repository, err := a.store.getEnvironmentRepositoryRecordByResourceID(r.Context(), resourceID, false)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("repository not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	token, err := randomToken(12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	job, err := a.store.CreateJob(r.Context(), DeployJob{
		EnvironmentRepositoryID: repository.InternalID,
		RepositoryID:            repository.ID,
		RepositoryName:          repository.Name,
		RunnerID:                repository.RunnerInternalID,
		RunnerName:              repository.Runner,
		Provider:                repository.Provider,
		Event:                   "manual",
		DeliveryID:              "manual-" + token,
		Branch:                  repository.Branch,
		CommitSHA:               strings.TrimSpace(req.CommitSHA),
		CommitMessage:           "manual deployment",
		CommitAuthor:            "admin",
		Status:                  "queued",
		TriggeredAt:             time.Now(),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

func (a *App) handleListJobs(w http.ResponseWriter, r *http.Request) {
	env, status, err := a.requireEnvironment(r.Context(), r)
	if err != nil {
		writeError(w, status, err)
		return
	}

	repositoryID := strings.TrimSpace(r.URL.Query().Get("repositoryId"))
	if repositoryID != "" {
		repository, err := a.store.getEnvironmentRepositoryRecordByResourceID(r.Context(), repositoryID, false)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, errors.New("repository not found"))
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if repository.EnvironmentID != env.ID {
			writeError(w, http.StatusNotFound, errors.New("repository not found"))
			return
		}
		jobs, err := a.store.ListJobs(r.Context(), repository.InternalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, jobs)
		return
	}

	jobs, err := a.listJobsForEnvironment(r.Context(), env.ID)
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

func (a *App) requireEnvironment(ctx context.Context, r *http.Request) (Environment, int, error) {
	environmentID, err := requiredEnvironmentID(r)
	if err != nil {
		return Environment{}, http.StatusBadRequest, err
	}
	environment, err := a.store.getEnvironmentByID(ctx, environmentID)
	if errors.Is(err, sql.ErrNoRows) {
		return Environment{}, http.StatusNotFound, errors.New("environment not found")
	}
	if err != nil {
		return Environment{}, http.StatusInternalServerError, err
	}
	return environment, 0, nil
}

func (a *App) listRunnersForEnvironment(ctx context.Context, environmentID string) ([]Runner, error) {
	rows, err := a.store.db.QueryContext(ctx,
		`SELECT DISTINCT r.id, r.name, r.mode, r.host, r.port, r.username, r.work_root, r.private_key_cipher,
		        r.created_at, r.updated_at
		 FROM runners r
		 INNER JOIN environment_repositories er ON er.runner_id = r.id
		 INNER JOIN environments e ON e.id = er.environment_id
		 WHERE e.public_id = ?
		 ORDER BY r.id DESC`,
		environmentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runners := make([]Runner, 0)
	for rows.Next() {
		runner, err := a.store.scanRunner(rows, false)
		if err != nil {
			return nil, err
		}
		runners = append(runners, runner)
	}
	return runners, rows.Err()
}

func (a *App) listSecretsForEnvironment(ctx context.Context, environmentID string) ([]Secret, error) {
	rows, err := a.store.db.QueryContext(ctx,
		`SELECT s.id, s.name, s.value_cipher, s.environment_id, s.environment_repository_id,
		        COALESCE(er.public_id, ''), COALESCE(src.name, ''), s.created_at, s.updated_at
		 FROM secrets s
		 LEFT JOIN environment_repositories er ON er.id = s.environment_repository_id
		 LEFT JOIN repository_sources src ON src.id = er.repository_source_id
		 INNER JOIN environments e ON e.id = s.environment_id
		 WHERE e.public_id = ?
		 ORDER BY s.environment_repository_id IS NOT NULL, COALESCE(src.name, ''), s.name`,
		environmentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	secrets := make([]Secret, 0)
	for rows.Next() {
		secret, err := a.store.scanSecret(rows, false)
		if err != nil {
			return nil, err
		}
		secrets = append(secrets, secret)
	}
	return secrets, rows.Err()
}

func (a *App) listJobsForEnvironment(ctx context.Context, environmentID string) ([]DeployJob, error) {
	rows, err := a.store.db.QueryContext(ctx,
		jobSelectSQL()+`
		 INNER JOIN environments e ON e.id = er.environment_id
		 WHERE e.public_id = ?
		 ORDER BY j.id DESC
		 LIMIT 200`,
		environmentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	jobs := make([]DeployJob, 0)
	for rows.Next() {
		job, err := a.store.scanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (a *App) updateEnvironment(ctx context.Context, resourceID string, env Environment) (Environment, error) {
	result, err := a.store.db.ExecContext(ctx,
		`UPDATE environments
		 SET name = ?, slug = ?, description = ?, color = ?, updated_at = ?
		 WHERE public_id = ?`,
		strings.TrimSpace(env.Name),
		strings.TrimSpace(env.Slug),
		strings.TrimSpace(env.Description),
		strings.TrimSpace(env.Color),
		dbTime(time.Now()),
		resourceID,
	)
	if err != nil {
		return Environment{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Environment{}, err
	}
	if rowsAffected == 0 {
		return Environment{}, sql.ErrNoRows
	}
	return a.store.getEnvironmentByID(ctx, resourceID)
}

func (a *App) deleteEnvironment(ctx context.Context, resourceID string) error {
	environment, err := a.store.getEnvironmentByID(ctx, resourceID)
	if err != nil {
		return err
	}

	tx, err := a.store.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx,
		`SELECT repository_source_id
		 FROM environment_repositories
		 WHERE environment_id = ?`,
		environment.InternalID,
	)
	if err != nil {
		return err
	}

	repositorySourceIDs := make([]int64, 0)
	for rows.Next() {
		var repositorySourceID int64
		if err := rows.Scan(&repositorySourceID); err != nil {
			rows.Close()
			return err
		}
		repositorySourceIDs = append(repositorySourceIDs, repositorySourceID)
	}
	if err := rows.Close(); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM environment_repositories WHERE environment_id = ?`, environment.InternalID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM environments WHERE id = ?`, environment.InternalID); err != nil {
		return err
	}
	if err := deleteRepositorySourcesWithoutBindings(ctx, tx, repositorySourceIDs); err != nil {
		return err
	}
	return tx.Commit()
}

func (a *App) updateRepositorySource(ctx context.Context, resourceID string, source RepositorySource) (RepositorySource, error) {
	existing, err := a.store.getRepositorySourceRecordByResourceID(ctx, resourceID, true)
	if err != nil {
		return RepositorySource{}, err
	}

	deployKey := existing.DeployKey
	if strings.TrimSpace(source.DeployKey) != "" {
		deployKey = source.DeployKey
	}
	deployKeyCipher, err := a.store.box.Seal(deployKey)
	if err != nil {
		return RepositorySource{}, err
	}

	tx, err := a.store.db.BeginTx(ctx, nil)
	if err != nil {
		return RepositorySource{}, err
	}
	defer tx.Rollback()

	now := dbTime(time.Now())
	if _, err := tx.ExecContext(ctx,
		`UPDATE repository_sources
		 SET name = ?, provider = ?, repo_url = ?, deploy_key_cipher = ?, updated_at = ?
		 WHERE public_id = ?`,
		strings.TrimSpace(source.Name),
		normalizeProvider(source.Provider),
		strings.TrimSpace(source.RepoURL),
		deployKeyCipher,
		now,
		resourceID,
	); err != nil {
		return RepositorySource{}, err
	}
	if err := tx.Commit(); err != nil {
		return RepositorySource{}, err
	}

	updated, err := a.store.getRepositorySourceRecordByResourceID(ctx, resourceID, false)
	if err != nil {
		return RepositorySource{}, err
	}
	return updated.RepositorySource, nil
}

func (a *App) deleteRepositorySource(ctx context.Context, resourceID string) error {
	source, err := a.store.getRepositorySourceRecordByResourceID(ctx, resourceID, false)
	if err != nil {
		return err
	}

	var bindings int
	if err := a.store.db.QueryRowContext(ctx,
		`SELECT COUNT(*)
		 FROM environment_repositories
		 WHERE repository_source_id = ?`,
		source.InternalID,
	).Scan(&bindings); err != nil {
		return err
	}
	if bindings > 0 {
		return errors.New("repository source is still bound to one or more environments")
	}

	_, err = a.store.db.ExecContext(ctx, `DELETE FROM repository_sources WHERE id = ?`, source.InternalID)
	return err
}

func (a *App) updateEnvironmentRepository(ctx context.Context, resourceID string, repo EnvironmentRepository) (EnvironmentRepository, error) {
	existing, err := a.store.getEnvironmentRepositoryRecordByResourceID(ctx, resourceID, true)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	environment, err := a.store.getEnvironmentByID(ctx, repo.EnvironmentID)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	source, err := a.store.getRepositorySourceRecordByResourceID(ctx, repo.RepositorySourceID, true)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	webhookSecret := existing.WebhookSecret
	if strings.TrimSpace(repo.WebhookSecret) != "" {
		webhookSecret = strings.TrimSpace(repo.WebhookSecret)
	}
	webhookSecretCipher, err := a.store.box.Seal(webhookSecret)
	if err != nil {
		return EnvironmentRepository{}, err
	}

	tx, err := a.store.db.BeginTx(ctx, nil)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	defer tx.Rollback()

	now := dbTime(time.Now())
	if _, err := tx.ExecContext(ctx,
		`UPDATE environment_repositories
		 SET environment_id = ?, repository_source_id = ?, webhook_secret_cipher = ?, branch = ?, work_dir = ?,
		     deploy_script = ?, runner_id = ?, clean_worktree = ?, updated_at = ?
		 WHERE public_id = ?`,
		environment.InternalID,
		source.InternalID,
		webhookSecretCipher,
		normalizeBranch(repo.Branch),
		strings.TrimSpace(repo.WorkDir),
		strings.TrimSpace(repo.DeployScript),
		nullableInt64(repo.RunnerInternalID),
		boolInt(repo.CleanWorktree),
		now,
		resourceID,
	); err != nil {
		return EnvironmentRepository{}, err
	}
	if err := tx.Commit(); err != nil {
		return EnvironmentRepository{}, err
	}

	updated, err := a.store.getEnvironmentRepositoryRecordByResourceID(ctx, resourceID, false)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	return updated.EnvironmentRepository, nil
}

func (a *App) deleteEnvironmentRepository(ctx context.Context, resourceID string) error {
	repository, err := a.store.getEnvironmentRepositoryRecordByResourceID(ctx, resourceID, false)
	if err != nil {
		return err
	}

	tx, err := a.store.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM environment_repositories WHERE public_id = ?`, resourceID); err != nil {
		return err
	}
	if err := deleteRepositorySourcesWithoutBindings(ctx, tx, []int64{repository.RepositorySourceInternalID}); err != nil {
		return err
	}
	return tx.Commit()
}

func deleteRepositorySourcesWithoutBindings(ctx context.Context, tx *sql.Tx, sourceIDs []int64) error {
	for _, sourceID := range uniqueInt64s(sourceIDs) {
		var bindings int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*)
			 FROM environment_repositories
			 WHERE repository_source_id = ?`,
			sourceID,
		).Scan(&bindings); err != nil {
			return err
		}
		if bindings > 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM repository_sources WHERE id = ?`, sourceID); err != nil {
			return err
		}
	}
	return nil
}

func uniqueInt64s(values []int64) []int64 {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[int64]struct{}, len(values))
	unique := make([]int64, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
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

func validateEnvironment(env Environment) error {
	if strings.TrimSpace(env.Name) == "" {
		return errors.New("environment name is required")
	}
	if strings.TrimSpace(env.Slug) == "" {
		return errors.New("environment slug is required")
	}
	return nil
}

func validateRepositorySource(source RepositorySource) error {
	if strings.TrimSpace(source.Name) == "" {
		return errors.New("repository source name is required")
	}
	if strings.TrimSpace(source.RepoURL) == "" {
		return errors.New("repository URL is required")
	}
	return nil
}

func validateEnvironmentRepository(repo EnvironmentRepository) error {
	if strings.TrimSpace(repo.EnvironmentID) == "" {
		return errors.New("environmentId is required")
	}
	if strings.TrimSpace(repo.RepositorySourceID) == "" {
		return errors.New("repositorySourceId is required")
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

func validateSecret(secret Secret, requireValue bool) error {
	name := normalizeSecretName(secret.Name)
	if name == "" {
		return errors.New("secret name is required")
	}
	if !envNamePattern.MatchString(name) {
		return errors.New("secret name must be a valid environment variable name")
	}
	if requireValue && secret.Value == "" {
		return errors.New("secret value is required")
	}
	return nil
}

func (a *App) resolveSecretRepositoryScope(ctx context.Context, environmentID string, secret *Secret) error {
	environment, err := a.store.getEnvironmentByID(ctx, environmentID)
	if err != nil {
		return err
	}
	secret.EnvironmentID = environment.InternalID
	secret.EnvironmentRepositoryID = nil
	secret.RepositoryID = strings.TrimSpace(secret.RepositoryID)
	if secret.RepositoryID == "" {
		return nil
	}

	repository, err := a.store.getEnvironmentRepositoryRecordByResourceID(ctx, secret.RepositoryID, false)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("repository not found")
	}
	if err != nil {
		return err
	}
	if repository.EnvironmentID != environmentID {
		return errors.New("repository is not in the selected environment")
	}
	repositoryID := repository.InternalID
	secret.EnvironmentRepositoryID = &repositoryID
	return nil
}

func parseRunnerID(raw string) (*int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return nil, errors.New("invalid runnerId")
	}
	return &id, nil
}
