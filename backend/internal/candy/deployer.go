package candy

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Deployer struct {
	app *App
}

type commandResult struct {
	ExitCode int
}

func NewDeployer(app *App) *Deployer {
	return &Deployer{app: app}
}

func (a *App) StartWorkers(ctx context.Context) {
	for i := 0; i < a.cfg.WorkerCount; i++ {
		workerID := i + 1
		go func() {
			deployer := NewDeployer(a)
			deployer.worker(ctx, workerID)
		}()
	}
}

func (d *Deployer) worker(ctx context.Context, workerID int) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		job, ok, err := d.app.store.ClaimNextJob(ctx)
		if err != nil {
			log.Printf("worker %d claim job: %v", workerID, err)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				continue
			}
		}
		if !ok {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				continue
			}
		}
		jobCtx, cancel := context.WithTimeout(ctx, d.app.cfg.JobTimeout)
		exitCode, err := d.RunJob(jobCtx, job)
		cancel()
		status := "succeeded"
		errText := ""
		if err != nil {
			status = "failed"
			errText = err.Error()
		}
		if finishErr := d.app.store.FinishJob(context.Background(), job.ID, status, exitCode, errText); finishErr != nil {
			log.Printf("worker %d finish job %d: %v", workerID, job.ID, finishErr)
		}
	}
}

func (d *Deployer) RunJob(ctx context.Context, job DeployJob) (*int, error) {
	repo, err := d.app.store.GetRepository(ctx, job.RepositoryID, true)
	if err != nil {
		return nil, err
	}
	runner := Runner{Name: "local", Mode: "local"}
	if repo.RunnerID != nil {
		runner, err = d.app.store.GetRunner(ctx, *repo.RunnerID, true)
		if err != nil {
			return nil, err
		}
	}

	lock := d.app.repoLock(repo.ID)
	lock.Lock()
	defer lock.Unlock()

	logLine := func(stream, line string) {
		if err := d.app.store.AddJobLog(context.Background(), job.ID, stream, line); err != nil {
			log.Printf("job %d log: %v", job.ID, err)
		}
	}

	logLine("system", fmt.Sprintf("deployment queued for %s on branch %s", repo.Name, repo.Branch))
	if job.CommitSHA != "" {
		logLine("system", "target commit "+job.CommitSHA)
	}

	checkoutPath, cleanup, err := d.checkout(ctx, repo, runner, job.CommitSHA, logLine)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return commandExitCode(err), err
	}

	if normalizeRunnerMode(runner.Mode) == "ssh" {
		if err := d.deploySSH(ctx, repo, runner, checkoutPath, job, logLine); err != nil {
			return commandExitCode(err), err
		}
		return intPtr(0), nil
	}

	if err := d.runLocalScript(ctx, repo, checkoutPath, job, logLine); err != nil {
		return commandExitCode(err), err
	}
	return intPtr(0), nil
}

func (d *Deployer) TestRunner(ctx context.Context, runner Runner) error {
	if normalizeRunnerMode(runner.Mode) != "ssh" {
		return nil
	}
	keyPath, cleanup, err := writeTempKey(runner.PrivateKey)
	if err != nil {
		return err
	}
	defer cleanup()
	args := sshArgs(runner, keyPath, "true")
	_, err = runCommand(ctx, "", nil, nil, "ssh", args...)
	return err
}

