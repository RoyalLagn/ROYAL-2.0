# ShaadiVendors — Product Requirements Document (PRD)
**Version 1.0 | July 2026 | Confidential**

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [User Roles & Access](#3-user-roles--access)
4. [Database Schema](#4-database-schema)
5. [Customer App — Page-by-Page Requirements](#5-customer-app--page-by-page-requirements)
6. [Vendor Dashboard — Page-by-Page Requirements](#6-vendor-dashboard--page-by-page-requirements)
7. [Admin Dashboard — Page-by-Page Requirements](#7-admin-dashboard--page-by-page-requirements)
8. [Subscription Plans](#8-subscription-plans)
9. [Notifications Architecture](#9-notifications-architecture)
10. [Cloudinary Integration](#10-cloudinary-integration)
11. [Razorpay Integration](#11-razorpay-integration)
12. [Development Phases & Timeline](#12-development-phases--timeline)
13. [Security & Compliance](#13-security--compliance)
14. [Launch Checklist](#14-launch-checklist)
15. [Cost Estimate](#15-cost-estimate)

---

## 1. Product Overview

**ShaadiVendors** is a wedding and event vendor marketplace built for India. It connects couples planning their wedding with verified local vendors across 14 service categories.

### Business Model
- **Revenue**: B2B — Vendors pay monthly subscriptions (Rs.999–Rs.4,999/mo) to be listed and receive leads
- **Customer**: Free app — browse, save, enquire, book
- **Admin**: Platform management, vendor approval, subscription oversight

### Target Market
- **Geography**: Tier 1 & Tier 2 Indian cities — initial focus on Pune, Mumbai, Lonavala, Nashik
- **Customers**: Engaged couples, typically 23–35 years old, planning weddings 6–18 months ahead
- **Vendors**: Small-to-medium wedding service businesses — photographers, decorators, caterers, DJs, makeup artists, etc.

### Vendor Categories (14 total)
Photographers, Venues, Caterers, Decorators, Makeup Artists, Mehndi Artists, DJs, Bridal Wear, Groom Wear, Jewellery & Accessories, Pandits, Invites & Cards, Pre Wedding Shoot, Music & Dance

---

## 2. Tech Stack

| Layer | Tool | Rationale |
|---|---|---|
| **Mobile App** | React Native + Expo SDK 54 | Cross-platform iOS + Android; already built |
| **Admin Web** | React + Vite + Tailwind CSS | Separate web dashboard deployed on Vercel |
| **Backend** | Supabase | PostgreSQL + Auth + Realtime + Edge Functions — all-in-one |
| **Database** | PostgreSQL (Supabase) | Relational, supports complex queries for bookings/payments |
| **Authentication** | Supabase Auth | Phone OTP for customers; email/password for vendors & admin |
| **File Storage** | Cloudinary | Auto-compress, resize, CDN, WebP — ideal for vendor portfolios |
| **Payments** | Razorpay | UPI, cards, net banking, subscriptions, webhooks — India #1 |
| **SMS / OTP** | MSG91 | Indian numbers, low cost, WhatsApp Business API |
| **WhatsApp** | Meta API via MSG91 | Enquiry + booking alerts to vendors |
| **Email** | Resend | Booking confirmations, welcome emails, subscription receipts |
| **Push Notifications** | Expo Push + FCM | Booking alerts, subscription reminders |
| **Analytics** | PostHog | Funnel analysis, drop-off screens, event tracking |
| **Crash Reporting** | Firebase Crashlytics | Production crash monitoring by device/OS version |
| **Maps** | Google Maps Platform | Vendor location pins, nearby search, address autocomplete |
| **Search (Phase 2)** | Algolia | Switch from PostgreSQL FTS when vendors exceed ~20,000 |
| **OTA Updates** | EAS Update | Push bug fixes without Play Store review cycle |
| **Build** | EAS Build | Generates APK (Android) and IPA (iOS) |
| **Admin Hosting** | Vercel | React + Vite admin web app |

**Estimated Monthly Cost at Launch:** Under Rs.5,000/month

---

## 3. User Roles & Access

| Role | Entry Point | Session Storage | Key Permissions |
|---|---|---|---|
| **Customer** | Phone OTP login | Expo SecureStore | Browse, favorite, enquire, book, review |
| **Vendor** | Email + password login | Expo SecureStore | Manage own profile, see own enquiries/bookings, pay subscription |
| **Admin** | Email + password (hardcoded role in DB) | Web browser session | Full platform access — approve vendors, manage all data |

### Role Enforcement
- **Database level**: Supabase Row Level Security (RLS) on every table
- **App level**: Route guards check `auth.user().role` before rendering protected screens
- **Edge Function level**: All payment and notification triggers verify role before executing

---

## 4. Database Schema

### Tables

```sql
-- All users (customers, vendors, admins share this table)
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT UNIQUE,           -- customers only
  email        TEXT UNIQUE,           -- vendors + admin
  name         TEXT NOT NULL,
  avatar_url   TEXT,                  -- Cloudinary URL
  role         TEXT NOT NULL CHECK (role IN ('customer','vendor','admin')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Vendor business profiles
CREATE TABLE vendors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL,
  category            TEXT NOT NULL,
  tagline             TEXT,
  about               TEXT,
  location            TEXT,             -- human-readable address
  city                TEXT,
  lat                 DECIMAL(9,6),
  lng                 DECIMAL(9,6),
  phone               TEXT,             -- business contact (never exposed publicly)
  starting_price      INTEGER,          -- in Rs.
  price_level         TEXT,             -- Rs / RsRs / RsRsRs
  tags                TEXT[],           -- specialty tags e.g. ["Candid","Traditional"]
  rating              DECIMAL(3,2) DEFAULT 0,
  review_count        INTEGER DEFAULT 0,
  is_verified         BOOLEAN DEFAULT false,
  is_featured         BOOLEAN DEFAULT false,
  subscription_plan   TEXT DEFAULT 'trial',   -- basic/standard/premium/trial
  subscription_status TEXT DEFAULT 'trial',   -- active/expired/trial/suspended
  profile_views       INTEGER DEFAULT 0,
  admin_notes         TEXT,             -- admin internal notes
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Vendor offered services (chips on profile)
CREATE TABLE vendor_services (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL
);

-- Vendor portfolio images/videos
CREATE TABLE vendor_portfolio (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  cloudinary_url TEXT NOT NULL,
  cloudinary_id  TEXT NOT NULL,         -- for deletion
  media_type     TEXT DEFAULT 'photo',  -- photo / video
  display_order  INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Vendor pricing packages
CREATE TABLE vendor_packages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,           -- e.g. "Silver", "Gold", "Platinum"
  price        INTEGER NOT NULL,        -- in Rs.
  description  TEXT,
  inclusions   TEXT[]                   -- list of what's included
);

-- Blocked dates for availability
CREATE TABLE vendor_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason      TEXT,                     -- "Booked", "Personal", etc.
  UNIQUE(vendor_id, blocked_date)
);

-- Customer saved vendors
CREATE TABLE favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, vendor_id)
);

-- Enquiries from customers to vendors (primary lead flow)
CREATE TABLE enquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID REFERENCES users(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  wedding_date    DATE,
  guest_count     INTEGER,
  message         TEXT,
  status          TEXT DEFAULT 'new',   -- new/read/replied/closed
  vendor_reply    TEXT,                 -- optional text reply from vendor
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Bookings created after enquiry
CREATE TABLE bookings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID NOT NULL REFERENCES users(id),
  vendor_id            UUID NOT NULL REFERENCES vendors(id),
  enquiry_id           UUID REFERENCES enquiries(id),
  event_date           DATE NOT NULL,
  event_location       TEXT,
  amount               INTEGER NOT NULL,   -- in Rs., agreed amount
  advance_paid         INTEGER DEFAULT 0,  -- advance payment amount
  status               TEXT DEFAULT 'pending',
                       -- pending/confirmed/advance_paid/completed/cancelled
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  cancellation_reason  TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Reviews (only allowed after booking.status = 'completed')
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  vendor_id   UUID NOT NULL REFERENCES vendors(id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  is_visible  BOOLEAN DEFAULT true,      -- admin can hide inappropriate reviews
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Vendor platform subscriptions
CREATE TABLE vendor_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                UUID NOT NULL REFERENCES vendors(id),
  plan                     TEXT NOT NULL,   -- basic/standard/premium
  price                    INTEGER NOT NULL, -- Rs.999/1999/4999
  status                   TEXT NOT NULL,   -- active/expired/cancelled/trial
  razorpay_subscription_id TEXT,
  razorpay_plan_id         TEXT,
  start_date               DATE,
  end_date                 DATE,
  trial_end_date           DATE,
  created_at               TIMESTAMPTZ DEFAULT now()
);

-- All payment transactions
CREATE TABLE payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 TEXT NOT NULL,    -- booking_advance/subscription/booking_full
  reference_id         UUID,            -- booking_id or subscription_id
  vendor_id            UUID REFERENCES vendors(id),
  customer_id          UUID REFERENCES users(id),
  amount               INTEGER NOT NULL, -- in Rs.
  status               TEXT NOT NULL,   -- success/failed/refunded/pending
  razorpay_payment_id  TEXT,
  razorpay_order_id    TEXT,
  refund_id            TEXT,
  failure_reason       TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- In-app notifications
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  type         TEXT NOT NULL,   -- enquiry/booking/review/subscription/system
  reference_id UUID,            -- related entity ID
  action_url   TEXT,            -- deep link path in app
  is_read      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Expo push tokens per device
CREATE TABLE push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   TEXT,              -- ios/android
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);
```

### Key DB Triggers

```sql
-- Auto-update vendor rating when new review is added
CREATE OR REPLACE FUNCTION update_vendor_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vendors SET
    rating = (SELECT AVG(rating) FROM reviews WHERE vendor_id = NEW.vendor_id AND is_visible = true),
    review_count = (SELECT COUNT(*) FROM reviews WHERE vendor_id = NEW.vendor_id AND is_visible = true)
  WHERE id = NEW.vendor_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rating
AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_vendor_rating();

-- Auto-update vendors.updated_at
CREATE TRIGGER set_vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

### Row Level Security Policies

```sql
-- Customers see only their own data
CREATE POLICY "customer_own_bookings" ON bookings FOR SELECT
  USING (customer_id = auth.uid());
CREATE POLICY "customer_own_favorites" ON favorites FOR ALL
  USING (customer_id = auth.uid());
CREATE POLICY "customer_own_enquiries" ON enquiries FOR SELECT
  USING (customer_id = auth.uid());

-- Vendors see only their own business data
CREATE POLICY "vendor_own_profile" ON vendors FOR ALL
  USING (user_id = auth.uid());
CREATE POLICY "vendor_own_enquiries" ON enquiries FOR ALL
  USING (vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid()));
CREATE POLICY "vendor_own_bookings" ON bookings FOR ALL
  USING (vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid()));

-- Public can read verified active vendors
CREATE POLICY "public_read_vendors" ON vendors FOR SELECT
  USING (is_verified = true AND subscription_status IN ('active','trial'));

-- Public can read vendor services, portfolio, packages
CREATE POLICY "public_read_services" ON vendor_services FOR SELECT USING (true);
CREATE POLICY "public_read_portfolio" ON vendor_portfolio FOR SELECT USING (true);
CREATE POLICY "public_read_packages" ON vendor_packages FOR SELECT USING (true);
CREATE POLICY "public_read_reviews" ON reviews FOR SELECT USING (is_visible = true);

-- Admin: bypass all (using service role key in Edge Functions only)
```

---

## 5. Customer App — Page-by-Page Requirements

### Current State: UI complete, 0% backend wired

---

### 5.1 Authentication Screen (NEW — not yet built)

**File:** `app/auth.tsx`

**Purpose:** Entry point for all users. Detects role after login.

**UI Components:**
- ShaadiVendors logo + tagline
- Phone number input with India (+91) country code prefix
- "Send OTP" button
- 6-digit OTP input (auto-focus, auto-submit on 6th digit)
- Resend OTP (with 30-second cooldown timer)
- "Login as Vendor" / "Login as Admin" text links (navigate to email login)

**Development Requirements:**
```
1. Supabase phone auth: supabase.auth.signInWithOtp({ phone: '+91XXXXXXXXXX' })
2. MSG91 fallback for OTP delivery if Supabase SMS quota exceeded
3. On success: check users.role
   - role = 'customer' → navigate to /(tabs)/index
   - role = 'vendor' → navigate to /vendor-dashboard
   - role = 'admin' → navigate to /admin-dashboard
4. New user (no role yet): create users row with role='customer', navigate to profile setup
5. Store session: await SecureStore.setItemAsync('session', JSON.stringify(session))
6. Auto-login: on app start, check SecureStore for valid session token
7. Error states: invalid OTP, network error, too many attempts
```

---

### 5.2 Home Screen (`app/(tabs)/index.tsx`)

**Current State:** UI complete. All data hardcoded.

**Development Requirements:**

```
DATA FETCHING:
1. Hero banners:
   - Source: Supabase table 'banners' (admin-managed)
   - Query: SELECT * FROM banners WHERE is_active = true ORDER BY display_order
   - Fields: id, image_url (Cloudinary), title, subtitle, cta_text, cta_route
   - Auto-scroll carousel with 3-second interval

2. Category grid:
   - Static (hardcoded 14 categories is correct — no DB needed)
   - Each category taps → router.push('/VendorsListing', { params: { category } })

3. Featured vendors section:
   - Query: SELECT * FROM vendors WHERE is_featured = true AND is_verified = true LIMIT 8
   - Display: vendor card with image, name, rating, starting price, location
   - Tap → /VendorsProfile?vendorId=X&category=Y

4. "Trending Near You" section (Phase 2 — add after maps integration):
   - Query vendors WHERE city = user.city ORDER BY profile_views DESC LIMIT 6

ACTIONS:
5. "List Your Business" CTA button → router.push('/vendor-dashboard') or auth gate

PERFORMANCE:
6. Skeleton loading placeholders while data fetches
7. Image lazy loading via Cloudinary responsive URLs
8. Cache response for 5 minutes (React Query or SWR)
```

---

### 5.3 Categories Screen (`app/(tabs)/Categories.tsx`)

**Current State:** UI complete. Static category list.

**Development Requirements:**

```
DATA:
1. Category list is static (14 categories) — no DB call needed
2. Each category card shows:
   - Icon + name (static)
   - Vendor count badge: SELECT COUNT(*) FROM vendors WHERE category = X AND is_verified = true
   - Fetch all counts in single query: SELECT category, COUNT(*) FROM vendors GROUP BY category

ACTIONS:
3. Tap category → navigate to VendorsListing with category param
4. Count badges update on screen focus (not just mount)
```

---

### 5.4 Vendor Listing Screen (`app/VendorsListing.tsx`)

**Current State:** UI complete. Data from static `data/vendorData.ts`.

**Development Requirements:**

```
DATA FETCHING:
1. Replace static import with Supabase query:
   const { data } = await supabase
     .from('vendors')
     .select(`
       id, business_name, category, rating, review_count,
       starting_price, price_level, location, city, tags,
       is_featured, is_verified, subscription_plan,
       vendor_portfolio(cloudinary_url, display_order)
     `)
     .eq('category', category)
     .eq('is_verified', true)
     .in('subscription_status', ['active', 'premium'])
     .order('is_featured', { ascending: false })
     .order('rating', { ascending: false })
     .range(offset, offset + 19)   // 20 per page

2. Hero image: first portfolio image (display_order = 0) or vendor.avatar_url

FILTERS (server-side):
3. Price filter: .gte('starting_price', min).lte('starting_price', max)
4. Rating filter: .gte('rating', minRating)
5. City filter: .eq('city', selectedCity)
6. Sort options: rating DESC / starting_price ASC / starting_price DESC / newest

SEARCH:
7. PostgreSQL full-text search:
   .textSearch('search_vector', query, { type: 'websearch' })
   (Add generated column: search_vector tsvector from business_name, tags, location)

PAGINATION:
8. Infinite scroll: load next 20 when user scrolls to 80% of list
9. Show "X vendors found" count from COUNT(*) query

FAVORITES:
10. On mount: fetch user's favorites from DB, store in local state
11. Heart toggle: upsert/delete in favorites table immediately (optimistic update)
12. Sync FavoritesContext with DB state on login

PERFORMANCE:
13. Skeleton loading cards while fetching
14. Debounce search input (300ms)
15. Cancel previous fetch on new search/filter change (AbortController)
```

---

### 5.5 Vendor Profile Screen (`app/VendorsProfile.tsx`)

**Current State:** UI complete. Data from static vendorData.ts.

**Development Requirements:**

```
DATA FETCHING:
1. Full vendor query:
   SELECT v.*, 
     array_agg(DISTINCT vs.service_name) as services,
     array_agg(DISTINCT row(vp.cloudinary_url, vp.media_type, vp.display_order)) as portfolio,
     array_agg(DISTINCT row(vpk.package_name, vpk.price, vpk.description, vpk.inclusions)) as packages,
     array_agg(DISTINCT row(r.rating, r.comment, r.created_at, u.name)) as reviews
   FROM vendors v
   LEFT JOIN vendor_services vs ON vs.vendor_id = v.id
   LEFT JOIN vendor_portfolio vp ON vp.vendor_id = v.id
   LEFT JOIN vendor_packages vpk ON vpk.vendor_id = v.id
   LEFT JOIN reviews r ON r.vendor_id = v.id AND r.is_visible = true
   LEFT JOIN users u ON u.id = r.customer_id
   WHERE v.id = $vendorId

2. Increment profile view counter on mount:
   await supabase.rpc('increment_profile_views', { p_vendor_id: vendorId })
   (RPC function: UPDATE vendors SET profile_views = profile_views + 1 WHERE id = p_vendor_id)

HEART / FAVORITE:
3. Check if favorited: SELECT id FROM favorites WHERE customer_id = auth.uid() AND vendor_id = X
4. Toggle: INSERT/DELETE in favorites table with optimistic UI update

ACTION BUTTONS:
5. CALL button:
   Linking.openURL(`tel:${vendor.phone}`)
   Log: INSERT INTO enquiries with type='call' for analytics

6. WHATSAPP button:
   const msg = encodeURIComponent(`Hi, I found you on ShaadiVendors! I am interested in your ${category} services for my wedding.`)
   Linking.openURL(`https://wa.me/91${vendor.phone}?text=${msg}`)

7. MESSAGE button (in-app chat — Phase 3):
   Navigate to /chat?vendorId=X (build after core flows done)

8. ENQUIRE button → opens EnquiryModal (see below)

ENQUIRY MODAL:
9. Fields: Full Name (pre-fill from auth), Phone (pre-fill), Wedding Date (DatePicker), 
   Guest Count, Message (optional)
10. Submit:
    - INSERT INTO enquiries (customer_id, vendor_id, customer_name, customer_phone, wedding_date, guest_count, message)
    - Trigger MSG91 WhatsApp to vendor: "New enquiry from [name] for [date]"
    - INSERT INTO notifications (user_id=vendor.user_id, type='enquiry', ...)
    - Show success screen: "Enquiry sent! The vendor will contact you shortly."
11. Auth gate: if not logged in, show login prompt before opening modal

VIEW PACKAGES button:
12. Opens bottom sheet with full packages list from vendor_packages table

PORTFOLIO:
13. Tap image → fullscreen lightbox gallery (react-native-image-viewing or similar)
14. "View All" → navigate to /vendor-portfolio?vendorId=X (Phase 2)

REVIEWS SECTION (below portfolio):
15. Show latest 3 reviews with name, rating, comment, date
16. "View All Reviews" → /vendor-reviews?vendorId=X
17. If customer has a completed booking with this vendor: show "Write a Review" button

REQUEST QUOTE (bottom bar):
18. Same as ENQUIRE button — opens EnquiryModal
19. "Starting from Rs.X" is pulled from vendors.starting_price

AVAILABILITY CHECK (Phase 2):
20. Show calendar with blocked dates from vendor_availability table
```

---

### 5.6 Bookings Screen (`app/(tabs)/bookings.tsx`)

**Current State:** UI complete. Static hardcoded bookingsData array.

**Development Requirements:**

```
AUTH GATE:
1. If not logged in: show "Login to view your bookings" with login button

DATA FETCHING:
2. Query:
   SELECT b.*, v.business_name, v.category, v.phone,
     (SELECT cloudinary_url FROM vendor_portfolio WHERE vendor_id = v.id ORDER BY display_order LIMIT 1) as vendor_image
   FROM bookings b
   JOIN vendors v ON v.id = b.vendor_id
   WHERE b.customer_id = auth.uid()
   ORDER BY b.event_date DESC

3. Tabs filter (client-side after fetch):
   - Upcoming: status IN ('pending','confirmed','advance_paid') AND event_date >= today
   - Completed: status = 'completed'
   - Cancelled: status = 'cancelled'

BOOKING CARD ACTIONS:
4. CALL vendor: Linking.openURL(`tel:${vendor.phone}`)
5. MESSAGE vendor: WhatsApp link
6. CANCEL booking (upcoming only):
   - Confirm modal: "Are you sure? Cancellation policy applies."
   - UPDATE bookings SET status='cancelled', cancellation_reason=X WHERE id=booking.id
   - INSERT notification for vendor
   - Send WhatsApp to vendor via MSG91

7. WRITE REVIEW (completed bookings without a review):
   - Show "Rate your experience" button
   - Opens ReviewModal: star rating + text comment
   - INSERT INTO reviews (booking_id, customer_id, vendor_id, rating, comment)
   - Auto-trigger vendor rating recalculation (DB trigger)

8. VIEW INVOICE (completed bookings with payment):
   - Show payment receipt screen with booking details + amount paid

EMPTY STATE:
9. No bookings: "No bookings yet. Explore vendors to plan your perfect wedding."
   - "Explore Vendors" button → /(tabs)/Categories

REAL-TIME:
10. Supabase Realtime subscription on bookings table for status changes
    - e.g. When vendor confirms, card updates live from 'pending' to 'confirmed'
```

---

### 5.7 Favorites Screen (`app/(tabs)/favorites.tsx`)

**Current State:** UI complete and redesigned. In-memory context only (lost on refresh).

**Development Requirements:**

```
AUTH GATE:
1. If not logged in: show login prompt instead of empty state

DATA FETCHING:
2. On login: fetch favorites from DB:
   SELECT f.*, v.business_name, v.category, v.rating, v.review_count,
     v.starting_price, v.price_level, v.location, v.tags,
     (SELECT cloudinary_url FROM vendor_portfolio WHERE vendor_id = v.id ORDER BY display_order LIMIT 1) as image
   FROM favorites f
   JOIN vendors v ON v.id = f.vendor_id
   WHERE f.customer_id = auth.uid()
   ORDER BY f.created_at DESC

3. Sync FavoritesContext state with DB result on mount

TOGGLE FAVORITE:
4. Add: INSERT INTO favorites (customer_id, vendor_id) — optimistic update
5. Remove: DELETE FROM favorites WHERE customer_id = auth.uid() AND vendor_id = X
6. Both operations update local context immediately, DB in background

GRID / LIST TOGGLE:
7. Store preference in AsyncStorage ('favorites_view_mode')

NAVIGATE TO PROFILE:
8. Tap card → /VendorsProfile?vendorId=X&category=Y (already implemented)

REAL-TIME:
9. If vendor is suspended/deleted, remove from favorites list gracefully
```

---

### 5.8 Profile Screen (`app/(tabs)/profile.tsx`)

**Current State:** UI complete. Static hardcoded user object ("Priya Sharma").

**Development Requirements:**

```
DATA FETCHING:
1. On mount: SELECT id, name, email, phone, avatar_url FROM users WHERE id = auth.uid()
2. Display real name, phone, avatar

EDIT PROFILE:
3. "Edit" button → EditProfileModal
   - Name field (text input, required)
   - Avatar: tap avatar → Expo ImagePicker → Cloudinary upload → update avatar_url
   - Save: UPDATE users SET name=X, avatar_url=Y WHERE id = auth.uid()

MENU ITEMS — wire each:
4. My Bookings → navigate to /(tabs)/bookings
5. Settings → SettingsScreen (notification preferences)
6. Notifications → notification preferences:
   - Toggle: booking updates (push)
   - Toggle: new offers (push)
   - Toggle: WhatsApp alerts
   - Store in Supabase users.notification_prefs JSONB column
7. Help & Support → opens WhatsApp to support number OR in-app FAQ
8. Privacy Policy → WebView with policy URL
9. Terms of Service → WebView with ToS URL
10. Logout:
    - Confirm modal
    - await supabase.auth.signOut()
    - Clear SecureStore session
    - Navigate to /auth

THEME TOGGLE:
11. Already working — keep as is

STATS SUMMARY (optional — Phase 2):
12. Show: X bookings made, X vendors favorited, Member since [date]
```

---

## 6. Vendor Dashboard — Page-by-Page Requirements

### Current State: UI complete, all data hardcoded, no auth

---

### 6.1 Vendor Login Screen (NEW — not yet built)

**File:** `app/vendor-auth.tsx`

**Development Requirements:**

```
UI:
1. Email input + password input
2. "Login" button
3. "Forgot password?" link
4. "New vendor? Register your business" link → /vendor-onboarding

AUTH:
5. supabase.auth.signInWithPassword({ email, password })
6. Check users.role = 'vendor' — if not vendor, show error "Use customer login"
7. On success: navigate to /vendor-dashboard
8. Store session in SecureStore

FORGOT PASSWORD:
9. Email input → supabase.auth.resetPasswordForEmail(email)
10. Resend email via Resend with "Reset Your Password" template
11. Show: "Check your email for reset instructions"
```

---

### 6.2 Vendor Onboarding Wizard (NEW — not yet built)

**File:** `app/vendor-onboarding.tsx`

**Development Requirements:**

```
STEP 1 — Account Creation:
1. Full name, email, password, confirm password
2. Phone number (business contact — not shared publicly)
3. supabase.auth.signUp({ email, password }) → creates users row
4. UPDATE users SET role='vendor', name=X, phone=Y

STEP 2 — Business Basics:
5. Business name (required)
6. Category selection (dropdown/grid of 14 categories)
7. Tagline (optional, max 80 chars)

STEP 3 — Location:
8. City selection (dropdown of supported cities)
9. Full address text input
10. Google Maps autocomplete for address
11. Auto-fill lat/lng from Maps API

STEP 4 — About & Services:
12. "About your business" textarea (min 100 chars)
13. Services: add chips (type + press Enter, or select from suggestions per category)

STEP 5 — Pricing:
14. Starting price (number input, Rs.)
15. Price level selector: Rs. / RsRs / RsRsRs
16. Add packages (optional): name + price + inclusions
   - "Add Package" button → inline form
   - Max 5 packages

STEP 6 — Portfolio Upload:
17. Expo ImagePicker (multi-select, up to 10 photos at onboarding)
18. Each image → Cloudinary upload with loading indicator
19. Drag to reorder (display_order)
20. "Skip for now" option

STEP 7 — Preview:
21. Show how the public profile will look (read-only VendorsProfile layout)
22. "Edit" link for each section

STEP 8 — Submit:
23. INSERT INTO vendors (all collected data, is_verified = false)
24. INSERT INTO vendor_subscriptions (plan='trial', status='trial', trial_end_date = now()+14 days)
25. Send welcome email via Resend: "Welcome to ShaadiVendors! Your profile is under review."
26. INSERT notification for admin: "New vendor pending approval: [business_name]"
27. Send admin push notification
28. Show success screen: "Profile submitted! We'll review and approve within 24 hours."

PROGRESS:
29. Progress bar showing current step / total steps
30. Can navigate back to previous steps
31. Save draft: auto-save to AsyncStorage on each step
32. Resume draft on re-open
```

---

### 6.3 Vendor Dashboard Home (`app/vendor-dashboard.tsx`)

**Current State:** UI complete. All stats hardcoded ("Magic Moments Photography", 1,245 views, etc.)

**Development Requirements:**

```
DATA FETCHING — replace all hardcoded values:

1. Vendor profile:
   SELECT * FROM vendors WHERE user_id = auth.uid() LIMIT 1

2. Stats (show real numbers):
   a. Profile views: vendors.profile_views
   b. Enquiries (30 days):
      SELECT COUNT(*) FROM enquiries WHERE vendor_id = X AND created_at > now() - interval '30 days'
   c. Unread messages:
      SELECT COUNT(*) FROM notifications WHERE user_id = auth.uid() AND is_read = false
   d. Rating: vendors.rating (already stored, updated by trigger)

3. Profile completion % calculation:
   Score each field:
   - business_name: 10%
   - about: 10%
   - location + lat/lng: 10%
   - vendor_services (at least 3): 10%
   - vendor_portfolio (at least 5 photos): 15%
   - vendor_packages (at least 1): 15%
   - tags (at least 3): 10%
   - phone: 10%
   - starting_price: 10%
   Total = sum of filled fields
   Display: "X% Complete" with progress bar

4. Recent enquiries preview:
   SELECT * FROM enquiries WHERE vendor_id = X ORDER BY created_at DESC LIMIT 3

5. Subscription status banner:
   SELECT * FROM vendor_subscriptions WHERE vendor_id = X ORDER BY created_at DESC LIMIT 1
   - If trial: show "X days left in trial — Upgrade now"
   - If expired: show "Subscription expired — Renew to stay visible"

QUICK ACTIONS:
6. View Profile → navigate to /VendorPublicPreview (shows how customers see this vendor)
7. Share Profile → share deep link via React Native Share API
8. Promote → navigate to /vendor-subscription (upgrade plan)
9. Preview → same as View Profile

PROFILE COMPLETION ITEMS (8 rows):
10. Each row taps → navigate to specific edit section
11. Show real completion % per section (not hardcoded 80%, 90%)

NEED HELP:
12. Contact Support → WhatsApp link to ShaadiVendors support number

REAL-TIME:
13. Supabase Realtime: new enquiry arrives → notification badge updates + enquiry preview adds new row
```

---

### 6.4 Vendor Enquiries Tab (NEW — not yet built as separate screen)

**File:** `app/vendor-enquiries.tsx`

**Development Requirements:**

```
DATA:
1. SELECT e.*, u.name as customer_name, u.avatar_url
   FROM enquiries e
   LEFT JOIN users u ON u.id = e.customer_id
   WHERE e.vendor_id = X
   ORDER BY e.created_at DESC

FILTERS:
2. Tabs: All / New / Replied / Closed
3. Date range filter

ENQUIRY CARD:
4. Customer avatar + name, wedding date, message preview
5. "New" badge for unread (status = 'new')
6. Tap → opens EnquiryDetail

ENQUIRY DETAIL SCREEN:
7. Full message
8. Customer phone (tap → call or WhatsApp)
9. Wedding date, guest count
10. "Reply on WhatsApp" → pre-filled WhatsApp link
11. "Mark as Replied" → UPDATE enquiries SET status='replied'
12. "Close" → UPDATE enquiries SET status='closed'
13. Vendor internal notes field (optional)

AUTO-MARK READ:
14. When enquiry detail is opened: UPDATE enquiries SET status='read' WHERE status='new'
15. Decrement unread badge count

REAL-TIME:
16. Supabase Realtime subscription → new enquiry appears at top without refresh
17. Push notification on new enquiry (handled by Edge Function)
```

---

### 6.5 Vendor Bookings Tab (NEW — not yet built as separate screen)

**File:** `app/vendor-bookings.tsx`

**Development Requirements:**

```
DATA:
1. SELECT b.*, u.name as customer_name, u.phone as customer_phone, u.avatar_url
   FROM bookings b
   JOIN users u ON u.id = b.customer_id
   WHERE b.vendor_id = X
   ORDER BY b.event_date ASC

TABS:
2. Upcoming (pending/confirmed/advance_paid, event_date >= today)
3. Completed
4. Cancelled

BOOKING CARD ACTIONS:
5. PENDING booking (customer made booking, awaiting vendor confirm):
   - "Accept" → UPDATE status='confirmed' → push + SMS to customer
   - "Decline" → UPDATE status='cancelled' + reason → notify customer

6. CONFIRMED booking:
   - "Mark as Completed" → UPDATE status='completed'
   - Trigger: INSERT notification for customer (review request)
   - "Contact Customer" → WhatsApp link

7. COMPLETED booking:
   - Show review if customer left one
   - "View Review" → review detail

CALENDAR VIEW:
8. Toggle: List view / Calendar view
9. Calendar shows booked dates (event_date from confirmed bookings)
10. Blocked dates from vendor_availability shown in different color

EARNINGS SUMMARY (top of screen):
11. This month earnings: SUM(amount) FROM bookings WHERE vendor_id=X AND status='completed' AND month=current
12. Total bookings completed: COUNT
```

---

### 6.6 Vendor Profile Management — Business Information

**File:** `app/vendor-edit-business.tsx`

**Development Requirements:**

```
FORM FIELDS (pre-filled from vendors table):
1. Business name (required)
2. Category (dropdown — locked after verification)
3. Tagline (max 80 chars)
4. Business phone (not shown publicly)
5. Business email

SAVE:
6. UPDATE vendors SET business_name=X, tagline=Y, phone=Z
7. Show success toast
8. Navigate back to profile completion screen

VALIDATION:
9. Business name: min 3 chars, max 100
10. Phone: valid Indian mobile number format
```

---

### 6.7 Vendor Profile Management — About Your Business

**File:** `app/vendor-edit-about.tsx`

**Development Requirements:**

```
FORM:
1. About textarea (rich text — min 100 chars, max 1000)
2. Character counter
3. Tags input: add/remove specialty tags (e.g. "Candid", "Traditional")
   - Suggestions based on category
   - Max 8 tags

SAVE:
4. UPDATE vendors SET about=X, tags=Y WHERE user_id = auth.uid()
```

---

### 6.8 Vendor Profile Management — Services & Packages

**File:** `app/vendor-edit-services.tsx`

**Development Requirements:**

```
SERVICES:
1. List current services from vendor_services table
2. Add service: text input + "Add" button
   INSERT INTO vendor_services (vendor_id, service_name)
3. Delete service: swipe or X button
   DELETE FROM vendor_services WHERE id = X

PACKAGES:
4. List current packages from vendor_packages
5. Add package form:
   - Package name (e.g. "Silver Package")
   - Price (number, Rs.)
   - Description
   - Inclusions (add/remove chips)
   INSERT INTO vendor_packages (...)
6. Edit package: tap to edit inline
7. Delete package: DELETE FROM vendor_packages WHERE id = X
8. Max 5 packages
```

---

### 6.9 Vendor Profile Management — Portfolio

**File:** `app/vendor-edit-portfolio.tsx`

**Development Requirements:**

```
CURRENT PHOTOS:
1. Grid view of existing portfolio images from vendor_portfolio
2. Drag to reorder → UPDATE vendor_portfolio SET display_order = X

ADD PHOTOS:
3. "+" button → Expo ImagePicker (multi-select, max 10 at a time)
4. For each selected image:
   a. Show thumbnail with upload progress bar
   b. Upload to Cloudinary: POST /upload with signed preset
   c. On success: INSERT INTO vendor_portfolio (vendor_id, cloudinary_url, cloudinary_id, display_order)
   d. On failure: show retry button
5. Max total: 50 photos (Standard/Premium) or 10 (Basic)

DELETE PHOTO:
6. Long-press or X button → confirm dialog
7. DELETE FROM vendor_portfolio WHERE id = X
8. Delete from Cloudinary: call Cloudinary destroy API via Edge Function

VIDEO UPLOAD (Premium plan only):
9. Expo DocumentPicker for video files
10. Cloudinary video upload with progress
11. Auto-thumbnail generation
```

---

### 6.10 Vendor Profile Management — Availability

**File:** `app/vendor-edit-availability.tsx`

**Development Requirements:**

```
CALENDAR:
1. react-native-calendars: monthly calendar view
2. Mark existing blocked dates (from vendor_availability) in red/gray

BLOCK DATE:
3. Tap date → confirm: "Block this date as unavailable?"
   INSERT INTO vendor_availability (vendor_id, blocked_date, reason)
4. Reason options: "Already Booked", "Personal", "Holiday"

UNBLOCK DATE:
5. Tap blocked date → "Make available again?"
   DELETE FROM vendor_availability WHERE vendor_id = X AND blocked_date = Y

BULK BLOCK:
6. Range selector: "Block a date range" → date picker for start + end
   INSERT multiple rows

VIEW:
7. Show confirmed bookings from bookings table as different color (read-only)
8. Distinguish: booked (from DB) vs. manually blocked (from vendor_availability)
```

---

### 6.11 Vendor Subscription & Billing

**File:** `app/vendor-subscription.tsx`

**Development Requirements:**

```
CURRENT PLAN DISPLAY:
1. Fetch: SELECT * FROM vendor_subscriptions WHERE vendor_id = X ORDER BY created_at DESC LIMIT 1
2. Show: plan name, status, next billing date, amount
3. Trial banner: "X days left in your free trial"
4. Expired banner: "Subscription expired on [date] — profile hidden from customers"

PLAN CARDS (3 plans):
5. Basic: Rs.999/month — feature list
6. Standard: Rs.1,999/month — feature list (highlight as "Popular")
7. Premium: Rs.4,999/month — feature list

UPGRADE FLOW:
8. Select plan → "Subscribe Now" button
9. Call Supabase Edge Function: create-razorpay-subscription
   - Edge Function creates Razorpay subscription via API
   - Returns { subscriptionId, shortUrl }
10. Open Razorpay checkout in WebView (or react-native-razorpay)
11. On payment success:
    - Razorpay webhook → Edge Function → UPDATE vendor_subscriptions
    - UPDATE vendors SET subscription_plan=X, subscription_status='active'
    - Send confirmation email via Resend
    - Navigate to success screen

PAYMENT HISTORY:
12. List from payments WHERE vendor_id = X AND type = 'subscription'
13. Show: date, plan, amount, status (success/failed/refunded), download invoice link

CANCEL SUBSCRIPTION:
14. "Cancel Renewal" → confirm modal
15. Call Edge Function: cancel-razorpay-subscription
16. Update status to 'cancelled' — plan stays active till end_date
```

---

## 7. Admin Dashboard — Page-by-Page Requirements

### Current State: UI complete, all data hardcoded

---

### 7.1 Admin Login (NEW)

**File:** `app/admin-auth.tsx` (or web-only in React admin panel)

**Development Requirements:**

```
1. Email + password form
2. supabase.auth.signInWithPassword({ email, password })
3. Verify: users.role = 'admin' — if not admin, reject with error
4. On success: navigate to /admin-dashboard
5. No self-registration — admin accounts created manually in Supabase dashboard
```

---

### 7.2 Admin Dashboard Home (`app/admin-dashboard.tsx`)

**Current State:** UI complete. Stats hardcoded (1,248 vendors, Rs.2,84,950 revenue, etc.)

**Development Requirements:**

```
REAL METRICS — replace all hardcoded values:

1. Total Vendors:
   SELECT COUNT(*) FROM vendors

2. Active Subscriptions:
   SELECT COUNT(*) FROM vendor_subscriptions WHERE status = 'active'

3. Monthly Revenue:
   SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE status = 'success'
   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', now())

4. Monthly Enquiries:
   SELECT COUNT(*) FROM enquiries
   WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', now())

5. vs last month % change (for each metric):
   Compare with: WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', now() - interval '1 month')

REVENUE CHART:
6. Replace stock photo with react-native-gifted-charts LineChart
7. Data: SELECT DATE(created_at) as day, SUM(amount) as revenue
         FROM payments WHERE status='success' AND created_at > now() - interval '30 days'
         GROUP BY day ORDER BY day
8. Show current month total + % change from last month

RECENT SUBSCRIPTIONS:
9. Real data:
   SELECT vs.*, v.business_name, v.category, u.avatar_url
   FROM vendor_subscriptions vs
   JOIN vendors v ON v.id = vs.vendor_id
   JOIN users u ON u.id = v.user_id
   ORDER BY vs.created_at DESC LIMIT 5

RECENT ENQUIRIES:
10. Real data:
    SELECT e.*, u.name, u.avatar_url, v.business_name as vendor_name
    FROM enquiries e
    LEFT JOIN users u ON u.id = e.customer_id
    JOIN vendors v ON v.id = e.vendor_id
    ORDER BY e.created_at DESC LIMIT 5

QUICK ACTIONS:
11. Add Vendor → /admin-add-vendor (manual vendor creation)
12. Subscriptions → /subscriptions-admin
13. Payments → /payments-admin
14. Enquiries → /admin-enquiries
15. Reviews → /admin-reviews
16. Reports → /admin-reports (Phase 2)

PENDING APPROVALS BADGE:
17. SELECT COUNT(*) FROM vendors WHERE is_verified = false
18. Show red badge on dashboard header if > 0

REAL-TIME:
19. Supabase Realtime on vendors table: new pending vendor → notification + badge update
```

---

### 7.3 Admin Vendor Management (`app/vendors-admin-listing.tsx`)

**Current State:** UI exists. All vendor rows hardcoded.

**Development Requirements:**

```
DATA:
1. SELECT v.*, u.email, u.phone as user_phone,
     vs.plan, vs.status as sub_status, vs.end_date,
     (SELECT COUNT(*) FROM enquiries WHERE vendor_id = v.id) as total_enquiries,
     (SELECT COUNT(*) FROM bookings WHERE vendor_id = v.id) as total_bookings
   FROM vendors v
   JOIN users u ON u.id = v.user_id
   LEFT JOIN vendor_subscriptions vs ON vs.vendor_id = v.id AND vs.status = 'active'
   ORDER BY v.created_at DESC

FILTERS:
2. Status tabs: All / Pending / Active / Suspended
3. Category filter
4. Search by business name or city

VENDOR ROW ACTIONS:
5. APPROVE (pending vendors):
   - UPDATE vendors SET is_verified = true
   - INSERT vendor_subscriptions (plan='trial', status='trial', trial_end_date=now()+14)
   - Send welcome email via Resend Edge Function
   - INSERT notification for vendor

6. SUSPEND (active vendors):
   - Confirm modal: "This will hide the vendor from all listings. Continue?"
   - UPDATE vendors SET subscription_status = 'suspended'
   - UPDATE vendor_subscriptions SET status = 'suspended'
   - Send suspension email to vendor

7. REINSTATE (suspended vendors):
   - UPDATE vendors SET subscription_status = 'active'
   - Send reinstatement email

8. VIEW PROFILE → navigate to VendorsProfile (public view)
9. EDIT → /admin-edit-vendor?vendorId=X (admin can edit any field)
10. DELETE → confirm modal → DELETE FROM vendors (cascades to all related)
    (Soft delete preferred: add deleted_at timestamp column)

VENDOR DETAIL DRAWER:
11. Tap vendor row → side drawer showing:
    - All vendor details
    - Subscription history
    - Enquiries count + list
    - Bookings count + list
    - Reviews
    - Admin notes field (UPDATE vendors SET admin_notes = X)
```

---

### 7.4 Admin Payments (`app/payments-admin.tsx`)

**Current State:** UI complete. All transactions hardcoded.

**Development Requirements:**

```
SUMMARY STATS:
1. Total revenue: SUM(amount) FROM payments WHERE status='success'
2. This month: SUM WHERE month = current
3. Failed payments: COUNT WHERE status='failed'
4. Refunds issued: SUM WHERE status='refunded'

TRANSACTION LIST:
5. SELECT p.*, v.business_name, u.avatar_url
   FROM payments p
   LEFT JOIN vendors v ON v.id = p.vendor_id
   LEFT JOIN users u ON u.id = v.user_id
   ORDER BY p.created_at DESC

FILTERS:
6. Date range picker
7. Status: All / Success / Failed / Refunded
8. Type: All / Subscription / Booking
9. Search by vendor name or Razorpay payment ID

ACTIONS:
10. REFUND (success payments):
    - Confirm modal with reason
    - Call Edge Function: process-razorpay-refund
    - UPDATE payments SET status='refunded', refund_id=X
    - Send refund confirmation email to vendor

11. VIEW DETAILS → payment detail screen (Razorpay order + payment IDs, timestamps)

EXPORT:
12. "Export CSV" button:
    - Query all filtered payments
    - Generate CSV with: date, vendor, type, amount, status, payment_id
    - Share via React Native Share or download via FileSystem

RAZORPAY WEBHOOK:
13. Supabase Edge Function endpoint: /functions/v1/razorpay-webhook
    - Verify webhook signature
    - On payment.captured: UPDATE payments SET status='success'
    - On payment.failed: UPDATE payments SET status='failed', failure_reason=X
    - On refund.processed: UPDATE payments SET status='refunded', refund_id=X
    - On subscription.charged: INSERT new payment row + extend subscription end_date
    - On subscription.cancelled: UPDATE vendor_subscriptions SET status='cancelled'
```

---

### 7.5 Admin Subscriptions (`app/subscriptions-admin.tsx`)

**Current State:** UI complete. All data hardcoded.

**Development Requirements:**

```
SUMMARY:
1. Active subscriptions: COUNT WHERE status='active'
2. Trial subscriptions: COUNT WHERE status='trial'  
3. Expiring this week: COUNT WHERE end_date BETWEEN now() AND now()+7days
4. Monthly recurring revenue (MRR):
   SUM(price) FROM vendor_subscriptions WHERE status='active'

SUBSCRIPTION LIST:
5. SELECT vs.*, v.business_name, v.category, v.city, u.email
   FROM vendor_subscriptions vs
   JOIN vendors v ON v.id = vs.vendor_id
   JOIN users u ON u.id = v.user_id
   ORDER BY vs.created_at DESC

FILTERS:
6. Status: All / Active / Trial / Expired / Cancelled
7. Plan: Basic / Standard / Premium
8. Expiring soon toggle

ACTIONS:
9. EXTEND SUBSCRIPTION (admin override):
   - Date picker to select new end_date
   - UPDATE vendor_subscriptions SET end_date = X
   - No charge for extension (admin goodwill)

10. CHANGE PLAN:
    - SELECT new plan
    - UPDATE vendor_subscriptions SET plan = X, price = Y
    - UPDATE vendors SET subscription_plan = X
    - Adjust Razorpay subscription via Edge Function

11. CANCEL:
    - UPDATE vendor_subscriptions SET status='cancelled'
    - Call Edge Function to cancel Razorpay subscription
    - UPDATE vendors SET subscription_status='expired'

RENEWAL ALERTS:
12. Automated Edge Function (cron, daily):
    - Find subscriptions expiring in 3 days
    - Send email + push to vendor: "Your subscription expires in 3 days"
    - Find expired subscriptions
    - UPDATE vendors SET subscription_status='expired'
    - Send "Subscription expired" email
```

---

### 7.6 Admin Enquiries Overview (NEW)

**File:** `app/admin-enquiries.tsx`

**Development Requirements:**

```
PURPOSE: Platform-level view of all enquiries for moderation and analytics

DATA:
1. SELECT e.*, v.business_name, u.name as customer_name
   FROM enquiries e
   JOIN vendors v ON v.id = e.vendor_id
   LEFT JOIN users u ON u.id = e.customer_id
   ORDER BY e.created_at DESC

STATS:
2. Today's enquiries: COUNT WHERE DATE(created_at) = today
3. This week: COUNT WHERE created_at > now()-7days
4. Average response rate (% of enquiries with status='replied')

ACTIONS:
5. Flag inappropriate enquiry → mark + hide from vendor
6. View full enquiry detail
7. Export enquiries data as CSV
```

---

### 7.7 Admin Reviews Moderation (NEW)

**File:** `app/admin-reviews.tsx`

**Development Requirements:**

```
DATA:
1. SELECT r.*, v.business_name, u.name as customer_name, b.event_date
   FROM reviews r
   JOIN vendors v ON v.id = r.vendor_id
   JOIN users u ON u.id = r.customer_id
   JOIN bookings b ON b.id = r.booking_id
   ORDER BY r.created_at DESC

FILTERS:
2. Rating: All / 1-star / 2-star / 3-star / 4-star / 5-star
3. Visibility: Visible / Hidden
4. Date range

ACTIONS:
5. HIDE review: UPDATE reviews SET is_visible = false
   (Triggers vendor rating recalculation via DB trigger)
6. SHOW review: UPDATE reviews SET is_visible = true
7. DELETE review: DELETE FROM reviews WHERE id = X (use carefully)
8. View associated booking
```

---

## 8. Subscription Plans

| Plan | Price | Enquiries/mo | Portfolio | Listing Priority | Analytics | Support |
|---|---|---|---|---|---|---|
| **Trial** | Free (14 days) | 5 | 5 photos | Normal | None | Email |
| **Basic** | Rs.999/mo | 10 | 10 photos | Normal | Basic | Email |
| **Standard** | Rs.1,999/mo | Unlimited | 50 photos | Priority | Standard | WhatsApp |
| **Premium** | Rs.4,999/mo | Unlimited | 50 photos + video | Featured on home | Full | Dedicated |

### Subscription Enforcement Logic
```
Unlisted vendors (is_verified=false): hidden from all listings
Trial vendors: listed normally, limited enquiry count
Basic: listed, enforced enquiry limit server-side
Standard: priority listing (higher sort order)
Premium: featured banner on home screen + priority listing
Expired: hidden from listings, vendor notified, profile kept in DB
Suspended (admin): hidden immediately, vendor notified
```

---

## 9. Notifications Architecture

### Events & Channels

| Event | Push | WhatsApp | SMS | Email | Recipient |
|---|---|---|---|---|---|
| New enquiry received | ✅ | ✅ | — | — | Vendor |
| Booking request received | ✅ | ✅ | ✅ | — | Vendor |
| Booking confirmed by vendor | ✅ | — | ✅ | ✅ | Customer |
| Booking completed | ✅ | — | — | ✅ | Customer (+ review request) |
| Booking cancelled | ✅ | — | ✅ | ✅ | Both parties |
| Review received | ✅ | — | — | — | Vendor |
| Subscription expiring (3 days) | ✅ | — | — | ✅ | Vendor |
| Subscription expired | ✅ | — | ✅ | ✅ | Vendor |
| New vendor approved | ✅ | ✅ | — | ✅ | Vendor |
| New vendor pending | ✅ | — | — | — | Admin |
| Payment successful | ✅ | — | — | ✅ | Vendor |
| Payment failed | ✅ | — | ✅ | ✅ | Vendor |

### Implementation
- **Edge Functions** trigger all external notifications (never from client)
- **Supabase Realtime** triggers Edge Functions via Database Webhooks
- **Expo Push API**: batch sends via Edge Function
- **FCM**: used for Android background delivery reliability
- **Push tokens**: stored in `push_tokens` table, updated on app open

---

## 10. Cloudinary Integration

### Setup
```
Account: Create Cloudinary account → note cloud_name, api_key, api_secret
Upload Preset: Create "signed" preset named "shaadi_vendors_uploads"
  - Allowed formats: jpg, jpeg, png, webp, mp4
  - Max file size: 10MB photos, 100MB videos
  - Auto-quality: true
  - Auto-format: true (serves WebP/AVIF)
```

### Folder Structure
```
shaadi-vendors/
├── vendors/
│   ├── {vendor_id}/
│   │   ├── portfolio/          -- product images
│   │   │   ├── img_001.jpg
│   │   │   └── ...
│   │   ├── videos/             -- reel/video portfolio
│   │   └── avatar.jpg          -- vendor business logo/photo
├── users/
│   └── {user_id}/
│       └── avatar.jpg          -- customer profile photo
└── banners/                    -- admin-managed home screen banners
    ├── banner_001.jpg
    └── ...
```

### Upload Flow (Mobile App)
```typescript
// 1. Get signed upload credentials from Edge Function
const { signature, timestamp, cloudName, apiKey } = 
  await supabase.functions.invoke('get-cloudinary-signature', {
    body: { folder: `vendors/${vendorId}/portfolio` }
  })

// 2. Upload from app
const formData = new FormData()
formData.append('file', { uri: imageUri, name: 'photo.jpg', type: 'image/jpeg' })
formData.append('signature', signature)
formData.append('timestamp', timestamp)
formData.append('api_key', apiKey)
formData.append('folder', `vendors/${vendorId}/portfolio`)

const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
  method: 'POST',
  body: formData
})
const { secure_url, public_id } = await response.json()

// 3. Save to DB
await supabase.from('vendor_portfolio').insert({
  vendor_id: vendorId,
  cloudinary_url: secure_url,
  cloudinary_id: public_id
})
```

### Delivery URL Transformations
```
Original: https://res.cloudinary.com/{cloud}/image/upload/{public_id}.jpg

Thumbnail (200x200):
https://res.cloudinary.com/{cloud}/image/upload/w_200,h_200,c_fill,f_auto,q_auto/{public_id}

Card image (400w):
https://res.cloudinary.com/{cloud}/image/upload/w_400,c_fill,f_auto,q_auto/{public_id}

Hero image (800w):
https://res.cloudinary.com/{cloud}/image/upload/w_800,c_fill,f_auto,q_auto/{public_id}
```

---

## 11. Razorpay Integration

### Subscription Flow
```
1. Vendor selects plan in app
2. App calls Edge Function: POST /functions/v1/create-subscription
   Body: { vendorId, plan: 'standard' }
3. Edge Function:
   a. Look up Razorpay plan_id for the selected plan
   b. POST https://api.razorpay.com/v1/subscriptions
      { plan_id, total_count: 120, quantity: 1 }
   c. Returns { id: sub_xxxx, short_url: "https://rzp.io/..." }
4. App opens Razorpay checkout WebView or uses react-native-razorpay SDK
5. Customer pays via UPI/card/net banking
6. Razorpay sends webhook to: POST /functions/v1/razorpay-webhook
7. Webhook Edge Function:
   a. Verify signature: crypto.createHmac('sha256', secret).update(body).digest('hex')
   b. On subscription.charged:
      - INSERT payments (type='subscription', status='success', ...)
      - UPDATE vendor_subscriptions SET status='active', end_date=...
      - UPDATE vendors SET subscription_status='active', subscription_plan=plan
      - Send confirmation email via Resend
      - Send push notification to vendor
```

### Razorpay Plan IDs (create in Razorpay dashboard)
```
Basic:    plan_basic_999    — Rs.999/month
Standard: plan_standard_1999 — Rs.1,999/month  
Premium:  plan_premium_4999  — Rs.4,999/month
```

---

## 12. Development Phases & Timeline

### Phase 0 — Quick Wins (Week 1 — No backend needed)
- [ ] Wire "Call" button with real placeholder number
- [ ] Wire "WhatsApp" button with pre-filled message template
- [ ] Wire "Enquire" button → WhatsApp fallback (temporary until Phase 2)
- [ ] Add vendor waitlist Google Form link in vendor dashboard
- [ ] Replace admin revenue chart (stock photo) with gifted-charts component + placeholder data
- [ ] Fix all console warnings (shadow* props, pointerEvents)

### Phase 1 — Foundation: Supabase + Auth (Weeks 2–6)
- [ ] Create Supabase project, run full schema migration
- [ ] Set up all RLS policies
- [ ] Customer auth screen: phone OTP via Supabase + MSG91
- [ ] Vendor auth screen: email + password
- [ ] Admin auth: email + password with role check
- [ ] Session persistence: Expo SecureStore on mobile
- [ ] Replace `data/vendorData.ts` with live Supabase queries in VendorsListing
- [ ] Replace static vendors in VendorsProfile with Supabase fetch
- [ ] Replace in-memory FavoritesContext with `favorites` table sync
- [ ] Customer profile: real user data from `users` table
- [ ] Supabase Realtime: notification badge live updates

### Phase 2 — Customer Core Flows (Weeks 7–10)
- [ ] Enquiry modal: form → DB write → MSG91 WhatsApp alert to vendor
- [ ] Booking flow: date picker → confirmation → DB write
- [ ] Real booking list with status management
- [ ] Review submission (gated to completed bookings)
- [ ] DB trigger for vendor rating auto-update
- [ ] Server-side search with PostgreSQL full-text search
- [ ] Favorites persistence across sessions
- [ ] Profile view counter increment

### Phase 3 — Vendor Operations (Weeks 11–14)
- [ ] Vendor onboarding wizard (8 steps)
- [ ] Cloudinary portfolio upload
- [ ] Vendor dashboard real stats
- [ ] Vendor enquiries tab with WhatsApp reply
- [ ] Vendor bookings tab: accept/complete/decline
- [ ] Vendor availability calendar
- [ ] Profile management: all 8 sections editable
- [ ] Razorpay subscription checkout via Edge Function
- [ ] Subscription enforcement in vendor listings

### Phase 4 — Admin + Payments (Weeks 15–18)
- [ ] All admin metrics: real Supabase queries
- [ ] Real revenue chart: gifted-charts + payments data
- [ ] Razorpay webhook handler Edge Function
- [ ] Admin: approve/suspend/reinstate vendor
- [ ] Admin: subscription management + overrides
- [ ] Admin: payments view with export
- [ ] Admin: reviews moderation
- [ ] Expo Push + FCM setup
- [ ] Firebase Crashlytics integration
- [ ] PostHog analytics events

### Phase 5 — Polish + Launch (Weeks 19–22)
- [ ] Google Maps: vendor location, nearby search, address autocomplete
- [ ] Resend email templates for all transactional emails
- [ ] EAS Build: Android APK + iOS IPA
- [ ] EAS Update: OTA patch pipeline
- [ ] Play Store submission (takes 3–7 days)
- [ ] App Store submission (takes 1–3 days)
- [ ] Admin web dashboard: React + Vite + Tailwind → Vercel
- [ ] Load testing: simulate 500 concurrent users on Supabase free tier
- [ ] 50 real vendors onboarded pre-launch

---

## 13. Security & Compliance

| Concern | Solution |
|---|---|
| Vendor phone privacy | Phone never in API response — WhatsApp link generated server-side after enquiry creation |
| Razorpay security | Orders created by Edge Function only — client never touches API secret |
| Cloudinary security | Signed upload presets — unsigned uploads blocked in dashboard settings |
| Admin access | Role enforced at both DB (RLS with service role) and app route guard level |
| OTP brute force | Supabase built-in rate limiting on phone auth (5 attempts/hour) |
| Data isolation | RLS ensures vendor A cannot read enquiries sent to vendor B |
| PII protection | Customer phone stored in `users` only — vendors access via enquiry context only |
| Webhook security | Verify Razorpay signature on every webhook before processing |
| SQL injection | Supabase JS client uses parameterized queries — no raw SQL in app |

### Required Legal Pages (Play Store Requirement)
- Privacy Policy: explain what data is collected (phone, location, photos)
- Terms of Service: vendor subscription terms, cancellation policy, refund policy
- Host at: `https://shaadividors.in/privacy` and `/terms`

---

## 14. Launch Checklist

### Must Complete Before Go-Live
- [ ] 50 real verified vendors onboarded and active
- [ ] Android Play Store developer account created
- [ ] Play Store listing approved (takes 3–7 days for first app)
- [ ] Razorpay KYC completed (2–3 business days, requires GST/PAN)
- [ ] MSG91 WhatsApp Business API approved (**takes 2–3 weeks — start day 1**)
- [ ] Privacy Policy + Terms of Service live at public URL
- [ ] Support WhatsApp number active and monitored daily
- [ ] Firebase Crashlytics verified working in production build
- [ ] All 3 role logins tested end-to-end on real Android device
- [ ] Razorpay test payments → production payments mode switched

### Minimum Viable PostHog Events
| Event Name | Trigger |
|---|---|
| `screen_view` | Every navigation |
| `vendor_searched` | Search submitted |
| `vendor_profile_opened` | VendorsProfile mounted |
| `enquiry_started` | Enquiry modal opened |
| `enquiry_sent` | Enquiry form submitted |
| `favorite_toggled` | Heart tapped |
| `booking_created` | Booking confirmed |
| `vendor_signup_started` | Vendor onboarding step 1 |
| `vendor_signup_completed` | Onboarding wizard submitted |
| `subscription_checkout_started` | Razorpay checkout opened |
| `subscription_paid` | Webhook: payment.captured |

---

## 15. Cost Estimate

### Monthly Costs at Launch (~100 vendors, ~500 customers)

| Service | Free Tier | Est. Monthly Cost |
|---|---|---|
| Supabase | 500MB DB, 2GB storage | Free |
| Cloudinary | 25GB storage + 25GB bandwidth | Free |
| PostHog | 1M events/month | Free |
| Resend | 3,000 emails/month | Free |
| Firebase Crashlytics | Always free | Free |
| Google Maps | $200/month credit | Free (within credit) |
| Expo EAS Build | 30 builds/month free | Free or Rs.1,700/mo |
| MSG91 OTP | Rs.0.15–0.25 per OTP | ~Rs.500–1,500/mo |
| Razorpay | No monthly fee | 2% per transaction |

**Total estimated Month 1: Rs.500–3,200/month**

### Cost at Scale (~1,000 vendors, ~5,000 customers)

| Service | Est. Monthly Cost |
|---|---|
| Supabase Pro | Rs.2,000/mo |
| Cloudinary | Rs.3,000/mo |
| PostHog | Rs.1,500/mo |
| MSG91 | Rs.5,000/mo |
| Google Maps | Rs.2,000/mo |
| Resend | Rs.800/mo |
| Expo EAS | Rs.1,700/mo |
| **Total** | **~Rs.16,000/mo** |

At Rs.16,000/mo costs and Rs.999 avg subscription: break-even at **17 paying vendors**.

---

*ShaadiVendors PRD v1.0 — July 2026*
*Prepared for internal development team. Confidential.*
*The mobile UI is production-quality and complete across all 3 dashboards.*
*All remaining work is backend integration, authentication, and payments.*
