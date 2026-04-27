package candy

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var ErrDuplicateDelivery = errors.New("duplicate webhook delivery")

type Store struct {
	db        *sql.DB
	box       SecretBox
	publicURL string
}

type LoginThrottle struct {
	Scope       string
	MaxFailures int
	Window      time.Duration
	Lockout     time.Duration
}

func NewStore(ctx context.Context, cfg Config, box SecretBox) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", cfg.DBPath+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	store := &Store{db: db, box: box, publicURL: strings.TrimRight(cfg.PublicURL, "/")}
	if err := store.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	if err := store.ensureAdminUser(ctx, cfg.AdminUsername, cfg.AdminPassword, true); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `PRAGMA journal_mode=WAL;`); err != nil {
		return err
	}
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS runners (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			mode TEXT NOT NULL CHECK (mode IN ('local', 'ssh')),
			host TEXT NOT NULL DEFAULT '',
			port INTEGER NOT NULL DEFAULT 22,
			username TEXT NOT NULL DEFAULT '',
			work_root TEXT NOT NULL DEFAULT '',
			private_key_cipher TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS environments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			public_id TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL UNIQUE,
			slug TEXT NOT NULL UNIQUE,
			description TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS repository_sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			public_id TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL UNIQUE,
			provider TEXT NOT NULL DEFAULT 'github',
			repo_url TEXT NOT NULL,
			deploy_key_cipher TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS environment_repositories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			public_id TEXT NOT NULL UNIQUE,
			environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
			repository_source_id INTEGER NOT NULL REFERENCES repository_sources(id) ON DELETE CASCADE,
			webhook_secret_cipher TEXT NOT NULL,
			webhook_id TEXT NOT NULL UNIQUE CHECK (webhook_id <> ''),
			branch TEXT NOT NULL,
			work_dir TEXT NOT NULL,
			deploy_script TEXT NOT NULL,
			runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
			clean_worktree INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			UNIQUE(environment_id, repository_source_id)
		);`,
		`CREATE INDEX IF NOT EXISTS environment_repositories_environment_idx
			ON environment_repositories(environment_id, id);`,
		`CREATE INDEX IF NOT EXISTS environment_repositories_source_idx
			ON environment_repositories(repository_source_id, id);`,
		`CREATE INDEX IF NOT EXISTS environment_repositories_runner_idx
			ON environment_repositories(runner_id, id);`,
		`CREATE TABLE IF NOT EXISTS secrets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			value_cipher TEXT NOT NULL,
			environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
			environment_repository_id INTEGER NULL REFERENCES environment_repositories(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			UNIQUE(environment_id, environment_repository_id, name)
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS secrets_environment_global_name_idx
			ON secrets(environment_id, name)
			WHERE environment_repository_id IS NULL;`,
		`CREATE INDEX IF NOT EXISTS secrets_environment_repository_idx
			ON secrets(environment_repository_id, name);`,
		`CREATE TABLE IF NOT EXISTS deploy_jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			environment_repository_id INTEGER NOT NULL REFERENCES environment_repositories(id) ON DELETE CASCADE,
			runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
			provider TEXT NOT NULL,
			event TEXT NOT NULL,
			delivery_id TEXT NOT NULL DEFAULT '',
			branch TEXT NOT NULL,
			commit_sha TEXT NOT NULL DEFAULT '',
			commit_message TEXT NOT NULL DEFAULT '',
			commit_author TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'ignored')),
			exit_code INTEGER NULL,
			error TEXT NOT NULL DEFAULT '',
			triggered_at TEXT NOT NULL,
			started_at TEXT NULL,
			finished_at TEXT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS deploy_jobs_delivery_idx
			ON deploy_jobs(environment_repository_id, delivery_id)
			WHERE delivery_id <> '';`,
		`CREATE INDEX IF NOT EXISTS deploy_jobs_status_idx ON deploy_jobs(status, id);`,
		`CREATE INDEX IF NOT EXISTS deploy_jobs_environment_repository_idx
			ON deploy_jobs(environment_repository_id, id);`,
		`CREATE TABLE IF NOT EXISTS job_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			job_id INTEGER NOT NULL REFERENCES deploy_jobs(id) ON DELETE CASCADE,
			stream TEXT NOT NULL,
			line TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS job_logs_job_idx ON job_logs(job_id, id);`,
		`CREATE TABLE IF NOT EXISTS login_attempts (
			scope TEXT PRIMARY KEY,
			failed_count INTEGER NOT NULL,
			first_failed_at TEXT NOT NULL,
			last_failed_at TEXT NOT NULL,
			locked_until TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE INDEX IF NOT EXISTS login_attempts_locked_until_idx ON login_attempts(locked_until);`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	_, _ = s.db.ExecContext(ctx, `DROP TABLE IF EXISTS repositories`)
	_, err := s.ensureDefaultEnvironment(ctx)
	return err
}

func (s *Store) ensureDefaultEnvironment(ctx context.Context) (Environment, error) {
	defaults := []struct {
		Name  string
		Slug  string
		Color string
	}{
		{Name: "Production", Slug: "production", Color: "#D83B53"},
		{Name: "Testing", Slug: "testing", Color: "#1F8E5E"},
	}

	now := dbTime(time.Now())
	for _, defaultEnvironment := range defaults {
		resourceID, err := newOpaqueID("env")
		if err != nil {
			return Environment{}, err
		}
		if _, err := s.db.ExecContext(ctx,
			`INSERT OR IGNORE INTO environments
			 (public_id, name, slug, description, color, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			resourceID, defaultEnvironment.Name, defaultEnvironment.Slug, "", defaultEnvironment.Color, now, now,
		); err != nil {
			return Environment{}, err
		}
		if _, err := s.db.ExecContext(ctx,
			`UPDATE environments
			 SET color = ?, updated_at = ?
			 WHERE slug = ? AND color = ''`,
			defaultEnvironment.Color, now, defaultEnvironment.Slug,
		); err != nil {
			return Environment{}, err
		}
	}

	return s.getEnvironmentBySlug(ctx, "production")
}

