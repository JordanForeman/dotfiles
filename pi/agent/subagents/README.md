# Project Subagents

This directory contains project-local subagents for the dotfiles repository. These subagents are specialized tools that work alongside the pi coding agent to provide enhanced capabilities.

## Structure

```
.pi/agent/subagents/
├── README.md                              # This file
├── orchestrations/                        # Orchestration configurations
│   ├── README.md                         # Orchestration documentation
│   ├── feature-pipeline.json             # Unified strategy-first feature pipeline
│   ├── feature-dev-pipeline.json         # End-to-end feature delivery pipeline (legacy preset)
│   ├── design-dev-pipeline.json          # Design-first frontend delivery pipeline (legacy preset)
│   ├── pr-review.json                    # PR review orchestration
│   └── team-creation-pipeline.json       # Reusable team capability creation pipeline
├── execution-strategist.md               # Dynamic runtime strategy planner
├── team-creator.md                        # Team capability authoring specialist
├── pr-triage.md                          # PR analysis and triage
├── design.md                             # Visual design specialist for frontend work
├── design-reviewer.md                    # Architecture and design review
├── rails-reviewer.md                     # Rails/backend code review
├── frontend-reviewer.md                  # React/TypeScript frontend review
└── testing-reviewer.md                   # Test quality and coverage review
```

## Subagents

### PR Triage (`pr-triage.md`)
**Purpose**: Analyzes pull requests to identify applicable review dimensions

**Capabilities**:
- Detects languages and frameworks in PRs
- Classifies change types (features, refactoring, tests, etc.)
- Identifies architectural significance
- Recommends appropriate specialized reviewers

**Usage**:
```bash
pi subagent pr-triage --task "Analyze PR #1234"
```

### Design Reviewer (`design-reviewer.md`)
**Purpose**: Reviews code design and architecture

**Focus Areas**:
- SOLID principles and design patterns
- Cohesion and coupling analysis
- Abstraction appropriateness
- Component composition
- Testability and maintainability

**Usage**:
```bash
pi subagent design-reviewer --task "Review the design of feature-branch changes"
```

### Design (`design.md`)
**Purpose**: Produces distinctive frontend visual direction and implementation-ready design handoffs

**Focus Areas**:
- Typography, color systems, and thematic cohesion
- Motion choreography and high-impact interaction moments
- Atmospheric backgrounds and depth
- Avoiding generic AI-style visual output
- Accessibility constraints while preserving strong aesthetics

**Usage**:
```bash
pi subagent design --task "Create design direction for a marketing homepage redesign"
```

### Rails Reviewer (`rails-reviewer.md`)
**Purpose**: Reviews Ruby on Rails backend code

**Focus Areas**:
- Rails idioms and conventions
- ActiveRecord usage and query patterns
- Controller design (thin controllers)
- Service object patterns
- Rails testing best practices

**Usage**:
```bash
pi subagent rails-reviewer --task "Review Rails code in PR #1234"
```

### Frontend Reviewer (`frontend-reviewer.md`)
**Purpose**: Reviews React and TypeScript frontend code

**Focus Areas**:
- React component design and patterns
- TypeScript type safety
- State management (hooks, context)
- Accessibility (a11y)
- Performance optimization
- React Testing Library patterns

**Usage**:
```bash
pi subagent frontend-reviewer --task "Review frontend changes in PR #1234"
```

### Testing Reviewer (`testing-reviewer.md`)
**Purpose**: Reviews test quality and coverage

**Focus Areas**:
- Test coverage and comprehensiveness
- Minimal mocking strategy
- Domain-driven test naming
- Test clarity and maintainability
- Behavior validation (not implementation)

**Usage**:
```bash
pi subagent testing-reviewer --task "Review test quality in PR #1234"
```

### Execution Strategist (`execution-strategist.md`)
**Purpose**: Produces dynamic runtime orchestration strategies tailored to each objective

**Focus Areas**:
- Planning depth calibration (light/standard/deep)
- Determining when code exploration is required
- Determining whether a dedicated design track is required
- Selecting orchestration vs teams execution topology
- Emitting implementable runtime orchestration payloads

**Usage**:
```bash
pi subagent execution-strategist --task "Plan dynamic execution strategy for implementing issue #123"
```

### Team Creator (`team-creator.md`)
**Purpose**: Creates reusable team capabilities from high-level descriptions

**Focus Areas**:
- Designing subagent + orchestration topology for a new team capability
- Creating/maintaining reusable orchestration JSON configs
- Updating team-related docs with invocation patterns
- Ensuring new team artifacts are minimal, consistent, and reusable

