# Kal-UKFinder — app

The Expo client. One source tree builds iOS, Android and the web app.

```bash
npm install
npm run web        # browser
npm start          # then 'a' / 'i', or scan the QR with Expo Go
npm run typecheck
```

The app talks to the Kal-UKFinder API, which must be running (`npm run server` from the repo root).

**API address resolution** (`src/lib/api.ts`):

1. `EXPO_PUBLIC_API_URL` if set — use this for a deployed backend.
2. Otherwise, on native, the host serving the Metro bundle on port 4000. A physical phone therefore picks
   up your laptop's LAN address rather than `localhost`, which on the device would mean the phone itself.
3. Otherwise `http://localhost:4000`.

## Routes

```
src/app/
├── (tabs)/          index (Briefing) · jobs · policy · coach · profile
├── (auth)/          sign-in · sign-up · forgot-password
├── item/[id]        briefing detail
├── job/[id]         vacancy detail — requirements, closing date, apply
├── cv-review        paste a CV, get scored feedback
├── interview        interview plan + practice panel
├── saved            bookmarked vacancies and briefings
├── sources          the trusted-source register
└── onboarding       first-run topic and notification setup
```

## Accounts

Browsing is open to everyone. Saving, the coach and notifications need an account.

An anonymous user record is created on first launch and its id kept in `AsyncStorage`. Registering
**upgrades that same record** rather than creating a second one, so saved items and coach history survive
signing up. The session token lives in the Keychain / Android Keystore via `expo-secure-store`; on web,
where SecureStore has no implementation, it falls back to `AsyncStorage` — which is why tokens are
short-lived and revocable server-side.

`src/lib/session.tsx` owns all of this: bootstrap, sign in/up/out, transparent token refresh on a 401, and
profile updates.

## Styling — two layers, on purpose

pr.md §21 asks for GlueStack UI on the new screens and explicitly *not* a rewrite of the existing ones, so
both coexist:

| Layer | Where | Used by |
| --- | --- | --- |
| **GlueStack UI + NativeWind** — `src/components/ui/gs/` | headless `@gluestack-ui/*` behaviour, NativeWind classes for style | auth screens, Jobs, Policy, filter sheet, job and briefing cards |
| **Themed StyleSheet kit** — `src/components/ui/` | `Screen`, `Card`, `Chip`, `Button`, `TextField`, `SwitchRow`, states | Briefing, Coach, You, and the detail screens |

`tailwind.config.js` mirrors the tokens in `src/constants/theme.ts` and the admin panel's palette, so the
two layers are visually indistinguishable.

The GlueStack layer:

```
src/components/ui/gs/
├── button.tsx        createButton  — press state, disabled, accessibility roles
├── input.tsx         createInput + createFormControl — focus, invalid state, label/helper/error wiring
├── actionsheet.tsx   createActionsheet — focus trap, back button, inert background
├── primitives.tsx    Box · VStack · HStack · Text · Heading · Card · Badge · Chip · Spinner
└── screen.tsx        page shell, width-capped for the web build
```

`app/_layout.tsx` mounts `<OverlayProvider>` so the actionsheet can portal.

**Note:** GlueStack UI **v2** (per-component packages) is what works here. `@gluestack-ui/core@5` reaches
Adobe's `react-spectrum` transitively and cannot install on Windows — see the risks section of
[`docs/integration-plan.md`](../../docs/integration-plan.md).

See the root [README](../../README.md) for the API, the admin panel and the collection pipeline.
