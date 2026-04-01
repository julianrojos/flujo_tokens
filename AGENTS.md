# AGENTS.md

Operational instructions for AI agents in this repository.

## Precedence

Applies when instructions conflict (high → low):
1. **System prompt** — platform/IDE injected instructions.
2. **AGENTS.md** — project-level defaults (this file).
3. **`.agents/rules/*.mdc`** — domain and stage rules.
4. **Conversation messages** — per-task overrides from the user.

## Rule Loading

- Rules live in `.agents/rules/*.mdc`; each has `globs:` frontmatter that controls when it applies.
- For each task, apply only rules whose `globs` match the files being read, edited, or
  generated. If a task touches multiple file groups, apply the union.
- Quick discovery: `.agents/rules/_manifest.yml` maps rule IDs to doc types and stages via
  `matrix.by_doc_type` and `matrix.by_stage`. Use it to identify relevant rules without
  scanning all `.mdc` files when the doc type or stage is known.
- Do not duplicate rule content here; update rule files directly.

## Skills

- Skills live in `.agents/skills/**/SKILL.md`.
- Trigger: the user names a skill explicitly, or the task clearly matches the skill's
  `## When to use this skill` section.
- Resolve relative paths referenced by a skill from that skill's own directory.
- Prefer the minimal set of skills needed. When two skills overlap, apply both;
  the more specific one takes precedence.

## Workflows

- Workflows live in `.agents/workflows/*.md`. Each has a `description:` frontmatter field
  and a `# /<command>` heading.
- Trigger: the user invokes `/<command>` (e.g. `/review`, `/handoff`), or the task clearly
  maps to a workflow's `description:` field.
- When triggered, load the workflow file and follow its steps as the authoritative procedure
  for that command.
- `// turbo` in a workflow marks steps that are safe to run in parallel (read-only
  operations). Run them concurrently when the runtime supports it.
- Workflows and rules are complementary: the workflow defines procedure; applicable `.mdc`
  rules still govern any files produced.

## Repo Conventions

- Canonical component docs directories are system-scoped:
  `design-systems/<id>/docs/components` and `design-systems/<id>/docs/_spec/components`.
- Treat `design-systems/<id>/docs/_generated/**` as generated artifacts; modify via
  scripts/workflows, not manual editing.