**Usage**:
```bash
pi subagent team-creator --task "Create a reusable team capability for triaging and implementing GitHub issues"
```

## Orchestrations

### Feature Pipeline (`orchestrations/feature-pipeline.json`)
**Purpose**: Unified strategy-first feature delivery entrypoint

**Workflow**:
1. **Strategy Stage**: `execution-strategist` determines runtime topology (including whether design is required)
2. **Execute Stage**: implementation proceeds according to chosen strategy
3. **Review Stage**: quality/safety review

**Usage**:
```bash
pi subagent --orchestration feature-pipeline --task "Implement issue #123"
```

### Design Dev Orchestration (`orchestrations/design-dev-pipeline.json`)
**Purpose**: Delivers design-led frontend work with a dedicated design stage before implementation

**Workflow**:
1. **Plan Stage**: `planner` defines milestones and risks
2. **Design Stage**: `design` creates visual direction + implementation handoff
3. **Build Stage**: `builder` implements with design fidelity
4. **Review Stage**: `frontend-reviewer` + `reviewer` validate quality and correctness

**Usage**:
```bash
pi subagent --orchestration design-dev-pipeline --task "Build a distinctive marketing site for product launch"
```

### PR Review Orchestration (`orchestrations/pr-review.json`)
**Purpose**: Coordinates multiple specialized reviewers for comprehensive PR review

**Workflow**:
1. **Triage Stage**: Analyzes PR and identifies applicable reviewers
2. **Review Stage**: Runs applicable specialized reviewers in parallel

**Usage**:
```bash
pi subagent --orchestration pr-review --task "Review PR #1234"
```

### Team Creation Orchestration (`orchestrations/team-creation-pipeline.json`)
**Purpose**: Designs and creates reusable team capabilities from a high-level objective

**Workflow**:
1. **Design Stage**: Planner + Architect produce artifact plan and team architecture
2. **Create Stage**: `team-creator` authors subagents/orchestrations/docs
3. **Review Stage**: Reviewer validates quality and safety

**Usage**:
```bash
pi subagent --orchestration team-creation-pipeline --task "Create a reusable team capability for X"
```

See `orchestrations/README.md` for detailed documentation.

## Standard Operating Procedure

For non-trivial execution requests, default workflow is:
1. **Plan mode**: use `execution-strategist` to decide topology at runtime
2. **Dynamic orchestration**: prefer inline `subagent` `orchestration`/`teams` payloads for task-specific stage composition
3. **Execution + review**: run implementation tracks and reviewers according to strategy

Use static orchestration configs as reusable presets, not hard constraints.

## Design Principles

### Self-Filtering
Each specialized reviewer implements a self-filtering protocol:
- Receives triage output with applicability assessment
- Gracefully skips if marked as "NOT APPLICABLE"
- Performs full review if marked as "APPLICABLE"

This prevents noise from irrelevant reviewers without complex coordination logic.

### Generic Content
All subagents are framework/language-agnostic where possible and contain no organization-specific content. They focus on:
- Universal best practices
- Framework-specific conventions (Rails, React, etc.)
- Language-specific idioms (Ruby, TypeScript, etc.)
- General software engineering principles

### Orchestration Support
Reviewers follow an orchestration protocol:
- Can delegate to supporting subagents (`code-explorer`, `architect`, `code-explainer`)
- Receive and parse structured triage output
- Provide consistent output formats
- Support parallel execution

## Usage Patterns

### Individual Subagent Invocation
```bash
# Direct invocation
pi subagent <subagent-name> --task "<task-description>"

# Example
pi subagent design-reviewer --task "Review the architecture of the new payment service"
```

### Orchestration Invocation
```bash
# Run orchestration
pi subagent --orchestration <orchestration-name> --task "<task-description>"

# Example
pi subagent --orchestration pr-review --task "Review PR #1234"
```

### Teams Invocation (Parallel Orchestration Runs)
```json
{
  "teams": [
    {
      "name": "api",
      "orchestrationConfig": "feature-pipeline",
      "task": "Implement API changes"
    },
    {
      "name": "ui",
      "orchestrationConfig": "feature-pipeline",
      "task": "Implement UI changes"
    }
  ],
  "teamsConcurrency": 2,
  "teamsFailureMode": "continue"
}
```

Each team runs in its own git worktree. Use `/teams list` and `/teams show <team-id|name>` to inspect status.

Quick launcher commands:
```bash
/subagents team feature-pipeline api::"Implement API changes" || ui::"Implement UI changes"
/subagents team team-creation-pipeline meta-team::"Create a reusable team capability for docs automation"
```

