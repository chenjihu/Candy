package candy

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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
	if err := store.removeLegacyDefaultAdmin(ctx, cfg.AdminUsername); err != nil {
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
	if err := s.migrateRunnerTerminology(ctx); err != nil {
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
		`CREATE TABLE IF NOT EXISTS repositories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			provider TEXT NOT NULL DEFAULT 'github',
			repo_url TEXT NOT NULL,
			webhook_secret_cipher TEXT NOT NULL,
			branch TEXT NOT NULL,
			work_dir TEXT NOT NULL,
			deploy_key_cipher TEXT NOT NULL DEFAULT '',
			deploy_script TEXT NOT NULL,
			runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
			clean_worktree INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS deploy_jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
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
			ON deploy_jobs(repository_id, delivery_id)
			WHERE delivery_id <> '';`,
		`CREATE INDEX IF NOT EXISTS deploy_jobs_status_idx ON deploy_jobs(status, id);`,
		`CREATE INDEX IF NOT EXISTS deploy_jobs_repository_idx ON deploy_jobs(repository_id, id);`,
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
	return nil
}

func (s *Store) migrateRunnerTerminology(ctx context.Context) error {
	agentsExists, err := s.tableExists(ctx, "agents")
	if err != nil {
		return err
	}
	repositoriesUseAgentID, err := s.tableHasColumn(ctx, "repositories", "agent_id")
	if err != nil {
		return err
	}
	deployJobsUseAgentID, err := s.tableHasColumn(ctx, "deploy_jobs", "agent_id")
	if err != nil {
		return err
	}
	if !agentsExists && !repositoriesUseAgentID && !deployJobsUseAgentID {
		return nil
	}

	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys=OFF;`); err != nil {
		return err
	}
	defer conn.ExecContext(context.Background(), `PRAGMA foreign_keys=ON;`)

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS runners (
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
	);`); err != nil {
		return err
	}
	if agentsExists {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO runners
			(id, name, mode, host, port, username, work_root, private_key_cipher, created_at, updated_at)
			SELECT id, name, mode, host, port, username, work_root, private_key_cipher, created_at, updated_at
			FROM agents;`); err != nil {
			return err
		}
	}
	if repositoriesUseAgentID {
		if err := s.rebuildRepositoriesWithRunnerID(ctx, tx); err != nil {
			return err
		}
	}
	if deployJobsUseAgentID {
		if err := s.rebuildDeployJobsWithRunnerID(ctx, tx); err != nil {
			return err
		}
	}
	if agentsExists {
		if _, err := tx.ExecContext(ctx, `DROP TABLE IF EXISTS agents;`); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) rebuildRepositoriesWithRunnerID(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `ALTER TABLE repositories RENAME TO repositories_runner_migration_old;`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `CREATE TABLE repositories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		provider TEXT NOT NULL DEFAULT 'github',
		repo_url TEXT NOT NULL,
		webhook_secret_cipher TEXT NOT NULL,
		branch TEXT NOT NULL,
		work_dir TEXT NOT NULL,
		deploy_key_cipher TEXT NOT NULL DEFAULT '',
		deploy_script TEXT NOT NULL,
		runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
		clean_worktree INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO repositories
		(id, name, provider, repo_url, webhook_secret_cipher, branch, work_dir,
		 deploy_key_cipher, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		SELECT id, name, provider, repo_url, webhook_secret_cipher, branch, work_dir,
		 deploy_key_cipher, deploy_script, agent_id, clean_worktree, created_at, updated_at
		FROM repositories_runner_migration_old;`); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DROP TABLE repositories_runner_migration_old;`)
	return err
}

func (s *Store) rebuildDeployJobsWithRunnerID(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS deploy_jobs_delivery_idx;`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS deploy_jobs_status_idx;`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS deploy_jobs_repository_idx;`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `ALTER TABLE deploy_jobs RENAME TO deploy_jobs_runner_migration_old;`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `CREATE TABLE deploy_jobs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
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
	);`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO deploy_jobs
		(id, repository_id, runner_id, provider, event, delivery_id, branch, commit_sha, commit_message, commit_author,
		 status, exit_code, error, triggered_at, started_at, finished_at, created_at)
		SELECT id, repository_id, agent_id, provider, event, delivery_id, branch, commit_sha, commit_message, commit_author,
		 status, exit_code, error, triggered_at, started_at, finished_at, created_at
		FROM deploy_jobs_runner_migration_old;`); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DROP TABLE deploy_jobs_runner_migration_old;`)
	return err
}

func (s *Store) tableExists(ctx context.Context, table string) (bool, error) {
	var name string
	err := s.db.QueryRowContext(ctx,
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
		table,
	).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (s *Store) tableHasColumn(ctx context.Context, table string, column string) (bool, error) {
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`PRAGMA table_info(%s)`, sqliteIdentifier(table)))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

func sqliteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
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

func (s *Store) removeLegacyDefaultAdmin(ctx context.Context, configuredUsername string) error {
	if strings.EqualFold(strings.TrimSpace(configuredUsername), "admin") {
		return nil
	}
	var id int64
	var passwordHash string
	err := s.db.QueryRowContext(ctx, `SELECT id, password_hash FROM users WHERE username = ?`, "admin").Scan(&id, &passwordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !VerifyPassword("admin123", passwordHash) {
		return nil
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
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

func (s *Store) ListRepositories(ctx context.Context) ([]Repository, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT r.id, r.name, r.provider, r.repo_url, r.webhook_secret_cipher, r.branch, r.work_dir,
		        r.deploy_key_cipher, r.deploy_script, r.runner_id, COALESCE(a.name, ''), r.clean_worktree,
		        r.created_at, r.updated_at,
		        COALESCE((SELECT status FROM deploy_jobs j WHERE j.repository_id = r.id ORDER BY j.id DESC LIMIT 1), ''),
		        COALESCE((SELECT commit_sha FROM deploy_jobs j WHERE j.repository_id = r.id ORDER BY j.id DESC LIMIT 1), ''),
		        COALESCE((SELECT finished_at FROM deploy_jobs j WHERE j.repository_id = r.id ORDER BY j.id DESC LIMIT 1), '')
		 FROM repositories r
		 LEFT JOIN runners a ON a.id = r.runner_id
		 ORDER BY r.id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	repos := make([]Repository, 0)
	for rows.Next() {
		repo, err := s.scanRepository(rows, true)
		if err != nil {
			return nil, err
		}
		repos = append(repos, repo)
	}
	return repos, rows.Err()
}

func (s *Store) GetRepository(ctx context.Context, id int64, includeDeployKey bool) (Repository, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT r.id, r.name, r.provider, r.repo_url, r.webhook_secret_cipher, r.branch, r.work_dir,
		        r.deploy_key_cipher, r.deploy_script, r.runner_id, COALESCE(a.name, ''), r.clean_worktree,
		        r.created_at, r.updated_at, '', '', ''
		 FROM repositories r
		 LEFT JOIN runners a ON a.id = r.runner_id
		 WHERE r.id = ?`,
		id,
	)
	return s.scanRepository(row, includeDeployKey)
}

