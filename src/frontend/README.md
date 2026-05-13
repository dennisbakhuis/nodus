# Nodus Technology Radar — Frontend

React 19 + Vite + TypeScript frontend for the Nodus Technology Radar webapp.

## Requirements

- Node.js 20+
- npm 9+
- Backend running at `http://localhost:8000` for API calls (see `src/backend/README.md`)

## Install

```bash
cd src/frontend
npm install
```

## Development

```bash
npm run dev
```

App available at `http://localhost:5173`. API calls to `/api/*` are proxied to `http://localhost:8000`.

## Build

```bash
npm run build
```

Output goes to `dist/`. Bundle sizes (approximate, gzipped):
- CSS: ~5 KB
- Main JS: ~227 KB (includes d3, react-router, jspdf)

## Test

Unit and component tests (Vitest):

```bash
npm test
# or watch mode:
npm run test:watch
```

E2E tests (Playwright — requires browsers installed):

```bash
npx playwright install
npm run test:e2e
```

## Type check

```bash
npx tsc --noEmit
```

## Lint and format

```bash
npm run lint
npm run format
# Format check only (no writes):
npm run format -- --check
```

Linting uses ESLint v10 with TypeScript and React Hooks plugins. Formatting uses Prettier.

## Generate API types

Requires the backend running (`uv run uvicorn app.main:app` in `src/backend/`):

```bash
npm run gen:api
```

Regenerates `src/api/generated.ts` from the live OpenAPI schema at `http://localhost:8000/openapi.json`.

## Stack

| Concern | Library |
|---------|---------|
| UI framework | React 19 |
| Build tool | Vite 8 |
| Routing | React Router v7 |
| Radar visualization | d3.js v7 |
| PDF export | jsPDF + svg2pdf.js |
| Unit/component tests | Vitest + Testing Library |
| E2E tests | Playwright |
| Formatting | Prettier |
| Linting | ESLint v10 + typescript-eslint |

## URL structure

| Route | View |
|-------|------|
| `/radar` | Interactive radar (180° semicircle default) |
| `/radar/:slug` | Radar with detail panel open |
| `/list` | List view (tabular) |
| `/manage` | Management landing |
| `/manage/technologies` | Registry browse |
| `/manage/technologies/:slug` | Factsheet editor |
| `/manage/nominate` | Nomination intake form |
| `/manage/cycles` | Cycle management |
