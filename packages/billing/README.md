# @autoqa/billing

Business model and monetization system for AutoQA. Manage subscriptions, teams, analytics, and referrals.

## Features

- 💰 **Multi-Tier Pricing**: Free, Pro ($29/mo), Team ($99/mo), Enterprise (custom)
- 👥 **Team Collaboration**: Workspaces, RBAC, shared test library
- 🏢 **Enterprise Features**: SSO/SAML, audit logging, white-labeling, self-hosted
- 📊 **Analytics**: User tracking, conversion funnels, cohort analysis, A/B testing
- 🎁 **Referral Program**: Tiered commissions (10%-20%), automated payouts

## Installation

```bash
npm install @autoqa/billing
```

## Pricing Tiers

### Free Tier

- Open source core engine
- Unlimited local tests
- 1 user, 3 projects
- Community support

### Pro Tier - $29/month

- 1,000 cloud tests/month
- Advanced reporting
- Visual regression
- Self-healing tests
- Email support

### Team Tier - $99/month

- 10,000 tests/month
- 10 users, 50 projects
- Team collaboration
- RBAC
- Priority support
- Jira/Linear integration

### Enterprise Tier - Custom

- Unlimited everything
- Self-hosted deployment
- SSO/SAML
- Custom SLA
- Dedicated support
- White-labeling

## Usage

### Subscription Management

```typescript
import { SubscriptionManager, PricingTier } from '@autoqa/billing';

const manager = new SubscriptionManager();

// Create subscription with trial
const subscription = await manager.createSubscription(
  'user-123',
  PricingTier.PRO,
  14 // 14-day trial
);

// Upgrade subscription
await manager.upgradeSubscription(subscription.id, PricingTier.TEAM);

// Cancel subscription
await manager.cancelSubscription(subscription.id, false); // Cancel at period end

// Track usage
await manager.trackUsage(subscription.id, 500); // 500 tests executed
```

### Team Collaboration

```typescript
import {
  TeamCollaborationManager,
  UserRole,
  Permission,
} from '@autoqa/billing';

const teamManager = new TeamCollaborationManager();

// Create workspace
const workspace = await teamManager.createWorkspace('My Team', 'owner-123');

// Invite member
const member = await teamManager.inviteMember(
  workspace.id,
  'user-456',
  UserRole.MEMBER
);

// Check permissions
const canDelete = teamManager.hasPermission(member, Permission.TEST_DELETE);
const canInvite = teamManager.canPerformAction(member, 'invite_member');

// Update role
await teamManager.updateMemberRole(member.id, UserRole.ADMIN);
```

### Analytics Tracking

```typescript
import { AnalyticsTracker, ABTestManager } from '@autoqa/billing';

const analytics = new AnalyticsTracker();

// Track events
await analytics.track('user-123', 'test_created', {
  testName: 'Login flow',
  duration: 2500,
});

// Track conversion
await analytics.trackConversion('user-123', 'free', 'pro');

// Analyze funnel
const funnel = await analytics.analyzeFunnel('signup_funnel', [
  'page_view',
  'signup_started',
  'email_verified',
  'subscription_created',
]);

// A/B testing
const abTest = new ABTestManager();
const testId = await abTest.createTest('pricing_page', ['A', 'B']);
const variant = await abTest.assignVariant(testId, 'user-123');
```

### Referral Program

```typescript
import { ReferralManager } from '@autoqa/billing';

const referralManager = new ReferralManager();

// Generate referral code
const code = await referralManager.generateCode('user-123', 100); // Max 100 uses
console.log(code.code); // "AUTOQA-ABC123"

// Apply referral code
const referral = await referralManager.applyCode(
  'AUTOQA-ABC123',
  'new-user-456'
);

// Complete referral (when referred user subscribes)
await referralManager.completeReferral(referral.id, 29); // $29 subscription

// Get affiliate stats
const stats = await referralManager.getAffiliateStats('user-123');
console.log(`Total commission: $${stats.totalCommission}`);
console.log(`Pending payout: $${stats.pendingCommission}`);

// Process payout (minimum $50)
const payoutAmount = await referralManager.processPayout('user-123');
```

