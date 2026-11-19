# Tabs

Read this page when the change builds or changes tabs or a segmented control.

- **Anatomy.** A tab list of tabs, each with its selected state, and the panels they control. Underline tabs sit on a full-width one pixel rule with an indicator of 1 to 4 pixels; a segmented track is about 48 pixels tall with its active pill inside, and goes full width only below about 480 pixels.
- **Keyboard.** One tab stop with a roving focus; the arrows move and wrap, Home and End jump, and Tab leaves for the panel. Panels switch as focus arrives where they render at once, and only on Enter or Space where switching is costly.
- **Motion.** Content switches without an entrance or an exit, and a native tab switch never slides.
- **Labels.** A label changes weight without shifting the row, by holding the bold width in reserve; keyboard focus draws a ring only on keyboard focus.
- **Responsive collapse.** On a phone the tabs scroll sideways in their own row, never the page; a row of figures becomes a two-up grid or a scrolling row.
- **Native.** A bottom tab bar holds five tabs at most; a segmented picker suits two to four options; each tab keeps its own navigation stack.

## The checked rules

The registry's rules for this page's facets, each with its tier; the interface check runs them on the files you write, and a reviewer cites them by their ids.

- `aria-required-state`, floor: A widget role carries its required context and states, such as a tab inside a tablist and a combobox with aria-expanded.
- `rn-native-tabs-five`, floor: Native bottom tabs hold at most five screens.