func (s *Store) getEnvironmentBySlug(ctx context.Context, slug string) (Environment, error) {
	var environment Environment
	var createdAtRaw, updatedAtRaw string
	if err := s.db.QueryRowContext(ctx,
		`SELECT id, public_id, name, slug, description, color, created_at, updated_at
		 FROM environments
		 WHERE slug = ?`,
		slug,
	).Scan(
		&environment.InternalID,
		&environment.ID,
		&environment.Name,
		&environment.Slug,
		&environment.Description,
		&environment.Color,
		&createdAtRaw,
		&updatedAtRaw,
	); err != nil {
		return Environment{}, err
	}
	environment.CreatedAt = parseDBTime(createdAtRaw)
	environment.UpdatedAt = parseDBTime(updatedAtRaw)
	return environment, nil
}

func (s *Store) LoginBlocked(ctx context.Context, policies []LoginThrottle, now time.Time) (time.Time, bool, error) {
	var latest time.Time
	for _, policy := range policies {
		until, blocked, err := s.loginBlocked(ctx, policy, now)
		if err != nil {
			return time.Time{}, false, err
		}
		if blocked && until.After(latest) {
			latest = until
		}
	}
	if latest.IsZero() {
		return time.Time{}, false, nil
	}
	return latest, true, nil
}

func (s *Store) loginBlocked(ctx context.Context, policy LoginThrottle, now time.Time) (time.Time, bool, error) {
	if policy.Scope == "" {
		return time.Time{}, false, nil
	}
	var lockedUntil string
	err := s.db.QueryRowContext(ctx,
		`SELECT locked_until FROM login_attempts WHERE scope = ?`,
		policy.Scope,
	).Scan(&lockedUntil)
	if errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	until := parseDBTime(lockedUntil)
	if until.IsZero() || !until.After(now) {
		return time.Time{}, false, nil
	}
	return until, true, nil
}

func (s *Store) RecordLoginFailure(ctx context.Context, policies []LoginThrottle, now time.Time) (time.Time, bool, error) {
	var latest time.Time
	for _, policy := range policies {
		until, locked, err := s.recordLoginFailure(ctx, policy, now)
		if err != nil {
			return time.Time{}, false, err
		}
		if locked && until.After(latest) {
			latest = until
		}
	}
	if latest.IsZero() {
		return time.Time{}, false, nil
	}
	return latest, true, nil
}

func (s *Store) recordLoginFailure(ctx context.Context, policy LoginThrottle, now time.Time) (time.Time, bool, error) {
	if policy.Scope == "" || policy.MaxFailures <= 0 || policy.Window <= 0 || policy.Lockout <= 0 {
		return time.Time{}, false, nil
	}
	var failedCount int
	var firstFailedAtRaw, lockedUntilRaw string
	err := s.db.QueryRowContext(ctx,
		`SELECT failed_count, first_failed_at, locked_until FROM login_attempts WHERE scope = ?`,
		policy.Scope,
	).Scan(&failedCount, &firstFailedAtRaw, &lockedUntilRaw)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = s.db.ExecContext(ctx,
			`INSERT INTO login_attempts (scope, failed_count, first_failed_at, last_failed_at, locked_until)
			 VALUES (?, 1, ?, ?, '')`,
			policy.Scope, dbTime(now), dbTime(now),
		)
		return time.Time{}, false, err
	}
	if err != nil {
		return time.Time{}, false, err
	}

	firstFailedAt := parseDBTime(firstFailedAtRaw)
	lockedUntil := parseDBTime(lockedUntilRaw)
	if lockedUntil.After(now) {
		return lockedUntil, true, nil
	}
	if firstFailedAt.IsZero() || now.Sub(firstFailedAt) > policy.Window {
		failedCount = 0
		firstFailedAt = now
	}
	failedCount++

	var nextLockedUntil time.Time
	if failedCount >= policy.MaxFailures {
		nextLockedUntil = now.Add(policy.Lockout)
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE login_attempts
		 SET failed_count = ?, first_failed_at = ?, last_failed_at = ?, locked_until = ?
		 WHERE scope = ?`,
		failedCount, dbTime(firstFailedAt), dbTime(now), dbTime(nextLockedUntil), policy.Scope,
	)
	if err != nil {
		return time.Time{}, false, err
	}
	return nextLockedUntil, !nextLockedUntil.IsZero(), nil
}

func (s *Store) ClearLoginFailures(ctx context.Context, scopes []string) error {
	for _, scope := range scopes {
		if scope == "" {
			continue
		}
		if _, err := s.db.ExecContext(ctx, `DELETE FROM login_attempts WHERE scope = ?`, scope); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ensureAdminUser(ctx context.Context, username, password string, updateExisting bool) error {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE username = ?`, username).Scan(&id)
	if err == nil {
		if updateExisting {
			hash, err := HashPassword(password)
			if err != nil {
				return err
			}
			_, err = s.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, hash, id)
			return err
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, hash, dbTime(time.Now()),
	)
	return err
}