func (d *Deployer) checkout(ctx context.Context, repo Repository, runner Runner, commit string, logLine func(string, string)) (string, func(), error) {
	checkoutPath := repo.WorkDir
	if normalizeRunnerMode(runner.Mode) == "ssh" {
		checkoutPath = filepath.Join(d.app.cfg.DataDir, "checkouts", fmt.Sprintf("repo-%d", repo.ID))
	}
	keyPath, cleanup, err := writeTempKey(repo.DeployKey)
	if err != nil {
		return "", cleanup, err
	}

	env := []string{"GIT_TERMINAL_PROMPT=0"}
	if keyPath != "" {
		env = append(env, "GIT_SSH_COMMAND=ssh -i "+keyPath+" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new")
	} else {
		env = append(env, "GIT_SSH_COMMAND=ssh -o StrictHostKeyChecking=accept-new")
	}

	if !hasGitDir(checkoutPath) {
		if err := ensureCloneTarget(checkoutPath); err != nil {
			return "", cleanup, err
		}
		logLine("system", "cloning repository into "+checkoutPath)
		if _, err := runCommand(ctx, "", env, logLine, "git", "clone", "--branch", repo.Branch, "--single-branch", repo.RepoURL, checkoutPath); err != nil {
			return "", cleanup, err
		}
	} else {
		logLine("system", "updating repository in "+checkoutPath)
		if _, err := runCommand(ctx, "", env, logLine, "git", "-C", checkoutPath, "remote", "set-url", "origin", repo.RepoURL); err != nil {
			return "", cleanup, err
		}
		if _, err := runCommand(ctx, "", env, logLine, "git", "-C", checkoutPath, "fetch", "origin", repo.Branch, "--prune"); err != nil {
			return "", cleanup, err
		}
	}

	if commit != "" {
		if _, err := runCommand(ctx, "", env, logLine, "git", "-C", checkoutPath, "checkout", "--force", commit); err != nil {
			return "", cleanup, err
		}
	} else {
		remoteBranch := "origin/" + repo.Branch
		if _, err := runCommand(ctx, "", env, logLine, "git", "-C", checkoutPath, "checkout", "-B", repo.Branch, remoteBranch); err != nil {
			return "", cleanup, err
		}
		if _, err := runCommand(ctx, "", env, logLine, "git", "-C", checkoutPath, "reset", "--hard", remoteBranch); err != nil {
			return "", cleanup, err
		}
	}

	if repo.CleanWorktree {
		if _, err := runCommand(ctx, "", env, logLine, "git", "-C", checkoutPath, "clean", "-fdx"); err != nil {
			return "", cleanup, err
		}
	}
	return checkoutPath, cleanup, nil
}

func (d *Deployer) runLocalScript(ctx context.Context, repo Repository, checkoutPath string, job DeployJob, logLine func(string, string)) error {
	logLine("system", "running deployment script locally")
	env := deploymentEnv(repo, job)
	_, err := runCommand(ctx, checkoutPath, env, logLine, "bash", "-lc", repo.DeployScript)
	return err
}

func (d *Deployer) deploySSH(ctx context.Context, repo Repository, runner Runner, checkoutPath string, job DeployJob, logLine func(string, string)) error {
	keyPath, cleanup, err := writeTempKey(runner.PrivateKey)
	if err != nil {
		return err
	}
	defer cleanup()

	remoteDir := remoteWorkDir(runner, repo)
	logLine("system", "creating remote work directory "+remoteDir)
	if _, err := runCommand(ctx, "", nil, logLine, "ssh", sshArgs(runner, keyPath, "mkdir -p "+shellQuote(remoteDir))...); err != nil {
		return err
	}

	logLine("system", "copying checkout to SSH Runner with scp")
	scpArgs := scpArgs(runner, keyPath, filepath.Join(checkoutPath, "."), sshTarget(runner)+":"+remoteDir)
	if _, err := runCommand(ctx, "", nil, logLine, "scp", scpArgs...); err != nil {
		return err
	}

	logLine("system", "running deployment script on SSH Runner")
	remoteCommand := "cd " + shellQuote(remoteDir) + " && " + envPrefix(deploymentEnv(repo, job)) + " bash -lc " + shellQuote(repo.DeployScript)
	if _, err := runCommand(ctx, "", nil, logLine, "ssh", sshArgs(runner, keyPath, remoteCommand)...); err != nil {
		return err
	}
	return nil
}

func deploymentEnv(repo Repository, job DeployJob) []string {
	return []string{
		"CANDY_REPOSITORY_ID=" + strconv.FormatInt(repo.ID, 10),
		"CANDY_REPOSITORY_NAME=" + repo.Name,
		"CANDY_REPOSITORY_URL=" + repo.RepoURL,
		"CANDY_BRANCH=" + repo.Branch,
		"CANDY_COMMIT_SHA=" + job.CommitSHA,
		"CANDY_JOB_ID=" + strconv.FormatInt(job.ID, 10),
	}
}

func envPrefix(env []string) string {
	if len(env) == 0 {
		return ""
	}
	parts := make([]string, 0, len(env))
	for _, item := range env {
		name, value, ok := strings.Cut(item, "=")
		if !ok {
			continue
		}
		parts = append(parts, name+"="+shellQuote(value))
	}
	return strings.Join(parts, " ")
}

func hasGitDir(path string) bool {
	info, err := os.Stat(filepath.Join(path, ".git"))
	return err == nil && info.IsDir()
}

func ensureCloneTarget(path string) error {
	if entries, err := os.ReadDir(path); err == nil && len(entries) > 0 {
		return fmt.Errorf("work directory %s exists but is not a git repository", path)
	}
	return os.MkdirAll(filepath.Dir(path), 0o755)
}

