# PR Review Orchestration

## Overview

This directory contains orchestration configurations for coordinating multiple specialized subagents to perform comprehensive PR reviews.

## `pr-review.json`

A two-stage orchestration that provides multi-dimensional PR review:

### Stage 1: Triage & Analysis
- **Subagent**: `pr-triage`
- **Purpose**: Analyzes the PR diff to identify:
  - Languages and frameworks (Ruby/Rails, TypeScript/React, Python, etc.)
  - Change types (new features, refactoring, tests, docs, config)
  - Architectural significance (new patterns, breaking changes, etc.)
  - Recommended reviewers based on change characteristics

### Stage 2: Specialized Review (Parallel)
Four specialized reviewers run in parallel with concurrency limit of 4:

1. **design-reviewer**: Architecture and design patterns
   - Focuses on SOLID principles, cohesion, coupling
   - Reviews abstractions and component composition
   - Evaluates testability and maintainability
   
2. **rails-reviewer**: Backend/Rails code quality
   - Reviews Rails idioms and conventions
   - Validates ActiveRecord usage and query patterns
   - Ensures proper controller and service object design
   
3. **frontend-reviewer**: Frontend code (React/TypeScript)
   - Reviews React component design and patterns
   - Validates TypeScript usage and type safety
   - Evaluates accessibility and performance
   
4. **testing-reviewer**: Test quality and coverage
   - Validates comprehensive test coverage
   - Reviews testing patterns and best practices
   - Ensures tests validate behavior, not implementation

### Self-Filtering Mechanism

Each reviewer receives the triage output and self-filters based on applicability:
- If marked as "NOT APPLICABLE", the reviewer exits gracefully
- If marked as "APPLICABLE", the reviewer performs a full review
- This prevents unnecessary noise from reviewers that aren't relevant to the PR

## Usage

### Basic Usage

```bash
# Review a specific PR number
pi subagent --orchestration pr-review --task "Review PR #1234"

# Review current branch changes
pi subagent --orchestration pr-review --task "Review the current branch against main"

# Review a specific diff
pi subagent --orchestration pr-review --task "Review this diff: $(git diff main)"
```

### Usage from Parent Agent

When delegating to this orchestration from a parent agent:

```
subagent orchestration=pr-review Task:
Review PR #1234 for [project-name]
```

The orchestration will:
1. Fetch the PR diff using `gh pr diff 1234`
2. Analyze the changes and identify applicable reviewers
3. Run all applicable reviewers in parallel
4. Return consolidated findings

### Providing PR Context

The orchestration expects PR information in the format:
- **PR number**: "Review PR #1234"
- **Diff content**: "Analyze this diff: [diff content]"
- **Branch comparison**: "Review changes in feature-branch against main"

The `pr-triage` subagent will handle fetching the diff via `gh` CLI if given a PR number.

## Output Structure

The orchestration produces two sets of outputs:

### Triage Output
```markdown
## PR Summary
[High-level description]

## Changes Detected
- Languages & Frameworks
- Change Types
- Architectural Indicators

## Recommended Reviewers
### ✅ APPLICABLE
- reviewer-name: [reason]

### ⏭️ NOT APPLICABLE
- reviewer-name: [reason]

## Key Files to Review
[List of critical files]

## Review Priority
[High/Medium/Low with justification]
```

### Specialized Review Outputs
Each applicable reviewer provides:
```markdown
## [Reviewer Type] Review Summary
[Assessment]

## [Domain] Findings
### ✅ Strengths
### ⚠️ Concerns
### 💡 Recommendations

## 📋 Detailed Findings
[Specific feedback]

## 🎯 Priority Actions
[Critical items]
```

## Customization

### Adjusting Concurrency
Edit `pr-review.json` to change the concurrency limit in Stage 2:
```json
{
  "label": "Specialized Review",
  "concurrency": 2,  // Reduce to 2 for slower systems
  ...
}
```

### Adding/Removing Reviewers
Edit the `tasks` array in Stage 2 to add or remove specialized reviewers:
```json
{
  "subagent": "your-reviewer",
  "task": "Review task with triage: {previous}",
  "relation": "Description of review focus"
}
```

### Creating Specialized Orchestrations
For specific project types, create variant orchestrations:
- `pr-review-backend.json`: Only backend reviewers
- `pr-review-frontend.json`: Only frontend reviewers
- `pr-review-quick.json`: Triage only with single comprehensive reviewer

## Testing the Orchestration

### Test Case 1: Full-Stack PR
```bash
# PR with both Rails and React changes
pi subagent --orchestration pr-review --task "Review PR #[full-stack-pr]"
```
**Expected**: All reviewers activate

### Test Case 2: Backend-Only PR
```bash
# PR with only Ruby/Rails changes
pi subagent --orchestration pr-review --task "Review PR #[backend-pr]"
```
**Expected**: rails-reviewer, testing-reviewer, possibly design-reviewer

### Test Case 3: Frontend-Only PR
```bash
# PR with only TypeScript/React changes
pi subagent --orchestration pr-review --task "Review PR #[frontend-pr]"
```
**Expected**: frontend-reviewer, testing-reviewer

### Test Case 4: Test-Only PR
```bash
# PR with only test changes
pi subagent --orchestration pr-review --task "Review PR #[test-pr]"
```
**Expected**: testing-reviewer only

### Test Case 5: Docs/Config PR
```bash
# PR with only documentation or configuration changes
pi subagent --orchestration pr-review --task "Review PR #[docs-pr]"
```
**Expected**: Minimal engagement or all reviewers skip

## Troubleshooting

### Issue: All reviewers run even when not applicable
**Solution**: Check that each reviewer subagent has the SELF-FILTERING PROTOCOL section and properly checks the triage output.

### Issue: Triage doesn't detect certain file types
**Solution**: Update `pr-triage.md` to include additional file patterns in the "Identify File Types and Patterns" section.

### Issue: Reviewers provide redundant feedback
**Solution**: Clarify role boundaries in each reviewer's "Review Focus" section to minimize overlap.

### Issue: Orchestration times out or is too slow
**Solution**: Reduce concurrency limit or split into smaller focused orchestrations.

## Design Decisions

### Why Self-Filtering?
The JSON orchestration format doesn't support conditional execution. Self-filtering allows reviewers to gracefully skip when not applicable, avoiding the need for complex coordinator logic.

### Why Two Stages?
Separating triage from review ensures that:
1. All reviewers receive consistent context about the PR
2. The triage can identify priority areas and edge cases
3. Reviewers can make informed decisions about their applicability

### Why Parallel Execution?
Running reviewers in parallel:
- Reduces total review time (4 reviewers take ~1x time instead of 4x)
- Allows independent analysis from different perspectives
- Enables scaling to additional reviewers without time penalty

## Maintenance

### Updating Reviewers
When updating individual reviewer subagents:
1. Ensure the SELF-FILTERING PROTOCOL remains intact
2. Update the orchestration README if review focus changes
3. Test with sample PRs to verify self-filtering still works

### Adding New Review Dimensions
To add a new specialized reviewer:
1. Create the subagent in `.pi/agent/subagents/[name]-reviewer.md`
2. Include the SELF-FILTERING PROTOCOL section
3. Add a task to the Stage 2 tasks array in `pr-review.json`
4. Update `pr-triage.md` to detect changes requiring this reviewer
5. Update this README with the new reviewer's focus area

## Related Documentation

- **Subagent Documentation**: See `.pi/agent/subagents/README.md` for general subagent info
- **Pi Orchestration Guide**: `/nix/store/.../docs/orchestrations.md` (if available)
- **Individual Reviewers**: Each subagent has inline documentation in its markdown file
