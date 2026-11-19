# Dropdown

Read this page when the change builds or changes a select, a combobox or a menu.

- **The role by the job.** A list box with options for a select; a combobox, an input with a popup list, for a searchable pick; a menu only for an app's commands, never for a site's navigation.
- **Keyboard.** A menu button opens on Enter, Space or Down on its first item, on Up on its last, and Escape closes it and returns focus to the button. A combobox keeps focus in its input and points to the highlighted option; typing ahead clears after half a second.
- **Inside the menu.** The highlighted row is the only focus mark; in a searchable menu the search field is one stop and Enter there picks nothing. A long list caps at the smaller of 480 pixels or the space available, no narrower than its trigger.
- **Motion.** A popup grows from its trigger, scaling from about 0.95 in 150 milliseconds and leaving faster; a submenu sits two pixels off its parent with a safe area for the pointer.
- **Grouping.** More than three secondary actions go behind a menu; a menu on a title stays short and holds nothing destructive.
- **Surface.** A floating menu takes a ring inside its shadow, never a border and a shadow both, and a scrolling menu contains its overscroll.
