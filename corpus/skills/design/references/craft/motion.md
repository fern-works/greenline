# Motion

Read this page when a change adds or changes movement: a transition, an animation, a gesture, scroll-linked effects or a loading sequence.

## The rules you judge

1. Frequency decides first: something used a hundred times a day, or started from the keyboard, gets no motion; tens of times a day, near-invisible motion or none; an occasional surface such as a dialog, a drawer or a toast, standard motion; a rare or first-time moment, room for delight. Deciding on no motion is a valid result.
2. Name the purpose in one word before choosing a curve: feedback, origin, state change, bridging a jump, explanation, or delight in the rare tier only. Data the person is reading never moves for style.
3. Use the cheapest tool that works, in this order: a CSS transition, starting styles, a CSS animation for motion that must play while the page is busy, the Web Animations API, and a library only for springs, layout, exits or gestures.
4. Durations follow the register. In an app, a press answers in 100 to 160 milliseconds, a tooltip in 125 to 200 and a dropdown in 150 to 250, and every transition the person starts stays under 300. On a site, a hover runs 150 to 200, a menu 150 to 250, a dialog 250 to 450 and a section's entrance 400 to 800. Items in a stagger enter 30 to 80 milliseconds apart.
5. An entrance eases out; an exit eases in and lasts about three quarters of its entrance; a closing surface never overshoots, and nothing enters from a scale of zero.
6. Anything fired rapidly retargets with a transition rather than restarting a keyframe, and anything a finger drives uses a spring. An element leaves along the path it entered.
7. Popovers, menus and tooltips grow from their trigger; a dialog stays centred.
8. Reduced motion works in three tiers: remove parallax, large slides, zoom, spin, marquees, smooth scrolling and scrubbed pins; soften small movements into fades of 200 milliseconds or less; keep opacity, colour, focus, spinners and essential motion. Motion driven from script reads the same setting and follows a change to it.
9. A gesture states its physical model in one sentence; a grab mid-flight continues at its velocity, the release target is projected from the velocity, an overdrag rubber-bands, and the keyboard reaches every state. A spring's bounce stays between 0.1 and 0.3 and appears only where a drag dismisses or the moment is playful.
10. Motion code cannot judge is checked by playing it slowed two to five times, stepping its frames, or freezing it at its start, middle and end.
11. On a site, two or three scroll scenes per page at most; scroll-linked motion is linear, and content is in place at first paint.

## React Native

Use Reanimated's springs, settling at about 400 milliseconds with a damping ratio of 1, and sheets at about 300 with 0.8. A haptic fires in the same frame as its visual and is never the only feedback; under reduced motion, screens fade.

## SwiftUI and Compose

Drive animation from values, and keep every task usable under the system's reduce motion setting and with the animation scale turned down or off.

## Tailwind

Version 4's hover variant already applies only where hover exists; version 3 needs the hover-only setting turned on.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `content-visible-at-rest`, floor: Content is visible without its animation: no text stays hidden when scripts or animations do not run.
- `reduced-motion-path`, floor: Wherever motion exists a reduced-motion path exists: a prefers-reduced-motion rule, a motion library's reduced setting, or the platform's reduce-motion read.
- `reduced-motion-form`, reflex: The reduced path removes vestibular movement and keeps meaningful fades and state changes; it is never a blanket none.
- `reduced-motion-hidden`, floor: Under reduced motion no first-screen text is left hidden.
- `motion-pause-5s`, floor: Motion that starts on its own and lasts more than five seconds has a visible pause, stop or hide control; a marquee is no exception.
- `transition-all`, reflex: A transition names its properties; transition: all is not used.
- `animate-compositor-only`, reflex: Animations move transform and opacity, not width, height, top, left, margin or padding.
- `entrance-ease-out`, reflex: An entrance eases out; ease-in and linear are not used on an entering element.
- `exit-easing`, reflex: An exit eases in and lasts about three quarters of its entrance.
- `no-exit-overshoot`, reflex: A closing surface never overshoots.
- `no-exit-delay`, reflex: A dismissal starts at once; no delay before a close or a hover-out.
- `app-motion-300`, reflex: In the app register a user-initiated transition lasts under 300ms.
- `site-section-motion`, finish: In the site register a section's entrance runs 400 to 800ms.
- `motion-over-one-second`, reflex: No interface transition runs past one second, following var() chains.
- `no-scale-zero`, reflex: An entrance does not start from scale(0).
- `no-bounce-easing`, reflex: Interface curves do not bounce: no y outside -0.05 to 1.05, no bounce or elastic animation.
- `will-change-transient`, reflex: will-change is set just before an animation and removed after; never on *, never left on at rest.
- `hover-motion-gated`, reflex: :hover motion sits inside @media (hover: hover) and (pointer: fine).
- `hover-no-layout-shift`, reflex: Hovering changes no layout property and moves no neighbour.
- `loop-offscreen-paused`, finish: An endless animation pauses when it is off-screen or the tab is hidden.
- `reduced-duration-not-zero`, reflex: A reduced-motion override uses 0.01ms with one iteration, not 0s.
- `duration-scale`, finish: Durations come from the home's declared scale.
- `scrolltrigger-rules`, reflex: ScrollTrigger sits on top-level tweens only, never scrub with toggleActions, and ships no markers.
