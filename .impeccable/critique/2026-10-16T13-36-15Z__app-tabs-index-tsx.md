---
target: logged-in customer mobile experience
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-10-16T13-36-15Z
slug: app-tabs-index-tsx
---
## Customer mobile review

Method: dual-agent live-device and source/detector review.

### Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 2/4 | Loading states are visible but weak and unclear. |
| 2 | Match between system and real world | 3/4 | Wedding discovery is clear; referral language is denser. |
| 3 | User control and freedom | 2/4 | Referral navigation state is ambiguous; listing cards did not open reliably. |
| 4 | Consistency and standards | 1/4 | Shared controls, spacing, and selected nav states vary by page. |
| 5 | Error prevention | 2/4 | No clear prevention or reassurance was visible in complex flows. |
| 6 | Recognition rather than recall | 3/4 | Tab labels and category navigation are recognizable. |
| 7 | Flexibility and efficiency | 2/4 | Bookings has redundant hierarchy and discovery controls drift. |
| 8 | Aesthetic and minimalist design | 2/4 | Strong brand, but decorative layers obscure operating content. |
| 9 | Error recovery | 2/4 | Bookings has a recovery CTA; other recovery states were not clear. |
| 10 | Help and documentation | 1/4 | Referral and enquiry flows lack visible guidance. |
| **Total** |  | **20/40** | Needs a consistency and information-density pass. |

### What works

- Home is distinctly RoyalLagn: crest, bridal colour palette, media, and category discovery form a coherent first impression.
- The five-tab navigation is readable and mostly touch-friendly.
- Bookings supplies a meaningful empty-state action.

### Priority issues

1. **P0 — Vendor listing cards obscure essential vendor information.** A low-contrast decorative couple overlays vendor name, rating, service and price labels, which truncate. Remove the ornament from card content layers; preserve a stable thumbnail/content structure and allow key text two lines.
2. **P1 — Customer surfaces do not share one component vocabulary.** Home, Bookings, Profile and Referral use divergent heading sizes, surface radii, insets, button shapes and density. Standardise an 8/12/16/24 spacing scale, shared heading roles, 12–16px surface radii and primary/secondary controls.
3. **P1 — Referral navigation and layout are misleading.** Referral remains visually hot-pink while other tabs are selected, and the referral summary clips `Up to ₹6,000 / booking` and truncates segmented labels. Use a single selected nav state, stack the amount/badge and use an equal-width three-column summary with readable labels.
4. **P1 — Touch targets and discovery controls vary too much.** Search uses 42/36px refinement controls, Notifications 36px actions and 32px delete targets, while other pages use 44–58px. Establish a 48dp mobile target floor for customer actions and a shared filter/control primitive.
5. **P2 — Loading and empty states have low information clarity.** Enquiry skeletons have faint placeholder geometry and decorative artwork that resembles content. Mirror the final card structure, strengthen neutral skeleton contrast and omit decoration while loading.

### Source scan

The deterministic detector returned zero findings for `app/(tabs)/index.tsx`; it does not inspect React Native StyleSheet consistency. Source inspection found hard-coded light-only colours in Search, Favorites, Nearby and Home, local 9px metadata, and inconsistent action heights/radii.

### Personas

- **First-time planner:** listing cards hide price/name/rating, making a first vendor comparison unreliable.
- **Trust-sensitive customer:** referral asks for financial interaction amid promotional density, without enough guidance or reassurance.
- **Returning customer:** the permanently emphasized Referral tab competes with the actual selected destination.