func (s *Store) GetUserByUsername(ctx context.Context, username string) (User, error) {
	var user User
	var createdAt string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`,
		username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &createdAt)
	if err != nil {
		return user, err
	}
	user.CreatedAt = parseDBTime(createdAt)
	return user, nil
}

func (s *Store) ListRunners(ctx context.Context) ([]Runner, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, mode, host, port, username, work_root, private_key_cipher, created_at, updated_at
		 FROM runners ORDER BY id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runners := make([]Runner, 0)
	for rows.Next() {
		runner, err := s.scanRunner(rows, false)
		if err != nil {
			return nil, err
		}
		runners = append(runners, runner)
	}
	return runners, rows.Err()
}

func (s *Store) GetRunner(ctx context.Context, id int64, includePrivateKey bool) (Runner, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, mode, host, port, username, work_root, private_key_cipher, created_at, updated_at
		 FROM runners WHERE id = ?`,
		id,
	)
	return s.scanRunner(row, includePrivateKey)
}

func (s *Store) CreateRunner(ctx context.Context, runner Runner) (Runner, error) {
	now := dbTime(time.Now())
	cipherText, err := s.box.Seal(runner.PrivateKey)
	if err != nil {
		return Runner{}, err
	}
	result, err := s.db.ExecContext(ctx,
		`INSERT INTO runners (name, mode, host, port, username, work_root, private_key_cipher, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		runner.Name, normalizeRunnerMode(runner.Mode), runner.Host, defaultPort(runner.Port), runner.Username, runner.WorkRoot, cipherText, now, now,
	)
	if err != nil {
		return Runner{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Runner{}, err
	}
	return s.GetRunner(ctx, id, false)
}

func (s *Store) UpdateRunner(ctx context.Context, id int64, runner Runner) (Runner, error) {
	existing, err := s.GetRunner(ctx, id, true)
	if err != nil {
		return Runner{}, err
	}
	privateKey := existing.PrivateKey
	if strings.TrimSpace(runner.PrivateKey) != "" {
		privateKey = runner.PrivateKey
	}
	cipherText, err := s.box.Seal(privateKey)
	if err != nil {
		return Runner{}, err
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE runners
		 SET name = ?, mode = ?, host = ?, port = ?, username = ?, work_root = ?, private_key_cipher = ?, updated_at = ?
		 WHERE id = ?`,
		runner.Name, normalizeRunnerMode(runner.Mode), runner.Host, defaultPort(runner.Port), runner.Username, runner.WorkRoot, cipherText, dbTime(time.Now()), id,
	)
	if err != nil {
		return Runner{}, err
	}
	return s.GetRunner(ctx, id, false)
}

