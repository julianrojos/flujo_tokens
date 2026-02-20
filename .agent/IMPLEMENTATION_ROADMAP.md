# Implementation Roadmap — Quick Reference

**Last updated:** 2026-02-20
**Status:** Draft
**Owner:** TBD

---

## What to Implement First (Priority Order)

### 🔴 CRITICAL (Blocks everything else)

#### 1. **Validación mediante JSON Schema** (1.1 + 1.2)
- **Why:** Sin esto, la IA sigue inventando valores
- **Time:** 10h
- **Owner:** TBD
- **Includes:**
  - 5 schemas JSON para rules críticas
  - CLI validator `npm run validate:rules`
  - CI gate en pre-commit
- **Files to create:**
  ```
  .agent/rules/_schemas/
    ├── component-spec-yaml.schema.json
    ├── frontmatter-contract.schema.json
    ├── component-doc.schema.json
    ├── token-references.schema.json
    └── test-cases/
        ├── component-spec-yaml.valid.yml
        ├── component-spec-yaml.invalid-status.yml
        └── ...
  tooling/scripts/
    ├── validate-rules.mjs
    └── package.json (ajv, yaml)
  ```

#### 2. **Agent Expectations Explícitas** (2.1 + 2.2)
- **Why:** Evita incompatibilidad cuando cambian agentes (Claude → Gemini)
- **Time:** 15h
- **Owner:** TBD
- **Includes:**
  - Campo `agent_expectations` en SKILL.md
  - Validation script `validate-agent-compatibility.mjs`
  - Test fixtures para cada skill
- **Decision point:** ¿Llevar agent compatibility a Figma Bridge MCP?

---

### 🟠 HIGH (Debloquea calidad)

#### 3. **Violation Examples en Rules** (3.1)
- **Why:** Reduce ambigüedad en interpretación de IA
- **Time:** 60h (paralelizable)
- **Owner:** Team (sprint paralelo)
- **Approach:**
  - Top 10 rules: 2-3h cada una
  - Remaining 20 rules: 1-2h cada una
  - Template: copiar de `docs-language-tone` actualizado
- **Quick win:** Hacer top 3 (docs-language-tone, component-doc, ds-docs-guardrails) en semana 1

#### 4. **Rule Versioning + CI** (4.1 + 4.2)
- **Why:** Detectar incompatibilidades skill-rule automáticamente
- **Time:** 8h
- **Owner:** TBD
- **Includes:**
  - Frontmatter version en todas las reglas
  - Script `validate-skill-versions.mjs`
  - CHANGELOG.md centralizado
- **Decision:** ¿Versionado semántico o solo mayor.menor?

---

### 🟡 MEDIUM (Mejora observabilidad)

#### 5. **Quality Metrics** (5.1 + 5.2 + 5.3)
- **Why:** Saber qué reglas refactorizar, qué skills están sanos
- **Time:** 20h
- **Owner:** TBD
- **Outputs:**
  - Scorecard dashboard
  - Coverage report `.reports/rule-coverage-*.json`
  - Ambiguity analyzer
- **Frecuencia:** Semanal via CI

#### 6. **Skill Health Dashboard** (6.1)
- **Why:** Monitoreo continuo de skills (¿ejecutables? ¿compatibles?)
- **Time:** 10h
- **Owner:** TBD
- **Output:** `.reports/skill-health-*.json` + GitHub Pages dashboard

---

## Implementation Checklist

```markdown
## Phase 1: Foundation (Semanas 1-2)

### Week 1 — Setup
- [ ] Create `.agent/rules/_schemas/` directory
- [ ] Write `component-spec-yaml.schema.json` (2h)
- [ ] Write `frontmatter-contract.schema.json` (1h)
- [ ] Write `token-references.schema.json` (1.5h)
- [ ] Write `component-doc.schema.json` (1h)
- [ ] Write `component-name-normalization.schema.json` (1h)
- [ ] Create `.agent/rules/_schemas/test-cases/` with ✅ and ❌ examples
- [ ] Add `agent_expectations` field to `ds-component-doc/SKILL.md`
- [ ] Start 3.1: Add violation examples to top 3 rules

### Week 2 — Validation Scripts
- [ ] Write `tooling/scripts/validate-rules.mjs` (3h)
- [ ] Add to `package.json`: `ajv`, `yaml`, `glob` dependencies
- [ ] Wire CI gate (GitHub Actions)
- [ ] Write `validate-agent-compatibility.mjs` (4h)
- [ ] Create test fixtures for ds-component-doc skill
- [ ] Run first validation pass on existing docs (find violations)
- [ ] Continue 3.1: Add violation examples to 6 more rules

## Phase 2: Robustness (Semanas 3-4)

### Week 3 — Test Fixtures + Versioning
- [ ] Create comprehensive test cases for all 5 schemas
- [ ] Wire test runner into `validate-rules.mjs`
- [ ] Add `version` field to all 30 rules (1-2h total)
- [ ] Create `.agent/rules/CHANGELOG.md`
- [ ] Write `validate-skill-versions.mjs` (3h)
- [ ] Update all SKILL.md files with `requires_rules` pinned versions
- [ ] Continue 3.1: Examples for remaining rules

### Week 4 — Observability
- [ ] Write `measure-rule-coverage.mjs` (4h)
- [ ] Create `.reports/` directory in CI
- [ ] Wire weekly coverage reports to GitHub
- [ ] Write `measure-rule-ambiguity.mjs` (3h)
- [ ] Analyze and generate RULE_QUALITY_SCORECARD.md

## Phase 3: Continuous Improvement (Ongoing)

### Operational
- [ ] Run `npm run validate:rules` on every push
- [ ] Weekly: Review `.reports/rule-coverage-*.json` for regressions
- [ ] Monthly: Review AMBIGUITY scores for rules to refactor
- [ ] Quarterly: Update Rule Quality Scorecard
```

