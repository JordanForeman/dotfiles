# Extension Core

Shared base classes for taxonomy-aligned custom extensions.

## Categories

- `GuardianExtensionCore`
- `InterceptorExtensionCore`
- `WorkflowExtensionCore`
- `WidgetExtensionCore`
- `IntegrationExtensionCore`

All category cores extend `ExtensionCore`.

## Design goals

- Keep extension entrypoints thin and consistent
- Reuse command and UI helper behavior
- Make extension taxonomy explicit in code via inheritance