func (s *Store) DeleteRunner(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM runners WHERE id = ?`, id)
	return err
}

func (s *Store) ListEnvironments(ctx context.Context) ([]Environment, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, public_id, name, slug, description, color, created_at, updated_at
		 FROM environments
		 ORDER BY id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	environments := make([]Environment, 0)
	for rows.Next() {
		environment, err := s.scanEnvironment(rows)
		if err != nil {
			return nil, err
		}
		environments = append(environments, environment)
	}
	return environments, rows.Err()
}

func (s *Store) CreateEnvironment(ctx context.Context, env Environment) (Environment, error) {
	resourceID, err := newOpaqueID("env")
	if err != nil {
		return Environment{}, err
	}
	now := dbTime(time.Now())
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO environments
		 (public_id, name, slug, description, color, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		resourceID, strings.TrimSpace(env.Name), strings.TrimSpace(env.Slug), env.Description, env.Color, now, now,
	)
	if err != nil {
		return Environment{}, err
	}
	return s.getEnvironmentByID(ctx, resourceID)
}

func (s *Store) ListRepositorySources(ctx context.Context) ([]RepositorySource, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, public_id, name, provider, repo_url, deploy_key_cipher, created_at, updated_at
		 FROM repository_sources
		 ORDER BY id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := make([]RepositorySource, 0)
	for rows.Next() {
		source, err := s.scanRepositorySource(rows, false)
		if err != nil {
			return nil, err
		}
		sources = append(sources, source.RepositorySource)
	}
	return sources, rows.Err()
}

func (s *Store) CreateRepositorySource(ctx context.Context, source RepositorySource) (RepositorySource, error) {
	resourceID, err := newOpaqueID("src")
	if err != nil {
		return RepositorySource{}, err
	}
	deployKeyCipher, err := s.box.Seal(source.DeployKey)
	if err != nil {
		return RepositorySource{}, err
	}
	now := dbTime(time.Now())
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO repository_sources
		 (public_id, name, provider, repo_url, deploy_key_cipher, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		resourceID, strings.TrimSpace(source.Name), normalizeProvider(source.Provider), source.RepoURL, deployKeyCipher, now, now,
	)
	if err != nil {
		return RepositorySource{}, err
	}
	created, err := s.getRepositorySourceRecordByResourceID(ctx, resourceID, false)
	if err != nil {
		return RepositorySource{}, err
	}
	return created.RepositorySource, nil
}

func (s *Store) ListEnvironmentRepositories(ctx context.Context, environmentID string) ([]EnvironmentRepository, error) {
	query := environmentRepositorySelectSQL()
	args := make([]any, 0, 1)
	if strings.TrimSpace(environmentID) != "" {
		query += ` WHERE e.public_id = ?`
		args = append(args, strings.TrimSpace(environmentID))
	}
	query += ` ORDER BY er.id DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	repositories := make([]EnvironmentRepository, 0)
	for rows.Next() {
		repository, err := s.scanEnvironmentRepository(rows, false)
		if err != nil {
			return nil, err
		}
		repositories = append(repositories, repository.EnvironmentRepository)
	}
	return repositories, rows.Err()
}

