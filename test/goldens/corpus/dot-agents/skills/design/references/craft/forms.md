# Forms

Read this page when a change builds or changes a form, an input or a control that takes a value.

## The rules you judge

1. The label stays visible; a placeholder shows an example of the accepted format, never an instruction or the label itself.
2. Accept any input, trim it, then validate it; never block or filter typing.
3. Every form has a contract: how it opens, what is pending, where the value is committed, what Escape, leaving the page or a second submit mean, how failure is recovered, and where focus goes.
4. On a failure the draft is kept and a retry needs no retyping; unsaved changes are warned about before leaving; cancelling an edit, cancelling a request and undoing a commit are three different things.
5. The input type follows the content: a one-time code is text with a numeric keyboard, money a decimal keyboard, and a number field only for true quantities.
6. Never ask again for what the session already gave, and let sign-in take paste, autofill or a passwordless path.
7. Keep safe context, such as defaults, for repeated use; never remember a sensitive or destructive choice to save a step.
8. Group related controls with a fieldset and a legend, and mark required fields, explaining the mark once per form.

## The mobile web

Set the enter key's hint, and turn capitalisation and correction off on usernames and codes.

## React Native

Prefer uncontrolled inputs, so typing never waits on a render.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `control-height-ladder`, finish: Control heights sit on the home's ladder.
