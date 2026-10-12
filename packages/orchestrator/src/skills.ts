// Skill library (ADR 0013). A skill is a directory with a SKILL.md (YAML front matter + Markdown procedure) and
// optional reference files, following the open Agent Skills layout. Skills give agents repeatable procedures; the
// harness (tools, sandbox, policy, gate) is what makes them reliable.
//
// Trust: only bundled skills (shipped with ATLAS) and operator-installed skills (ATLAS data directory) are offered
// to agents. Skills found in a repository (.agents/skills, .pi/skills) are repository text, which never
// reconfigures an agent; they are listed as untrusted until the operator imports that exact version.
//
// Loading is progressive and governed: an agent sees an index (name + description) in its context, and fetches a
// procedure with the load_skill / read_skill_file tools. Every load is recorded with the content hash, so the
// evidence says which version of which procedure an agent followed.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AtlasError } from '@atlas/contracts';

/** external: found in another harness's skill folder (Claude Code, Codex, OpenCode); untrusted until imported. */
export type SkillSource = 'bundled' | 'operator' | 'repository' | 'external';

export interface SkillMeta {
  name: string;
  description: string;
  /** Roles the skill is offered to. Empty: every role that can read files. */
  roles: string[];
  version: string;
}

export interface Skill extends SkillMeta {
  source: SkillSource;
  dir: string;
  /** SHA-256 over SKILL.md and every reference file (sorted). */
  hash: string;
  files: string[];
  /** For external skills: which tool's folder it was found in. */
  origin?: string;
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_FILE = 256 * 1024;
const MAX_FILES = 64;

/**
 * Parse the front matter of a SKILL.md. A deliberately small YAML subset: `key: value`, quoted values, and lists as
 * `[a, b]` or `- item` lines. Anything else is an error rather than a guess.
 */
export function parseSkill(text: string): { meta: SkillMeta; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new AtlasError('invalid_request', 'SKILL.md must start with YAML front matter between --- lines');
  const fields: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && listKey) { (fields[listKey] as string[]).push(unquote(item[1])); continue; }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(raw);
    if (!kv) throw new AtlasError('invalid_request', `Unsupported front matter line: ${raw.slice(0, 80)}`);
    const [, k, v] = kv;
    listKey = null;
    if (v === '') { fields[k] = []; listKey = k; }
    else if (/^\[.*\]$/.test(v)) fields[k] = v.slice(1, -1).split(',').map((x) => unquote(x)).filter(Boolean);
    else fields[k] = unquote(v);
  }
  const str = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string) : '');
  const name = str('name');
  const description = str('description');
  if (!NAME.test(name) || name.length > 64) throw new AtlasError('invalid_request', `Skill name must be lowercase words joined by hyphens (got "${name}")`);
  if (!description || description.length > 1024) throw new AtlasError('invalid_request', `Skill ${name} needs a description of at most 1024 characters`);
  const roles = Array.isArray(fields.roles) ? fields.roles : str('roles') ? [str('roles')] : [];
  return { meta: { name, description, roles, version: str('version') || '1' }, body: m[2].trim() };
}

function unquote(v: string): string {
  const t = v.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

/** Files of a skill directory: regular files only, no symlinks, bounded in number and size. */
function skillFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.name.startsWith('.')) continue;
      const st = lstatSync(path.join(dir, r));
      if (st.isSymbolicLink()) throw new AtlasError('invalid_request', `Skill files may not be symlinks: ${r}`);
      if (st.isDirectory()) walk(r);
      else if (st.isFile()) {
        if (st.size > MAX_FILE) throw new AtlasError('invalid_request', `Skill file too large: ${r}`);
        out.push(r);
      }
      if (out.length > MAX_FILES) throw new AtlasError('invalid_request', 'Too many files in skill');
    }
  };
  walk('');
  return out.sort();
}

export function loadSkillDir(dir: string, source: SkillSource): Skill {
  const files = skillFiles(dir);
  if (!files.includes('SKILL.md')) throw new AtlasError('invalid_request', `No SKILL.md in ${dir}`);
  const { meta } = parseSkill(readFileSync(path.join(dir, 'SKILL.md'), 'utf8'));
  const h = createHash('sha256');
  for (const f of files) h.update(f).update('\0').update(readFileSync(path.join(dir, f))).update('\0');
  return { ...meta, source, dir, files, hash: h.digest('hex') };
}