func (s *Store) CreateEnvironmentRepository(ctx context.Context, repo EnvironmentRepository) (EnvironmentRepository, error) {
	environment, err := s.getEnvironmentByID(ctx, repo.EnvironmentID)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	source, err := s.getRepositorySourceRecordByResourceID(ctx, repo.RepositorySourceID, true)
	if err != nil {
		return EnvironmentRepository{}, err
	}

	webhookSecret := strings.TrimSpace(repo.WebhookSecret)
	if webhookSecret == "" {
		webhookSecret, err = randomToken(32)
		if err != nil {
			return EnvironmentRepository{}, err
		}
	}
	webhookSecretCipher, err := s.box.Seal(webhookSecret)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	webhookID, err := newOpaqueID("wh")
	if err != nil {
		return EnvironmentRepository{}, err
	}
	resourceID, err := newOpaqueID("repo")
	if err != nil {
		return EnvironmentRepository{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	defer tx.Rollback()

	now := dbTime(time.Now())
	_, err = tx.ExecContext(ctx,
		`INSERT INTO environment_repositories
		 (public_id, environment_id, repository_source_id, webhook_secret_cipher, webhook_id,
		  branch, work_dir, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		resourceID,
		environment.InternalID,
		source.InternalID,
		webhookSecretCipher,
		webhookID,
		normalizeBranch(repo.Branch),
		repo.WorkDir,
		repo.DeployScript,
		nullableInt64(repo.RunnerInternalID),
		boolInt(repo.CleanWorktree),
		now,
		now,
	)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	if err := tx.Commit(); err != nil {
		return EnvironmentRepository{}, err
	}

	created, err := s.getEnvironmentRepositoryRecordByResourceID(ctx, resourceID, true)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	return created.EnvironmentRepository, nil
}

func (s *Store) GetEnvironmentRepositoryByWebhookID(ctx context.Context, webhookID string) (EnvironmentRepository, error) {
	repository, err := s.getEnvironmentRepositoryRecordByWebhookID(ctx, webhookID, true)
	if err != nil {
		return EnvironmentRepository{}, err
	}
	return repository.EnvironmentRepository, nil
}

func (s *Store) ListSecrets(ctx context.Context) ([]Secret, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT s.id, s.name, s.value_cipher, s.environment_id, s.environment_repository_id,
		        COALESCE(er.public_id, ''), COALESCE(src.name, ''), s.created_at, s.updated_at
		 FROM secrets s
		 LEFT JOIN environment_repositories er ON er.id = s.environment_repository_id
		 LEFT JOIN repository_sources src ON src.id = er.repository_source_id
		 ORDER BY s.environment_repository_id IS NOT NULL, COALESCE(src.name, ''), s.name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	secrets := make([]Secret, 0)
	for rows.Next() {
		secret, err := s.scanSecret(rows, false)
		if err != nil {
			return nil, err
		}
		secrets = append(secrets, secret)
	}
	return secrets, rows.Err()
}

func (s *Store) GetSecret(ctx context.Context, id int64, includeValue bool) (Secret, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT s.id, s.name, s.value_cipher, s.environment_id, s.environment_repository_id,
		        COALESCE(er.public_id, ''), COALESCE(src.name, ''), s.created_at, s.updated_at
		 FROM secrets s
		 LEFT JOIN environment_repositories er ON er.id = s.environment_repository_id
		 LEFT JOIN repository_sources src ON src.id = er.repository_source_id
		 WHERE s.id = ?`,
		id,
	)
	return s.scanSecret(row, includeValue)
}

func (s *Store) CreateSecret(ctx context.Context, secret Secret) (Secret, error) {
	cipherText, err := s.box.Seal(secret.Value)
	if err != nil {
		return Secret{}, err
	}
	now := dbTime(time.Now())
	result, err := s.db.ExecContext(ctx,
		`INSERT INTO secrets (name, value_cipher, environment_id, environment_repository_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		normalizeSecretName(secret.Name), cipherText, secret.EnvironmentID, nullableInt64(secret.EnvironmentRepositoryID), now, now,
	)
	if err != nil {
		return Secret{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Secret{}, err
	}
	return s.GetSecret(ctx, id, false)
}

func (s *Store) UpdateSecret(ctx context.Context, id int64, secret Secret) (Secret, error) {
	existing, err := s.GetSecret(ctx, id, true)
	if err != nil {
		return Secret{}, err
	}
	value := existing.Value
	if secret.Value != "" {
		value = secret.Value
	}
	cipherText, err := s.box.Seal(value)
	if err != nil {
		return Secret{}, err
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE secrets
		 SET name = ?, value_cipher = ?, environment_id = ?, environment_repository_id = ?, updated_at = ?
		 WHERE id = ?`,
		normalizeSecretName(secret.Name), cipherText, secret.EnvironmentID, nullableInt64(secret.EnvironmentRepositoryID), dbTime(time.Now()), id,
	)
	if err != nil {
		return Secret{}, err
	}
	return s.GetSecret(ctx, id, false)
}

func (s *Store) DeleteSecret(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM secrets WHERE id = ?`, id)
	return err
}

func (s *Store) DeploymentSecrets(ctx context.Context, repositoryID string) ([]Secret, error) {
	repository, err := s.getEnvironmentRepositoryRecordByResourceID(ctx, repositoryID, false)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT s.id, s.name, s.value_cipher, s.environment_id, s.environment_repository_id,
		        COALESCE(er.public_id, ''), COALESCE(src.name, ''), s.created_at, s.updated_at
		 FROM secrets s
		 LEFT JOIN environment_repositories er ON er.id = s.environment_repository_id
		 LEFT JOIN repository_sources src ON src.id = er.repository_source_id
		 WHERE s.environment_id = ?
		   AND (s.environment_repository_id IS NULL OR s.environment_repository_id = ?)
		 ORDER BY s.environment_repository_id IS NOT NULL`,
		repository.EnvironmentInternalID,
		repository.InternalID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byName := make(map[string]Secret)
	order := make([]string, 0)
	for rows.Next() {
		secret, err := s.scanSecret(rows, true)
		if err != nil {
			return nil, err
		}
		if _, ok := byName[secret.Name]; !ok {
			order = append(order, secret.Name)
		}
		byName[secret.Name] = secret
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	secrets := make([]Secret, 0, len(order))
	for _, name := range order {
		secrets = append(secrets, byName[name])
	}
	return secrets, nil
}

func (s *Store) CreateJob(ctx context.Context, job DeployJob) (DeployJob, error) {
	now := time.Now()
	if job.TriggeredAt.IsZero() {
		job.TriggeredAt = now
	}
	if job.CreatedAt.IsZero() {
		job.CreatedAt = now
	}
	if job.Status == "" {
		job.Status = "queued"
	}
	result, err := s.db.ExecContext(ctx,
		`INSERT INTO deploy_jobs
		 (environment_repository_id, runner_id, provider, event, delivery_id, branch, commit_sha, commit_message, commit_author,
		  status, triggered_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		job.EnvironmentRepositoryID, nullableInt64(job.RunnerID), job.Provider, job.Event, job.DeliveryID, job.Branch,
		job.CommitSHA, job.CommitMessage, job.CommitAuthor, job.Status, dbTime(job.TriggeredAt), dbTime(job.CreatedAt),
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") && job.DeliveryID != "" {
			existing, lookupErr := s.GetJobByDelivery(ctx, job.EnvironmentRepositoryID, job.DeliveryID)
			if lookupErr == nil {
				return existing, ErrDuplicateDelivery
			}
		}
		return DeployJob{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return DeployJob{}, err
	}
	return s.GetJob(ctx, id)
}

func (s *Store) GetJobByDelivery(ctx context.Context, environmentRepositoryID int64, deliveryID string) (DeployJob, error) {
	row := s.db.QueryRowContext(ctx, jobSelectSQL()+` WHERE j.environment_repository_id = ? AND j.delivery_id = ?`, environmentRepositoryID, deliveryID)
	return s.scanJob(row)
}

func (s *Store) GetJob(ctx context.Context, id int64) (DeployJob, error) {
	row := s.db.QueryRowContext(ctx, jobSelectSQL()+` WHERE j.id = ?`, id)
	return s.scanJob(row)
}

func (s *Store) ListJobs(ctx context.Context, environmentRepositoryID int64) ([]DeployJob, error) {
	query := jobSelectSQL()
	var args []any
	if environmentRepositoryID > 0 {
		query += ` WHERE j.environment_repository_id = ?`
		args = append(args, environmentRepositoryID)
	}
	query += ` ORDER BY j.id DESC LIMIT 200`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	jobs := make([]DeployJob, 0)
	for rows.Next() {
		job, err := s.scanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (s *Store) ClaimNextJob(ctx context.Context) (DeployJob, bool, error) {
	for {
		var id int64
		err := s.db.QueryRowContext(ctx,
			`SELECT id FROM deploy_jobs WHERE status = 'queued' ORDER BY id LIMIT 1`,
		).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			return DeployJob{}, false, nil
		}
		if err != nil {
			return DeployJob{}, false, err
		}
		startedAt := dbTime(time.Now())
		result, err := s.db.ExecContext(ctx,
			`UPDATE deploy_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'`,
			startedAt, id,
		)
		if err != nil {
			return DeployJob{}, false, err
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return DeployJob{}, false, err
		}
		if rows == 1 {
			job, err := s.GetJob(ctx, id)
			return job, true, err
		}
	}
}

func (s *Store) FinishJob(ctx context.Context, id int64, status string, exitCode *int, errText string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE deploy_jobs SET status = ?, exit_code = ?, error = ?, finished_at = ? WHERE id = ?`,
		status, nullableInt(exitCode), errText, dbTime(time.Now()), id,
	)
	return err
}

func (s *Store) AddJobLog(ctx context.Context, jobID int64, stream, line string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO job_logs (job_id, stream, line, created_at) VALUES (?, ?, ?, ?)`,
		jobID, stream, sanitizeLogLine(line), dbTime(time.Now()),
	)
	return err
}

func (s *Store) ListJobLogs(ctx context.Context, jobID int64) ([]JobLogLine, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, job_id, stream, line, created_at FROM job_logs WHERE job_id = ? ORDER BY id`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := make([]JobLogLine, 0)
	for rows.Next() {
		var line JobLogLine
		var createdAt string
		if err := rows.Scan(&line.ID, &line.JobID, &line.Stream, &line.Line, &createdAt); err != nil {
			return nil, err
		}
		line.CreatedAt = parseDBTime(createdAt)
		logs = append(logs, line)
	}
	return logs, rows.Err()
}

type scanner interface {
	Scan(dest ...any) error
}

type repositorySourceRecord struct {
	RepositorySource
	DeployKeyCipher string
}

type environmentRepositoryRecord struct {
	EnvironmentRepository
	WebhookSecretCipher string
}

func (s *Store) getEnvironmentByID(ctx context.Context, resourceID string) (Environment, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, public_id, name, slug, description, color, created_at, updated_at
		 FROM environments
		 WHERE public_id = ?`,
		strings.TrimSpace(resourceID),
	)
	return s.scanEnvironment(row)
}

