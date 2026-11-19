# React and Next

Read this page when the manifest's frameworks include react or next. It holds interface mechanics only; general React practice is not this page's.

- **GSAP.** Run it inside the useGSAP hook with a scope, which reverts on unmount; without the hook, make a scoped context inside an effect and revert it in the cleanup. Animations made later in event handlers go through the hook's context-safe helper, their listeners removed.
- **Server render.** No GSAP or ScrollTrigger runs during the server render.
- **ScrollTrigger.** Only on top-level tweens or timelines, never scrubbing together with toggle actions, no markers in production, and a refresh after the layout changes.
- **Inputs.** A controlled input has a change handler or is read-only.
- **Motion.** Write motion to a ref's style or a motion value, never to state each frame.
- **Route changes.** After a client-side navigation, update the title and move focus to the new heading.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `gsap-scoped`, reflex: GSAP inside a component uses a scoped context that is reverted on cleanup.
- `controlled-input-handler`, reflex: A React input with a value also has an onChange or is read-only.
