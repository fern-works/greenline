# Marks: the owner's hand on a capture

This page holds what you do with the owner's marks: a note on one element or one region of a capture, at one width, with an intent, `fix`, `question`, `options` or `idea`. Read it when the status line prints `marks:`, when the owner asks you to fix the marks, and when the owner names something on a page in a sentence.

## Reading them

The status line prints `marks: <n> open on <address>` at each turn, naming a stale one, and `greenline mark list` prints each open mark: its id, address and width, intent, the element's role, text, selector and source file and line, and the note. Marks on the address of the open change are its follow-up; with no change open they are the next proposal's input, and the proposal lists them by id. Where the owner has not asked, offer them in one sentence, such as "You left 2 marks on /settings; shall I address them?", and wait.

## Addressing one

- Find the element by its source file and line where the build named one, else by its selector and its text, and read [craft.md](craft.md) before the write.
- `fix`: change that element, and only what the note asks.
- `question`: answer it in the reply, then propose the mark addressed with the answer as its note.
- `options`: build the variants for that element alone on the real route, behind the prototype switcher, as [prototype.md](prototype.md) builds them; the owner's pick becomes the code and the switcher goes.
- `idea`: say in one line what it would take, and build it only on the owner's yes, or propose it declined with the reason.
- A mark named stale was made on files that changed since: capture the address again and confirm the mark still holds before you act.

## Marks in words

A sentence of the owner's about something on a page is a mark in words. While a change is open, capture the address with `greenline check interface --url <origin> --path <address>`; with none open that command keeps no capture, so ask the owner to capture the page from the viewer's capture now. Find the element in the capture's boxes, and ask which one the owner means only when you cannot tell. Record it, quoting the owner: `greenline mark add --capture <id> --width <width> --selector <selector> --note <note> --intent <intent> --words "<the owner's words>"`, or `--region` with the stroke's points in place of the selector.

## Showing it answered

Once the change is made, capture the address again with the same command, at the same widths; the viewer then shows the before and the after side by side, the element outlined in both. Propose the closure with its evidence: `greenline mark propose <id> --capture <the capture after> --diff <commit> --note <what changed>`, or `--as declined` with the reason. The mark stays open: only the owner closes it, in the viewer or in words, which you record with `greenline mark close <id> --as addressed --words "<the owner's words>"`. Those words are the owner's verdict on that mark, an outcome or words that name its note or element, a word of four letters or more or two in a row such as "top bar", so one sentence naming two marks closes each; an instruction to close marks the owner has not looked at is no verdict, and the command refuses it, so leave them open and say so. Never edit `marks.jsonl` by hand; the harness hook refuses it. At the close, copy the `marks:` line `greenline status` prints into the close section as it stands, or `marks: none open` where it prints none, never from memory, on a line of its own or as the last clause of a quick close's one line: git's hooks refuse `done` while the close's line disagrees with the marks files.
