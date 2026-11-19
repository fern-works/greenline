# Modal

Read this page when the change builds or changes a dialog, a sheet or a drawer.

- **Anatomy.** A modal dialog has a name tied to its heading; an urgent confirmation is an alert dialog. Everything behind it is inert, through the native modal dialog or the inert attribute. A scrim that dismisses on a click is a control, not decoration.
- **Focus.** On opening, focus goes to the element marked to take it, else the first focusable one, and for a destructive confirmation the least destructive action. On closing it returns to the trigger, or to the nearest container where the trigger is gone. Tab wraps inside; Escape closes the one opened last.
- **Words.** The title names the action and the object, the body states what is lost with counts, and the buttons name verb and object. Deleting an account, a workspace or a repository asks for its name to be typed; a frequent reversible action takes undo instead of a dialog.
- **Long content.** The panel is capped at the dynamic viewport height; its body scrolls, its actions stay outside the scroll, its overscroll is contained, and its actions stay reachable on a viewport 320 pixels tall.
- **Sizes and motion.** Widths come from a small set, about 400, 540 and 880 pixels. In an app it enters by scaling from about 0.97 in under 300 milliseconds and leaves in about three quarters of that, easing in.
- **Native.** In SwiftUI one sheet at a time, driven from one item enum, each sheet dismissing itself. In React Navigation a form sheet takes detents such as a quarter, a half and full, and Android honours only the first three; a fit-to-content sheet whose root fills its parent vanishes on Android.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `no-keyboard-trap`, floor: Focus can always leave a component with Tab, Shift+Tab or Escape.
- `dialog-focus`, floor: A dialog takes focus inside when it opens and returns it to the opener when it closes.
- `dialog-named`, floor: A dialog has an accessible name.
- `dialog-fits-short`, floor: A dialog's actions stay reachable on a 320px-tall viewport.
- `rn-sheet-fit-height`, floor: A fit-to-content sheet's root has no flex:1, which hides it on Android.
- `overlay-transitioned`, finish: An overlay that is shown and hidden on a condition enters and leaves with a transition rather than appearing at once.
- `dialog-buttons-specific`, reflex: Dialog buttons name their action, not OK, Yes or No.
- `overlay-overscroll`, reflex: A scrolling dialog or drawer contains its overscroll.