function scan(root: string, source: SkillSource): { skills: Skill[]; errors: string[] } {
  const skills: Skill[] = [];
  const errors: string[] = [];
  if (!existsSync(root)) return { skills, errors };
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    try {
      const s = loadSkillDir(path.join(root, e.name), source);
      if (s.name !== e.name) throw new AtlasError('invalid_request', `Skill directory ${e.name} declares name ${s.name}`);
      skills.push(s);
    } catch (err) { errors.push(`${source}/${e.name}: ${(err as Error).message}`); }
  }
  return { skills, errors };
}

export const REPO_SKILL_DIRS = ['.agents/skills', '.pi/skills'];

/** Skill folders of other harnesses (ADR 0019): user-level, and inside a repository. */
export function harnessSkillDirs(home = os.homedir(), root?: string): { origin: string; dir: string }[] {
  return [
    { origin: 'Claude Code', dir: path.join(home, '.claude', 'skills') },
    { origin: 'Codex', dir: path.join(process.env.CODEX_HOME ?? path.join(home, '.codex'), 'skills') },
    { origin: 'OpenCode', dir: path.join(home, '.config', 'opencode', 'skills') },
    { origin: 'Agent Skills', dir: path.join(home, '.agents', 'skills') },
    ...(root ? [{ origin: 'Claude Code (repository)', dir: path.join(root, '.claude', 'skills') }, { origin: 'OpenCode (repository)', dir: path.join(root, '.opencode', 'skills') }] : []),
  ];
}

/** SKILL.md text for an operator-authored skill. Values are quoted; the parser below must read them back exactly. */
export function renderSkill(m: { name: string; description: string; roles: string[]; version?: string }, body: string): string {
  const q = (s: string) => `"${s.replace(/"/g, "'").replace(/\r?\n/g, ' ')}"`;
  return `---\nname: ${m.name}\ndescription: ${q(m.description)}\n${m.roles.length ? `roles: [${m.roles.join(', ')}]\n` : ''}version: ${q(m.version ?? '1')}\n---\n${body.trim()}\n`;
}

export class SkillLibrary {
  constructor(private readonly dirs: { bundled?: string; operator: string }, private readonly disabled: () => string[] = () => []) {}

  /** Trusted skills offered to agents. An operator skill overrides a bundled one of the same name. */
  trusted(): { skills: Skill[]; errors: string[] } {
    const b = this.dirs.bundled ? scan(this.dirs.bundled, 'bundled') : { skills: [], errors: [] };
    const o = scan(this.dirs.operator, 'operator');
    const byName = new Map<string, Skill>();
    for (const s of [...b.skills, ...o.skills]) byName.set(s.name, s);
    return { skills: [...byName.values()].sort((x, y) => x.name.localeCompare(y.name)), errors: [...b.errors, ...o.errors] };
  }

  /** Skills offered to a role. */
  forRole(role: string): Skill[] {
    const off = new Set(this.disabled());
    return this.trusted().skills.filter((s) => !off.has(s.name) && (!s.roles.length || s.roles.includes(role)));
  }

  get(name: string, role: string): Skill {
    const s = this.forRole(role).find((x) => x.name === name);
    if (!s) throw new AtlasError('invalid_request', `No skill named "${name}" is available to the ${role} role`);
    return s;
  }

