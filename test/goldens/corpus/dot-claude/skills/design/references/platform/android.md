# Android

Read this page when the manifest's platform is android, or cross on an Android target. This page is thin: one source covers Android whole, and the gap stands until another is ingested.

- **Semantics.** Compose's semantics replace web roles; an empty content description is right only for decorative content. Test roles, state, traversal order, merged semantics and TalkBack.
- **Window sizes.** Adapt by the window's size class, never a device's name; test compact and expanded windows, a large font scale, the dark theme, cutouts, a hardware keyboard, the layout direction and the predictive back gesture.
- **State.** Hoist state only as far as it is needed and collect it with lifecycle awareness; never run an effect in a composable's body; expose modifiers at the outer edge in a deliberate order, and keep lazy keys stable.
- **Motion.** Every animation still works when the system's animation scale is reduced or off.
- **Edges.** Edge to edge is the default from API 35 and cannot be turned off from API 36; a form sheet honours only its first three detents; a native tab bar holds five tabs at most.
- **Targets.** A target is at least 48 by 48 density-independent pixels; a ripple belongs only to an app styled as Material, and animating elevation costs frames.
