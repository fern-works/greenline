# Craft

Read this page at every write to an interface file. It routes you to the pages the change's facets name; read those and no others. The facets in play are printed on the status line: the register, the platform, the frameworks, and the components the design section declares.

## Read by what the change touches

- **The concerns it touches**, each a page whose body holds the web's rules, with a marked section where a platform or a framework differs: [type](craft/type.md), [colour](craft/colour.md), [layout](craft/layout.md), [motion](craft/motion.md), [copy](craft/copy.md), [forms](craft/forms.md), [states](craft/states.md), [accessibility](craft/accessibility.md), [performance](craft/performance.md), [responsive](craft/responsive.md), [dark mode](craft/dark-mode.md) and [data visualisation](craft/data-viz.md). Pictures and icons are [imagery](imagery.md).
- **The components the design section declares**, one page each: [table](components/table.md), [form](components/form.md), [modal](components/modal.md), [tabs](components/tabs.md), [dropdown](components/dropdown.md), [navigation](components/navigation.md), [toast](components/toast.md), [empty state](components/empty-state.md), [settings](components/settings.md), [pricing](components/pricing.md), [hero](components/hero.md), [footer](components/footer.md), [list](components/list.md), [card](components/card.md), [chart](components/chart.md) and [search](components/search.md).
- **The platform, when it is not the web**: [iOS](platform/ios.md), [Android](platform/android.md), [React Native and Expo](platform/react-native.md) or [desktop](platform/desktop.md).
- **The framework's interface mechanics**, never its general practice: [React and Next](framework/react.md), [Vue and Nuxt](framework/vue.md), [SwiftUI](framework/swiftui.md), [Tailwind](framework/tailwind.md) or [plain CSS](framework/vanilla.md).

## How the rules stand

Each page ends with the registry's rules for its facets, each with its tier: a **floor** rule holds `done` when it fails, until it is fixed or the owner rules on it in the change record, and no standing waiver clears it; a **reflex** rule is a default you may override with a reason the owner accepts, written as a waived line in the record; a **finish** rule is listed and never blocks. The interface check runs those rules on the files you write and returns its findings after each write; fix a floor finding before you move on. The rules a machine cannot check stand above them on each page, and you apply them by judgment. A colour, a face, a size or any other value off DESIGN.md's tokens or palette is never written into DESIGN.md or a token file on your taste: name it as off the lock and propose it to the owner, as a token to add or a waived exception, and write it on the owner's yes.

A web table in React with Tailwind reads the table page, the type page's body, the forms page when it filters, and the Tailwind page: a few pages, never the whole craft.
