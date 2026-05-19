<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

## Priority Order
1. `search_graph` - find functions, classes, routes, variables by pattern
2. `trace_path` - trace who calls a function or what it calls
3. `get_code_snippet` - read specific function/class source code
4. `query_graph` - run Cypher queries for complex patterns
5. `get_architecture` - high-level project summary

## When to fall back to grep/glob
- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results
<!-- codebase-memory-mcp:end -->

# Codex Repository Guide

This repo stores AI-agent skills for repeatable resume workflows.

## Skill Layout

- `.claude/skills/` contains Claude Code skills.
- `.codex/skills/` contains Codex-compatible mirrors.
- For shared behavior, keep the Claude skill as the source of truth and update the Codex mirror in the same change.

## Codex Skill Requirements

Every Codex skill must have:

- `SKILL.md` with YAML frontmatter containing `name` and `description`.
- Concise procedural instructions in the Markdown body.
- Optional `references/` files for mapping tables, templates, and long reference material.
- Optional `agents/openai.yaml` for UI metadata.

## Current Skills

| Claude directory | Codex directory | Skill name | Purpose |
| --- | --- | --- | --- |
| `.claude/skills/resume.io/` | `.codex/skills/resumeio-to-html/` | `resumeio-to-html` | Convert a resume.io resume into standalone HTML using the Corporate template. |

