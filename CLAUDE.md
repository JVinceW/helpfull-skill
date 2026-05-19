# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This repo stores **Claude skills** — self-contained instruction sets that teach Claude how to perform specific, repeatable tasks. Each skill lives in its own directory and consists of a `SKILL.md` plus any reference files the skill needs at runtime.

## Skill Directory Structure

Each skill follows this pattern:

```
<skill-name>/
  SKILL.md                  # Canonical skill definition (trigger phrases, steps, contracts)
  references/
    mapping.md              # Field-mapping rules or domain reference tables
    template-reference.html # Any static asset the skill injects into or references
    trigger-snippets.md     # Copy-paste prompts users can drop into a fresh session
```

## How Skills Work

A skill is invoked when a user types a trigger phrase (defined in `SKILL.md` under `## Trigger phrases`) into a Claude session. Claude then executes the deterministic steps listed under `## Deterministic steps`, using the reference files for field mappings and templates.

Skills are **stateless**: they must not persist data between runs beyond the active conversation. All preconditions (browser tabs, credentials, user-provided IDs) are validated at step 1 before any API calls are made.

## Writing or Editing Skills

- `SKILL.md` is the source of truth. The `## Deterministic steps` section must be unambiguous enough that any Claude instance can execute it identically.
- `mapping.md` owns field-level rules. Keep the `## Schema version` section current when the upstream API shape changes.
- `template-reference.html` contains a `/* INJECT_RESUME_HERE */` marker (or equivalent) that the skill replaces at runtime — do not remove it.
- `trigger-snippets.md` is for users only; it has no effect on Claude's behavior.

## Current Skills

| Directory     | Skill name           | What it does                                              |
|---------------|----------------------|-----------------------------------------------------------|
| `resume.io/`  | `resumeio-to-html`   | Fetches a resume.io resume via API and renders it as a standalone HTML CV using the Corporate template |
