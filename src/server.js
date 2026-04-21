/**
 * claude-withings MCP server factory.
 * Call createServer() to get a configured Server instance without a transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getMeasurements,
  getSleepSummary,
  getActivitySummary,
  getHeartData,
  formatMeasurements,
  formatTrendSummary,
} from './api.js';
import { storeMemory } from './memory.js';
import { DEFAULT_USER } from './auth.js';

const USER_PROP = {
  user: {
    type: 'string',
    description: `Withings account user name (default: "${DEFAULT_USER}"). Other family members must first run: node src/authorize.js --user <name>`,
  },
};

function dateToYmd(dateStr) {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

export function createServer() {
  const server = new Server(
    { name: 'claude-withings', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_weight',
        description: 'Get the latest weight and body composition measurement (weight, fat %, muscle mass, bone mass, hydration) from Withings scale.',
        inputSchema: {
          type: 'object',
          properties: {
            since_days: { type: 'number', description: 'Only return measurements from the last N days (default: 7)' },
            ...USER_PROP,
          },
          required: [],
        },
      },
      {
        name: 'get_sleep',
        description: 'Get sleep summary for a date range — total sleep, deep/REM/light breakdown, sleep score, wake-ups.',
        inputSchema: {
          type: 'object',
          properties: {
            startdate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
            enddate:   { type: 'string', description: 'End date in YYYY-MM-DD format' },
            ...USER_PROP,
          },
          required: ['startdate', 'enddate'],
        },
      },
      {
        name: 'get_activity',
        description: 'Get activity summary for a date range — steps, distance, calories, active calories, heart rate.',
        inputSchema: {
          type: 'object',
          properties: {
            startdate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
            enddate:   { type: 'string', description: 'End date in YYYY-MM-DD format' },
            ...USER_PROP,
          },
          required: ['startdate', 'enddate'],
        },
      },
      {
        name: 'get_heart_rate',
        description: 'Get heart rate measurements from Withings device.',
        inputSchema: {
          type: 'object',
          properties: {
            since_days: { type: 'number', description: 'Only return readings from the last N days (default: 7)' },
            ...USER_PROP,
          },
          required: [],
        },
      },
      {
        name: 'trend_summary',
        description: 'Compare this week vs last week: weight change, avg steps/day, avg active calories/day.',
        inputSchema: {
          type: 'object',
          properties: { ...USER_PROP },
          required: [],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const user = args?.user || DEFAULT_USER;
    try {
      switch (name) {
        case 'get_weight': {
          const sinceDays = args?.since_days ?? 7;
          const lastupdate = Math.floor((Date.now() - sinceDays * 86400_000) / 1000);
          const body = await getMeasurements({ lastupdate }, user);
          const text = formatMeasurements(body);
          storeMemory(`Withings measurements (${user}, last ${sinceDays}d): ${text}`, 'weight').catch(() => {});
          return { content: [{ type: 'text', text }] };
        }

        case 'get_sleep': {
          const body = await getSleepSummary({
            startdateymd: dateToYmd(args.startdate),
            enddateymd:   dateToYmd(args.enddate),
          }, user);
          return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
        }

        case 'get_activity': {
          const body = await getActivitySummary({
            startdateymd: dateToYmd(args.startdate),
            enddateymd:   dateToYmd(args.enddate),
          }, user);
          return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
        }

        case 'get_heart_rate': {
          const sinceDays = args?.since_days ?? 7;
          const startdate = Math.floor((Date.now() - sinceDays * 86400_000) / 1000);
          const body = await getHeartData({ startdate }, user);
          return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
        }

        case 'trend_summary': {
          const now = Math.floor(Date.now() / 1000);
          const oneWeek  = 7 * 86400;
          const twoWeeks = 14 * 86400;
          const ymd = (ts) => parseInt(new Date(ts * 1000).toISOString().slice(0, 10).replace(/-/g, ''), 10);
          const [thisWeekMeas, lastWeekMeas, thisActivity, lastActivity] = await Promise.all([
            getMeasurements({ lastupdate: now - oneWeek }, user),
            getMeasurements({ lastupdate: now - twoWeeks }, user),
            getActivitySummary({ startdateymd: ymd(now - oneWeek),  enddateymd: ymd(now) }, user),
            getActivitySummary({ startdateymd: ymd(now - twoWeeks), enddateymd: ymd(now - oneWeek) }, user),
          ]);
          const text = formatTrendSummary(thisWeekMeas, lastWeekMeas, thisActivity, lastActivity);
          return { content: [{ type: 'text', text }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}
