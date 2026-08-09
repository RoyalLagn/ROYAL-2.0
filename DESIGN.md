---
name: RoyalLagn
description: A modern wedding editorial system for trusted vendor discovery and wedding-business operations.
colors:
  bridal-pink: "#E91E63"
  bridal-pink-strong: "#BE185D"
  blush: "#FCE7F3"
  petal-mist: "#FDF2F8"
  warm-paper: "#FFFFFF"
  porcelain: "#FDF2F8"
  warm-ink: "#1F191C"
  warm-muted: "#787178"
  petal-border: "#FBCFE8"
  admin-canvas: "#F8F9FB"
  admin-surface: "#FFFFFF"
  admin-surface-subtle: "#F4F6F8"
  admin-border: "#E2E5EA"
  admin-text: "#181B23"
  admin-text-secondary: "#676E7C"
  admin-warning: "#B76A00"
  admin-info: "#2563EB"
  midnight: "#070B14"
  midnight-surface: "#0E141F"
  midnight-raised: "#161E2E"
  midnight-border: "#232C3D"
  dark-foreground: "#F5F5F5"
  success: "#16A34A"
  destructive: "#DC2626"
  celebration-gold: "#FACC15"
typography:
  display:
    fontFamily: "PlayfairDisplay_700Bold, Georgia, serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.8px"
  page-title:
    fontFamily: "Inter_700Bold, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.45px"
  headline:
    fontFamily: "Inter_700Bold, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.5px"
  title:
    fontFamily: "Inter_700Bold, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  editorial-card-title:
    fontFamily: "PlayfairDisplay_700Bold, Georgia, serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.28
  body:
    fontFamily: "Inter_400Regular, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body-compact:
    fontFamily: "Inter_400Regular, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  metadata:
    fontFamily: "Inter_400Regular, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter_600SemiBold, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
  button:
    fontFamily: "Inter_700Bold, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.33
  tab:
    fontFamily: "Inter_600SemiBold, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.42
  caption:
    fontFamily: "Inter_500Medium, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
  metric:
    fontFamily: "Inter_700Bold, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.27
rounded:
  base: "12px"
  control: "14px"
  card-sm: "16px"
  card: "20px"
  card-lg: "24px"
  hero: "26px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  control: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  desktop-gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.bridal-pink}"
    textColor: "{colors.porcelain}"
    typography: "{typography.button}"
    rounded: "{rounded.card-sm}"
    padding: "14px 18px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.bridal-pink-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "14px"
    height: "49px"
  card:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.petal-mist}"
    textColor: "{colors.bridal-pink-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
---

# Design System: RoyalLagn

## Overview

**Creative North Star: "The Modern Wedding Editorial"**

RoyalLagn pairs the romance and visual confidence of a contemporary wedding publication with the clarity of a trusted marketplace. Photography and video lead on discovery surfaces; blush framing, precise pink accents, and selective Playfair Display typography give that media an unmistakably wedding-focused setting without competing with it.

Operational surfaces for vendors and administrators are denser and primarily Inter-led. The admin workspace uses a soft neutral-gray canvas, white data surfaces, restrained gray borders, and pink only for branded actions and selection. This keeps profiles, enquiries, billing, moderation, and CRM work fast to scan while preserving the RoyalLagn identity.

Depth is softly layered: editorial surfaces may use petal tints, while the admin workspace layers white cards over a neutral canvas with restrained borders and shadows. Controls feel refined and tactile through clear states and short press responses rather than ornamental animation.

**Key Characteristics:**

- Media-forward public discovery with an editorial serif accent.
- Bridal pink used as a deliberate action and selection signal.
- Warm blush neutrals for editorial surfaces, neutral SaaS surfaces for admin, and midnight blue-black surfaces in dark mode.
- Rounded, approachable silhouettes with fine borders and restrained elevation.
- Compact operational density for vendor and admin workflows.
- Brief, reduced-motion-aware interaction feedback.

## Colors

The palette combines bridal pink and petal-tinted neutrals with warm ink in light mode, then shifts to blue-black midnight layers while preserving pink as the primary signal in dark mode.

### Primary

- **Bridal Pink** (`#E91E63`): Primary actions, active navigation, selection, focus, and branded emphasis.
- **Editorial Rose** (`#BE185D`): Small pink text on light surfaces where stronger contrast is required.

### Secondary

- **Blush Veil** (`#FCE7F3`): Secondary controls, selected backgrounds, input tint, and soft branded framing.
- **Petal Mist** (`#FDF2F8`): Low-emphasis sections, chips, and quiet tonal separation.

### Tertiary

- **Celebration Gold** (`#FACC15`): Ratings and rare celebratory details only; it is not a competing action color.
- **Success Green** (`#16A34A`): Confirmed success and completion states.
- **Destructive Red** (`#DC2626`): Errors and destructive actions.

### Neutral