func remoteWorkDir(runner Runner, repo Repository) string {
	workDir := strings.TrimSpace(repo.WorkDir)
	if strings.TrimSpace(runner.WorkRoot) != "" && !strings.HasPrefix(workDir, "/") {
		return strings.TrimRight(runner.WorkRoot, "/") + "/" + workDir
	}
	return workDir
}

func writeTempKey(key string) (string, func(), error) {
	cleanup := func() {}
	key = strings.TrimSpace(key)
	if key == "" {
		return "", cleanup, nil
	}
	file, err := os.CreateTemp("", "candy-key-*.pem")
	if err != nil {
		return "", cleanup, err
	}
	path := file.Name()
	cleanup = func() {
		_ = os.Remove(path)
	}
	if _, err := file.WriteString(key + "\n"); err != nil {
		_ = file.Close()
		cleanup()
		return "", cleanup, err
	}
	if err := file.Close(); err != nil {
		cleanup()
		return "", cleanup, err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		cleanup()
		return "", cleanup, err
	}
	return path, cleanup, nil
}

func runCommand(ctx context.Context, dir string, env []string, logLine func(string, string), name string, args ...string) (commandResult, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), env...)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return commandResult{ExitCode: -1}, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return commandResult{ExitCode: -1}, err
	}
	if logLine != nil {
		logLine("system", "$ "+name+" "+redactedArgs(args))
	}
	if err := cmd.Start(); err != nil {
		return commandResult{ExitCode: -1}, err
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go streamLines(stdout, "stdout", logLine, &wg)
	go streamLines(stderr, "stderr", logLine, &wg)
	waitErr := cmd.Wait()
	wg.Wait()
	if waitErr != nil {
		exitCode := -1
		var exitErr *exec.ExitError
		if errors.As(waitErr, &exitErr) {
			exitCode = exitErr.ExitCode()
		}
		return commandResult{ExitCode: exitCode}, waitErr
	}
	return commandResult{ExitCode: 0}, nil
}

func streamLines(reader io.Reader, stream string, logLine func(string, string), wg *sync.WaitGroup) {
	defer wg.Done()
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024), 1024*1024)
	for scanner.Scan() {
		if logLine != nil {
			logLine(stream, scanner.Text())
		}
	}
	if err := scanner.Err(); err != nil && logLine != nil && !isBenignLogScannerError(err) {
		logLine("system", "log scanner error: "+err.Error())
	}
}

func isBenignLogScannerError(err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, os.ErrClosed) {
		return true
	}
	return strings.Contains(err.Error(), "file already closed") || strings.Contains(err.Error(), "read on closed pipe")
}

func commandExitCode(err error) *int {
	if err == nil {
		return intPtr(0)
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return intPtr(exitErr.ExitCode())
	}
	return nil
}

func intPtr(value int) *int {
	return &value
}

func sshTarget(runner Runner) string {
	if strings.TrimSpace(runner.Username) == "" {
		return runner.Host
	}
	return runner.Username + "@" + runner.Host
}

func sshArgs(runner Runner, keyPath string, remoteCommand string) []string {
	args := []string{
		"-p", strconv.Itoa(defaultPort(runner.Port)),
		"-o", "IdentitiesOnly=yes",
		"-o", "StrictHostKeyChecking=accept-new",
	}
	if keyPath != "" {
		args = append(args, "-i", keyPath)
	}
	args = append(args, sshTarget(runner), remoteCommand)
	return args
}

func scpArgs(runner Runner, keyPath, source, target string) []string {
	args := []string{
		"-r",
		"-P", strconv.Itoa(defaultPort(runner.Port)),
		"-o", "IdentitiesOnly=yes",
		"-o", "StrictHostKeyChecking=accept-new",
	}
	if keyPath != "" {
		args = append(args, "-i", keyPath)
	}
	args = append(args, source, target)
	return args
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func redactedArgs(args []string) string {
	out := make([]string, len(args))
	copy(out, args)
	for i := 0; i < len(out); i++ {
		if out[i] == "-i" && i+1 < len(out) {
			out[i+1] = "<key>"
		}
		if out[i] == "-lc" && i+1 < len(out) {
			out[i+1] = "<script>"
		}
		if strings.Contains(out[i], "bash -lc") {
			out[i] = "<remote-script>"
		}
	}
	return strings.Join(out, " ")
}