func (s *Store) CreateRepository(ctx context.Context, repo Repository) (Repository, error) {
	if strings.TrimSpace(repo.WebhookSecret) == "" {
		secret, err := randomToken(32)
		if err != nil {
			return Repository{}, err
		}
		repo.WebhookSecret = secret
	}
	webhookCipher, err := s.box.Seal(repo.WebhookSecret)
	if err != nil {
		return Repository{}, err
	}
	deployKeyCipher, err := s.box.Seal(repo.DeployKey)
	if err != nil {
		return Repository{}, err
	}
	now := dbTime(time.Now())
	result, err := s.db.ExecContext(ctx,
		`INSERT INTO repositories
		 (name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		repo.Name, normalizeProvider(repo.Provider), repo.RepoURL, webhookCipher, normalizeBranch(repo.Branch),
		repo.WorkDir, deployKeyCipher, repo.DeployScript, nullableInt64(repo.RunnerID), boolInt(repo.CleanWorktree), now, now,
	)
	if err != nil {
		return Repository{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Repository{}, err
	}
	return s.GetRepository(ctx, id, false)
}

func (s *Store) UpdateRepository(ctx context.Context, id int64, repo Repository) (Repository, error) {
	existing, err := s.GetRepository(ctx, id, true)
	if err != nil {
		return Repository{}, err
	}
	webhookSecret := existing.WebhookSecret
	if strings.TrimSpace(repo.WebhookSecret) != "" {
		webhookSecret = repo.WebhookSecret
	}
	deployKey := existing.DeployKey
	if strings.TrimSpace(repo.DeployKey) != "" {
		deployKey = repo.DeployKey
	}
	webhookCipher, err := s.box.Seal(webhookSecret)
	if err != nil {
		return Repository{}, err
	}
	deployKeyCipher, err := s.box.Seal(deployKey)
	if err != nil {
		return Repository{}, err
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE repositories
		 SET name = ?, provider = ?, repo_url = ?, webhook_secret_cipher = ?, branch = ?, work_dir = ?,
		     deploy_key_cipher = ?, deploy_script = ?, runner_id = ?, clean_worktree = ?, updated_at = ?
		 WHERE id = ?`,
		repo.Name, normalizeProvider(repo.Provider), repo.RepoURL, webhookCipher, normalizeBranch(repo.Branch),
		repo.WorkDir, deployKeyCipher, repo.DeployScript, nullableInt64(repo.RunnerID), boolInt(repo.CleanWorktree), dbTime(time.Now()), id,
	)
	if err != nil {
		return Repository{}, err
	}
	return s.GetRepository(ctx, id, false)
}

