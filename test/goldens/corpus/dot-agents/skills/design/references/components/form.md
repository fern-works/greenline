# Form

Read this page when the change builds or changes a form; read the forms page of the craft with it.

- **Anatomy.** The label sits above its field, 14 pixels at weight 500, 8 to 10 pixels above it; never a floating label, never a placeholder in its place. Inputs are 38 to 40 pixels tall; 24 pixels from a description to the first label, 16 between fields and to the save button.
- **Errors.** A failed field is marked invalid and tied to its message beside it, never a red border alone; on submit, focus moves to the first invalid field. A message says how to fix the input, and a requirement known in advance shows as help before it.
- **Submitting.** The submit button stays enabled until the request starts; while it is pending a spinner sits beside the unchanged label, the button is marked busy, and a second press sends nothing.
- **Failure.** A failed save keeps what was typed and retries without retyping; cancel discards only the draft; a render never resets a typed value; leaving with unsaved changes warns.
- **Autofill and paste.** Personal fields carry valid autocomplete tokens; codes and card numbers are text with a numeric keyboard; paste is never blocked in a password or a code field.
- **Custom controls.** A custom control submits through one hidden input per value, reacts to its field's invalid state, and is never hidden from assistive technology while still focusable.
- **Consent.** A consent or marketing box starts unchecked, and success copy carries no exclamation.
- **Responsive collapse.** On a narrow screen the label, the field and the next pair stack, and phone inputs use text of at least 16 pixels. A disabled control stays legible and says why.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `input-labelled`, floor: Every input has a programmatic label; a placeholder is never the label.
- `label-bound`, floor: A label is bound to its control by for, or by wrapping it.
- `autocomplete-valid`, floor: An autocomplete token, where present, is one the HTML standard defines (WCAG 1.3.5).
- `autocomplete-personal`, reflex: A field for the person's own data declares its purpose with an autocomplete token.
- `paste-allowed`, floor: Paste is never blocked in a password or code field (WCAG 3.3.8); elsewhere blocking paste is a reflex.
- `error-associated`, floor: After a failed submit, each invalid field is marked invalid and points to its visible message.
- `no-fake-send`, floor: A form that reports success sends something: no success message without a request.
- `consent-not-preselected`, floor: A consent or marketing checkbox is not checked by default.
- `submit-not-predisabled`, reflex: A submit button is enabled at first render; validation runs on submit, with the explained exception allowed on the record.
- `pending-no-repeat`, reflex: A second press while a request is pending sends nothing more.
- `pending-label-kept`, reflex: A pending button keeps its label and size, with a spinner and aria-busy, rather than swapping its text.
- `error-focus-first`, reflex: A failed submit moves focus to the first invalid field or a linked summary.
- `input-keeps-value`, floor: A failed request never clears what the person typed.
