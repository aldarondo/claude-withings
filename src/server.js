/**
 * claude-withings MCP server factory.
 * Call createServer() to get a configured Server instance without a transport.
 *
 * Supported devices: Withings scale (body composition) and blood pressure monitor.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getMeasurements,
  getHeartData,
  formatMeasurements,
  formatTrendSummary,
} from './api.js';
import { storeMemory } from './memory.js';
import { DEFAULT_USER } from './auth.js';
import { runBackfill } from './backfill.js';

const USER_PROP = {
  user: {
    type: 'string',
    description: `Withings account user name (default: "${DEFAULT_USER}"). Other family members must first authorize at the server's web UI.`,
  },
};

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
        name: 'get_heart_rate',
        description: 'Get heart rate measurements from Withings blood pressure monitor.',
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
        description: 'Compare weight this week vs last week.',
        inputSchema: {
          type: 'object',
          properties: { ...USER_PROP },
          required: [],
        },
      },
      {
        name: 'backfill_to_memory',
        description: 'Fetch historical Withings data and build monthly summaries (weight, body composition, heart rate stats). Stores to the configured memory server if set; otherwise returns a report.',
        inputSchema: {
          type: 'object',
          properties: {
            years: {
              type: 'number',
              description: 'How many years of history to backfill (default: 5)',
            },
            dry_run: {
              type: 'boolean',
              description: 'If true, fetch and format data but do not write to memory (default: false)',
            },
            ...USER_PROP,
          },
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
          storeMemory(`Withings weight (${user}, last ${sinceDays}d): ${text}`, 'weight').catch(() => {});
          return { content: [{ type: 'text', text }] };
        }

        case 'get_heart_rate': {
          const sinceDays = args?.since_days ?? 7;
          const startdate = Math.floor((Date.now() - sinceDays * 86400_000) / 1000);
          const body = await getHeartData({ startdate }, user);
          const text = JSON.stringify(body, null, 2);
          storeMemory(`Withings heart rate (${user}, last ${sinceDays}d): ${text}`, 'heart_rate').catch(() => {});
          return { content: [{ type: 'text', text }] };
        }

        case 'trend_summary': {
          const now = Math.floor(Date.now() / 1000);
          const oneWeek  = 7 * 86400;
          const twoWeeks = 14 * 86400;
          const [thisWeekMeas, lastWeekMeas] = await Promise.all([
            getMeasurements({ lastupdate: now - oneWeek }, user),
            getMeasurements({ lastupdate: now - twoWeeks }, user),
          ]);
          const text = formatTrendSummary(thisWeekMeas, lastWeekMeas);
          return { content: [{ type: 'text', text }] };
        }

        case 'backfill_to_memory': {
          const years  = args?.years ?? 5;
          const dryRun = args?.dry_run ?? false;
          const { summary, results } = await runBackfill({ user, years, dryRun });
          const detail = results.map(
            (r) => `  ${r.month}: ${r.bodyCount} body, ${r.heartCount} HR`
          ).join('\n');
          return { content: [{ type: 'text', text: `${summary}\n\n${detail}` }] };
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
