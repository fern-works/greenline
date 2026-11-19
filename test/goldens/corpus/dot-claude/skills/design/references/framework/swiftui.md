# SwiftUI

Read this page when the manifest's frameworks include swiftui. It holds interface mechanics only.

- **Ownership.** State for local values, a binding for a value its parent owns, an observable model held in state at the root, the environment for shared services, and no view model that adds nothing.
- **One enum.** One mutually exclusive enum per sheet or route, never many booleans; no side effect or live call in a view's body.
- **Controls.** A native control, never a tap gesture on an image or text; colours from the theme; text that scales with Dynamic Type; identity never a list's index.
- **Async.** Asynchronous work runs in a task on the view, with explicit loading and error states.
- **Previews.** A preview never replaces a check on the device or with accessibility settings on.
