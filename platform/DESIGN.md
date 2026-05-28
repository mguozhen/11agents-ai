# GTM Swarm — Design System

Adapted from the ElevenLabs design language. Off-white canvas, warm near-black ink, Inter for UI, generous whitespace, hairline borders, pill CTAs.

---

## Colors

```css
/* Canvas / Backgrounds */
--canvas:          #f5f5f5   /* page floor */
--canvas-soft:     #fafafa   /* alternating sections */
--surface:         #ffffff   /* cards, panels */
--surface-raised:  #f0efed   /* badges, icon plates */

/* Dark surfaces (elevated panels, featured cards) */
--surface-dark:    #0c0a09
--surface-dark-el: #1c1917   /* elevated on dark */

/* Ink / Text */
--ink:             #0c0a09   /* display, headings */
--body:            #4e4e4e   /* default running text */
--muted:           #777169   /* subtitles, hints */
--muted-soft:      #a8a29e   /* disabled, placeholder */
--on-dark:         #ffffff
--on-dark-soft:    #a8a29e

/* Borders */
--hairline:        #e7e5e4   /* default 1px divider */
--hairline-soft:   #f0efed
--hairline-strong: #d6d3d1

/* Atmospheric gradients (decoration only, never CTA fills) */
--grad-mint:       #a7e5d3
--grad-peach:      #f4c5a8
--grad-lavender:   #c8b8e0
--grad-sky:        #a8c8e8
--grad-rose:       #e8b8c4

/* Semantic */
--success:         #16a34a
--error:           #dc2626
```

---

## Typography

**Fonts:** Inter (UI) · fallback: system-ui, sans-serif  
**Display:** Georgia, 'Times New Roman', serif (weight 300, large headings only)

| Token | Size | Weight | Line-height | Letter-spacing |
|-------|------|--------|-------------|----------------|
| display-lg | 36px | 300 | 1.17 | -0.36px |
| display-md | 32px | 300 | 1.13 | -0.32px |
| display-sm | 24px | 300 | 1.2  | 0 |
| title-md   | 20px | 500 | 1.35 | 0 |
| title-sm   | 18px | 500 | 1.44 | 0.18px |
| body-md    | 16px | 400 | 1.5  | 0.16px |
| body-sm    | 15px | 400 | 1.47 | 0.15px |
| caption    | 14px | 400 | 1.5  | 0 |
| label      | 12px | 600 | 1.4  | 0.96px |
| button     | 15px | 500 | 1.0  | 0 |

---

## Spacing

Base unit: **4px**

| Token | Value |
|-------|-------|
| xxs   | 4px   |
| xs    | 8px   |
| sm    | 12px  |
| base  | 16px  |
| md    | 20px  |
| lg    | 24px  |
| xl    | 32px  |
| xxl   | 48px  |
| section | 96px |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| xs    | 4px   | inline tags |
| sm    | 6px   | compact rows |
| md    | 8px   | inputs |
| lg    | 12px  | compact cards |
| xl    | 16px  | feature cards |
| xxl   | 24px  | gradient orb cards |
| pill  | 9999px | CTAs, badges |

---

## Shadows

```
card:  0 1px 2px rgba(0,0,0,0.04)
hover: 0 4px 16px rgba(0,0,0,0.06)
```

---

## Components

### Button — Primary
```
background: #292524   border-radius: pill   padding: 10px 20px
color: #fff           font: 15px/500        height: 40px
```

### Button — Outline
```
background: transparent   border: 1px solid #d6d3d1   border-radius: pill
color: #0c0a09            font: 15px/500               padding: 9px 19px
```

### Input
```
background: #fff    border: 1px solid #d6d3d1   border-radius: 8px
padding: 12px 16px  height: 44px                font: 16px/400
focus: border 2px #0c0a09
```

### Card
```
background: #fff    border: 1px solid #e7e5e4   border-radius: 16px
padding: 24px       shadow: card
```

### Badge / Pill
```
background: #f0efed   border-radius: pill   padding: 4px 10px
color: #0c0a09        font: 12px/600/+0.96px letter-spacing
```

---

## Principles

1. **Off-white canvas, warm ink** — no saturated action colors
2. **Pill geometry for all CTAs** — 9999px is the button signature
3. **Atmospheric gradients as decoration** — never button fills or text colors
4. **Hairline + minimal shadow elevation** — cards float via 1px border + soft shadow
5. **Weight 300 for display** — serif headings stay light and editorial
6. **Inter for all UI text** — body, labels, buttons, nav
