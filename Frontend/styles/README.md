# ArkCare UI Theme Architecture

ArkCare's visual system is intentionally split into two layers:

1. **`styles/theme.css`** — design tokens only. Change colors, borders, radii, and semantic values here to reskin the application.
2. **`app/globals.css`** — semantic surface classes, compatibility mappings, and flat-mode enforcement.

## Stable semantic classes

Feature pages should prefer:

- `surface-panel` — primary page/container surface
- `surface-card` — smaller card/tile
- `surface-frame` — framed section/hero shell
- `status-chip` — compact status/context label
- `brand-text` — brand/emphasis text
- `progress-track` — progress rail

Shared controls under `components/ui/` use Tailwind semantic tokens such as
`bg-card`, `text-foreground`, `border-border`, `bg-primary`, and
`text-muted-foreground`.

## Changing the theme later

For a new visual direction:

1. Edit token values in `styles/theme.css`.
2. For multiple themes, add another selector such as `[data-theme="dark"]` and switch the `data-theme` attribute on `<html>`.
3. If the design language changes structurally, adjust semantic classes in `app/globals.css`.
4. Avoid adding raw `zinc`, `black`, hard-coded hex backgrounds, gradients, blur, or shadows in feature pages.
5. Keep feature components on semantic tokens/classes so the next reskin stays centralized.

Legacy compatibility selectors in `globals.css` exist only as a safety net for
older feature code. New code should not depend on them.
