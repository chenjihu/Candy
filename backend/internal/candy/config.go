package candy

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr                 string
	DBPath               string
	DataDir              string
	PublicURL            string
	FrontendDir          string
	AppSecret            string
	UsingDevSecret       bool
	AdminUsername        string
	AdminPassword        string
	WorkerCount          int
	JobTimeout           time.Duration
	LoginUserMaxFailures int
	LoginIPMaxFailures   int
	LoginFailureWindow   time.Duration
	LoginLockout         time.Duration
	TrustProxyHeaders    bool
}

func LoadConfig() Config {
	_ = godotenv.Load()

	cfg := Config{
		Addr:                 env("CANDY_ADDR", ":8080"),
		DBPath:               env("CANDY_DB_PATH", "./data/candy.db"),
		DataDir:              env("CANDY_DATA_DIR", "./data"),
		PublicURL:            env("CANDY_PUBLIC_URL", "http://localhost:8080"),
		FrontendDir:          env("CANDY_FRONTEND_DIR", defaultFrontendDir()),
		AppSecret:            os.Getenv("CANDY_APP_SECRET"),
		AdminUsername:        env("CANDY_ADMIN_USERNAME", "super_admin"),
		AdminPassword:        os.Getenv("CANDY_ADMIN_PASSWORD"),
		WorkerCount:          envInt("CANDY_WORKERS", 2),
		JobTimeout:           time.Duration(envInt("CANDY_JOB_TIMEOUT_SECONDS", 30*60)) * time.Second,
		LoginUserMaxFailures: envInt("CANDY_LOGIN_USER_MAX_FAILURES", 5),
		LoginIPMaxFailures:   envInt("CANDY_LOGIN_IP_MAX_FAILURES", 20),
		LoginFailureWindow:   time.Duration(envInt("CANDY_LOGIN_FAILURE_WINDOW_SECONDS", 15*60)) * time.Second,
		LoginLockout:         time.Duration(envInt("CANDY_LOGIN_LOCKOUT_SECONDS", 15*60)) * time.Second,
		TrustProxyHeaders:    envBool("CANDY_TRUST_PROXY_HEADERS", false),
	}
	if cfg.AppSecret == "" {
		cfg.AppSecret = "dev-only-change-me-before-production"
		cfg.UsingDevSecret = true
	}
	return cfg
}

func (cfg Config) Validate() error {
	if strings.TrimSpace(cfg.AdminUsername) == "" {
		return errors.New("CANDY_ADMIN_USERNAME cannot be empty")
	}
	if strings.TrimSpace(cfg.AdminPassword) == "" {
		return errors.New("CANDY_ADMIN_PASSWORD must be set")
	}
	return nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func defaultFrontendDir() string {
	for _, candidate := range []string{"./frontend/dist", "../frontend/dist"} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return "./frontend/dist"
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}
