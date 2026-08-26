update public.application_settings
set value = jsonb_build_object('content', $terms$
# RoyalLagn Terms & Conditions

These Terms & Conditions govern your use of the RoyalLagn mobile app, website, and related services.

By accessing RoyalLagn, creating an account, registering as a Vendor, submitting content, or purchasing a Vendor plan, you agree to these Terms & Conditions.

## 1. About RoyalLagn

RoyalLagn is a wedding-vendor discovery, listing, and enquiry platform.

RoyalLagn helps users discover and contact independent wedding Vendors.

RoyalLagn does not itself provide the wedding services offered by Vendors and is generally not a party to agreements, bookings, quotations, payments, cancellations, or disputes between users and Vendors.

Users should independently verify a Vendor before making any booking or payment.

## 2. Accounts

You must provide accurate and current information when creating or managing an account.

You are responsible for keeping your password, email account, verification codes, and device access secure.

You must not:

* Impersonate another person or business
* Create fraudulent accounts
* Use another person's information without permission
* Share unauthorized administrative access
* Use RoyalLagn for unlawful purposes

RoyalLagn is intended for users aged 18 years or older.

## 3. Vendor Accounts and Listings

Vendors are responsible for ensuring that their business information is accurate, lawful, and not misleading.

This includes:

* Business identity and contact information
* Services and availability
* Locations and service areas
* Packages and pricing
* Photos, videos, and portfolio content
* Required business permissions or registrations

Submitting a Vendor application does not guarantee approval, verification, enquiries, bookings, ranking, promotion, or revenue.

RoyalLagn may review, verify, reject, restrict, suspend, or remove a Vendor listing where reasonably necessary for security, accuracy, policy enforcement, or legal compliance.

A RoyalLagn verification badge does not guarantee the quality, availability, legality, or performance of a Vendor's services.

## 4. Enquiries, Reviews and Content

Users may contact Vendors using RoyalLagn enquiries or supported external services such as phone, WhatsApp, email, or maps.

RoyalLagn cannot guarantee that a Vendor will respond or that a booking or transaction will occur.

Reviews must represent genuine opinions or experiences and must not contain:

* False or misleading claims
* Spam or advertisements
* Harassment or threats
* Illegal or discriminatory material
* Excessive personal information
* Copyrighted material used without permission

RoyalLagn may moderate or remove inappropriate content.

You retain ownership of content you upload.

By submitting content to RoyalLagn, you give RoyalLagn a non-exclusive, royalty-free licence to store, process, resize, display, publish, and distribute that content as reasonably necessary to operate, secure, promote, and improve RoyalLagn.

You must have the necessary rights or permission to upload the content you submit.

## 5. Vendor Plans and Payments

RoyalLagn may offer Free, Premium, Elite, or other Vendor plans.

Available prices, features, limits, and subscription periods are those displayed when the Vendor selects a plan.

Supported Vendor payments may be processed through Razorpay.

Sensitive payment credentials such as card numbers, CVV, UPI PINs, or banking passwords are processed by Razorpay and are not intended to be stored by RoyalLagn.

RoyalLagn may verify a payment before activating a paid plan.

Failed, incomplete, reversed, fraudulent, or unverified payments may not activate Vendor access.

### Renewal

RoyalLagn's currently supported Vendor subscription flow does not automatically renew through Razorpay.

When a paid period expires, the Vendor must initiate a new payment to renew unless RoyalLagn introduces and clearly discloses another renewal method.

### Cancellation

Where cancellation is available, cancelling a Vendor plan normally allows access until the end of the already-paid subscription period.

Cancellation does not automatically create a right to a refund.

Any applicable refund rights or refund process will be handled according to applicable law and any refund terms presented by RoyalLagn.

## 6. Prohibited Use

You must not:

* Provide fraudulent or misleading information
* Impersonate another person or Vendor
* Upload illegal or infringing content
* Manipulate reviews, ratings, views, or enquiries
* Spam or harass users
* Upload malware
* Attempt unauthorized access
* Circumvent security or subscription restrictions
* Scrape or systematically extract RoyalLagn data without permission
* Use RoyalLagn for unlawful activities

## 7. Suspension and Account Termination

RoyalLagn may restrict, suspend, or terminate accounts, listings, content, or Vendor access where reasonably necessary because of:

* Violation of these Terms & Conditions
* Fraud or payment abuse
* Misleading Vendor information
* Security risks
* Harassment or abuse
* Intellectual-property infringement
* Illegal activity
* Legal or regulatory requirements

Where appropriate, RoyalLagn may provide an opportunity to correct an issue before taking action.

## 8. Intellectual Property

RoyalLagn owns or has rights to the RoyalLagn platform, software, design, branding, logo, interface, and original platform materials.

You may not copy, reproduce, misuse, or commercially exploit RoyalLagn's branding or platform materials without permission.

Users and Vendors retain ownership of their own original content.

For intellectual-property concerns, contact:

royallagn@gmail.com

## 9. Third-Party Services

RoyalLagn may use third-party services including Supabase, Cloudinary, Razorpay, Expo, device location services, WhatsApp, phone, email, and mapping applications.

Third-party services are governed by their own terms and privacy practices.

RoyalLagn is not responsible for the independent operation or availability of third-party services except where responsibility cannot legally be excluded.

## 10. Disclaimer and Liability

RoyalLagn provides the platform based on its current availability.

RoyalLagn does not guarantee:

* Continuous or error-free availability
* Vendor quality or performance
* Accuracy of every Vendor listing
* Vendor availability
* Any specific number of enquiries or bookings
* Business revenue or results
* Completion of communications with Vendors

Disputes relating to Vendor services, bookings, quality, quotations, delivery, cancellation, or payments made directly between a user and Vendor should ordinarily be resolved between those parties.

Nothing in these Terms & Conditions removes rights or protections that cannot legally be excluded under applicable law.

## 11. Privacy and Account Deletion

RoyalLagn handles personal information according to the RoyalLagn Privacy Policy available through the RoyalLagn website and app.

Users can request account deletion through the app or at:

https://www.royallagn.com/account-deletion

Some records may be retained where required for legal, tax, payment, fraud-prevention, security, or dispute-resolution purposes.

## 12. Changes to These Terms

RoyalLagn may update these Terms & Conditions when its services, features, legal requirements, or business practices change.

The latest version will be made available through the RoyalLagn app or website.

Continued use of RoyalLagn after updated Terms become applicable means you accept them to the extent permitted by law.

## 13. Governing Law

These Terms & Conditions are governed by the applicable laws of India.

Subject to any mandatory consumer or statutory rights, disputes relating to RoyalLagn will be subject to the jurisdiction of the appropriate courts in Pune, Maharashtra, India.

## 14. Contact Us

**RoyalLagn**
At Post – Sate, Taluka Maval, District Pune, Maharashtra – 412106, India

**Website:** https://royallagn.com/
**Support:** royallagnsupport@gmail.com
**Privacy:** royallagnsupport@gmail.com
**Legal/IP Notices:** royallagn@gmail.com
$terms$),
    updated_at = now()
where key = 'terms_and_conditions';
