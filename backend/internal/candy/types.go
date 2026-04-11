package candy

import "time"

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Runner struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	Mode          string    `json:"mode"`
	Host          string    `json:"host,omitempty"`
	Port          int       `json:"port,omitempty"`
	Username      string    `json:"username,omitempty"`
	WorkRoot      string    `json:"workRoot,omitempty"`
	PrivateKey    string    `json:"privateKey,omitempty"`
	HasPrivateKey bool      `json:"hasPrivateKey"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type Repository struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	Provider        string    `json:"provider"`
	RepoURL         string    `json:"repoUrl"`
	WebhookURL      string    `json:"webhookUrl"`
	WebhookSecret   string    `json:"webhookSecret,omitempty"`
	Branch          string    `json:"branch"`
	WorkDir         string    `json:"workDir"`
	DeployKey       string    `json:"deployKey,omitempty"`
	HasDeployKey    bool      `json:"hasDeployKey"`
	DeployScript    string    `json:"deployScript"`
	RunnerID        *int64    `json:"runnerId,omitempty"`
	RunnerName      string    `json:"runnerName,omitempty"`
	CleanWorktree   bool      `json:"cleanWorktree"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	LastJobStatus   string    `json:"lastJobStatus,omitempty"`
	LastJobCommit   string    `json:"lastJobCommit,omitempty"`
	LastJobFinished string    `json:"lastJobFinished,omitempty"`
}

type DeployJob struct {
	ID             int64      `json:"id"`
	RepositoryID   int64      `json:"repositoryId"`
	RepositoryName string     `json:"repositoryName,omitempty"`
	RunnerID       *int64     `json:"runnerId,omitempty"`
	RunnerName     string     `json:"runnerName,omitempty"`
	Provider       string     `json:"provider"`
	Event          string     `json:"event"`
	DeliveryID     string     `json:"deliveryId"`
	Branch         string     `json:"branch"`
	CommitSHA      string     `json:"commitSha"`
	CommitMessage  string     `json:"commitMessage"`
	CommitAuthor   string     `json:"commitAuthor"`
	Status         string     `json:"status"`
	ExitCode       *int       `json:"exitCode,omitempty"`
	Error          string     `json:"error,omitempty"`
	TriggeredAt    time.Time  `json:"triggeredAt"`
	StartedAt      *time.Time `json:"startedAt,omitempty"`
	FinishedAt     *time.Time `json:"finishedAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type JobLogLine struct {
	ID        int64     `json:"id"`
	JobID     int64     `json:"jobId"`
	Stream    string    `json:"stream"`
	Line      string    `json:"line"`
	CreatedAt time.Time `json:"createdAt"`
}
