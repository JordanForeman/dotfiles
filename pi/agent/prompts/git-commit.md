# Git Commit Template

When making git commits, always ensure proper attribution by:

1. **Use the git_commit_attributed tool** instead of direct bash commands when possible
2. **Set explicit author and committer** for any git operations
3. **Verify attribution** before pushing

## Proper Git Configuration

- **Name**: Jordan Foreman  
- **Email**: hello@jordanforeman.com

## Example Commands

### Making a commit:
```bash
# Set proper attribution first
export GIT_AUTHOR_NAME="Jordan Foreman"
export GIT_AUTHOR_EMAIL="hello@jordanforeman.com" 
export GIT_COMMITTER_NAME="Jordan Foreman"
export GIT_COMMITTER_EMAIL="hello@jordanforeman.com"

# Then make the commit
git commit --author="Jordan Foreman <hello@jordanforeman.com>" -m "Your commit message"
```

### Amending a commit:
```bash
# Fix attribution on existing commit
GIT_AUTHOR_NAME="Jordan Foreman" \
GIT_AUTHOR_EMAIL="hello@jordanforeman.com" \
GIT_COMMITTER_NAME="Jordan Foreman" \
GIT_COMMITTER_EMAIL="hello@jordanforeman.com" \
git commit --amend --author="Jordan Foreman <hello@jordanforeman.com>" --no-edit
```

## Verification

Always verify attribution before pushing:
```bash
git log -1 --pretty=fuller
```

Should show:
- **Author**: Jordan Foreman <hello@jordanforeman.com>
- **Commit**: Jordan Foreman <hello@jordanforeman.com>

## Tools Available

- Use `/git-check` command to verify and fix git configuration
- Use `git_commit_attributed` tool for properly attributed commits
- Run `~/.pi/agent/bin/fix-git-attribution` script to fix configuration