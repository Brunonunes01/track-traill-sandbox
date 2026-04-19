# Security Hardening Steps

## 1) Firebase Rules (Critical)

1. Open Firebase Console.
2. Apply [firebase.database.rules.json](/home/bruno/Projects/IA/Teste/Track-Traill/firebase.database.rules.json) in Realtime Database rules.
3. Apply [firebase.storage.rules](/home/bruno/Projects/IA/Teste/Track-Traill/firebase.storage.rules) in Storage rules.

## 2) Roles and Admin Access

- Do not assign `role` from client code.
- Manage admin access with Firebase Auth Custom Claims via Admin SDK / Cloud Functions only.
- Client-side admin actions should call secure backend endpoints.

### Cloud Functions (Admin Claims)

This project now includes:

- `setUserAdminClaim` (callable)
- `clearUserAdminClaim` (callable)

Deploy steps:

1. Install Firebase CLI (`npm i -g firebase-tools`).
2. In project root: `firebase login`.
3. Set bootstrap env for first admin in Functions runtime:
   - `firebase functions:config:set security.admin_bootstrap_emails=\"admin@seu-dominio.com\"`
   - Or set `ADMIN_BOOTSTRAP_EMAILS` in your CI/runtime for 2nd gen.
4. Install function deps:
   - `cd functions && npm install`
5. Deploy:
   - `cd .. && firebase deploy --only functions`

After first claim assignment, remove bootstrap emails from env/config.

## 3) Secrets

Configure these environment variables in EAS/CI and local `.env`:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_DATABASE_URL`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY`
- `EXPO_PUBLIC_GRAPHHOPPER_API_KEY`
- `EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION` (ex: `us-central1`)

Then restrict keys in provider consoles by app package/bundle and API scope.

## 4) Residual Risk

Client-side checks were hardened, but true authorization must be enforced by Firebase Rules and backend (Cloud Functions). Without rules, IDOR remains possible.