func (s *Store) getRepositorySourceRecordByResourceID(ctx context.Context, resourceID string, includeDeployKey bool) (repositorySourceRecord, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, public_id, name, provider, repo_url, deploy_key_cipher, created_at, updated_at
		 FROM repository_sources
		 WHERE public_id = ?`,
		strings.TrimSpace(resourceID),
	)
	return s.scanRepositorySource(row, includeDeployKey)
}

func (s *Store) getRepositorySourceRecordByInternalID(ctx context.Context, id int64, includeDeployKey bool) (repositorySourceRecord, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, public_id, name, provider, repo_url, deploy_key_cipher, created_at, updated_at
		 FROM repository_sources
		 WHERE id = ?`,
		id,
	)
	return s.scanRepositorySource(row, includeDeployKey)
}

func (s *Store) getEnvironmentRepositoryRecordByResourceID(ctx context.Context, resourceID string, includeSensitive bool) (environmentRepositoryRecord, error) {
	row := s.db.QueryRowContext(ctx,
		environmentRepositorySelectSQL()+` WHERE er.public_id = ?`,
		strings.TrimSpace(resourceID),
	)
	return s.scanEnvironmentRepository(row, includeSensitive)
}

func (s *Store) getEnvironmentRepositoryRecordByWebhookID(ctx context.Context, webhookID string, includeSensitive bool) (environmentRepositoryRecord, error) {
	row := s.db.QueryRowContext(ctx,
		environmentRepositorySelectSQL()+` WHERE er.webhook_id = ?`,
		strings.TrimSpace(webhookID),
	)
	return s.scanEnvironmentRepository(row, includeSensitive)
}

func (s *Store) getEnvironmentRepositoryRecordByInternalID(ctx context.Context, id int64, includeSensitive bool) (environmentRepositoryRecord, error) {
	row := s.db.QueryRowContext(ctx,
		environmentRepositorySelectSQL()+` WHERE er.id = ?`,
		id,
	)
	return s.scanEnvironmentRepository(row, includeSensitive)
}

