# React Native and Expo

Read this page when the manifest's platform is cross on React Native or Expo.

- **Whether to animate.** A hundred uses a day gets no motion; tens a day gets under 150 milliseconds or none; an occasional action gets standard motion.
- **The cheapest tool.** Reanimated's CSS transitions, then layout animations, then shared values for gestures; native stack transitions, form sheets and native tabs; never a pan responder or a state update per frame.
- **Springs.** About 400 milliseconds with a damping ratio of 1 by default, 0.8 after a drag, 300 milliseconds at 0.8 for sheets; a press scales to about 0.97 over 100 to 150 milliseconds.
- **Reduced motion.** Keep opacity and colour, drop movement, scale and overshoot, and let screens fade; font scaling stays on.
- **Safe areas.** Use the safe-area insets hook in each screen, never one wrapper around the whole app and never both, with automatic content insets on scroll views and landscape in mind.
- **Wide screens.** At 768 pixels and wider, tabs move to the side and drawers become permanent. Long lists are virtualised with stable keys.
- **Feel.** Judge it on a release build on the slowest device supported.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `rn-reduced-motion`, floor: A Reanimated animation reads the system's reduce-motion setting.
- `rn-motion-ui-thread`, reflex: Gesture-driven motion runs on the UI thread: no PanResponder, no setState per frame, no JS calls from style worklets.
- `rn-safe-area-hook`, reflex: Screens use the safe-area insets hook; the whole app is not wrapped in one SafeAreaView, and the two are not mixed.
