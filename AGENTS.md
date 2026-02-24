# Dotfiles Repository

This repository manages personal configuration files and pi agent customizations.

## Repository Structure

```
dotfiles/
├── pi/              # Source directory for pi configuration (managed in git)
│   └── agent/
│       ├── subagents/         # Custom subagents
│       ├── orchestrations/    # Orchestration configs
│       ├── extensions/        # Pi extensions
│       ├── prompts/          # Prompt templates
│       ├── skills/           # Agent skills
│       └── themes/           # TUI themes
├── .pi/             # Symlink target (DO NOT commit files here)
└── [other dotfiles] # zsh, vim, etc.
```

**Critical:** All pi-related changes should be made in `pi/`, NOT `.pi/`. The `.pi/` directory is the symlink target for the global pi configuration (`~/.pi/`).

## Development Workflow

### Creating New Subagents

1. Create in `pi/agent/subagents/` (NOT `.pi/agent/subagents/`)
2. Use markdown frontmatter with required fields:
   - `name`: Machine-readable identifier
   - `description`: One-line purpose
   - `version`: Semantic version
3. Follow existing patterns (see `rails-reviewer.md`, `architect.md`, etc.)
4. Keep generic - avoid project-specific details (no Shopify-isms)
5. Update `pi/agent/subagents/README.md` with new subagent

### Creating Orchestrations

1. Create JSON files in `pi/agent/subagents/orchestrations/`
2. Structure:
   ```json
   {
     "stages": [
       {
         "label": "Stage name",
         "concurrency": 2,
         "tasks": [
           {
             "subagent": "subagent-name",
             "task": "Task description",
             "relation": "How this relates to parent goal"
           }
         ]
       }
     ]
   }
   ```
3. Document in `pi/agent/subagents/orchestrations/README.md`

### Git Operations

- Branch strategy: Use `next` branch for development, merge to `main` when stable
- Commit format: Conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- **Delegate git operations** to the `git-ops` subagent:
  ```
  Ask pi to: "Commit and push these changes"
  Pi will invoke: subagent(git-ops, "commit and push with message X")
  ```

### Available Development Subagents

For working on this repository, you can delegate to:

- **`architect`** - Design new features, subagents, or orchestrations
- **`builder`** - Implement designed features
- **`markdown-author`** - Create or update documentation
- **`git-ops`** - Handle all git operations (commit, push, branch, rebase)
- **`code-explorer`** - Navigate and understand the repository structure
- **`reviewer`** - Review changes before committing

### PR Review Orchestration

The `pr-review` orchestration provides multi-dimensional code review:

1. **Triage Stage** (`pr-triage`): Analyzes the PR/diff to understand scope
2. **Review Stage** (parallel): Specialized reviewers engage based on relevance:
   - `rails-reviewer` - Backend Ruby/Rails code
   - `frontend-reviewer` - Frontend JavaScript/TypeScript/CSS
   - `design-reviewer` - UI/UX design patterns
   - `testing-reviewer` - Test coverage and quality

Invoke with:
```bash
pi subagent --orchestration pr-review --scope=project --task "Review PR #123"
```

## Development Patterns

### When to Create a Subagent

Create a new subagent when:
- A task requires specialized domain knowledge (e.g., Rails, design, testing)
- A workflow is reused frequently across different contexts
- You want to enforce consistent methodology (e.g., git operations, documentation)
- A task benefits from a narrow, focused prompt

### When to Create an Orchestration

Create an orchestration when:
- A workflow has multiple distinct phases (triage → specialized review)
- Tasks can run in parallel (multiple specialized reviewers)
- You want to compose existing subagents in a reusable pattern
- Different task types need different subagent combinations

### Self-Filtering Pattern

Subagents should self-filter when their domain doesn't apply:
```markdown
If this PR doesn't contain [relevant files/changes], respond with:
"✅ No [domain] changes detected - skipping review"
```

This allows orchestrations to fan out to all reviewers without conditional logic.

## Testing

Before committing new subagents or orchestrations:

1. **Unit test**: Invoke subagent directly with simple task
2. **Integration test**: Test in orchestration with other subagents
3. **Edge cases**: Test self-filtering (empty input, wrong domain, etc.)
4. **Documentation**: Ensure README reflects new capabilities

## Style Guidelines

### Markdown Frontmatter
```yaml
---
name: subagent-name
description: Brief one-line description
version: 1.0.0
---
```

### Subagent Prompts
- Clear, imperative instructions
- Define inputs and expected outputs
- Include self-filtering criteria
- Specify output format (markdown sections, JSON, etc.)
- Provide examples when helpful

### Orchestration Design
- Keep concurrency low (1-2) to avoid overwhelming output
- Use meaningful stage labels
- Provide clear `relation` fields for debugging
- Use `{previous}` to inject prior stage output

## Common Tasks

### Update a Subagent
```bash
# Edit the file
vi pi/agent/subagents/subagent-name.md

# Test it
pi subagent --subagent subagent-name --task "Test task"

# Commit via git-ops
pi: "Commit this change with message 'fix: improve subagent-name filtering'"
```

### Add a New Reviewer to PR Orchestration
1. Create reviewer subagent in `pi/agent/subagents/`
2. Add to Stage 2 in `pi/agent/subagents/orchestrations/pr-review.json`
3. Update orchestrations README
4. Test with relevant PR

### Sync to Global Config
The `pi/` directory should be symlinked to `~/.pi/`:
```bash
ln -s ~/src/github.com/jordanforeman/dotfiles/pi ~/.pi
```

## Questions & Iteration

When uncertain:
- Check existing subagents for patterns
- Test incrementally
- Use `ask_user` tool for clarification
- Document assumptions and decisions

The goal is a collection of reusable, composable subagents that improve productivity without becoming brittle or project-specific.
