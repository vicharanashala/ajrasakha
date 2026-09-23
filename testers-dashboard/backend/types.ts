// Symbol.for(...) returns the exact same process-wide Symbol for a given string no matter
// which file calls it, so these resolve to the identical tokens backend's own CORE_TYPES uses
// for the same bindings - this file exists so this package needs no import into backend/src
// at all for its own DI wiring.
export const DASHBOARD_TYPES = {
  TestersDashboardController: Symbol.for('TestersDashboardController'),
  ZohoTicketStatusController: Symbol.for('ZohoTicketStatusController'),
  TestersDashboardService: Symbol.for('TestersDashboardService'),
  ZohoTicketStatusService: Symbol.for('ZohoTicketStatusService'),
  TesterLogController: Symbol.for('TesterLogController'),
  TesterLogService: Symbol.for('TesterLogService'),
};
