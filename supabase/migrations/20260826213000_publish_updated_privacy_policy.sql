update public.application_settings
set value = jsonb_build_object('content', $privacy$
# RoyalLagn Privacy Policy

RoyalLagn is a wedding-vendor discovery and marketplace platform. This Privacy Policy explains how we collect, use, share, store, and protect information when you use the RoyalLagn app, website, and related services.

## 1. Information We Collect

Depending on how you use RoyalLagn, we may collect:

* Name, email address, phone number, profile image, and account information
* Favourites, reviews, ratings, enquiries, event details, and other content you submit
* Vendor business information, services, packages, pricing, contact details, portfolio media, and verification documents
* Photos, videos, and documents you choose to upload
* Vendor subscription and transaction information
* App activity such as searches, profile views, Clip interactions, favourites, and enquiries
* Device information, push notification token, IP address, and security or diagnostic information

### Location

If you use **Near Me** and grant permission, we may temporarily use your device location to show nearby Vendors and calculate distance.

Location permission is optional. You can manually select a city or area instead.

## 2. How We Use Information

We use information to:

* Create and secure accounts
* Operate Vendor listings and profiles
* Provide search and nearby Vendor discovery
* Manage favourites, reviews, Clips, and enquiries
* Connect users with selected Vendors
* Process Vendor subscriptions and payments
* Send notifications and provide support
* Prevent fraud, abuse, and security incidents
* Improve RoyalLagn
* Meet legal, tax, accounting, and regulatory requirements

## 3. Sharing of Information

Vendor profiles, portfolios, pricing, reviews, and other information intended for publication may be visible to RoyalLagn users.

When you send an enquiry, relevant contact, event, and enquiry information may be shared with the Vendor you select.

RoyalLagn uses service providers including:

* **Supabase** for authentication, database, and backend services
* **Cloudinary** for image, video, and document hosting
* **Razorpay** for supported Vendor payments
* **Expo** for push notifications
* Device and location services for features you choose to use

These providers may process information as necessary to provide their services and in accordance with applicable privacy and security requirements.

RoyalLagn does **not sell personal information or use it for cross-app behavioural advertising.**

## 4. Payments

Vendor payments may be processed through **Razorpay**.

Razorpay may process payment information required to complete a transaction.

Sensitive payment credentials such as full card details, CVV, UPI PIN, or banking passwords are handled by Razorpay and are not intended to be stored by RoyalLagn.

RoyalLagn may retain payment references, transaction status, and financial records where required for accounting, tax, fraud prevention, disputes, or legal compliance.

## 5. Permissions and Your Choices

RoyalLagn may request permission for:

* **Location** — for optional Near Me functionality
* **Photos and Media** — when you choose to upload content
* **Notifications** — for app notifications

You may deny or disable these permissions through your device settings.

You may also update your profile, manage favourites and reviews, select your location manually, and log out.

## 6. Account and Data Deletion

You may request deletion of your RoyalLagn account and associated personal information.

Account deletion can be initiated from:

**RoyalLagn App → Settings → Account → Delete Account**

You can also request account deletion through:

**https://www.royallagn.com/account-deletion**

After a deletion request is submitted, RoyalLagn may verify the request before processing it.

We will delete or anonymize associated personal information unless certain records must be retained for legal, tax, payment, fraud-prevention, security, or dispute-resolution purposes.

For privacy or deletion assistance, contact:

**royallagnsupport@gmail.com**

## 7. Security and Retention

We use reasonable technical and organizational safeguards to protect information, including secure authentication, encrypted connections, access controls, and database security measures.

However, no online service can guarantee absolute security.

We retain information only for as long as reasonably necessary to operate RoyalLagn, provide services, meet legal obligations, maintain financial records, prevent fraud, and resolve disputes.

## 8. Children’s Privacy

RoyalLagn is intended for users **18 years of age or older** and is not designed as a service for children.

If you believe a child has provided personal information to RoyalLagn, contact:

**royallagnsupport@gmail.com**

## 9. Changes to This Policy

We may update this Privacy Policy when RoyalLagn, our services, legal requirements, service providers, or data practices change.

The latest version will be available through the RoyalLagn app and website.

## 10. Contact Us

**RoyalLagn**
At Post – Sate, Taluka Maval, District Pune, Maharashtra – 412106, India

**Website:** https://royallagn.com/
**Support:** royallagnsupport@gmail.com
**Privacy:** royallagnsupport@gmail.com
**Legal/IP Notices:** royallagn@gmail.com
$privacy$),
    updated_at = now()
where key = 'privacy_policy';
