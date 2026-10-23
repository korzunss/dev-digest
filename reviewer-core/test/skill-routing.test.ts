import { describe, it, expect } from 'vitest';
import {
  skillsForFile,
  groupBySkillSet,
  specsForCall,
  type ScopedSkillInput,
  type PathMatcher,
} from '../src/index.js';

const skill = (id: string, paths: string[]): ScopedSkillInput => ({ id, name: id, version: 1, body: id, paths });
// Test matcher: a glob `*.ext` matches by suffix.
const match: PathMatcher = (path, globs) => globs.some((g) => path.endsWith(g.replace('*', '')));

describe('skillsForFile', () => {
  const skills = [skill('all', []), skill('cs', ['*.cs']), skill('ts', ['*.ts'])];
  it('always includes unscoped skills and keeps attached order', () => {
    expect(skillsForFile(skills, 'a.cs', match)).toEqual([0, 1]);
    expect(skillsForFile(skills, 'a.ts', match)).toEqual([0, 2]);
    expect(skillsForFile(skills, 'a.md', match)).toEqual([0]);
  });
  it('matches a deleted file by its old path', () => {
    expect(skillsForFile(skills, 'old/Gone.cs', match)).toEqual([0, 1]);
  });
});

describe('groupBySkillSet', () => {
  it('returns one group when only unscoped skills exist', () => {
    const g = groupBySkillSet(['a.cs', 'b.ts'], [skill('all', [])], match);
    expect(g).toEqual([{ paths: ['a.cs', 'b.ts'], skillIdx: [0] }]);
  });
  it('splits by exact skill set, ordered by first file in diff order', () => {
    const skills = [skill('all', []), skill('cs', ['*.cs']), skill('ts', ['*.ts'])];
    const g = groupBySkillSet(['x.cs', 'y.ts', 'z.cs', 'n.md'], skills, match);
    expect(g.map((x) => x.paths)).toEqual([['x.cs', 'z.cs'], ['y.ts'], ['n.md']]);
    expect(g.map((x) => x.skillIdx)).toEqual([[0, 1], [0, 2], [0]]);
  });
  it('puts a two-stack file in the group of its combined set', () => {
    const skills = [skill('a', ['*.ts']), skill('b', ['x.ts'])];
    const g = groupBySkillSet(['x.ts', 'y.ts'], skills, match);
    expect(g.map((x) => x.skillIdx)).toEqual([[0, 1], [0]]);
  });
  it('gives a file with no matching skill an empty skill set', () => {
    const g = groupBySkillSet(['a.md'], [skill('cs', ['*.cs'])], match);
    expect(g).toEqual([{ paths: ['a.md'], skillIdx: [] }]);
  });
});

describe('specsForCall', () => {
  const docs = [
    { path: 'own.md', body: 'o' },
    { path: 'via-cs.md', body: 'c', viaSkillIds: ['cs'] },
    { path: 'via-both.md', body: 'b', viaSkillIds: ['cs', 'ts'] },
  ];
  it('keeps docs without viaSkillIds and those sharing an injected id', () => {
    expect(specsForCall(docs, new Set(['ts'])).map((d) => d.path)).toEqual(['own.md', 'via-both.md']);
  });
  it('drops every inherited-only doc when no skill is injected', () => {
    expect(specsForCall(docs, new Set()).map((d) => d.path)).toEqual(['own.md']);
  });
  it('passes undefined through', () => {
    expect(specsForCall(undefined, new Set())).toBeUndefined();
  });
});