### Enterprise Features

```typescript
import { EnterpriseManager } from '@autoqa/billing';

const enterprise = new EnterpriseManager();

// Configure SSO
await enterprise.configureSSO('workspace-123', {
  provider: 'okta',
  entityId: 'https://example.okta.com',
  ssoUrl: 'https://example.okta.com/sso',
  certificate: '-----BEGIN CERTIFICATE-----...',
});

// Log audit event
await enterprise.logAudit({
  userId: 'user-123',
  action: 'test_deleted',
  resource: 'test-456',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  metadata: { testName: 'Login flow' },
});

// Enable white-labeling
await enterprise.enableWhiteLabeling('workspace-123', {
  logo: 'https://example.com/logo.png',
  primaryColor: '#FF6B6B',
  companyName: 'Acme Corp',
});
```

### Pricing Calculator

```typescript
import { PricingCalculator, PricingTier } from '@autoqa/billing';

// Calculate usage cost
const cost = PricingCalculator.calculateUsageCost(1500, PricingTier.PRO);
// $29 base + $25 overage (500 tests × $0.05) = $54

// Calculate annual savings
const savings = PricingCalculator.calculateAnnualSavings(PricingTier.PRO);
// $348 - $278 = $70 saved (20% discount)

// Check if can upgrade
const canUpgrade = PricingCalculator.canUpgrade(
  PricingTier.FREE,
  PricingTier.PRO
);
// true

// Check if over limit
const isOver = PricingCalculator.isOverLimit(
  { tests: 1500, users: 2, projects: 5 },
  PricingTier.PRO
);
// true (exceeded 1000 tests/month limit)
```

## Pricing Structure

| Feature                 | Free            | Pro     | Team     | Enterprise |
| ----------------------- | --------------- | ------- | -------- | ---------- |
| **Price**               | $0              | $29/mo  | $99/mo   | Custom     |
| **Tests/month**         | Unlimited local | 1,000   | 10,000   | Unlimited  |
| **Users**               | 1               | 1       | 10       | Unlimited  |
| **Projects**            | 3               | 10      | 50       | Unlimited  |
| **Parallel executions** | 1               | 3       | 10       | Unlimited  |
| **Retention**           | 7 days          | 30 days | 90 days  | 365 days   |
| **Support**             | Community       | Email   | Priority | Dedicated  |
| **SSO/SAML**            | ❌              | ❌      | ❌       | ✅         |
| **Self-hosted**         | ✅              | ❌      | ❌       | ✅         |
| **White-labeling**      | ❌              | ❌      | ❌       | ✅         |

## Referral Commission Tiers

- **Tier 1** (1-10 referrals): 10% commission
- **Tier 2** (11-50 referrals): 15% commission
- **Tier 3** (50+ referrals): 20% commission

Minimum payout: $50

## Role-Based Access Control

### Owner

- Full access to everything
- Billing management
- Team management

### Admin

- Create/update/delete tests
- Manage projects
- Invite/remove members
- View billing

### Member

- Create/update tests
- Execute tests
- View projects

### Viewer

- Read-only access
- View tests and results

## Testing

```bash
npm test
```

Property-based tests ensure:

- ✅ Billing calculations always accurate
- ✅ Tier limits enforced correctly
- ✅ RBAC prevents unauthorized access
- ✅ Commission calculations correct
- ✅ Subscription state transitions valid

## Examples

See [examples](./examples) directory for more:

- [Subscription lifecycle](./examples/subscription.ts)
- [Team collaboration](./examples/team.ts)
- [Analytics tracking](./examples/analytics.ts)
- [Referral program](./examples/referral.ts)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