func environmentRepositorySelectSQL() string {
	return `SELECT er.id, er.public_id, er.environment_id, e.public_id, e.name,
		er.repository_source_id, s.public_id, s.name, s.provider, s.repo_url,
		er.webhook_secret_cipher, er.webhook_id, er.branch, er.work_dir, er.deploy_script,
		er.runner_id, COALESCE(a.name, ''), er.clean_worktree, s.deploy_key_cipher,
		er.created_at, er.updated_at
		FROM environment_repositories er
		INNER JOIN environments e ON e.id = er.environment_id
		INNER JOIN repository_sources s ON s.id = er.repository_source_id
		LEFT JOIN runners a ON a.id = er.runner_id`
}

func (s *Store) scanEnvironment(row scanner) (Environment, error) {
	var environment Environment
	var createdAt, updatedAt string
	if err := row.Scan(
		&environment.InternalID,
		&environment.ID,
		&environment.Name,
		&environment.Slug,
		&environment.Description,
		&environment.Color,
		&createdAt,
		&updatedAt,
	); err != nil {
		return environment, err
	}
	environment.CreatedAt = parseDBTime(createdAt)
	environment.UpdatedAt = parseDBTime(updatedAt)
	return environment, nil
}

func (s *Store) scanRepositorySource(row scanner, includeDeployKey bool) (repositorySourceRecord, error) {
	var source repositorySourceRecord
	var createdAt, updatedAt string
	if err := row.Scan(
		&source.InternalID,
		&source.ID,
		&source.Name,
		&source.Provider,
		&source.RepoURL,
		&source.DeployKeyCipher,
		&createdAt,
		&updatedAt,
	); err != nil {
		return source, err
	}
	source.HasDeployKey = source.DeployKeyCipher != ""
	if includeDeployKey {
		deployKey, err := s.box.Open(source.DeployKeyCipher)
		if err != nil {
			return source, err
		}
		source.DeployKey = deployKey
	}
	source.CreatedAt = parseDBTime(createdAt)
	source.UpdatedAt = parseDBTime(updatedAt)
	return source, nil
}

func (s *Store) scanEnvironmentRepository(row scanner, includeSensitive bool) (environmentRepositoryRecord, error) {
	var repository environmentRepositoryRecord
	var runnerID sql.NullInt64
	var deployKeyCipher string
	var clean int
	var createdAt, updatedAt string
	if err := row.Scan(
		&repository.InternalID,
		&repository.ID,
		&repository.EnvironmentInternalID,
		&repository.EnvironmentID,
		&repository.EnvironmentName,
		&repository.RepositorySourceInternalID,
		&repository.RepositorySourceID,
		&repository.Name,
		&repository.Provider,
		&repository.RepoURL,
		&repository.WebhookSecretCipher,
		&repository.WebhookID,
		&repository.Branch,
		&repository.WorkDir,
		&repository.DeployScript,
		&runnerID,
		&repository.Runner,
		&clean,
		&deployKeyCipher,
		&createdAt,
		&updatedAt,
	); err != nil {
		return repository, err
	}
	if runnerID.Valid {
		repository.RunnerInternalID = &runnerID.Int64
		repository.RunnerID = strconv.FormatInt(runnerID.Int64, 10)
	}
	repository.HasDeployKey = deployKeyCipher != ""
	repository.CleanWorktree = clean != 0
	repository.WebhookURL = fmt.Sprintf("%s/webhooks/%s", s.publicURL, repository.WebhookID)
	if includeSensitive {
		webhookSecret, err := s.box.Open(repository.WebhookSecretCipher)
		if err != nil {
			return repository, err
		}
		repository.WebhookSecret = webhookSecret
		deployKey, err := s.box.Open(deployKeyCipher)
		if err != nil {
			return repository, err
		}
		repository.DeployKey = deployKey
	}
	repository.CreatedAt = parseDBTime(createdAt)
	repository.UpdatedAt = parseDBTime(updatedAt)
	return repository, nil
}

func (s *Store) scanRunner(row scanner, includePrivateKey bool) (Runner, error) {
	var runner Runner
	var privateKeyCipher, createdAt, updatedAt string
	if err := row.Scan(&runner.ID, &runner.Name, &runner.Mode, &runner.Host, &runner.Port, &runner.Username, &runner.WorkRoot, &privateKeyCipher, &createdAt, &updatedAt); err != nil {
		return runner, err
	}
	runner.HasPrivateKey = privateKeyCipher != ""
	if includePrivateKey {
		privateKey, err := s.box.Open(privateKeyCipher)
		if err != nil {
			return runner, err
		}
		runner.PrivateKey = privateKey
	}
	runner.CreatedAt = parseDBTime(createdAt)
	runner.UpdatedAt = parseDBTime(updatedAt)
	return runner, nil
}

var ansiEscapeSequence = regexp.MustCompile("\x1b\\[[0-?]*[ -/]*[@-~]")