---

## Decision Tree: Qué Hacer Cuando

### "Quiero agregar una rule nueva"
```
1. Escribe la regla en `.agent/rules/new-rule.mdc`
2. Agrega frontmatter (name, version, description, globs)
3. Si validable:
   - Crea `.agent/rules/_schemas/new-rule.schema.json`
   - Agrega test-cases ✅/❌
   - Declare en `_manifest.yml`
4. Si semántica (prose only):
   - Agrega ## Examples of Violations
   - No schema needed
5. Agrega a manifest.yml en la sección correcta (by_doc_type, by_skill)
6. Commit y CI validará formato
```

### "La IA generó docs que viola mi rule"
```
1. ¿La rule tiene JSON Schema?
   → SÍ: Debería haber sido catcheado en validate-rules.mjs
       Report bug en validator
   → NO: Agrega violation example y entrena a la IA manualmente
2. ¿La rule tiene agent_expectations?
   → SÍ: Ejecuta validate-agent-compatibility.mjs
   → NO: Crea expectations y corre compatibility test
3. Commit la corrección y actualiza la regla si es ambigua
```

### "Quiero cambiar una rule existente"
```
1. Edita `.agent/rules/rule-name.mdc`
2. ¿Es breaking change?
   → SÍ: Bump version MAJOR, agrega migration guide, update CHANGELOG
   → NO: Bump version MINOR/PATCH
3. Actualiza todas las skills que declaren `requires_rules` con esta rule
4. CI verifica compatibilidad automáticamente
5. Agrega test-case nuevo si es validable
```

### "Un skill no me da el output correcto"
```
1. Check SKILL.md frontmatter:
   ✅ Tiene inputs/outputs declarados?
   ✅ Tiene agent_expectations?
   ✅ Sus requires_rules están satisfechos?
2. Runea: npm run validate:skill-health
3. Si score < 80:
   - Agrega test fixtures faltantes
   - Declara agent_expectations faltantes
   - Actualiza requires_rules si hay versioning conflict
4. Re-test y valida output contra expectations
```

---

## Key Files to Create / Modify

### New Files
```
.agent/rules/_schemas/*.schema.json          [5 archivos críticos + más después]
.agent/rules/_schemas/test-cases/*           [fixtures de prueba]
.agent/rules/CHANGELOG.md                    [history de cambios]
tooling/scripts/validate-rules.mjs           [CLI validator]
tooling/scripts/validate-agent-compatibility.mjs
tooling/scripts/validate-skill-versions.mjs
tooling/scripts/measure-rule-coverage.mjs
tooling/scripts/measure-rule-ambiguity.mjs
tooling/scripts/measure-skill-health.mjs
.github/workflows/validate-rules.yml         [CI gate]
.github/workflows/measure-coverage.yml       [reporting]
.agent/RULE_QUALITY_SCORECARD.md            [metrics]
```

### Modified Files
```
.agent/rules/_manifest.yml                   [agregar info de schema/versioning]
.agent/rules/*.mdc (all 30 files)            [agregar violation examples]
.agent/skills/**/SKILL.md (all 7 skills)     [agregar agent_expectations, version]
package.json                                  [agregar devDependencies: ajv, semver, etc]
.gitignore                                    [agregar .reports/]
```

---

## Approval Gates

```
After 1.1 (JSON Schema):
  ✅ Schema files pass JSON validation
  ✅ All globs match actual files

After 1.2 (CLI Validator):
  ✅ validate-rules.mjs catches known violations
  ✅ CI gate blocks non-compliant PRs

After 2.1 + 2.2 (Agent Compatibility):
  ✅ Test-run skill against all compatible_agents
  ✅ All agent_expectations pass

After 3.1 (Violation Examples):
  ✅ Rulesheet tiene ≥2 ❌ examples per violation type
  ✅ Todos los ejemplos pasan test-case runner

After Phase 1 Complete:
  ✅ All 30 rules have violation examples (distributed)
  ✅ validate:rules passes on 100% of docs/
  ✅ All skills report 80+ health score
```

---

## Success Criteria

| Goal | Baseline | After Phase 1 | After Phase 3 |
| ---- | -------- | ------------- | ------------- |
| Validation catch rate | 40% | 85% | 95% |
| Rules con schema | 0% | 17% | 100% |
| Rules con examples | 0% | 50% | 100% |
| Skill health score | N/A | 75 avg | 85 avg |
| CI validation time | N/A | <30s | <30s |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| Schema design too strict | Medium | High | Review with team, iterate in Week 2 |
| Agent compat tests false positives | Medium | Medium | Use comprehensive fixtures, include human review |
| Rule examples take longer | High | Low | Parallelize across team, use template |
| Skills need major refactor to comply | Low | High | Scope check before commitment |

---

## Questions for Julian

1. **Sequence:** ¿Quieres que haga 1.x primero (blocking foundation) o paralelizo con 3.x (violation examples)?
2. **Agentes:** ¿Cuál es el agente "canonical" (Claude)? ¿O son todos iguales?
3. **CI:** ¿GitHub Actions OK? ¿Presupuesto para más jobs?
4. **Reglas legacy:** ¿Backport schema/violations a todas las 30 reglas, o solo nuevas?
5. **Timeline:** ¿200h OK? ¿O necesitas MVP en 2 sprints (60-80h)?
