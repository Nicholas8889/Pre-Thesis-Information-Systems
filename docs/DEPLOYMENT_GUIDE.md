# Deployment Guide - Vercel and Supabase

Updated: 19 July 2026

This guide explains how to deploy the CV Tajuk Revenue Cycle Information System MVP using GitHub, Vercel, and Supabase.

## Deployment Position

The project is a thesis MVP that can be run locally for demonstration and deployed to Vercel for online demo or limited company-side pilot review.

Current deployment target:

```text
GitHub repository -> Vercel web app -> Supabase PostgreSQL database
```

## Required Services

| Service | Purpose |
| --- | --- |
| GitHub | Stores the application source code and triggers deployment when changes are pushed. |
| Vercel | Builds and hosts the Next.js web application. |
| Supabase | Hosts the PostgreSQL database and private storage bucket for Customer PO documents. |

## Vercel Environment Variables

Open the Vercel project, then go to:

```text
Settings -> Environment Variables
```

Add these variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection string. |
| `DIRECT_URL` | Supabase PostgreSQL direct connection string. |
| `AUTH_SECRET` | Long random secret used for application session signing. |
| `SUPABASE_URL` | Supabase project URL, for example `https://PROJECT_REF.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-only service role key. |
| `SUPABASE_CUSTOMER_PO_BUCKET` | Storage bucket name, normally `customer PO-documents`. |

Apply the variables to:

```text
Production
Preview
Development
```

Do not commit real passwords, service role keys, or database URLs to GitHub.

## Supabase Connection String Rules

Use the Supabase connection string that starts with:

```text
postgresql://
```

Do not use the Supabase project URL for Prisma database access:

```text
https://PROJECT_REF.supabase.co
```

Recommended production-style setup:

| Variable | Recommended Value |
| --- | --- |
| `DATABASE_URL` | Pooled Supabase/Supavisor connection string. |
| `DIRECT_URL` | Direct Supabase database connection string. |

For a thesis demo or first deployment test, both variables can temporarily use the same direct connection string.

## Build Configuration

The build command is:

```bash
npm run build
```

The build script runs:

```bash
prisma generate && next build
```

This is required because Vercel must generate Prisma Client before Next.js performs TypeScript checks.

The app uses the default Next.js output folder:

```text
.next
```

Do not set a custom `distDir` for Vercel unless the Vercel output directory is changed to match it.

## Deployment Steps

1. Push the latest code to GitHub.
2. Open Vercel.
3. Import the GitHub repository if it is not already imported.
4. Add the environment variables listed above.
5. Deploy or redeploy the project.
6. If deployment fails, inspect the red error line near the bottom of the build log.
7. After Vercel shows Ready, open the generated URL and test login plus one end-to-end flow.

## Common Vercel Errors

| Error Message | Meaning | Fix |
| --- | --- | --- |
| `Missing required environment variable: DATABASE_URL` | Vercel does not have the Supabase database URL. | Add `DATABASE_URL` in Vercel Environment Variables. |
| `Prisma has no exported member ...GetPayload` | Prisma Client was not generated before the build. | Ensure `package.json` build is `prisma generate && next build`. |
| `The Next.js output directory ".next" was not found` | Next.js built into a different folder than Vercel expected. | Use the default `.next` folder; remove custom `distDir`. |
| Database connection timeout | Vercel cannot reach the database. | Check Supabase URL, password, SSL mode, pooled/direct connection choice, and Supabase project status. |

## Post-Deployment Smoke Test

After deployment succeeds:

1. Open the Vercel URL.
2. Login using a demo active account.
3. Open Dashboard.
4. Open Customer Inquiries.
5. Create one inquiry.
6. Convert it to Customer PO.
7. Confirm invoice, payment, Surat Jalan, and receivable pages load.
8. Confirm printable Invoice and Surat Jalan pages open.

## Login Troubleshooting

If the deployed login page does not work:

1. Confirm Vercel has `AUTH_SECRET`.
2. Use a long random value for `AUTH_SECRET`, at least 32 characters.
3. Confirm Vercel has `DATABASE_URL` and `DIRECT_URL`.
4. Confirm the Supabase database has the `User` table and at least one active user.
5. If the tables exist but demo users are missing, run:

```bash
npm run prisma:seed:users
```

Do not run the full `npm run prisma:seed` on a database that already contains real company test data unless you intentionally want to reset demo data.

## Security Notes

- Rotate the Supabase database password if it was ever pasted into chat, screenshots, or shared notes.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Do not add service role keys to any `NEXT_PUBLIC_` variable.
- Demo accounts are acceptable for thesis demonstration, but a real company rollout should review authentication, authorization, backup, logging, and operational ownership first.

## Readiness Rating

Current suggested status:

| Area | Rating | Notes |
| --- | ---: | --- |
| Thesis MVP | 84/100 | Strong process coverage and demo value. |
| Internal UMKM pilot | 74/100 | Suitable for controlled pilot after deployment and credential rotation. |
| Deployment readiness | 82/100 after Vercel Ready | Depends on Vercel environment variables and Supabase connectivity. |
| Production readiness | 60/100 | Needs security hardening, backup plan, and operational procedures. |
