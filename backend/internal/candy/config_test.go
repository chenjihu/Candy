package candy

import "testing"

func TestConfigValidateRequiresAdminPassword(t *testing.T) {
	cfg := Config{AdminUsername: "super_admin"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected missing admin password to fail validation")
	}
	cfg.AdminPassword = "strong-password"
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected config to validate: %v", err)
	}
}

func TestLoadConfigDefaultsAdminUsernameOnly(t *testing.T) {
	t.Setenv("CANDY_ADMIN_USERNAME", "")
	t.Setenv("CANDY_ADMIN_PASSWORD", "")

	cfg := LoadConfig()
	if cfg.AdminUsername != "super_admin" {
		t.Fatalf("AdminUsername = %q", cfg.AdminUsername)
	}
	if cfg.AdminPassword != "" {
		t.Fatal("expected admin password to have no default")
	}
}
