# Environment Management Entry Design

## Goal

Add a first-class environment management entry to the dashboard UI so administrators can create and maintain environments without calling the API manually.

## Scope

This design covers:

- a management entry near the top environment selector
- a lightweight modal for environment CRUD
- built-in default environments
- default environment colors
- deletion and safety rules

This phase does not redesign the broader dashboard navigation.

## Entry Placement

Add a small `Manage` icon button directly beside the top environment selector in the dashboard header.

Reasoning:

- environment switching and environment management stay mentally grouped
- the header remains compact
- no new primary tab is needed

## Interaction Model

Clicking the management button opens an environment management modal.

Modal layout:

- left side: environment list
- right side: environment editor form

Supported actions:

- create new environment
- edit existing environment
- delete empty environment

The currently selected environment should be visually indicated in the list.

## Form Fields

The modal editor should support:

- `name`
- `slug`
- `description`
- `color`

Color can be chosen from a small curated set first, rather than a free-form custom picker.

## Built-in Default Environments

The system should always ensure these two environments exist:

- `Production`
- `Testing`

Default colors:

- `Production`: current red brand-aligned color
- `Testing`: green

This should be guaranteed during initialization or migration, not only in the frontend.

## Safety Rules

- environments with bound repositories, runners, secrets, or deployment history remain non-deletable
- deleting environments should stay blocked by current backend safeguards
- the UI should surface backend deletion errors clearly

## Visual Direction

The modal should match the current Candy admin language:

- soft white surfaces
- subtle brand tinting
- compact but polished layout
- environment color visible in both the list and the form preview

## Implementation Notes

- keep the existing top environment switcher
- add a new modal component in the current frontend structure
- wire CRUD to existing `/api/environments` endpoints
- refresh dashboard environment state after create, update, or delete
- if the currently selected environment is edited, update the visible selector immediately

## Testing

Verify:

- built-in `Production` and `Testing` appear on a clean system
- new environments can be created from the UI
- edited environment names and colors update in the selector and badges
- deleting a non-empty environment is blocked with a clear message
- deleting an empty environment refreshes the list cleanly