- **Warm Paper** (`#FFFFFF`): Default light page background. The root and main canvas remain clean white.
- **Porcelain** (`#FDF2F8`): Pink-tinted cards and raised content surfaces. Popovers and navigation may remain white when they need stronger separation.
- **Warm Ink** (`#1F191C`): Primary light-mode text.
- **Warm Muted** (`#787178`): Supporting copy and metadata.
- **Petal Border** (`#FBCFE8`): Light-mode dividers, input strokes, and card outlines.
- **Midnight Canvas** (`#070B14`): Default dark page background.
- **Midnight Surface** (`#0E141F`): Dark cards and raised regions.
- **Midnight Raised** (`#161E2E`): Dark secondary and accent surfaces.
- **Midnight Border** (`#232C3D`): Dark-mode structure and separation.
- **Moonlight Text** (`#F5F5F5`): Primary dark-mode content.

### Contextual Media Colors

- **Profile Dark Rose Border** (`#4B3440`): Dark-mode avatar and profile-photo framing.
- **Profile Rose Atmosphere** (`rgba(236,72,153,0.08)`, `rgba(236,72,153,0.15)`): Low-contrast decorative profile accents only.
- **Media Scrims** (`rgba(0,0,0,0.35)`, `rgba(0,0,0,0.45)`, `rgba(0,0,0,0.5)`, `rgba(0,0,0,0.55)`, `rgba(20,10,15,.48)`): Legibility layers over photography; never page backgrounds.
- **Marketing Print Tints** (`#F4D8E5`, `#F7DCE8`, `#F3DCE7`, `rgba(240,140,185,0.055)`): Fixed export-safe borders and atmosphere in the vendor marketing-card artwork.
- **WhatsApp Green** (`#25D366`): The official WhatsApp contact indicator only.

### Named Rules

**The Pink Signal Rule.** Bridal Pink identifies actions, selection, focus, and meaningful brand moments; avoid washing entire screens in saturated pink.

**The Media Leads Rule.** On discovery surfaces, photographs and video carry the emotional color. UI colors frame the media rather than compete with it.

## Typography

- **Display Font:** Playfair Display, with Georgia or platform serif fallback
- **Body Font:** Inter, with the platform sans-serif fallback

**Character:** Playfair provides an editorial wedding voice for prominent public-facing moments. Inter carries navigation, forms, metadata, operational screens, and dense UI with crisp legibility.

### Hierarchy

- **Editorial Page Title** (Playfair Bold, 26/32): Public discovery titles and vendor identity only.
- **Page Title** (Inter Bold, 24/30): Functional Public, Vendor, and Admin screen titles.
- **Section Heading** (Inter Bold, 20/26): Operational sections. Public editorial sections may use Playfair Bold at the same 20/26 scale.
- **Card Title** (Inter Bold, 16/21): Card and panel names. Media-led vendor identity may use Playfair Bold at 18/23.
- **Body** (Inter Regular, 13/20): Ordinary descriptions and supporting copy, with a 12/18 compact variant for dense interfaces.
- **Metadata** (Inter Regular, 11/16): Dates, locations, counts, prices, and secondary facts.
- **Label** (Inter Semibold, 11/15): Field labels, chips, badges, and compact controls.
- **Button** (Inter Bold, 12/16): Primary and secondary actions.
- **Tab** (Inter Semibold, 12/17): Navigation and segmented controls.
- **Caption** (Inter Medium, 10/14): The smallest non-decorative text role; never reduce functional text below this floor.

### Named Rules

**The Editorial Accent Rule.** Use Playfair selectively on public discovery and vendor storytelling; use Inter for transactional and operational clarity. Never set dense forms or dashboards primarily in the serif.

**The Restrained Hierarchy Rule.** Do not make text larger merely to create hierarchy. Prefer spacing, weight, color, and grouping before increasing font size. Functional page titles stop at 24px; editorial public titles stop at 26px.

## Layout

RoyalLagn is mobile-first and safe-area aware. Phone gutters are normally 16px, narrowing to 12px below 360px; tablets use 24px and desktop workspaces use 32px. Section gaps move from 14px on phones to 18px on tablets and 20px on desktop. Cards generally carry 14–16px padding on phones and 20px on wider layouts.

Responsive behavior is defined at 360, 480, 768, 900, 1024, 1440, and 1920px. Phone surfaces are usually single-column, tablets introduce two or three columns where content permits, and desktop dashboards use bounded content areas and denser multi-column grids. Public discovery favors vertically flowing media and horizontally scrollable categories; operational views favor bounded reading widths, such as the 780px vendor form container.

Spacing follows a compact 6/8/12/16/20/24/32 rhythm. Preserve breathing room around media and page headings, but keep labels, metadata, and dashboard controls deliberately compact.

## Elevation & Depth

The system is softly layered. Fine pink or midnight borders and tonal background changes provide most structure; ambient shadows are reserved for media cards, dashboard hero cards, floating navigation, and other surfaces that genuinely sit above the canvas. Typical cards use low-opacity colored shadows around 5–12% with 8–22px blur and 2–5px vertical offset; Android elevation is usually 2–3. Floating bottom navigation may use stronger elevation to remain legible over content.

### Shadow Vocabulary

