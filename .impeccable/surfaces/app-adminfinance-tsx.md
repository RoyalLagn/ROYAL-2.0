---
version: 1
slug: "app-adminfinance-tsx"
primary_target: "app/AdminFinance.tsx"
related_targets: ["components/admin/finance","services/adminFinanceService.ts","types/adminFinance.ts","supabase/migrations/20260815170000_admin_finance_control_center.sql"]
---

# Admin Finance control center

## Direction contract

- Thesis: Finance is a traceable monthly command ledger, not a collage of vanity metrics.
- Own-world anchors: RoyalLagn's neutral admin canvas, ruled white statement surfaces, Inter typography, and bridal-pink actions.
- Story: Select a month, understand financial health, inspect its sources, make an authorized entry, and close the record.
- First viewport: Page heading and month control lead into a section rail beside a compact financial statement canvas.
- Form: Financial command ledger, assigned structure 7, seed `152faaa5`.

## Shipped world

- This is an ordinary extension of RoyalLagn's incumbent admin workspace, not a replacement visual system. It keeps the neutral admin canvas, white statement surfaces, Inter hierarchy, shared page header, responsive container, and admin footer.
- The visual language is ledger-like and restrained: compact rows, tabular currency figures, hairline rules, quiet surface tinting, and 12–16px radii organize dense financial records without turning them into a card collage.
- Bridal pink is reserved for active navigation, selected controls, and primary actions. Green marks positive or verified state, amber marks estimates and caution, and red marks loss, overspend, validation failure, and destructive correction actions.
- Controls preserve 48dp targets, readable labels and states, restrained scale-and-opacity pressed feedback, and no decorative motion.

## Information and financial hierarchy

- A persistent month selector leads the page and is the scope for the Overview, Revenue, Expenses, Budgets, Profit & Loss, Taxes, and Reports modules. Its open or closed status remains visible beside the period label.
- The desktop first viewport places the section rail beside a compact statement canvas. Overview leads with net profit after estimated tax, then exposes the statement calculation and its underlying budget and Cloudinary records rather than presenting disconnected vanity metrics.
- Actual reporting follows a fixed trace: recorded gross revenue minus gateway fees equals net revenue; net revenue minus recorded operating expenses equals profit before tax; estimated tax provisions are then deducted to show planning-level net profit.
- Budgets remain comparisons against actual expense-ledger records, not substitutes for them. Cloudinary estimated and actual costs remain explicitly paired. Tax estimates are labelled as planning support and never as accountant-confirmed payable tax.
- Forecast scenarios are a separate planning model. They may be saved and compared, but never alter actual revenue, expenses, profit-and-loss statements, or monthly reports.

## Modules and exclusions

- Shipped modules: Overview, Revenue, Expenses, Budgets, Profit & Loss, Taxes, Forecast, and Reports.
- Explicitly excluded from this surface: Cash Flow, Invoices & Payments, and Vendor Subscription Analytics. Do not imply that those workflows are present through labels, summary cards, or report copy.

## Permissions and record authority

- Active administrators can read and maintain finance records and can complete the checklist to close a month. Database row-level security enforces administrator access; the UI is not the sole permission boundary.
- Only an active `super_admin` can reopen a closed month. The Reports module hides the reopen action from other administrators and directs them to provide a correction reason to a super administrator.
- Verified subscription revenue is synchronized from `subscription_payments` and is visibly labelled as a verified payment. The manual editor can update or delete only records whose source is `manual`; source-payment records remain controlled by the payment workflow.
- Forecast scenarios are planning records rather than month-ledger entries. They remain independent of the selected month's actual statement and closing lock.

## Closed-period safeguards

- Closing requires every operating check to be confirmed, then stores the checklist and a monthly summary snapshot for audit before marking the period closed.
- A closed period disables transaction entry, manual transaction edits and deletes, budgets, tax entries, and Cloudinary usage changes in the UI. Database triggers independently reject inserts, updates, or deletes that touch a closed transaction month, budget, tax period, or Cloudinary month.
- Reopening requires super-administrator authorization and a correction reason of at least eight characters; the reason, actor, and timestamp remain on the monthly record.
- Payment synchronization never mutates a closed statement. A late verified payment is posted to the current open month as a traceable adjustment; if that period is also closed, verification succeeds without silently rewriting either statement and reconciliation remains explicit admin work.

## Responsive behavior

- At 980px and above, navigation is a compact 188px left rail beside the financial canvas. Below 980px it becomes a horizontally scrollable tab row above the content while the shared bottom admin navigation remains available.
- Below 600px, the period control stacks, both month arrows stay with the period label, the month entry expands to full width, and transaction rows wrap so source, amount, and actions remain legible.
- Metrics, statement columns, form fields, scenario results, and action rows use wrapping layouts instead of fixed desktop grids. The content container caps at 1500px while phone, tablet, and desktop retain the same module order and financial meaning.

## Finish record

- Final reviewer disposition: **ship**. All material findings were resolved before this shipped-world record was written.
