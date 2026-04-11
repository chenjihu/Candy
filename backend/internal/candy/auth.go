package candy

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const sessionCookieName = "candy_session"

var (
	errInvalidLogin = errors.New("用户名或密码错误")
	errLoginLocked  = errors.New("登录失败次数过多，请稍后再试")
)

type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]session
}

type session struct {
	Username  string
	ExpiresAt time.Time
}

func NewSessionManager() *SessionManager {
	return &SessionManager{sessions: make(map[string]session)}
}

func (m *SessionManager) Create(w http.ResponseWriter, username string) error {
	token, err := randomToken(32)
	if err != nil {
		return err
	}
	expires := time.Now().Add(24 * time.Hour)
	m.mu.Lock()
	m.sessions[token] = session{Username: username, ExpiresAt: expires}
	m.mu.Unlock()
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	})
	return nil
}

func (m *SessionManager) Destroy(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		m.mu.Lock()
		delete(m.sessions, cookie.Value)
		m.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func (m *SessionManager) Username(r *http.Request) (string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return "", false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	current, ok := m.sessions[cookie.Value]
	if !ok || time.Now().After(current.ExpiresAt) {
		delete(m.sessions, cookie.Value)
		return "", false
	}
	return current.Username, true
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	username := strings.TrimSpace(req.Username)
	scopes := a.loginThrottlePolicies(username, loginRemoteIP(r, a.cfg.TrustProxyHeaders))
	if until, blocked, err := a.store.LoginBlocked(r.Context(), scopes, time.Now()); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	} else if blocked {
		writeLoginLocked(w, until)
		return
	}

	user, err := a.store.GetUserByUsername(r.Context(), username)
	passwordHash := a.dummyPasswordHash
	userFound := true
	if errors.Is(err, sql.ErrNoRows) {
		userFound = false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	} else {
		passwordHash = user.PasswordHash
	}
	passwordOK := VerifyPassword(req.Password, passwordHash)
	if !userFound || !passwordOK {
		if until, locked, err := a.store.RecordLoginFailure(r.Context(), scopes, time.Now()); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		} else if locked {
			writeLoginLocked(w, until)
			return
		}
		writeError(w, http.StatusUnauthorized, errInvalidLogin)
		return
	}
	if err := a.store.ClearLoginFailures(r.Context(), []string{loginUsernameScope(username)}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := a.sessions.Create(w, user.Username); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"username": user.Username})
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	a.sessions.Destroy(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	username, ok := a.sessions.Username(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, errors.New("not authenticated"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"username": username})
}

func (a *App) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := a.sessions.Username(r); !ok {
			writeError(w, http.StatusUnauthorized, errors.New("not authenticated"))
			return
		}
		next(w, r)
	}
}

func (a *App) loginThrottlePolicies(username, ip string) []LoginThrottle {
	return []LoginThrottle{
		{
			Scope:       loginUsernameScope(username),
			MaxFailures: a.cfg.LoginUserMaxFailures,
			Window:      a.cfg.LoginFailureWindow,
			Lockout:     a.cfg.LoginLockout,
		},
		{
			Scope:       loginIPScope(ip),
			MaxFailures: a.cfg.LoginIPMaxFailures,
			Window:      a.cfg.LoginFailureWindow,
			Lockout:     a.cfg.LoginLockout,
		},
	}
}

func loginUsernameScope(username string) string {
	return "user:" + strings.ToLower(strings.TrimSpace(username))
}

func loginIPScope(ip string) string {
	return "ip:" + strings.TrimSpace(ip)
}

func loginRemoteIP(r *http.Request, trustProxyHeaders bool) string {
	if trustProxyHeaders {
		if forwardedFor := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwardedFor != "" {
			ip := strings.TrimSpace(strings.Split(forwardedFor, ",")[0])
			if parsed := net.ParseIP(ip); parsed != nil {
				return parsed.String()
			}
		}
		if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
			if parsed := net.ParseIP(realIP); parsed != nil {
				return parsed.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		if parsed := net.ParseIP(host); parsed != nil {
			return parsed.String()
		}
		return host
	}
	if parsed := net.ParseIP(r.RemoteAddr); parsed != nil {
		return parsed.String()
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func writeLoginLocked(w http.ResponseWriter, until time.Time) {
	if !until.IsZero() {
		retryAfter := int(time.Until(until).Seconds())
		if retryAfter > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		}
	}
	writeError(w, http.StatusTooManyRequests, errLoginLocked)
}
