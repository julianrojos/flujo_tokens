# SKILL: doc-consistency-checker

## Purpose

Close the system.

Compare:

- `ComponentDocModelOutput` as the structured factual base
- `ComponentDocOutput` as the final rendered artifact
- `EditorialPatch`

and generate an internal consistency and quality report before publication is allowed.

The ideal output of this skill is a `ValidationReport`.

---

## What It Validates

### 1. Factual Contradictions

Detect whether the patch:

- mentions variants that are not present
- mentions states that are not present
- changes the factual meaning of the component

### 2. Unsupported Claims

Detect claims that sound verified but are not backed by:

- Figma/MCP
- an explicit system convention
- reliable external metadata

Pay special attention to:

- accessibility
- behavior
- theming
- roles

### 3. Terminology Consistency

Compare names across both blocks.
Examples:

- `leading-icon` vs `prefix icon`
- `helper-text` vs `supporting copy`

If there is a mismatch:

- emit `terminologyMismatch`
- do not block unless the meaning changes

### 4. Minimum Coverage

Check whether any critical piece is missing.

Suggested checks:

- `summary`
- `variants[]` y/o `states[]`
- `accessibility`
- `qa[]`

### 5. QA Quality

Mark as warning if `qa[]` contains:

- generic phrases
- questions that cannot be verified
- items that are not component-specific

### 6. Accessibility Quality

Block or warn if:

- a role is stated as fact without evidence
- keyboard support is presented as verified without support
- labeling is presented as resolved without basis
- `[To confirm with dev]` is not used when appropriate

### 7. StructureWarning

If the extractor already emitted `StructureWarning`, this skill must:

- lower overall confidence
- raise the bar for editorial claims
- prevent poor structure from being compensated with aggressive inference

---

## Recommended Severity

### blocking

- factual contradiction
- claim presented as fact without traceability
- severely unreadable structure
- accessibility presented as verified without evidence

### warning

- ambiguous classification
- inconsistent naming
- misaligned terminology
- overly generic QA
- inferred theming with partial coverage

### info

- opportunity to enrich the description
- empty optional fields
- non-critical editorial improvement

## Suggested ValidationReport

- `passes: boolean`
- `score: number`
- `severity: "blocking" | "warning" | "info"`
- `structureWarnings[]`
- `missingSections[]`
- `unsupportedClaims[]`
- `editorialConflicts[]`
- `terminologyMismatches[]`
- `a11yWarnings[]`
- `notes[]`

---

## Final Rule

Publication must be blocked if the documentation looks more certain than it really is.