func (s *Store) DeleteRepository(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM repositories WHERE id = ?`, id)
	return err
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
		 (repository_id, runner_id, provider, event, delivery_id, branch, commit_sha, commit_message, commit_author,
		  status, triggered_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		job.RepositoryID, nullableInt64(job.RunnerID), job.Provider, job.Event, job.DeliveryID, job.Branch,
		job.CommitSHA, job.CommitMessage, job.CommitAuthor, job.Status, dbTime(job.TriggeredAt), dbTime(job.CreatedAt),
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") && job.DeliveryID != "" {
			existing, lookupErr := s.GetJobByDelivery(ctx, job.RepositoryID, job.DeliveryID)
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

func (s *Store) GetJobByDelivery(ctx context.Context, repositoryID int64, deliveryID string) (DeployJob, error) {
	row := s.db.QueryRowContext(ctx, jobSelectSQL()+` WHERE j.repository_id = ? AND j.delivery_id = ?`, repositoryID, deliveryID)
	return s.scanJob(row)
}

func (s *Store) GetJob(ctx context.Context, id int64) (DeployJob, error) {
	row := s.db.QueryRowContext(ctx, jobSelectSQL()+` WHERE j.id = ?`, id)
	return s.scanJob(row)
}

func (s *Store) ListJobs(ctx context.Context, repositoryID int64) ([]DeployJob, error) {
	query := jobSelectSQL()
	var args []any
	if repositoryID > 0 {
		query += ` WHERE j.repository_id = ?`
		args = append(args, repositoryID)
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

func (s *Store) scanRepository(row scanner, includeDeployKey bool) (Repository, error) {
	var repo Repository
	var webhookCipher, deployKeyCipher, createdAt, updatedAt string
	var runnerID sql.NullInt64
	var clean int
	if err := row.Scan(
		&repo.ID, &repo.Name, &repo.Provider, &repo.RepoURL, &webhookCipher, &repo.Branch, &repo.WorkDir,
		&deployKeyCipher, &repo.DeployScript, &runnerID, &repo.RunnerName, &clean, &createdAt, &updatedAt,
		&repo.LastJobStatus, &repo.LastJobCommit, &repo.LastJobFinished,
	); err != nil {
		return repo, err
	}
	if runnerID.Valid {
		repo.RunnerID = &runnerID.Int64
	}
	secret, err := s.box.Open(webhookCipher)
	if err != nil {
		return repo, err
	}
	repo.WebhookSecret = secret
	repo.WebhookURL = fmt.Sprintf("%s/webhooks/%d", s.publicURL, repo.ID)
	repo.HasDeployKey = deployKeyCipher != ""
	repo.CleanWorktree = clean != 0
	if includeDeployKey {
		deployKey, err := s.box.Open(deployKeyCipher)
		if err != nil {
			return repo, err
		}
		repo.DeployKey = deployKey
	}
	repo.CreatedAt = parseDBTime(createdAt)
	repo.UpdatedAt = parseDBTime(updatedAt)
	return repo, nil
}

func (s *Store) scanJob(row scanner) (DeployJob, error) {
	var job DeployJob
	var runnerID sql.NullInt64
	var exitCode sql.NullInt64
	var triggeredAt, startedAt, finishedAt, createdAt sql.NullString
	if err := row.Scan(
		&job.ID, &job.RepositoryID, &job.RepositoryName, &runnerID, &job.RunnerName, &job.Provider,
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
	return `SELECT j.id, j.repository_id, r.name, j.runner_id, COALESCE(a.name, ''), j.provider,
		j.event, j.delivery_id, j.branch, j.commit_sha, j.commit_message, j.commit_author,
		j.status, j.exit_code, j.error, j.triggered_at, j.started_at, j.finished_at, j.created_at
		FROM deploy_jobs j
		INNER JOIN repositories r ON r.id = j.repository_id
		LEFT JOIN runners a ON a.id = j.runner_id`
}

func normalizeProvider(provider string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	switch provider {
	case "gitee", "generic":
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

func defaultPort(port int) int {
	if port <= 0 {
		return 22
	}
	return port
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
