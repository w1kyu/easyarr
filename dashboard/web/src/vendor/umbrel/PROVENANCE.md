# Vendored umbrelOS code — provenance

Everything in this folder is copied from [umbrelOS](https://github.com/getumbrel/umbrel) and stays under
the **PolyForm Noncommercial License 1.0.0** (see `LICENSE.md`, copied verbatim from upstream). It is
**not** covered by EasyArr's MIT license. Rules: SPEC §14.1 / DECISIONS D-020.

- Upstream repository: https://github.com/getumbrel/umbrel
- Upstream commit: `11e7f5bdfcb5bb8b46f39edd6defb4c37641763a` (2026-09-22)
- Date copied: 2026-10-30
- The upstream LICENSE contains no `Required Notice:` line.
- Not copied: the Umbrel logo, name and brand marks, wallpapers (images/videos), bundled display fonts,
  image assets, and the WebGL "liquid glass" renderer. Inter is used from the `inter-ui` npm package (OFL-1.1).
- Modified files carry a header comment: `Modified by EasyArr — originally from getumbrel/umbrel <path>@<commit>`.

Every file in this folder must be listed below — CI enforces it (`scripts/check-vendor.mjs`).

| File (in this folder) | Upstream path | Modified? |
|---|---|---|
| `components/app-icon.tsx` | `packages/ui/src/components/app-icon.tsx` | yes — inlined a neutral placeholder instead of importing Umbrel's desktop app-icon module and asset |
| `components/fade-scroller.tsx` | `packages/ui/src/components/fade-scroller.tsx` | no |
| `components/ui/alert-dialog.tsx` | `packages/ui/src/components/ui/alert-dialog.tsx` | no |
| `components/ui/alert.tsx` | `packages/ui/src/components/ui/alert.tsx` | no |
| `components/ui/badge.tsx` | `packages/ui/src/components/ui/badge.tsx` | no |
| `components/ui/button.tsx` | `packages/ui/src/components/ui/button.tsx` | no |
| `components/ui/card.tsx` | `packages/ui/src/components/ui/card.tsx` | no |
| `components/ui/checkbox.tsx` | `packages/ui/src/components/ui/checkbox.tsx` | no |
| `components/ui/copy-button.tsx` | `packages/ui/src/components/ui/copy-button.tsx` | yes — inlined `sleep` instead of importing `@/utils/misc` (which depends on Umbrel's tRPC client) |
| `components/ui/copyable-field.tsx` | `packages/ui/src/components/ui/copyable-field.tsx` | yes — inlined `sleep` instead of importing `@/utils/misc` (which depends on Umbrel's tRPC client) |
| `components/ui/dialog-close-button.tsx` | `packages/ui/src/components/ui/dialog-close-button.tsx` | no |
| `components/ui/dialog.tsx` | `packages/ui/src/components/ui/dialog.tsx` | no |
| `components/ui/dropdown-menu.tsx` | `packages/ui/src/components/ui/dropdown-menu.tsx` | no |
| `components/ui/form.tsx` | `packages/ui/src/components/ui/form.tsx` | no |
| `components/ui/icon-button.tsx` | `packages/ui/src/components/ui/icon-button.tsx` | no |
| `components/ui/icon.tsx` | `packages/ui/src/components/ui/icon.tsx` | no |
| `components/ui/input.tsx` | `packages/ui/src/components/ui/input.tsx` | no |
| `components/ui/label.tsx` | `packages/ui/src/components/ui/label.tsx` | no |
| `components/ui/list.tsx` | `packages/ui/src/components/ui/list.tsx` | no |
| `components/ui/loading.tsx` | `packages/ui/src/components/ui/loading.tsx` | no |
| `components/ui/numbered-list.tsx` | `packages/ui/src/components/ui/numbered-list.tsx` | no |
| `components/ui/progress.tsx` | `packages/ui/src/components/ui/progress.tsx` | no |
| `components/ui/radio-group.tsx` | `packages/ui/src/components/ui/radio-group.tsx` | no |
| `components/ui/scroll-area.tsx` | `packages/ui/src/components/ui/scroll-area.tsx` | no |
| `components/ui/segmented-control.tsx` | `packages/ui/src/components/ui/segmented-control.tsx` | no |
| `components/ui/separator.tsx` | `packages/ui/src/components/ui/separator.tsx` | no |
| `components/ui/shared/dialog.ts` | `packages/ui/src/components/ui/shared/dialog.ts` | no |
| `components/ui/shared/material.ts` | `packages/ui/src/components/ui/shared/material.ts` | no |
| `components/ui/shared/menu.ts` | `packages/ui/src/components/ui/shared/menu.ts` | no |
| `components/ui/shared/motion.ts` | `packages/ui/src/components/ui/shared/motion.ts` | no |
| `components/ui/sheet.tsx` | `packages/ui/src/components/ui/sheet.tsx` | yes — uses EasyArr's own wallpaper (`~/lib/wallpaper`) instead of Umbrel's wallpaper provider |
| `components/ui/switch.tsx` | `packages/ui/src/components/ui/switch.tsx` | no |
| `components/ui/tabs.tsx` | `packages/ui/src/components/ui/tabs.tsx` | no |
| `components/ui/toast.tsx` | `packages/ui/src/components/ui/toast.tsx` | yes — removed notification sounds and browser-tab attention (Umbrel desktop features) |
| `components/ui/tooltip.tsx` | `packages/ui/src/components/ui/tooltip.tsx` | no |
| `hooks/use-is-mobile.ts` | `packages/ui/src/hooks/use-is-mobile.ts` | no |
| `index.css` | `packages/ui/src/index.css` | yes — `@config` path adjusted; removed the @font-face blocks for Umbrel's bundled display fonts (not vendored) |
| `lib/utils.ts` | `packages/ui/src/lib/utils.ts` | no |
| `tailwind.config.ts` | `packages/ui/tailwind.config.ts` | yes — import path adjusted to the vendor folder layout |
| `utils/element-classes.ts` | `packages/ui/src/utils/element-classes.ts` | no |
| `utils/tw.ts` | `packages/ui/src/utils/tw.ts` | no |
