# Candy Select Refresh Design

## Goal

Replace the remaining native dropdown controls with a unified Candy-branded select system that feels more commercial, matches the current UI language, and improves usability.

This refresh should:

- keep the interface visually cohesive with the existing Candy theme
- make the header environment selector feel like a premium control
- support richer interactions where they are useful
- avoid turning every form control into a heavy widget

## Scope

The redesign covers all current single-select dropdowns in the frontend:

- header environment selector
- repository source selector
- repository platform selector
- runner mode selector
- secret repository scope selector

This phase does not include multi-select, async remote search, or creatable options.

## Design Direction

Use a single reusable custom `Select` component family with two presentation levels:

1. Rich variant
   - used for the environment selector and repository source selector
   - supports richer option rows, search, clear action, empty state, and optional metadata

2. Compact variant
   - used for platform, runner mode, and secret scope
   - uses the same interaction model and visual language, but with simpler option rows

The overall direction is brand-forward rather than ultra-minimal:

- soft white surfaces
- subtle red/blue Candy-tinted gradients
- crisp borders with light brand emphasis
- more polished menu panels, hover states, and selected states

## Component Model

Add a reusable select system inside the frontend codebase:

- `Select`
- `SelectTrigger`
- `SelectMenu`
- `SelectOption`

This does not need to be split into separate files yet if that would fight the current code structure, but the behavior should still be implemented as a focused component boundary rather than repeated inline state.

Expected behavior:

- click trigger to open/close
- click outside to dismiss
- keyboard navigation with up/down
- enter to confirm selection
- escape to close
- disabled state support
- consistent focus styling

## Rich Select Behavior

### Environment selector

The environment selector is the flagship select in the header.

Closed state:

- compact horizontal control
- small `ENVIRONMENT` label on the left
- selected environment name only
- color dot for the environment
- centered chevron icon
- no repository or runner counts

Open state:

- branded floating panel
- one clean row per environment
- optional color dot and secondary slug/description only if useful
- current environment clearly highlighted

### Repository source selector

The repository source selector gets the richest menu.

Open menu includes:

- search input at the top
- option rows with source name and secondary metadata
- provider badge or short provider label
- deploy-key configured indicator when applicable
- clear selection action when a value is chosen
- empty state when there are no matching items

## Compact Select Behavior

Used for platform, runner mode, and secret scope.

Closed state:

- same trigger shape and typography family as the rich variant
- smaller footprint
- left icon or badge only when it adds clarity

Open state:

- same menu shell and motion language
- simple rows with clear selected and hover states

## Visual Rules

- border radius stays within the existing product system
- triggers should align with existing input heights
- menu panels should feel premium through spacing and shadow, not through oversized controls
- the environment selector height must not exceed the locale switch by a visually distracting amount
- the environment chevron must be vertically centered
- brand accents should be present but restrained enough that selects do not overpower the rest of the page

## Accessibility

- use button/listbox style semantics or equivalent accessible semantics
- support keyboard interaction and visible focus
- preserve readable contrast in all states
- keep labels connected to their controls

## Implementation Notes

- replace native `select` usage in the targeted forms and header
- preserve existing data flow and API payloads
- keep localization intact
- prefer a reusable internal component rather than styling each dropdown independently

## Testing

Verify:

- open/close behavior works with mouse and keyboard
- selection updates form state correctly
- outside click closes the menu
- environment selector renders cleanly in desktop and mobile layouts
- search in repository source select filters correctly
- build still succeeds

## Out of Scope

- multi-select
- server-backed search
- option creation from the select itself
- redesigning unrelated radio groups or date picker behavior
