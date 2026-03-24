# InspectPro Manager Dashboard Quick Guide (1-Page)

## Purpose
Use the dashboard to run morning operations quickly, identify risk early, and track fleet performance using shared InspectPro + Ironlog data.

## Open Dashboard
- URL: `http://localhost:3002/dashboard.html`
- Auto-refresh is set to 10 minutes.
- Use `Ctrl + F5` if recent UI updates are not visible.

## Morning Ops Check (5-10 minutes)
1. Review Executive Summary cards.
2. Check service reminders for overdue and due soon items.
3. Review Data Quality Alerts panel.
4. Review Weekly Trend (availability/utilization/uptime).
5. Review Operations (Daily), including Weighbridge Total and Product-Client breakdown.

## Filters and Focus
- Use status filter to isolate risk quickly.
- Use asset search to focus on specific machines.
- Filtered view also affects export output.

## Priority Interpretation
- **Overdue service:** highest maintenance risk today.
- **Due soon service:** plan action before shift rollover.
- **Low availability/utilization:** investigate downtime causes.
- **Data quality alerts:** fix source entries before decisions.

## Exports
- Use:
  - `Export KPI CSV`
  - `Export Service CSV`
- Export after applying filters for targeted reporting.

## Daily Decision Rhythm
- Morning: clear critical/overdue items first.
- Midday: recheck trend direction and open service risk.
- End of day: verify that major alerts were actioned.

## Weekly Leadership Snapshot
- Use Weekly Trend + KPI + Service Risk as your review pack.
- Highlight:
  - Top risk assets
  - Availability/utilization movement
  - Repeated failure patterns
  - Service backlog exposure

## Common Issues and Quick Fixes
- **No new data:** verify API/server is running, then refresh.
- **Unexpected numbers:** check Data Quality Alerts first.
- **UI stale:** hard refresh (`Ctrl + F5`) and confirm latest build loaded.

## Reference Docs
- Release and rollback: `RELEASE_CHECKLIST.md`
- LAN production operations: `LAN_PRODUCTION_CHECKLIST.md`

