#!/usr/bin/env node

/**
 * Initialize MongoDB Replica Set
 * This script connects to a running MongoDB instance and initializes it as a single-node replica set
 *
 * Usage: node init-replica-set.mjs
 */

import { MongoClient } from 'mongodb';

const mongoUrl = 'mongodb://127.0.0.1:27018/?directConnection=true';
const replicaSetName = 'ajra-rs';

async function initializeReplicaSet() {
  let client;

  try {
    console.log('[replica-set-init] Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();

    const admin = client.db('admin').admin();
    const status = await admin.command({ replSetGetStatus: 1 }).catch(() => null);

    if (status) {
      console.log('[replica-set-init] ✓ Replica set already initialized');
      console.log('[replica-set-init] Status:', {
        ok: status.ok,
        set: status.set,
        me: status.me,
        members: status.members.map(m => ({ name: m.name, state: m.stateStr }))
      });
      return;
    }

    // Replica set not initialized, initialize it
    console.log(`[replica-set-init] Initializing replica set: ${replicaSetName}`);

    const result = await admin.command({
      replSetInitiate: {
        _id: replicaSetName,
        members: [
          {
            _id: 0,
            host: '127.0.0.1:27018'
          }
        ]
      }
    });

    console.log('[replica-set-init] ✓ Replica set initialized:', result.ok === 1 ? 'SUCCESS' : 'FAILED');

    // Wait a moment for the replica set to become ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify status
    const newStatus = await admin.command({ replSetGetStatus: 1 });
    console.log('[replica-set-init] Updated status:', {
      ok: newStatus.ok,
      set: newStatus.set,
      me: newStatus.me,
      members: newStatus.members.map(m => ({ name: m.name, state: m.stateStr }))
    });

  } catch (error) {
    console.error('[replica-set-init] ERROR:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('[replica-set-init] MongoDB is not listening on 127.0.0.1:27018');
      console.error('[replica-set-init] Start MongoDB first using: mongod --port 27018 --bind_ip 127.0.0.1 --dbpath C:\\Users\\sanno\\.ajra-local-mongo\\db');
    }
    process.exit(1);
  } finally {
    await client?.close();
  }
}

initializeReplicaSet();
