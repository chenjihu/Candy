package candy

import "testing"

func TestSanitizeLogLineRemovesANSISequences(t *testing.T) {
	got := sanitizeLogLine("\x1b[1m\x1b[36m5\x1b[39m\x1b[22m")
	if got != "5" {
		t.Fatalf("sanitizeLogLine() = %q, want %q", got, "5")
	}
}

func TestSanitizeLogLineRemovesControlCharacters(t *testing.T) {
	got := sanitizeLogLine("hello\x07 world\x1b[0m")
	if got != "hello world" {
		t.Fatalf("sanitizeLogLine() = %q, want %q", got, "hello world")
	}
}
