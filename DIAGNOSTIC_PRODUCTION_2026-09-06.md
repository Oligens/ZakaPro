# ZakaPro — Diagnostic & Hardening 2026-09-06

## Verdict
The previous architecture was **not 100% production-safe** for the requested multi-tenant checkout flow. The repository already had good foundations (per-user SQL filters, per-app webhook field, public plan lookup, Neon/Vercel error handling), but the customer checkout was still simulated in the React client and the real SMS endpoint only understood platform subscription intents.

This branch closes the main gap by making merchant checkout server-authoritative.

## Findings
| Area | Before | After |
|---|---|---|
| App isolation | Good for authenticated dashboard queries; public plan lookup intentionally public | Checkout validates plan_id against the exact app_id |
| Dynamic plans | PostgreSQL plans existed and SDK snippets were plan-aware | Checkout amount is read from PostgreSQL; client cannot choose its own amount |
| Customer checkout | React Hub generated a fake SMS and immediately showed success | Public checkout creates a server-side checkout_payment_intents row |
| SMS validation | Platform intents matched by phone; merchant plans were not represented | Merchant intent is matched by reference + phone, then exact amount + name + phone are checked |
| Amount rule | Platform SMS flow accepted amounts greater than required | Exact equality is enforced for platform and merchant subscription flows |
| Duplicate processing | Reference uniqueness existed for subscription payments | Merchant intent has unique checkout reference and paid reference, plus row locking |
| Webhook | Frontend could dispatch a webhook using local state/global settings | Merchant activation dispatches the configured app webhook server-side using the app secret |
| Wallet destination | Public Hub contained hard-coded payment numbers | Wallets are loaded from the application's owner record |
| SDK security | Generated cURL exposed a prefix of the app secret | Secret is replaced by a placeholder |
| Database | Existing migrations were idempotent but lacked merchant checkout intent table | New idempotent migration + schema baseline added |

## Important architectural distinction

`subscription_payment_intents` remains the **ZakaPro platform subscription** flow (250/2500 HTG).

Merchant applications use `checkout_payment_intents`, because their prices are dynamic and belong to `plans.amount`.

This prevents a platform price constant from accidentally becoming the price of every merchant application.

## Changed components

- `api/apps/[appKey]/checkout.js`: creates a server-authoritative checkout intent and calculates totals from PostgreSQL.
- `api/apps/[appKey]/plans.js`: returns dynamic plans, zones and merchant payment destinations without exposing secrets.
- `api/sms.js`: handles merchant intents, exact amount validation, reference/phone/name checks, duplicate protection, persistence and server-side webhooks.
- `src/views/PublicHub.tsx`: new public checkout with no fake success state.
- `src/App.tsx`: routes the public Hub through the new implementation.
- `src/lib/generator.ts`: removes secret leakage and supports an absolute API base.
- `db/schema.sql`: adds checkout intent schema and unique references.
- `db/migrations/2026-09-06-*`: idempotent production migrations.

## Remaining deployment prerequisites

A repository inspection cannot prove a live Vercel deployment is green without executing the Vercel build/deployment environment. Before production activation:

1. Run the migrations in Neon in filename order.
2. Confirm DATABASE_URL, JWT_SECRET, SMS_LISTENER_SECRET, SMTP variables and merchant wallet data are present.
3. Replace the SDK API-base placeholder with the actual deployed ZakaPro domain.
4. Test exact amount, underpayment, overpayment, wrong phone, wrong name, wrong reference and duplicate reference.
5. Verify one successful merchant activation creates exactly one transaction, subscriber update, activation and delivery record, then one webhook event.

## Production conclusion

The critical trust boundary is now:

**app_key → PostgreSQL app → PostgreSQL plan → server-created checkout intent → SMS reference + phone → exact amount → activation → app webhook**

The browser is no longer trusted to decide the payable amount or to declare a successful payment.