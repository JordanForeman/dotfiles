---
name: git-attribution
description: Ensures all git operations are properly attributed to Jordan Foreman. Use this skill whenever making commits, creating PRs, or performing git operations.
injection: explicit
---

# Git Attribution Skill

This skill ensures all git operations are properly attributed to **Jordan Foreman <hello@jordanforeman.com>**.

## When to Use

- Before making any git commits
- When creating pull requests
- When amending commits
- When rebasing or cherry-picking
- Any time git attribution might be involved

## Core Principles

1. **Always verify attribution** before pushing
2. **Use explicit author/committer settings** for all operations
3. **Check configuration** at the start of git workflows
4. **Fix attribution immediately** if incorrect

## Correct Attribution

- **Name**: Jordan Foreman
- **Email**: hello@jordanforeman.com

## Available Tools & Commands

### Pi Tools
- `git_commit_attributed` - Make properly attributed commits
- `/git-check` - Check and fix git configuration

### Scripts
- `~/.pi/agent/bin/fix-git-attribution` - Fix git configuration

### Manual Commands
```bash
# Set environment variables for single operation
export GIT_AUTHOR_NAME="Jordan Foreman"
export GIT_AUTHOR_EMAIL="hello@jordanforeman.com"
export GIT_COMMITTER_NAME="Jordan Foreman" 
export GIT_COMMITTER_EMAIL="hello@jordanforeman.com"

# Or set git config
git config user.name "Jordan Foreman"
git config user.email "hello@jordanforeman.com"

# Make commit with explicit attribution
git commit --author="Jordan Foreman <hello@jordanforeman.com>" -m "Message"
```

## Verification Process

Always run before pushing:
```bash
git log -1 --pretty=fuller
```

Expected output:
```
Author:     Jordan Foreman <hello@jordanforeman.com>
Commit:     Jordan Foreman <hello@jordanforeman.com>
```

## Common Scenarios

### New Repository
1. Run `/git-check` to verify configuration
2. Set local config if needed
3. Create commits using `git_commit_attributed` tool

### Existing Repository
1. Check current attribution: `git log -1 --pretty=fuller`
2. If incorrect, amend with proper attribution
3. Set correct config for future commits

### Pull Request Creation
1. Verify all commits have correct attribution
2. If any commits are wrong, fix before creating PR
3. Use `git rebase -i` with proper environment variables if needed

## Troubleshooting

### Wrong Attribution on Existing Commits
```bash
# Amend last commit
GIT_AUTHOR_NAME="Jordan Foreman" \
GIT_AUTHOR_EMAIL="hello@jordanforeman.com" \
GIT_COMMITTER_NAME="Jordan Foreman" \
GIT_COMMITTER_EMAIL="hello@jordanforeman.com" \
git commit --amend --author="Jordan Foreman <hello@jordanforeman.com>" --no-edit

# For multiple commits, use interactive rebase
GIT_AUTHOR_NAME="Jordan Foreman" \
GIT_AUTHOR_EMAIL="hello@jordanforeman.com" \
GIT_COMMITTER_NAME="Jordan Foreman" \
GIT_COMMITTER_EMAIL="hello@jordanforeman.com" \
git rebase -i HEAD~N  # N = number of commits to fix
```

### GitHub Showing Wrong User
- Ensure both Author AND Committer are set correctly
- GitHub matches commits to users based on email address
- Use `--force` push after fixing attribution (if safe to do so)

## Integration with Pi

This skill automatically:
- Sets proper git configuration on Pi startup
- Intercepts git commands to ensure attribution
- Provides tools for attributed commits
- Shows status indicators when config is correct/incorrect

The `git-attribution` extension handles most of this automatically, but use this skill as reference when manual intervention is needed.