- **Ambient Card** (`0 5px 12px rgba(99,55,74,0.08)`): Media and listing cards that need gentle separation.
- **Quiet Dashboard Lift** (`0 8px 18px rgba(125,61,88,0.05)`): Pink-tinted vendor and admin cards over white page canvases.
- **Floating Chrome** (`0 4px 14px rgba(0,0,0,0.13)`): Bottom navigation and transient UI only.

### Named Rules

**The Soft Layer Rule.** Establish hierarchy with canvas, surface, border, and inset tint first; add a shadow only when a surface must visibly float.

## Shapes

Rounded geometry is generous but controlled. Inputs and compact controls use approximately 12–14px radii; small cards use 16px; core cards use 20–24px; hero and sheet surfaces reach 26–28px. Pills use a fully rounded 999px silhouette. Borders are normally one pixel and softly tinted. Media is clipped cleanly inside its card or decorative frame rather than floating independently.

## Components

Components should feel refined and tactile: clear at rest, immediate under touch, and calm when state changes.

### Buttons

- **Shape:** Rounded rectangle, normally 14–16px, with a minimum native target of 44px and common primary height of 48–56px.
- **Primary:** Bridal Pink with white, bold Inter text; horizontal padding is normally 18px or more.
- **Pressed / Focus:** Press feedback scales toward 0.98 with slight opacity reduction; fields transition their border toward Bridal Pink. Disabled actions reduce opacity without changing meaning.
- **Secondary / Ghost:** Blush-filled or transparent with warm ink/rose text; preserve the same target size and strong label weight.

### Chips

- **Style:** Fully rounded, compact, and Inter Bold; unselected chips use Petal Mist or a fine border.
- **State:** Selected chips use Bridal Pink with white text. Gold is reserved for ratings, not general selection.

### Cards / Containers

- **Corner Style:** 16px for compact media cards; 20–24px for primary containers; 26px for hero surfaces.
- **Background:** Porcelain over Warm Paper in light mode; Midnight Surface over Midnight Canvas in dark mode.
- **Shadow Strategy:** Fine border first, ambient shadow second.
- **Internal Padding:** Usually 14–16px on phones and 20px on larger operational layouts.

### Inputs / Fields

- **Style:** Warm Paper or a soft tinted surface, one-pixel border, 14px radius, approximately 49px minimum height, and 14px horizontal padding.
- **Focus:** Border transitions to Bridal Pink with a subtle increase in visual weight, without layout shift.
- **Error / Disabled:** Error messages replace helper text in the same reserved area; destructive red indicates errors. Disabled fields retain their shape and reduce opacity.

### Navigation

Customer mobile navigation is rounded, tactile, and icon-led, with pink active states and short spring movement. The center destination may receive stronger circular emphasis. Vendor and admin navigation are more restrained and workspace-oriented. Navigation must respect safe areas, expose selected state accessibly, and avoid decorative motion that delays routing.

### Editorial Media Card

Vendor and category cards use clipped rounded media frames, concise metadata, pink selection or proximity details, and small overlays for favorites, ratings, or verification. Photography may use an intentional cover crop; vendor logos and profile images always use a square 1:1 frame with proportional `contain` rendering so they are never stretched or automatically cropped. Their hierarchy is image first, vendor/category identity second, decision-supporting metadata third.

Logo and profile-image editing uses a fixed 1:1 crop canvas with a recommended 1024×1024 PNG output. The complete source image is visible and centered by default, including portrait and landscape sources; the user controls positioning, zoom, and rotation, and the live square preview must exactly match the saved output. Preserve intentional whitespace when needed rather than forcing a logo to fill the frame.

### Feedback & Motion

Press feedback uses a 0.98 scale and approximately 0.92 opacity. Most transitions last 120–320ms with a soft settle curve; larger decorative loops are exceptional. Entrances travel only 8–12px. Success feedback is non-blocking, sheets use a softened backdrop, and every bespoke animation respects reduced-motion preferences.

## Do's and Don'ts

### Do:

- **Do** preserve the semantic light/dark palette and use Bridal Pink as a meaningful signal.
- **Do** let wedding photography and Clips provide the emotional richness on public surfaces.
- **Do** use Playfair for selective editorial emphasis and Inter for UI clarity.
- **Do** keep public, vendor, and admin surfaces visibly related while respecting their different densities and jobs.
- **Do** use fine borders, tonal layers, and brief tactile states before adding stronger shadows or motion.
- **Do** preserve minimum touch targets, safe areas, keyboard behavior, accessibility state, and reduced-motion behavior.

### Don't:

- **Don't** introduce generic Material blue, cool gray defaults, or an unrelated component-library theme.
- **Don't** make every surface pink; saturated pink loses authority when it becomes background noise.
- **Don't** flatten vendor/admin tools into decorative consumer cards or make public discovery feel like a back-office dashboard.
- **Don't** use Playfair for dense forms, metadata, tables, or small operational labels.
- **Don't** introduce bouncy, long-distance, looping, or navigation-blocking motion.
- **Don't** replace the rounded editorial identity with sharp enterprise geometry or excessively pill-shaped containers.