Team manager helpers:
```bash
/teams do Implement issue #123 with parallel API/UI tracks
/teams create "A reusable generalist team for feature delivery"
/teams create "A team that creates teams"
```

### Delegation from Parent Agent
Within a pi agent session, you can delegate to subagents:
```
subagent Task:
Use pr-review orchestration to review PR #1234
```

## Extending This System

### Adding a New Reviewer

1. **Create the Subagent File**
   ```bash
   touch .pi/agent/subagents/your-reviewer.md
   ```

2. **Define the Subagent**
   Include these sections:
   - Frontmatter (name, description, tools, tags)
   - SELF-FILTERING PROTOCOL
   - Review approach and focus areas
   - Orchestration protocol (when to delegate)
   - GitHub interaction requirements
   - Output format

3. **Update PR Triage**
   Modify `pr-triage.md` to detect when your reviewer is applicable.

4. **Add to Orchestration**
   Edit `orchestrations/pr-review.json` to include your reviewer in Stage 2.

5. **Document**
   Update this README and `orchestrations/README.md`.

### Creating a New Orchestration

1. **Design the Stages**
   - Stage 1: Analysis/preparation
   - Stage 2+: Specialized work (often parallel)

2. **Create JSON Config**
   ```bash
   touch .pi/agent/subagents/orchestrations/your-orchestration.json
   ```

3. **Define Tasks**
   ```json
   {
     "name": "your-orchestration",
     "description": "Description",
     "stages": [
       {
         "label": "Stage Name",
         "tasks": [...]
       }
     ]
   }
   ```

4. **Document**
   Add usage instructions to `orchestrations/README.md`.

## Best Practices

### For Subagent Authors
- **Be specific about tools**: Declare all tools in frontmatter
- **Self-filter gracefully**: Exit early if not applicable
- **Delegate when uncertain**: Use `code-explorer`, `architect`, etc.
- **Provide structured output**: Use consistent markdown formatting
- **Document invocation patterns**: Include examples in subagent file

### For Orchestration Authors
- **Pass context between stages**: Use `{previous}` injection
- **Set appropriate concurrency**: Balance speed and system load
- **Provide clear task descriptions**: Include what each stage should do
- **Test edge cases**: Verify behavior with various PR types

### For Users
- **Start with orchestrations**: They coordinate multiple subagents intelligently
- **Use individual subagents for focused work**: When you need one specific analysis
- **Provide clear context**: Include PR numbers, branch names, or diffs
- **Review triage output first**: Understand which reviews will run before full execution

## Troubleshooting

### Subagent Not Found
**Problem**: "Subagent 'X' not found"

**Solution**: Ensure the file exists in `.pi/agent/subagents/` with matching frontmatter name.

### Orchestration Fails
**Problem**: Orchestration errors or times out

**Solutions**:
- Check JSON syntax in orchestration file
- Verify all referenced subagents exist
- Reduce concurrency limit if system is overloaded
- Check for proper `{previous}` injection syntax

### Reviewers Provide Redundant Feedback
**Problem**: Multiple reviewers comment on the same issues

**Solutions**:
- Clarify role boundaries in each reviewer's focus areas
- Update triage logic to better route concerns
- Consider adding a synthesis stage to deduplicate findings

### Self-Filtering Not Working
**Problem**: Reviewers run even when not applicable

**Solutions**:
- Verify SELF-FILTERING PROTOCOL section exists
- Check that triage output includes "Recommended Reviewers" section
- Ensure reviewer checks for "APPLICABLE" vs "NOT APPLICABLE"

## Integration with User-Level Subagents

Project-local subagents (in `.pi/agent/subagents/`) coexist with user-level subagents (in `~/.pi/agent/subagents/`). Pi agent will discover both and allow you to choose which to use.

**Recommendation**: Keep generic, reusable subagents at user-level and project-specific ones here.

## Maintenance

### Regular Updates
- Review subagents quarterly for outdated patterns
- Update based on framework version changes (Rails, React, etc.)
- Incorporate feedback from actual usage

### Version Control
- Commit all subagents and orchestrations to the repository
- Track changes to understand evolution of review processes
- Use PRs to propose changes to review criteria

### Testing
- Periodically test orchestrations with real PRs
- Validate that triage correctly identifies applicable reviewers
- Ensure self-filtering works across all scenarios
- Run tool/profile heuristic checks to catch prompt-composer interaction drift:
  ```bash
  node pi/agent/subagents/scripts/lint-tool-heuristics.mjs
  # strict mode (non-zero exit on warnings)
  node pi/agent/subagents/scripts/lint-tool-heuristics.mjs --strict
  ```
