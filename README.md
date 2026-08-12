# RoyalLagn

RoyalLagn is a cross-platform wedding-vendor marketplace with public customer, vendor, and admin/CRM surfaces built in Expo and backed by Supabase.

## Project documentation

- [PRD.md](PRD.md) — product scope, users, journeys, and outcomes
- [SRS.md](SRS.md) — functional and non-functional requirements
- [ARCHITECTURE.md](ARCHITECTURE.md) — system structure, data flows, integrations, and deployment
- [DESIGN.md](DESIGN.md) — visual and component system
- [AGENTS.md](AGENTS.md) — engineering conventions for coding agents

Files in [docs/archive/](docs/archive/) are historical references and are not current requirements.

## Get started

1. Install dependencies

   ```bash
   npm install --legacy-peer-deps
   ```

2. Start the app

   ```bash
   npm run start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Vendor workspace backend

The vendor dashboard reads live Supabase data. Apply the included migrations before testing signed-in vendor data:

```bash
npx supabase db push
```

Portfolio uploads are signed by Supabase Edge Functions. Store these as function secrets—never as `EXPO_PUBLIC_` variables:

```bash
npx supabase secrets set \
  CLOUDINARY_CLOUD_NAME=your-cloud-name \
  CLOUDINARY_API_KEY=your-api-key \
  CLOUDINARY_API_SECRET=your-api-secret
npx supabase functions deploy cloudinary-sign
npx supabase functions deploy cloudinary-delete
npx supabase functions deploy clip-upload-sign
npx supabase functions deploy clip-cloudinary-delete
npx supabase functions deploy profile-image
```

Uploaded portfolio assets use `royallagn/vendors/{vendorId}/albums/{albumId}/`. The app stores the secure URL, Cloudinary public ID, media type, display order, and album relationship in Supabase.

Vendor Clip deletion first removes the Cloudinary video and thumbnail, then
soft-deletes the owned database row. Public Clip queries only return approved,
public, unlocked rows whose `deleted_at` value is null, so a successfully deleted
Clip cannot reappear on the public Clips screen.

## Profile propagation verification

Run the fast source-level integration guard on every change:

```bash
npm run test:profile-smoke
```

For the authenticated database and Realtime test, add disposable staging accounts
to `.env` and run:

```bash
E2E_CUSTOMER_EMAIL=
E2E_CUSTOMER_PASSWORD=
E2E_VENDOR_EMAIL=
E2E_VENDOR_PASSWORD=
E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
npm run test:profile-e2e
```

The E2E test verifies customer-to-Admin propagation, atomic Vendor owner/business
updates, public and Admin Vendor visibility, and live Vendor profile-view updates.
It restores names after the run; the test Vendor receives one intentional profile view.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
