---
name: google-workspace
description: "Interact with Google Workspace (Gmail, Drive, Calendar, Docs, Sheets, Chat, Tasks, and more) via the `gws` CLI. Use when the user asks about email, calendar events, files in Drive, spreadsheets, documents, or any Google Workspace service."
injection: explicit
---

# Google Workspace Skill

Interact with Google Workspace APIs using the `gws` CLI — a single binary that dynamically covers every Workspace API.

## Prerequisites

- `gws` must be on `$PATH` — install via `npm install -g @googleworkspace/cli` or `nix run github:googleworkspace/cli`
- Authentication must be configured (see [Authentication](#authentication))

### Quick install check

```bash
gws --version || echo "gws not found — install with: npm install -g @googleworkspace/cli"
```

## Authentication

```bash
# First-time setup (requires gcloud CLI)
gws auth setup

# Subsequent logins (scope by service to stay under 25-scope testing limit)
gws auth login -s drive,gmail,sheets,calendar,docs,tasks,chat

# Check auth status
gws auth status
```

If auth is not configured, prompt the user to run the above before proceeding.

## Core CLI Syntax

```bash
gws <service> <resource> <method> [flags]
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--format <FORMAT>` | `json` (default), `table`, `yaml`, `csv` |
| `--dry-run` | Preview request without executing |
| `--page-all` | Auto-paginate (NDJSON output) |
| `--page-limit <N>` | Max pages (default: 10) |

### Method Flags

| Flag | Description |
|------|-------------|
| `--params '{"key": "val"}'` | URL/query parameters |
| `--json '{"key": "val"}'` | Request body |
| `-o, --output <PATH>` | Save binary response to file |
| `--upload <PATH>` | Upload file content (multipart) |

### Discovery & Help

```bash
gws <service> --help              # List resources for a service
gws <service> <resource> --help   # List methods for a resource
gws schema <method>               # Full request/response schema
```

## Safety Rules

1. **Read operations are safe** — run freely
2. **Write operations require user confirmation** — always confirm before: sending email, creating/modifying events, uploading/deleting files, modifying documents/sheets
3. **Use `--dry-run`** to preview write operations when the user wants to verify first
4. **Never delete without explicit approval** — files, events, emails, etc.

## Quick Reference: Common Operations

### Gmail

```bash
# Triage inbox (read-only)
gws gmail +triage
gws gmail +triage --max 10 --query 'from:someone@example.com'

# Send email (⚠ WRITE — confirm first)
gws gmail +send --to alice@example.com --subject 'Subject' --body 'Body text'
gws gmail +send --to alice@example.com --subject 'Hi' --body 'Hello' --cc bob@example.com

# Reply / Reply-all / Forward (⚠ WRITE)
gws gmail +reply --message-id MSG_ID --body 'Thanks!'
gws gmail +reply-all --message-id MSG_ID --body 'Noted.'
gws gmail +forward --message-id MSG_ID --to someone@example.com

# Read a specific message
gws gmail users messages get --params '{"userId": "me", "id": "MSG_ID"}'

# Search messages
gws gmail users messages list --params '{"userId": "me", "q": "subject:invoice after:2026/01/01"}'

# Get user profile
gws gmail users getProfile --params '{"userId": "me"}'
```

### Calendar

```bash
# View agenda (read-only)
gws calendar +agenda
gws calendar +agenda --today
gws calendar +agenda --week
gws calendar +agenda --days 3 --calendar 'Work'

# Create event (⚠ WRITE — confirm first)
gws calendar +insert \
  --summary 'Meeting Title' \
  --start '2026-03-15T10:00:00-05:00' \
  --end '2026-03-15T11:00:00-05:00' \
  --attendee alice@example.com

# List events (raw API)
gws calendar events list --params '{"calendarId": "primary", "timeMin": "2026-03-10T00:00:00Z", "maxResults": 10, "singleEvents": true, "orderBy": "startTime"}'
```

### Drive

```bash
# List recent files (read-only)
gws drive files list --params '{"pageSize": 10}'

# Search files
gws drive files list --params '{"q": "name contains '\''report'\'' and mimeType = '\''application/pdf'\''", "pageSize": 20}'

# Upload file (⚠ WRITE)
gws drive +upload ./report.pdf
gws drive +upload ./data.csv --parent FOLDER_ID --name 'Sales Data.csv'

# Download file
gws drive files get --params '{"fileId": "FILE_ID", "alt": "media"}' -o ./downloaded-file.pdf

# Create folder (⚠ WRITE)
gws drive files create --json '{"name": "New Folder", "mimeType": "application/vnd.google-apps.folder"}'

# Get file metadata
gws drive files get --params '{"fileId": "FILE_ID", "fields": "id,name,mimeType,modifiedTime,size,webViewLink"}'
```

### Sheets

```bash
# Read values (read-only)
gws sheets +read --spreadsheet SPREADSHEET_ID --range 'Sheet1!A1:D10'

# Append rows (⚠ WRITE)
gws sheets +append --spreadsheet SPREADSHEET_ID --values 'Alice,95,true'
gws sheets +append --spreadsheet SPREADSHEET_ID --json-values '[["Name","Score"],["Bob",87]]'

# Create spreadsheet (⚠ WRITE)
gws sheets spreadsheets create --json '{"properties": {"title": "Q1 Budget"}}'

# Raw read (for more control)
gws sheets spreadsheets values get \
  --params '{"spreadsheetId": "ID", "range": "Sheet1!A1:C10"}'
```

> **Shell escaping:** Sheets ranges use `!` — always wrap in single quotes.

### Docs

```bash
# Read document
gws docs documents get --params '{"documentId": "DOC_ID"}'

# Append text (⚠ WRITE)
gws docs +write --document DOC_ID --text 'New paragraph here.'

# Create document (⚠ WRITE)
gws docs documents create --json '{"title": "Meeting Notes"}'
```

### Tasks

```bash
# List task lists
gws tasks tasklists list

# List tasks in a list
gws tasks tasks list --params '{"tasklist": "TASKLIST_ID"}'

# Create task (⚠ WRITE)
gws tasks tasks insert --params '{"tasklist": "TASKLIST_ID"}' --json '{"title": "Review PR", "due": "2026-03-15T00:00:00Z"}'
```

### Chat

```bash
# List spaces
gws chat spaces list

# Send message (⚠ WRITE)
gws chat spaces messages create \
  --params '{"parent": "spaces/SPACE_ID"}' \
  --json '{"text": "Deploy complete."}'
```

## Advanced Patterns

### Pagination

```bash
# Stream all pages as NDJSON
gws drive files list --params '{"pageSize": 100}' --page-all | jq -r '.files[].name'
```

### Multipart Upload

```bash
gws drive files create --json '{"name": "report.pdf"}' --upload ./report.pdf
```

### Schema Introspection

When unsure about parameters for any method:

```bash
gws schema drive.files.list
gws schema gmail.users.messages.send
gws schema calendar.events.insert
```

### Combining Operations

For multi-step workflows (e.g., "find file then share it"):

```bash
# Step 1: Find the file
gws drive files list --params '{"q": "name = '\''Budget 2026'\''"}' | jq -r '.files[0].id'

# Step 2: Share it (⚠ WRITE)
gws drive permissions create \
  --params '{"fileId": "FILE_ID"}' \
  --json '{"role": "reader", "type": "user", "emailAddress": "alice@example.com"}'
```

## Troubleshooting

- **"gws: command not found"** → `npm install -g @googleworkspace/cli`
- **Auth errors** → `gws auth login -s <services>` (re-authenticate with needed scopes)
- **403 Forbidden** → Scope not granted; re-run `gws auth login` with the required service
- **Unknown method** → `gws` discovers APIs dynamically; use `gws <service> --help` to explore
- **Rate limits** → Add `--page-delay 200` for paginated requests

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_WORKSPACE_CLI_TOKEN` | Pre-obtained OAuth2 access token |
| `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` | Path to credentials JSON |
| `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` | Override config dir (default: `~/.config/gws`) |
