# Vue and Nuxt

Read this page when the manifest's frameworks include vue or nuxt. It holds interface mechanics only.

- **GSAP.** Create tweens on mount inside a context scoped to the component's root, and revert it on unmount; never create animations in setup before the root exists, and register plugins once for the app.
- **ScrollTrigger.** Refresh it after the DOM updates, on the next tick or after an asynchronous load.
- **Nuxt.** One composable registers the plugins and loads the rare ones lazily.