func sanitizeLogLine(line string) string {
	line = ansiEscapeSequence.ReplaceAllString(line, "")
	return strings.Map(func(r rune) rune {
		switch r {
		case '\t':
			return r
		}
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, line)
}

func (s *Store) scanSecret(row scanner, includeValue bool) (Secret, error) {
	var secret Secret
	var valueCipher, createdAt, updatedAt string
	var environmentRepositoryID sql.NullInt64
	if err := row.Scan(
		&secret.ID,
		&secret.Name,
		&valueCipher,
		&secret.EnvironmentID,
		&environmentRepositoryID,
		&secret.RepositoryID,
		&secret.Repository,
		&createdAt,
		&updatedAt,
	); err != nil {
		return secret, err
	}
	if environmentRepositoryID.Valid {
		secret.EnvironmentRepositoryID = &environmentRepositoryID.Int64
	}
	value, err := s.box.Open(valueCipher)
	if err != nil {
		return secret, err
	}
	if includeValue {
		secret.Value = value
	}
	secret.MaskedValue = maskSecret(value)
	secret.CreatedAt = parseDBTime(createdAt)
	secret.UpdatedAt = parseDBTime(updatedAt)
	return secret, nil
}

func (s *Store) scanJob(row scanner) (DeployJob, error) {
	var job DeployJob
	var runnerID sql.NullInt64
	var exitCode sql.NullInt64
	var triggeredAt, startedAt, finishedAt, createdAt sql.NullString
	if err := row.Scan(
		&job.ID, &job.EnvironmentRepositoryID, &job.RepositoryID, &job.RepositoryName, &runnerID, &job.RunnerName, &job.Provider,
		&job.Event, &job.DeliveryID, &job.Branch, &job.CommitSHA, &job.CommitMessage, &job.CommitAuthor,
		&job.Status, &exitCode, &job.Error, &triggeredAt, &startedAt, &finishedAt, &createdAt,
	); err != nil {
		return job, err
	}
	if runnerID.Valid {
		job.RunnerID = &runnerID.Int64
	}
	if exitCode.Valid {
		code := int(exitCode.Int64)
		job.ExitCode = &code
	}
	job.TriggeredAt = parseDBTime(triggeredAt.String)
	if startedAt.Valid && startedAt.String != "" {
		t := parseDBTime(startedAt.String)
		job.StartedAt = &t
	}
	if finishedAt.Valid && finishedAt.String != "" {
		t := parseDBTime(finishedAt.String)
		job.FinishedAt = &t
	}
	job.CreatedAt = parseDBTime(createdAt.String)
	return job, nil
}

func jobSelectSQL() string {
	return `SELECT j.id, j.environment_repository_id, er.public_id, src.name, j.runner_id, COALESCE(a.name, ''), j.provider,
		j.event, j.delivery_id, j.branch, j.commit_sha, j.commit_message, j.commit_author,
		j.status, j.exit_code, j.error, j.triggered_at, j.started_at, j.finished_at, j.created_at
		FROM deploy_jobs j
		INNER JOIN environment_repositories er ON er.id = j.environment_repository_id
		INNER JOIN repository_sources src ON src.id = er.repository_source_id
		LEFT JOIN runners a ON a.id = j.runner_id`
}

func normalizeProvider(provider string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	switch provider {
	case "gitee", "gitlab", "generic":
		return provider
	default:
		return "github"
	}
}

func normalizeRunnerMode(mode string) string {
	if strings.EqualFold(mode, "ssh") {
		return "ssh"
	}
	return "local"
}

func normalizeBranch(branch string) string {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return "main"
	}
	return strings.TrimPrefix(branch, "refs/heads/")
}

func normalizeSecretName(name string) string {
	return strings.ToUpper(strings.TrimSpace(name))
}

func nextUniqueRepositorySourceName(name string, used map[string]struct{}) string {
	baseName := strings.TrimSpace(name)
	if baseName == "" {
		baseName = "repository"
	}

	candidate := baseName
	for suffix := 1; ; suffix++ {
		if suffix > 1 {
			candidate = fmt.Sprintf("%s-%d", baseName, suffix)
		}
		if _, exists := used[candidate]; exists {
			continue
		}
		used[candidate] = struct{}{}
		return candidate
	}
}

func maskSecret(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 4 {
		return "••••"
	}
	if len(value) <= 8 {
		return value[:2] + "••••" + value[len(value)-2:]
	}
	return value[:4] + "••••••" + value[len(value)-4:]
}

func defaultPort(port int) int {
	if port <= 0 {
		return 22
	}
	return port
}

func (s *Store) newUniqueWebhookID(used map[string]struct{}) (string, error) {
	for {
		webhookID, err := newOpaqueID("wh")
		if err != nil {
			return "", err
		}
		if _, exists := used[webhookID]; exists {
			continue
		}
		used[webhookID] = struct{}{}
		return webhookID, nil
	}
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableSQLInt64(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

func nullableInt(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func dbTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

func parseDBTime(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}
	}
	return t
}
