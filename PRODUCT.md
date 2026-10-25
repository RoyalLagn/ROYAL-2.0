# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- Couples and families use RoyalLagn to discover nearby wedding vendors, compare services, save media, and send enquiries.
- Wedding vendors use RoyalLagn to manage their public profile, services, availability, enquiries, marketing material, and subscription access.
- Administrators operate vendor approvals, marketplace content, subscriptions, payments, acquisition CRM, reporting, settings, and company financial records.

## Product Purpose

RoyalLagn is an Indian wedding marketplace that connects customers with relevant wedding vendors while giving vendors and administrators dedicated operational workspaces. Success means customers can confidently find suitable vendors, vendors can reliably run their presence and enquiries, and administrators can operate the marketplace from verified records rather than assumptions.

## Positioning

RoyalLagn combines location-aware wedding-vendor discovery, subscription-prioritized marketplace visibility, short-form wedding media, and operational vendor/admin tooling in one product.

## Operating Context

The product runs as an Expo/React Native application across web, iOS, and Android. Supabase provides authentication and relational data. Cloudinary stores and delivers dynamic media. Razorpay-backed subscription payment records are the verified source for received subscription revenue.

## Capabilities and Constraints

- Public, vendor, and administrator roles have separate authenticated workflows.
- Financial reporting must distinguish verified actual transactions from forecasts or pricing assumptions.
- The administrator finance module includes overview, revenue, expenses, budgets, profit and loss, taxes, forecasting, break-even planning, alerts, monthly closing, and financial reports.
- Cash Flow, Invoices & Payments, and Vendor Subscription Analytics are explicitly outside the requested finance module.
- Estimated taxes must be labelled as estimates and must not be presented as accountant-confirmed tax payable.
- Existing application structure and unrelated functionality must remain intact.

## Brand Commitments

- Product name: RoyalLagn.
- Existing RoyalLagn logo and wedding-focused identity remain authoritative.
- Operational admin surfaces prioritize clarity and compact scanability while retaining bridal pink as the primary action signal.

## Evidence on Hand

- Existing application routes, Supabase migrations, subscription-payment records, and established public/vendor/admin workflows in this repository.
- Existing design system at `docs/DESIGN.md`.
- Founder finance requirements supplied in the implementation brief; sample financial figures are illustrative and must not be treated as production data.

## Product Principles

1. Base operational decisions on verified records, not inferred totals.
2. Keep customer discovery, vendor operations, and administrator controls clearly separated.
3. Make important state, ownership, and recovery actions understandable without training.
4. Preserve reliable behavior across web, iOS, and Android.
5. Treat financial forecasts and tax provisions as decision support, not accounting advice.

## Accessibility & Inclusion

Interactive controls must expose appropriate labels, roles, states, readable errors, minimum mobile touch targets, reduced-motion behavior, and responsive layouts across phone, tablet, and desktop use.
