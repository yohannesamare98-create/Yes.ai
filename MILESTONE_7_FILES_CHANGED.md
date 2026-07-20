# MILESTONE_7_FILES_CHANGED.md

Matches the format of `MILESTONE_6A_FILES_CHANGED.md` for consistency.

## Added (10 files)

```
database/migrations/20260719_milestone7_billing.sql
backend/config/planConfig.js
backend/services/usageService.js
backend/services/paymentProviders/index.js
backend/services/paymentProviders/stripeProvider.js
backend/services/paymentProviders/paytabsProvider.js
backend/services/paymentProviders/applePayProvider.js
backend/services/paymentProviders/googlePayProvider.js
backend/routes/billingRoutes.js
CHANGELOG_MILESTONE_7.md, TEST_GUIDE_MILESTONE_7.md, MILESTONE_7_FILES_CHANGED.md (this file)
```

## Changed (3 files, all additive)

```
backend/server.js                — +2 lines (import + mount billingRoutes)
admin-dashboard/index.html       — removed stale hardcoded plan-price map, added MRR/ARR summary + usage column
client-dashboard/index.html      — extended existing Billing tab (usage bar, upgrade/downgrade/resume, payment history)
```

## Explicitly NOT touched (verified by diff against the uploaded project ZIP)

```
backend/lib/botEngine.js
backend/routes/testAiRoutes.js
backend/routes/stripeRoutes.js       (existing checkout/webhook/cancel — read, not modified)
backend/lib/stripeClient.js          (wrapped by stripeProvider.js, not edited)
backend/routes/clientRoutes.js
backend/routes/whatsappWebhook.js
backend/middleware/auth.js           (reused as-is)
client-dashboard/test-ai.html
database/migrations/20260718_intelligence_engine.sql
landing/*
```

## The one integration point for whoever owns the AI engine

`backend/services/usageService.js` exports `recordConversationUsage({ clientId, leadId })`.
After a successful AI reply is generated (wherever that happens once
Milestone 6A lands), call:

```js
import { recordConversationUsage } from '../services/usageService.js';
await recordConversationUsage({ clientId, leadId });
```

That is the entire surface area. Nothing else needs to change in the AI
engine for usage tracking to start working.
