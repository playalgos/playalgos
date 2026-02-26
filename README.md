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

## Deploy

Deploy to dev:
```bash
npm run deploy:dev
```

Deploy to prod:
```bash
npm run deploy:prod
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
