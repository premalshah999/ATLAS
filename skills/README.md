# ATLAS bundled skills

Reviewed, versioned procedures that ship with ATLAS ([ADR 0013](../docs/adr/0013-skills.md)). Agents see an index of the skills offered to their role and load one with `load_skill`; every load is recorded with the skill's content hash.

A skill is a directory with a `SKILL.md` (front matter `name`, `description`, optional `roles` and `version`) and optional reference files. Operators can add their own skills in Settings; skills found in a repository are offered to agents only after the operator imports that exact version.

Skills describe *how* to work. They are not evidence: ATLAS's gate still verifies every result independently.