  /** Read one file of a trusted skill; the path must be one of the skill's listed files. */
  read(name: string, role: string, rel = 'SKILL.md'): { skill: Skill; text: string } {
    const s = this.get(name, role);
    const norm = rel.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!s.files.includes(norm)) throw new AtlasError('invalid_request', `Skill ${name} has no file ${rel}. Files: ${s.files.join(', ')}`);
    const abs = path.join(s.dir, norm);
    if (!realpathSync(abs).startsWith(realpathSync(s.dir) + path.sep)) throw new AtlasError('invalid_request', 'Skill file escapes its directory');
    return { skill: s, text: readFileSync(abs, 'utf8') };
  }

  /** Skills found in a repository: listed, never offered to agents until imported. */
  inRepository(root: string): { skills: Skill[]; errors: string[] } {
    const out = { skills: [] as Skill[], errors: [] as string[] };
    for (const d of REPO_SKILL_DIRS) {
      const r = scan(path.join(root, d), 'repository');
      out.skills.push(...r.skills);
      out.errors.push(...r.errors);
    }
    return out;
  }

  /**
   * Import a repository skill into the operator library, pinned by the hash the operator reviewed: if the files
   * changed since, nothing is imported.
   */
  /**
   * Skills in other harnesses' folders. Untrusted like repository skills; one ATLAS itself synced there (same hash
   * as a trusted skill) is not listed again.
   */
  inHarnesses(home?: string, root?: string): { skills: Skill[]; errors: string[] } {
    const mine = new Set(this.trusted().skills.map((s) => s.hash));
    const out = { skills: [] as Skill[], errors: [] as string[] };
    for (const { origin, dir } of harnessSkillDirs(home, root)) {
      const r = scan(dir, 'external');
      out.skills.push(...r.skills.filter((s) => !mine.has(s.hash)).map((s) => ({ ...s, origin })));
      out.errors.push(...r.errors.map((e) => `${origin}: ${e.replace(/^external\//, '')}`));
    }
    return out;
  }

  importFromRepository(root: string, name: string, expectedHash: string): Skill {
    return this.importReviewed(this.inRepository(root).skills, name, expectedHash, 'this repository');
  }

  importFromHarness(name: string, expectedHash: string, home?: string, root?: string): Skill {
    return this.importReviewed(this.inHarnesses(home, root).skills.filter((s) => s.hash === expectedHash), name, expectedHash, 'another tool\'s skill folders');
  }

  /** Write or replace an operator skill authored in ATLAS. Reference files of an existing operator skill are kept. */
  saveOperator(m: { name: string; description: string; roles: string[]; version?: string }, body: string): Skill {
    const text = renderSkill(m, body);
    const parsed = parseSkill(text);
    if (parsed.meta.name !== m.name || parsed.meta.description !== m.description.replace(/"/g, "'").replace(/\r?\n/g, ' ')) throw new AtlasError('invalid_request', 'The skill could not be written faithfully');
    if (Buffer.byteLength(text) > MAX_FILE) throw new AtlasError('invalid_request', 'Skill text is too large');
    const target = path.join(this.dirs.operator, m.name);
    mkdirSync(target, { recursive: true });
    const tmp = path.join(target, `.SKILL.md.${process.pid}.tmp`);
    writeFileSync(tmp, text);
    renameSync(tmp, path.join(target, 'SKILL.md'));
    return loadSkillDir(target, 'operator');
  }

  private importReviewed(candidates: Skill[], name: string, expectedHash: string, where: string): Skill {
    const found = candidates.find((s) => s.name === name);
    if (!found) throw new AtlasError('invalid_request', `No skill named ${name} in ${where}`);
    if (found.hash !== expectedHash) throw new AtlasError('invalid_request', 'The skill changed since you reviewed it; review it again');
    const target = path.join(this.dirs.operator, name);
    mkdirSync(this.dirs.operator, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    for (const f of found.files) {
      mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
      cpSync(path.join(found.dir, f), path.join(target, f));
    }
    const imported = loadSkillDir(target, 'operator');
    if (imported.hash !== expectedHash) { rmSync(target, { recursive: true, force: true }); throw new AtlasError('internal', 'Imported skill does not match the reviewed hash'); }
    return imported;
  }

  removeOperator(name: string) {
    if (!NAME.test(name)) throw new AtlasError('invalid_request', 'Invalid skill name');
    const target = path.join(this.dirs.operator, name);
    if (existsSync(target) && statSync(target).isDirectory()) rmSync(target, { recursive: true, force: true });
  }

  /** Index shown in an agent's context: names and descriptions only (progressive disclosure). */
  index(role: string): string {
    const list = this.forRole(role);
    if (!list.length) return '';
    return `Load a skill with load_skill when its description matches your situation; follow its procedure. Skills are procedures, not evidence.\n${list.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`;
  }
}
