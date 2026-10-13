/**
 * Shared mock payloads for local Reports demo (Vite middleware).
 * Does not talk to Firebase or Redshift.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { getFinanceDashboard } = require(path.join(root, 'functions/financeReports/financeService.js'));

export function buildDemoUser({ allowReports = true } = {}) {
  return {
    uid: 'demo-finance-user',
    email: 'dale.demo@countrylion.co.uk',
    fullName: 'Dale Demo',
    isActive: true,
    portalsAccess: allowReports
      ? { master_admin: 'admin' }
      : { routes_app: 'driver' },
    featureAccess: allowReports
      ? { finance_reports: true, bonus_deductions: false }
      : { finance_reports: false, bonus_deductions: false },
  };
}

export async function getDemoFinancePayload(query = {}) {
  const data = await getFinanceDashboard({
    period: query.period || '12m',
    depot: query.depot || 'All',
    segment: query.segment || 'All',
    fromDate: query.from,
    toDate: query.to,
  });
  return { ok: true, data };
}
