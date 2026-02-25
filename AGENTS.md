# AGENTS.md

Operational instructions for AI agents in this repository.

## Rule Loading (No Duplication)

- Source of truth for rules is `.agent/rules/*.mdc`.
- For each task, read rule files and apply only those whose `globs` match the files being read, edited, or generated.
- If a task touches multiple file groups, apply the union of matching rules.
- Do not duplicate rule content in this file; update rule files directly.
- Precedence for conflicts: system > developer > user > `AGENTS.md` > `.agent/rules/*.mdc`.

## Skills Loading

- Skills are defined in `.agent/skills/**/SKILL.md`.
- If the user names a skill (or the task clearly matches one), load only the relevant `SKILL.md` files and follow their workflow.
- Resolve relative paths referenced by a skill from that skill's own directory first.
- Prefer the minimal set of skills needed for the task.

## Workflows

- Workflows are defined in `.agent/workflows/*.md`.

## Repo Conventions

- Canonical component docs directory: `docs/components`.
- Treat `docs/_generated/**` as generated artifacts; modify via scripts/workflows, not manual editing.
