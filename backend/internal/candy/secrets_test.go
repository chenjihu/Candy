package candy

import "testing"

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("correct horse", hash) {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword("wrong horse", hash) {
		t.Fatal("expected wrong password to fail")
	}
}

func TestSecretBoxRoundTrip(t *testing.T) {
	box := NewSecretBox("app-secret")
	cipherText, err := box.Seal("private value")
	if err != nil {
		t.Fatal(err)
	}
	plain, err := box.Open(cipherText)
	if err != nil {
		t.Fatal(err)
	}
	if plain != "private value" {
		t.Fatalf("Open() = %q", plain)
	}
}
