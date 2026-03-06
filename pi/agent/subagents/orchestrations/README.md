# Orchestration JSON

This directory contains orchestration JSON artifacts in this repo.

## Notes

- Primary reusable workflow format is chain files (`*.chain.md`) in `pi/agent/subagents/`
- JSON files here can be used as planning artifacts or source material when building chains

## Practical workflow

1. Define or update agent prompts in `pi/agent/subagents/*.md`
2. Build reusable execution flow as `*.chain.md`
3. Validate with `/chain` or `subagent` chain payloads
