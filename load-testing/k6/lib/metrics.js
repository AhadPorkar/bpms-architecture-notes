// Business-transaction metrics. HTTP timings tell you which request was slow;
// these tell you what the *user* waited for (several requests per click).

import { Trend, Rate } from 'k6/metrics';

/** Duration of a whole business transaction in ms, tagged with tx=<name>. */
export const txDuration = new Trend('tx_duration', true);

/** Share of failed business transactions, tagged with tx=<name>. */
export const txFailed = new Rate('tx_failed');
