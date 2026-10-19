---
name: Responsive verification
description: Why shared layout changes need cross-breakpoint and usable-scroll-area checks.
---

Check shared form-control and app-shell changes on a narrow phone, tablet, and desktop—not only the default mobile page.

**Why:** A shared field style fit phone screens but exposed wider-screen task-filter overflow. A chat composer could remain reachable while the message feed itself shrank to an unusable strip.

**How to apply:** Use proportional checks of document and control bounds across breakpoints. For fixed-height or scrolling sections, also check the usable content height and whether the last controls can scroll above the fixed footer. Fix the layout source rather than concealing document overflow.
