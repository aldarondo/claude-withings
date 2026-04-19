#!/usr/bin/env node
/**
 * claude-withings MCP Server — stdio entry point.
 * Pulls health data from the Withings API.
 *
 * Env vars required:
 *   WITHINGS_CLIENT_ID       - OAuth2 app client ID
 *   WITHINGS_CLIENT_SECRET   - OAuth2 app client secret
 *   WITHINGS_ACCESS_TOKEN    - Current access token
 *   WITHINGS_REFRESH_TOKEN   - Refresh token (auto-rotated)
 *   WITHINGS_TOKEN_EXPIRES_AT - Unix ms timestamp of access token expiry
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('claude-withings MCP server running');
