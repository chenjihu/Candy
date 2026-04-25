# Candy Select Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining native dropdowns with a reusable Candy-branded custom select system that supports richer menus where needed without breaking existing form behavior.

**Architecture:** Build one reusable select component family inside the existing frontend entry file, backed by shared hooks for open state, outside-click dismissal, and keyboard navigation. Roll it out first to compact form dropdowns, then to the richer environment and repository source selectors, and finish by polishing styles and validating the full dashboard flow.

**Tech Stack:** React, Vite, existing `frontend/src/main.jsx` component structure, existing `frontend/src/styles.css` design system.

---

## File Map

- Modify: `frontend/src/main.jsx`
  - Add reusable custom select primitives and wire them into existing forms.
- Modify: `frontend/src/styles.css`
  - Add branded trigger/menu/option styles for compact and rich variants.
- Test: `frontend/package.json`
  - Use existing `npm run build` verification path.

### Task 1: Add reusable select primitives

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/package.json`

- [ ] **Step 1: Write the failing test target**

We do not have a frontend unit test harness in this repo yet, so the failing target for this task is the current missing behavior: there is no reusable custom select component and all dropdowns still depend on native `<select>`. The implementation for this task must introduce:

```jsx
function Select({ ...props }) {}
function SelectTrigger({ ...props }) {}
function SelectMenu({ ...props }) {}
function SelectOption({ ...props }) {}
```

- [ ] **Step 2: Run the current verification command to establish baseline**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS before refactor, confirming the baseline app still builds.

- [ ] **Step 3: Write minimal implementation**

Add a focused select system in `frontend/src/main.jsx` with:

```jsx
function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  variant = 'compact',
  searchable = false,
  clearable = false,
  renderOption,
  renderValue,
  getOptionSearchText
}) {
  // internal open state
  // highlighted option index
  // outside click close
  // keyboard navigation
}
```

Support:

- trigger button instead of native `select`
- listbox popup
- `Escape`, `Enter`, `ArrowUp`, `ArrowDown`
- optional search field
- optional clear action
- render prop support for rich options

- [ ] **Step 4: Add minimal shared styles**

Add CSS blocks in `frontend/src/styles.css` for:

```css
.select,
.select-trigger,
.select-menu,
.select-option,
.select-search,
.select-clear,
.select-rich,
.select-compact
```

Ensure the first version is functional before polishing.

- [ ] **Step 5: Run verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS with the new select primitives compiled.

### Task 2: Replace compact form dropdowns

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/package.json`

- [ ] **Step 1: Write the failing behavior target**

The current compact dropdowns still use native controls at:

- secret repository scope
- repository platform
- runner mode

After this task, those controls must render through the reusable `Select` component while preserving the same state fields and payload values.

- [ ] **Step 2: Run baseline verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS before swapping the compact controls.

- [ ] **Step 3: Write minimal implementation**

Replace the existing native controls with `Select` usage similar to:

```jsx
<Select
  variant="compact"
  value={form.provider}
  onChange={(next) => setForm((current) => ({ ...current, provider: next }))}
  options={[
    { value: 'github', label: t('repository.providerGithub'), badge: 'GH' },
    { value: 'gitee', label: t('repository.providerGitee'), badge: 'GI' },
    { value: 'generic', label: t('repository.providerGeneric'), badge: '::' }
  ]}
/>
```

Keep the same form semantics and required behavior.

- [ ] **Step 4: Polish compact variant styles**

Add compact trigger sizing and option-row styling so the controls align with existing inputs and do not expand the layout.

- [ ] **Step 5: Run verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS with compact dropdown replacements.

### Task 3: Replace the environment selector with the rich flagship variant

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/package.json`

- [ ] **Step 1: Write the failing behavior target**

The header environment selector currently still uses a native `select` and does not match the approved rich design direction.

Required behavior after this task:

- label remains on the left
- closed state shows only environment name and color dot
- no repository or runner counts
- centered chevron
- branded open menu with clean environment rows

- [ ] **Step 2: Run baseline verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS before replacing the environment selector.

- [ ] **Step 3: Write minimal implementation**

Update `EnvironmentSwitcher` to use the reusable `Select` with rich rendering:

```jsx
<Select
  variant="rich"
  value={selectedEnvironmentId}
  onChange={onChange}
  options={environments.map((environment) => ({
    value: environment.id,
    label: environment.name,
    color: environment.color,
    meta: environment.slug || ''
  }))}
  renderValue={(option) => ...}
  renderOption={(option, state) => ...}
/>
```

- [ ] **Step 4: Add environment-specific styling**

Style the header version so its height is visually close to the locale switch, and keep the chevron vertically centered using icon geometry instead of font glyphs.

- [ ] **Step 5: Run verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS with the new environment selector.

### Task 4: Replace repository source with searchable rich select

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/package.json`

- [ ] **Step 1: Write the failing behavior target**

The repository source picker still uses a native select and cannot search, show richer metadata, or clear the current value through the menu.

- [ ] **Step 2: Run baseline verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS before replacing the source picker.

- [ ] **Step 3: Write minimal implementation**

Replace the source picker with:

```jsx
<Select
  variant="rich"
  searchable
  clearable
  value={form.repositorySourceId}
  onChange={(next) => setForm((current) => ({ ...current, repositorySourceId: next }))}
  options={repositorySources.map((source) => ({
    value: source.id,
    label: source.name,
    provider: source.provider,
    description: source.repoUrl,
    hasDeployKey: source.hasDeployKey
  }))}
  getOptionSearchText={(option) => [option.label, option.provider, option.description].join(' ')}
  renderValue={(option) => ...}
  renderOption={(option, state) => ...}
/>
```

- [ ] **Step 4: Add richer option styling**

Style provider badges, deploy-key indicators, search row, clear action, hover state, selected row, and empty state.

- [ ] **Step 5: Run verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS with searchable rich repository source selection.

### Task 5: Final polish and regression pass

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/package.json`

- [ ] **Step 1: Write the failing behavior target**

Before finishing, verify the remaining spec requirements:

- outside click closes menus
- keyboard navigation works
- forms still submit correct values
- desktop and mobile layouts remain stable

- [ ] **Step 2: Implement final polish**

Tighten spacing, z-index, mobile width behavior, and selected-state visuals so the new select menus feel integrated with the rest of the product.

- [ ] **Step 3: Run final verification**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`
Expected: PASS

- [ ] **Step 4: Manual smoke checklist**

Manually verify in the running app:

- environment menu opens and closes cleanly
- repository source search filters correctly
- compact selects update form state
- no native browser dropdown chrome remains for these controls

- [ ] **Step 5: Commit**

```bash
git add frontend/src/main.jsx frontend/src/styles.css docs/superpowers/specs/2026-04-25-select-refresh-design.md docs/superpowers/plans/2026-04-25-select-refresh.md
git commit -m "feat: refresh select controls"
```
