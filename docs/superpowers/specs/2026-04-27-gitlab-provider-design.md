# GitLab Provider Support Design

## Goal

Add first-class GitLab support to Candy so repository sources can explicitly use `gitlab`, and GitLab push webhooks can trigger deployments with standard `X-Gitlab-Token` secret verification.

## Scope

This design adds GitLab as a peer provider alongside GitHub and Gitee across:

- repository source provider selection
- webhook provider detection
- webhook secret verification
- push event recognition
- delivery ID extraction
- README setup guidance

This design does **not** restructure the webhook system into a separate adapter framework. It extends the current provider branching model in place.

## Desired Behavior

### Repository Source

- The admin UI exposes `GitLab` in the source provider selector.
- Backend provider normalization accepts `gitlab`.
- GitLab SSH URLs such as `git@gitlab.com:group/project.git` are treated as normal repository source URLs.

### Webhook Verification

- For repositories configured with provider `gitlab`, webhook requests are verified using the standard GitLab secret header:
  - request header: `X-Gitlab-Token`
  - comparison rule: constant-time equality against the configured webhook secret
- If the header is missing, return `401` with a clear verification error.
- If the token does not match, return `401`.

### Provider Detection

- If a repository source is set to `generic`, incoming webhook requests are auto-detected as:
  - `gitee` if `X-Gitee-Event` or `X-Gitee-Token` exists
  - `gitlab` if `X-Gitlab-Event` or `X-Gitlab-Token` exists
  - otherwise `github`

### Push Event Handling

- GitLab push hooks are accepted as deployment triggers.
- Event detection uses `X-Gitlab-Event`.
- A request is considered a push event when the event header equals `Push Hook`.
- Branch extraction continues to use `ref`, which GitLab includes in push payloads.
- Commit SHA continues to prefer `after`, falling back to head/commit lists when needed.
- Commit author/message extraction should tolerate GitLab payload conventions without widening the payload model more than necessary.

### Delivery ID

- Delivery ID extraction should recognize GitLab request identifiers before falling back to the body hash.
- Preferred GitLab header:
  - `X-Request-Id`
- Existing GitHub/Gitee delivery headers remain unchanged.

### Documentation

- README.md and README.zh.md must list GitLab in the supported provider/webhook matrix.
- Webhook setup guidance must describe GitLab setup:
  - webhook URL
  - push event selection
  - secret token mapped to `X-Gitlab-Token`

## Implementation Shape

### Backend

Primary files:

- `backend/internal/candy/webhook.go`
- `backend/internal/candy/store.go`
- `backend/internal/candy/api.go` if provider normalization lives there or is shared from there
- `backend/internal/candy/webhook_test.go`

Expected backend changes:

1. Extend provider normalization to accept `gitlab`.
2. Extend provider auto-detection to identify GitLab headers.
3. Add a GitLab verification branch in `verifyWebhookSignature(...)`.
4. Add GitLab event extraction in `webhookEvent(...)`.
5. Add GitLab push event acceptance in `isPushEvent(...)`.
6. Add GitLab delivery header support in `webhookDeliveryID(...)`.
7. Add or extend tests covering:
   - valid GitLab token accepted
   - invalid token rejected
   - missing token rejected
   - GitLab push event queued

### Frontend

Primary file:

- `frontend/src/main.jsx`

Expected frontend changes:

1. Add `GitLab` label in both English and Chinese dictionaries.
2. Add `gitlab` option to the source provider select component.
3. Ensure provider label rendering recognizes `gitlab`.

### Docs

Primary files:

- `README.md`
- `README.zh.md`

Expected doc changes:

1. Add GitLab to feature bullets where supported providers are listed.
2. Update webhook setup sections with GitLab instructions.

## Compatibility Notes

- This change is additive for current schema/users.
- No database migration is required.
- Existing GitHub and Gitee behavior must remain unchanged.

## Testing

Minimum validation:

- `go test ./internal/candy`
- `npm run build`

Targeted behavior checks:

- GitLab provider can be created from the UI/API.
- GitLab webhook with matching `X-Gitlab-Token` queues a deployment.
- GitLab webhook with missing or wrong token is rejected.
- GitHub and Gitee webhook tests still pass unchanged.
