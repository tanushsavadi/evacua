#!/usr/bin/env ts-node

/**
 * Fetch.ai Agent Startup Script
 * Run with: npm run agent
 */

import { runAgent } from '../lib/fetch-agent';

async function main() {
  console.log('\n🚀 Starting Fetch.ai Monitoring Agent...\n');
  
  try {
    await runAgent();
  } catch (error) {
    console.error('❌ Agent startup failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Agent shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Agent shutting down gracefully...');
  process.exit(0);
});

main();

