# Seekv8

Multi-game web app built with React + Vite, powered by Firebase.

Current implemented game:
- Binary Search Guessing Game

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Firebase Cloud Functions (callable)
- Database: Cloud Firestore
- Auth: Firebase Anonymous Auth
- Hosting: Firebase Hosting

## Prerequisites

- Node.js 20+ (Node 22 recommended)
- npm
- Firebase CLI (`firebase-tools`)

## Local Setup

1. Install dependencies:
```bash
npm install
cd functions && npm install && cd ..
```

2. Configure environment:
```bash
cp .env.example .env
```

Fill `.env` with your Firebase web app config values.

3. Ensure Firebase is configured:
- Add project aliases in `.firebaserc` (`dev`, `prod`)
- Enable Anonymous Auth, Firestore, Functions, Hosting in Firebase console

## Run Locally

```bash
npm run dev
```

App runs on:
- `http://127.0.0.1:5173/`

## Build

```bash
npm run build
```


## Testing

Run unit/UI tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run Firestore rules tests (uses Firestore emulator):
```bash
npm run test:rules
```

## Project Structure

```txt
src/
  app/                 # app shell, routing, game registry
  components/          # reusable UI components
  firebase/            # firebase client + store wrappers
  games/               # pure game logic
  pages/               # route pages
  test/                # test setup
functions/
  src/                 # cloud functions source
```

## Notes

- Score-critical game writes are handled through Cloud Functions.
- Firestore rules block direct client writes to sessions, bestScores, and leaderboard entries.

## Git Branch Policy

- `main`: production branch. Merges here trigger production deploy workflow (with environment approval gate).
- `develop`: integration branch. Merges here trigger automatic deploy to dev.
- `feat/<name>` and `fix/<name>`: day-to-day work branches created from `develop`.
- `hotfix/<name>`: urgent production fixes created from `main`.

### Day-to-day flow

1. Create branch from `develop`:
```bash
git checkout develop
git pull
git checkout -b feat/<name>
```
2. Push branch and open PR to `develop`.
3. Merge only after CI is green.
4. Merge to `develop` auto-deploys to dev.

### Release flow

1. Open PR from `develop` to `main`.
2. Merge after CI checks pass and reviews are complete.
3. Production deploy job starts and waits for `production` environment approval.

### Hotfix flow

1. Branch from `main`:
```bash
git checkout main
git pull
git checkout -b hotfix/<name>
```
2. Open PR to `main` and merge after CI.
3. Open PR from `main` back to `develop` to keep branches in sync.

### Tag production releases

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```
