# iOS

Read this page when the manifest's platform is ios, or cross on an iOS target. The craft pages' web rules apply where this page says nothing.

- **Start from the target.** Name the lowest OS the app supports, where SwiftUI ends and UIKit begins, and the inputs it takes. Prefer the system's controls, semantic colours, text styles and safe-area handling to rebuilt ones.
- **Accessibility.** The native accessibility tree carries labels, values, traits and reading order; decorative images are hidden, and an icon-only button has a label.
- **Navigation.** One stack per tab; sheets driven by one item; placeholders while loading.
- **Targets and haptics.** A control is at least 44 by 44 points, the platform's own minimum cited rather than copied. A haptic fires in the same frame as its visual, once per action, never as the only feedback, and the person can turn it off.
- **Frames.** A high-refresh screen gives an 8 millisecond frame once the app opts in; test on the slowest device supported.
- **Verify.** On the primary device and one contrasting form factor, with larger text, dark mode, reduced motion and a right-to-left language; wait for the settled state rather than a fixed delay.
- **Held.** Apple's own guideline text and glass material are not drawn from here; read Apple's documentation where a question needs it.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `control-named-native`, floor: An icon-only native control carries an accessibility label.
- `target-size-native`, reflex: A native control is at least 44 pt where the platform's default is 44 pt; the platform's own minimum is cited, not copied.
- `dynamic-type`, reflex: Native text scales with the system text size: no fixed point size without relativeTo, no fixed-height single line, font scaling never turned off.
- `control-not-gesture`, reflex: An action uses a control, not a tap handler on text or an image.
- `colour-literal-native`, reflex: Native views take colours from the theme, not literals.
