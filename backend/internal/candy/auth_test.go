package candy

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestLoginRemoteIPDoesNotTrustForwardedHeadersByDefault(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/login", nil)
	req.RemoteAddr = "192.0.2.10:4321"
	req.Header.Set("X-Forwarded-For", "203.0.113.22")

	if got := loginRemoteIP(req, false); got != "192.0.2.10" {
		t.Fatalf("loginRemoteIP() = %q", got)
	}
	if got := loginRemoteIP(req, true); got != "203.0.113.22" {
		t.Fatalf("trusted loginRemoteIP() = %q", got)
	}
}

func TestStoreLoginThrottleLocksAndClears(t *testing.T) {
	ctx := t.Context()
	cfg := Config{
		DBPath:        t.TempDir() + "/candy.db",
		PublicURL:     "http://localhost",
		AdminUsername: "admin",
		AdminPassword: "admin123",
	}
	store, err := NewStore(ctx, cfg, NewSecretBox("test-secret"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	now := time.Now()
	policies := []LoginThrottle{{
		Scope:       "user:admin",
		MaxFailures: 2,
		Window:      time.Minute,
		Lockout:     time.Minute,
	}}

	if _, locked, err := store.RecordLoginFailure(ctx, policies, now); err != nil || locked {
		t.Fatalf("first failure locked=%v err=%v", locked, err)
	}
	until, locked, err := store.RecordLoginFailure(ctx, policies, now.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if !locked || !until.After(now) {
		t.Fatalf("expected lock until after now, got locked=%v until=%v", locked, until)
	}
	if _, blocked, err := store.LoginBlocked(ctx, policies, now.Add(2*time.Second)); err != nil || !blocked {
		t.Fatalf("expected blocked=true, got blocked=%v err=%v", blocked, err)
	}
	if err := store.ClearLoginFailures(ctx, []string{"user:admin"}); err != nil {
		t.Fatal(err)
	}
	if _, blocked, err := store.LoginBlocked(ctx, policies, now.Add(3*time.Second)); err != nil || blocked {
		t.Fatalf("expected blocked=false after clear, got blocked=%v err=%v", blocked, err)
	}
}
