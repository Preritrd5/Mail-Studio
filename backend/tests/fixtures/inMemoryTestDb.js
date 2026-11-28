import crypto from 'node:crypto';

/**
 * Isolated test-only Supabase/PostgreSQL mock client and fixture factory.
 * Strictly reserved for automated tests under backend/tests/ with NODE_ENV === 'test'.
 * Never imported by backend/src/ production runtime code.
 */
export function createTestFixturesState(seedMode = 'empty') {
  const now = Date.now();
  const baseWorkerState = {
    id: '00000000-0000-0000-0000-000000000001',
    worker_id: 'unassigned',
    lock_generation: 1,
    worker_status: 'idle',
    heartbeat_at: new Date(now).toISOString(),
    next_send_allowed_at: new Date(now).toISOString(),
    last_attempt_completed_at: null,
    current_campaign_id: null,
    current_recipient_id: null,
    current_attempt_id: null,
    updated_at: new Date(now).toISOString(),
  };

  if (seedMode === 'empty') {
    return {
      admin_users: [],
      email_templates: [],
      template_versions: [],
      campaigns: [],
      campaign_recipients: [],
      email_attempts: [],
      import_batches: [],
      import_batch_rows: [],
      idempotency_keys: [],
      queue_worker_state: [baseWorkerState],
      queue_events: [],
      app_settings: [],
    };
  }

  // Test fixtures explicitly constructed for unit/integration suites
  const tplId1 = 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7';
  const tplId2 = 'e5f6a7b8-c9d0-41e2-f3a4-b5c6d7e8f9a0';

  return {
    admin_users: [
      {
        id: 'a1000000-0000-4000-8000-000000000001',
        user_id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
        display_name: 'Test Administrator',
        email: 'admin@snpsu.edu.in',
        created_at: new Date(now - 86400000 * 30).toISOString(),
      },
    ],
    email_templates: [
      {
        id: tplId1,
        name: 'Test Welcome Template',
        description: 'Fixture template for unit test commit and rendering checks.',
        category: 'Notifications',
        subject: 'Welcome to SNPSUNEXUS — {{recipient_name}}',
        html_content: '<p>Dear {{recipient_name}}, Welcome to {{institution_name}}. <a href="{{activation_link}}">Open</a></p>',
        text_content: 'Dear {{recipient_name}}, Welcome to {{institution_name}}.',
        version: 1,
        is_active: true,
        archived_at: null,
        created_at: new Date(now - 86400000 * 2).toISOString(),
        updated_at: new Date(now - 86400000 * 2).toISOString(),
      },
      {
        id: tplId2,
        name: 'Test Card Template',
        description: 'Fixture template for MIME and HTML card rendering verification.',
        category: 'General Notifications',
        subject: 'Official Notification — {{recipient_name}}',
        html_content:
          '<table role="presentation" width="100%"><tr><td><img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" /><h1>Official Notification</h1><p>Dear {{recipient_name}}, email {{recipient_email}}, role {{designation}}, link <a href="{{activation_link}}">Verify</a></p></td></tr></table>',
        text_content: 'Dear {{recipient_name}}, Email: {{recipient_email}}, Role: {{designation}}, Link: {{activation_link}}',
        version: 1,
        is_active: true,
        archived_at: null,
        created_at: new Date(now - 86400000 * 3).toISOString(),
        updated_at: new Date(now - 86400000 * 3).toISOString(),
      },
    ],
    template_versions: [
      {
        id: 'tv-test-1',
        template_id: tplId1,
        version: 1,
        name: 'Test Welcome Template',
        description: 'Fixture template for unit test commit and rendering checks.',
        category: 'Notifications',
        subject: 'Welcome to SNPSUNEXUS — {{recipient_name}}',
        html_content: '<p>Dear {{recipient_name}}, Welcome to {{institution_name}}. <a href="{{activation_link}}">Open</a></p>',
        text_content: 'Dear {{recipient_name}}, Welcome to {{institution_name}}.',
        created_at: new Date(now - 86400000 * 2).toISOString(),
        change_summary: 'Initial fixture baseline',
      },
      {
        id: 'tv-test-2',
        template_id: tplId2,
        version: 1,
        name: 'Test Card Template',
        description: 'Fixture template for MIME and HTML card rendering verification.',
        category: 'General Notifications',
        subject: 'Official Notification — {{recipient_name}}',
        html_content:
          '<table role="presentation" width="100%"><tr><td><img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" /><h1>Official Notification</h1><p>Dear {{recipient_name}}, email {{recipient_email}}, role {{designation}}, link <a href="{{activation_link}}">Verify</a></p></td></tr></table>',
        text_content: 'Dear {{recipient_name}}, Email: {{recipient_email}}, Role: {{designation}}, Link: {{activation_link}}',
        created_at: new Date(now - 86400000 * 3).toISOString(),
        change_summary: 'Initial fixture baseline',
      },
    ],
    campaigns: [
      {
        id: 'a1000000-0000-0000-0000-000000000001',
        campaign_name: 'Unit Fixture Campaign Ready',
        campaign_type: 'bulk',
        subject: 'Fixture Ready Notice — {{recipient_name}}',
        status: 'ready',
        total_recipients: 2,
        sent_count: 0,
        failed_count: 0,
        pending_count: 2,
        outcome_unknown_count: 0,
        template_id: tplId1,
        template_version: 1,
        template_snapshot: {
          subject: 'Fixture Ready Notice — {{recipient_name}}',
          html_content: '<p>Dear {{recipient_name}}, Fixture notice.</p>',
          text_content: 'Dear {{recipient_name}}, Fixture notice.',
        },
        created_at: new Date(now - 3600000 * 4).toISOString(),
      },
      {
        id: 'a2000000-0000-0000-0000-000000000002',
        campaign_name: 'Unit Fixture Campaign Running',
        campaign_type: 'bulk',
        subject: 'Fixture Running Notice — {{recipient_name}}',
        status: 'running',
        total_recipients: 1,
        sent_count: 0,
        failed_count: 0,
        pending_count: 1,
        outcome_unknown_count: 0,
        template_id: tplId1,
        template_version: 1,
        template_snapshot: {
          subject: 'Fixture Running Notice — {{recipient_name}}',
          html_content: '<p>Dear {{recipient_name}}, Running fixture notice.</p>',
          text_content: 'Dear {{recipient_name}}, Running fixture notice.',
        },
        created_at: new Date(now - 3600000 * 8).toISOString(),
        started_at: new Date(now - 3600000 * 2).toISOString(),
      },
      {
        id: 'a3000000-0000-0000-0000-000000000003',
        campaign_name: 'Unit Fixture Campaign Review',
        campaign_type: 'bulk',
        subject: 'Fixture Review Notice — {{recipient_name}}',
        status: 'needs_review',
        total_recipients: 2,
        sent_count: 0,
        failed_count: 0,
        pending_count: 0,
        outcome_unknown_count: 2,
        template_id: null,
        template_version: 1,
        template_snapshot: null,
        created_at: new Date(now - 3600000 * 12).toISOString(),
      },
      {
        id: 'a4000000-0000-0000-0000-000000000004',
        campaign_name: 'Unit Fixture Campaign Paused',
        campaign_type: 'bulk',
        subject: 'Fixture Paused Notice — {{recipient_name}}',
        status: 'paused',
        total_recipients: 0,
        sent_count: 0,
        failed_count: 0,
        pending_count: 0,
        outcome_unknown_count: 0,
        template_id: null,
        template_version: 1,
        template_snapshot: null,
        created_at: new Date(now - 3600000 * 24).toISOString(),
        paused_at: new Date(now - 3600000).toISOString(),
      },
      {
        id: 'c1000000-0000-0000-0000-000000000001',
        campaign_name: 'Unit Fixture Activity Bulk',
        campaign_type: 'bulk',
        subject: 'Fixture Activity Subject',
        status: 'completed',
        total_recipients: 2,
        sent_count: 1,
        failed_count: 1,
        pending_count: 0,
        outcome_unknown_count: 0,
        created_at: new Date(now - 3600000 * 6).toISOString(),
      },
      {
        id: 'c2000000-0000-0000-0000-000000000002',
        campaign_name: 'Unit Fixture Activity Individual',
        campaign_type: 'individual',
        subject: 'Fixture Individual Subject',
        status: 'running',
        total_recipients: 2,
        sent_count: 1,
        failed_count: 1,
        pending_count: 0,
        outcome_unknown_count: 0,
        created_at: new Date(now - 3600000 * 7).toISOString(),
      },
    ],
    campaign_recipients: [
      {
        id: 'r1000000-0000-0000-0000-000000000001',
        campaign_id: 'a1000000-0000-0000-0000-000000000001',
        recipient_name: 'Test Candidate One',
        recipient_email: 'candidate1@snpsu.edu.in',
        status: 'pending',
        attempt_count: 0,
        created_at: new Date(now - 3600000 * 4).toISOString(),
      },
      {
        id: 'r1000000-0000-0000-0000-000000000002',
        campaign_id: 'a1000000-0000-0000-0000-000000000001',
        recipient_name: 'Test Candidate Two',
        recipient_email: 'candidate2@snpsu.edu.in',
        status: 'pending',
        attempt_count: 0,
        created_at: new Date(now - 3600000 * 4).toISOString(),
      },
      {
        id: 'r2000000-0000-0000-0000-000000000001',
        campaign_id: 'a2000000-0000-0000-0000-000000000002',
        recipient_name: 'Test Candidate Running',
        recipient_email: 'running1@snpsu.edu.in',
        status: 'pending',
        attempt_count: 0,
        created_at: new Date(now - 3600000 * 8).toISOString(),
      },
      {
        id: 'r3000000-0000-0000-0000-000000000002',
        campaign_id: 'a3000000-0000-0000-0000-000000000003',
        recipient_name: 'Test Unknown Resolve A',
        recipient_email: 'unknown.a@snpsu.edu.in',
        status: 'outcome_unknown',
        attempt_count: 1,
        failure_reason: 'Fixture timeout',
        claimed_at: new Date(now - 3600000 * 2).toISOString(),
        created_at: new Date(now - 3600000 * 12).toISOString(),
      },
      {
        id: 'r3000000-0000-0000-0000-000000000003',
        campaign_id: 'a3000000-0000-0000-0000-000000000003',
        recipient_name: 'Test Unknown Resolve B',
        recipient_email: 'unknown.b@snpsu.edu.in',
        status: 'outcome_unknown',
        attempt_count: 1,
        failure_reason: 'Fixture connection drop',
        claimed_at: new Date(now - 3600000 * 2).toISOString(),
        created_at: new Date(now - 3600000 * 12).toISOString(),
      },
      {
        id: 'fa000000-0000-0000-0000-000000000001',
        campaign_id: 'c1000000-0000-0000-0000-000000000001',
        recipient_name: 'Test Activity Sent',
        recipient_email: 'activity.sent@snpsu.edu.in',
        status: 'sent',
        attempt_count: 1,
        sent_at: new Date(now - 3600000 * 2).toISOString(),
        created_at: new Date(now - 3600000 * 2).toISOString(),
        failure_reason: null,
      },
      {
        id: 'fa000000-0000-0000-0000-000000000002',
        campaign_id: 'c1000000-0000-0000-0000-000000000001',
        recipient_name: 'Test Bulk Failed',
        recipient_email: 'bulk.failed@snpsu.edu.in',
        status: 'failed',
        attempt_count: 1,
        sent_at: null,
        created_at: new Date(now - 3600000 * 3).toISOString(),
        failure_reason: '550 5.1.1 User unknown',
      },
      {
        id: 'fa000000-0000-0000-0000-000000000003',
        campaign_id: 'c2000000-0000-0000-0000-000000000002',
        recipient_name: 'Test Individual Failed',
        recipient_email: 'ind.failed@snpsu.edu.in',
        status: 'failed',
        attempt_count: 1,
        sent_at: null,
        created_at: new Date(now - 3600000 * 5).toISOString(),
        failure_reason: '550 Temporary mailbox failure',
      },
    ],
    email_attempts: [
      {
        id: 'at-test-1',
        recipient_id: 'fa000000-0000-0000-0000-000000000001',
        campaign_id: 'c1000000-0000-0000-0000-000000000001',
        attempt_number: 1,
        status: 'sent',
        smtp_message_id: '<test-msg-001@snpsu.edu.in>',
        created_at: new Date(now - 3600000 * 2).toISOString(),
        started_at: new Date(now - 3600000 * 2).toISOString(),
      },
      {
        id: 'at-test-2',
        recipient_id: 'fa000000-0000-0000-0000-000000000002',
        campaign_id: 'c1000000-0000-0000-0000-000000000001',
        attempt_number: 1,
        status: 'failed',
        failure_reason: '550 5.1.1 User unknown',
        smtp_message_id: null,
        created_at: new Date(now - 3600000 * 3).toISOString(),
        started_at: new Date(now - 3600000 * 3).toISOString(),
      },
      {
        id: 'at-test-3',
        recipient_id: 'fa000000-0000-0000-0000-000000000003',
        campaign_id: 'c2000000-0000-0000-0000-000000000002',
        attempt_number: 1,
        status: 'failed',
        failure_reason: '550 Temporary mailbox failure',
        smtp_message_id: null,
        created_at: new Date(now - 3600000 * 5).toISOString(),
        started_at: new Date(now - 3600000 * 5).toISOString(),
      },
    ],
    import_batches: [],
    import_batch_rows: [],
    idempotency_keys: [],
    queue_worker_state: [baseWorkerState],
    queue_events: [],
    app_settings: [],
  };
}

function getNestedValue(row, pathParts) {
  let curr = row;
  for (const p of pathParts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[p];
  }
  return curr;
}

function enrichRow(table, row, store, selectSpec) {
  const copy = { ...row };
  if (table === 'campaign_recipients' && selectSpec && selectSpec.includes('campaigns')) {
    copy.campaigns = store.campaigns.find((c) => c.id === row.campaign_id) || null;
  }
  if (table === 'campaign_recipients' && selectSpec && selectSpec.includes('email_attempts')) {
    copy.email_attempts = store.email_attempts.filter((a) => a.recipient_id === row.id);
  }
  return copy;
}

function parseOrClause(clause, row, table, store) {
  const parts = clause.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.some((expr) => {
    const ilikeMatch = expr.match(/^([^.]+(?:\.[^.]+)?)\.ilike\.(.+)$/);
    if (ilikeMatch) {
      const [, fieldPath, pattern] = ilikeMatch;
      const needle = pattern.replace(/^%|%$/g, '').toLowerCase();
      const enriched = enrichRow(table, row, store, 'campaigns');
      const val = getNestedValue(enriched, fieldPath.split('.'));
      return val !== null && val !== undefined && String(val).toLowerCase().includes(needle);
    }
    const eqMatch = expr.match(/^([^.]+)\.eq\.(.+)$/);
    if (eqMatch) {
      const [, field, rawVal] = eqMatch;
      const target = rawVal === 'false' ? false : rawVal === 'true' ? true : rawVal;
      return row[field] === target;
    }
    const notIsNull = expr.match(/^([^.]+)\.not\.is\.null$/);
    if (notIsNull) {
      const [, field] = notIsNull;
      return row[field] !== null && row[field] !== undefined;
    }
    return false;
  });
}

class MockQueryBuilder {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.op = 'select';
    this.selectSpec = '*';
    this.selectOptions = {};
    this.payload = null;
    this.upsertOptions = {};
    this.filters = [];
    this.orderSpecs = [];
    this.rangeSpec = null;
    this.limitVal = null;
    this.returnMode = 'many'; // 'many' | 'single' | 'maybeSingle'
    this.returnAfterMutation = false;
  }

  select(spec = '*', opts = {}) {
    if (this.op === 'select') {
      this.selectSpec = spec;
      this.selectOptions = opts || {};
    } else {
      this.returnAfterMutation = true;
      this.selectSpec = spec;
    }
    return this;
  }

  insert(rows) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(fields) {
    this.op = 'update';
    this.payload = fields;
    return this;
  }

  upsert(rows, opts = {}) {
    this.op = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertOptions = opts || {};
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    return this;
  }

  in(col, vals) {
    const set = new Set(vals || []);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }

  gt(col, val) {
    this.filters.push((r) => (r[col] ?? 0) > val);
    return this;
  }

  gte(col, val) {
    this.filters.push((r) => {
      if (r[col] === null || r[col] === undefined) return false;
      return String(r[col]) >= String(val);
    });
    return this;
  }

  lte(col, val) {
    this.filters.push((r) => {
      if (r[col] === null || r[col] === undefined) return false;
      return String(r[col]) <= String(val);
    });
    return this;
  }

  is(col, val) {
    this.filters.push((r) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val));
    return this;
  }

  ilike(col, pattern) {
    const needle = String(pattern || '').replace(/^%|%$/g, '').toLowerCase();
    this.filters.push((r) => r[col] && String(r[col]).toLowerCase().includes(needle));
    return this;
  }

  or(clause) {
    this.filters.push((r) => parseOrClause(clause, r, this.table, this.store));
    return this;
  }

  order(col, opts = { ascending: true }) {
    this.orderSpecs.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  range(from, to) {
    this.rangeSpec = { from, to };
    return this;
  }

  limit(n) {
    this.limitVal = n;
    return this;
  }

  single() {
    this.returnMode = 'single';
    return this._execute();
  }

  maybeSingle() {
    this.returnMode = 'maybeSingle';
    return this._execute();
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  async _execute() {
    if (!this.store[this.table]) {
      return {
        data: null,
        error: { code: 'PGRST205', message: `Could not find the table 'public.${this.table}' in the schema cache` },
      };
    }

    const rows = this.store[this.table];

    if (this.op === 'insert') {
      const inserted = [];
      for (const item of this.payload) {
        const rec = {
          id: item.id || crypto.randomUUID(),
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
          ...item,
        };
        if (this.table === 'campaign_recipients' && rec.recipient_email) {
          rec.normalized_email = String(rec.recipient_email).trim().toLowerCase();
        }
        rows.push(rec);
        inserted.push({ ...rec });
      }
      if (this.returnMode === 'single') {
        return { data: inserted[0], error: null };
      }
      if (this.returnMode === 'maybeSingle') {
        return { data: inserted[0] || null, error: null };
      }
      return { data: this.returnAfterMutation ? inserted : null, error: null };
    }

    if (this.op === 'upsert') {
      const conflictKey = this.upsertOptions.onConflict || 'id';
      const out = [];
      for (const item of this.payload) {
        const idx = rows.findIndex((r) => r[conflictKey] === item[conflictKey]);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...item, updated_at: item.updated_at || new Date().toISOString() };
          out.push({ ...rows[idx] });
        } else {
          const rec = {
            id: item.id || crypto.randomUUID(),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
            ...item,
          };
          rows.push(rec);
          out.push({ ...rec });
        }
      }
      if (this.returnMode === 'single') {
        return { data: out[0], error: null };
      }
      return { data: this.returnAfterMutation ? out : null, error: null };
    }

    if (this.op === 'update') {
      const matched = rows.filter((r) => this.filters.every((fn) => fn(r)));
      const updated = matched.map((r) => {
        Object.assign(r, this.payload, { updated_at: this.payload.updated_at || new Date().toISOString() });
        return { ...r };
      });
      if (this.returnMode === 'single') {
        if (updated.length === 0) {
          return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        }
        return { data: updated[0], error: null };
      }
      if (this.returnMode === 'maybeSingle') {
        return { data: updated[0] || null, error: null };
      }
      return { data: this.returnAfterMutation ? updated : null, error: null };
    }

    if (this.op === 'delete') {
      const remaining = [];
      const deleted = [];
      for (const r of rows) {
        if (this.filters.every((fn) => fn(r))) {
          deleted.push(r);
        } else {
          remaining.push(r);
        }
      }
      this.store[this.table] = remaining;
      return { data: this.returnAfterMutation ? deleted : null, error: null };
    }

    // SELECT
    let matched = rows
      .filter((r) => this.filters.every((fn) => fn(r)))
      .map((r) => enrichRow(this.table, r, this.store, this.selectSpec));

    if (this.selectSpec.includes('campaigns!inner')) {
      matched = matched.filter((r) => r.campaigns !== null);
    }

    if (this.orderSpecs.length > 0) {
      matched.sort((a, b) => {
        for (const { col, ascending } of this.orderSpecs) {
          const av = a[col] ?? '';
          const bv = b[col] ?? '';
          if (av < bv) return ascending ? -1 : 1;
          if (av > bv) return ascending ? 1 : -1;
        }
        return 0;
      });
    }

    const totalCount = matched.length;
    if (this.rangeSpec) {
      matched = matched.slice(this.rangeSpec.from, this.rangeSpec.to + 1);
    } else if (typeof this.limitVal === 'number') {
      matched = matched.slice(0, this.limitVal);
    }

    if (this.selectOptions?.head) {
      return { data: null, count: totalCount, error: null };
    }
    if (this.returnMode === 'single') {
      if (matched.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
      }
      return { data: matched[0], error: null };
    }
    if (this.returnMode === 'maybeSingle') {
      return { data: matched[0] || null, error: null };
    }

    return {
      data: matched,
      count: this.selectOptions?.count === 'exact' ? totalCount : undefined,
      error: null,
    };
  }
}

export function createTestSupabaseClient(seedMode = 'empty') {
  const store = createTestFixturesState(seedMode);

  const client = {
    _store: store,
    auth: {
      getUser: async (token) => {
        if (token === 'valid-test-admin-jwt') {
          return {
            data: {
              user: {
                id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
                email: 'admin@snpsu.edu.in',
                user_metadata: { role: 'administrator', display_name: 'Test Administrator' },
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: { message: 'Invalid test token' } };
      },
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
    from(table) {
      return new MockQueryBuilder(store, table);
    },
    async rpc(fnName, params = {}) {
      if (fnName === 'commit_import_batch') {
        const { p_batch_id, p_campaign_name, p_template_id, p_admin_id, p_idempotency_key } = params;
        const batch = store.import_batches.find((b) => b.id === p_batch_id);
        if (!batch) return { data: { success: false, error: 'Import batch not found.' }, error: null };
        if (batch.status === 'Committed' && batch.idempotency_key === p_idempotency_key) {
          return {
            data: {
              success: true,
              campaign_id: batch.committed_campaign_id,
              recipients_count: batch.selected_count,
              idempotent_replay: true,
            },
            error: null,
          };
        }
        if (batch.status === 'Committed') {
          return { data: { success: false, error: 'This import batch has already been committed and cannot be committed again.' }, error: null };
        }
        if (batch.status !== 'Ready') {
          return { data: { success: false, error: `Import batch is not ready for commitment. Current status: ${batch.status}` }, error: null };
        }
        const template = store.email_templates.find((t) => t.id === p_template_id && t.is_active);
        if (!template) {
          return { data: { success: false, error: 'The selected email template does not exist or has been archived.' }, error: null };
        }
        const selected = store.import_batch_rows.filter(
          (r) =>
            r.batch_id === p_batch_id &&
            r.is_selected &&
            (r.validation_status === 'valid' || r.validation_status === 'warning') &&
            r.recipient_name &&
            r.recipient_name.trim()
        );
        if (selected.length === 0) {
          return { data: { success: false, error: 'No eligible selected recipients found in this batch.' }, error: null };
        }
        const campaignId = crypto.randomUUID();
        const now = new Date().toISOString();
        store.campaigns.push({
          id: campaignId,
          campaign_name: p_campaign_name.trim(),
          campaign_type: 'bulk',
          subject: template.subject,
          template_id: template.id,
          template_version: template.version || 1,
          template_snapshot: {
            template_id: template.id,
            version: template.version || 1,
            name: template.name,
            subject: template.subject,
            html_content: template.html_content,
            text_content: template.text_content,
            captured_at: now,
          },
          status: 'ready',
          total_recipients: selected.length,
          sent_count: 0,
          failed_count: 0,
          pending_count: selected.length,
          outcome_unknown_count: 0,
          created_by: p_admin_id || null,
          created_at: now,
        });
        const seen = new Set();
        let insertedCount = 0;
        for (const r of selected) {
          const norm = String(r.recipient_email).trim().toLowerCase();
          if (seen.has(norm)) continue;
          seen.add(norm);
          store.campaign_recipients.push({
            id: crypto.randomUUID(),
            campaign_id: campaignId,
            recipient_name: r.recipient_name.trim(),
            recipient_email: r.recipient_email.trim(),
            normalized_email: norm,
            status: 'pending',
            attempt_count: 0,
            created_at: now,
            updated_at: now,
          });
          insertedCount++;
        }
        batch.status = 'Committed';
        batch.committed_at = now;
        batch.committed_campaign_id = campaignId;
        batch.idempotency_key = p_idempotency_key;
        batch.selected_count = insertedCount;
        return {
          data: {
            success: true,
            campaign_id: campaignId,
            recipients_count: insertedCount,
            idempotent_replay: false,
          },
          error: null,
        };
      }

      if (fnName === 'claim_next_queue_recipient') {
        const eligibleCampaign = store.campaigns
          .filter((c) => ['running', 'queued'].includes(c.status) && c.campaign_type === 'bulk' && c.pending_count > 0)
          .sort((a, b) => (a.status === 'running' ? -1 : 1))[0];
        if (!eligibleCampaign) return { data: { has_work: false }, error: null };
        if (eligibleCampaign.status === 'queued') {
          eligibleCampaign.status = 'running';
          eligibleCampaign.started_at = eligibleCampaign.started_at || new Date().toISOString();
        }
        const recip = store.campaign_recipients.find((r) => r.campaign_id === eligibleCampaign.id && r.status === 'pending');
        if (!recip) return { data: { has_work: false }, error: null };
        const nowIso = new Date().toISOString();
        recip.status = 'sending';
        recip.attempt_count = (recip.attempt_count || 0) + 1;
        recip.claimed_at = nowIso;
        recip.claimed_by_worker = params.p_worker_id;
        const attemptId = crypto.randomUUID();
        store.email_attempts.push({
          id: attemptId,
          campaign_id: eligibleCampaign.id,
          recipient_id: recip.id,
          attempt_number: recip.attempt_count,
          status: 'sending',
          worker_id: params.p_worker_id,
          started_at: nowIso,
          created_at: nowIso,
        });
        const ws = store.queue_worker_state[0];
        if (ws) {
          ws.worker_status = 'active';
          ws.current_campaign_id = eligibleCampaign.id;
          ws.current_recipient_id = recip.id;
          ws.current_attempt_id = attemptId;
          ws.heartbeat_at = nowIso;
        }
        return {
          data: {
            has_work: true,
            campaign: eligibleCampaign,
            recipient: recip,
            attempt_id: attemptId,
            attempt_number: recip.attempt_count,
          },
          error: null,
        };
      }

      if (fnName === 'finalize_queue_attempt') {
        const { p_attempt_id, p_outcome, p_smtp_message_id, p_failure_reason } = params;
        const now = new Date();
        const nowIso = now.toISOString();
        const nextAllowedIso = new Date(now.getTime() + 5000).toISOString();
        const att = store.email_attempts.find((a) => a.id === p_attempt_id);
        let campId = att?.campaign_id || params.p_campaign_id || null;
        let recId = att?.recipient_id || params.p_recipient_id || null;
        if (att) {
          att.status = p_outcome;
          att.smtp_message_id = p_smtp_message_id || null;
          att.failure_reason = p_failure_reason || null;
          att.completed_at = nowIso;
        }
        if (recId) {
          const recip = store.campaign_recipients.find((r) => r.id === recId);
          if (recip) {
            recip.status = p_outcome;
            recip.sent_at = p_outcome === 'sent' ? nowIso : null;
            recip.failure_reason = p_failure_reason || null;
          }
        }
        if (campId) {
          const camp = store.campaigns.find((c) => c.id === campId);
          if (camp) {
            if (p_outcome === 'sent') camp.sent_count = (camp.sent_count || 0) + 1;
            if (p_outcome === 'failed') camp.failed_count = (camp.failed_count || 0) + 1;
            if (p_outcome === 'outcome_unknown') {
              camp.outcome_unknown_count = (camp.outcome_unknown_count || 0) + 1;
              camp.status = 'needs_review';
            }
            camp.pending_count = Math.max(0, (camp.pending_count || 1) - 1);
            if (camp.pending_count === 0 && camp.status !== 'needs_review') camp.status = 'completed';
          }
        }
        const ws = store.queue_worker_state[0];
        if (ws) {
          ws.worker_status = 'waiting_interval';
          ws.current_recipient_id = null;
          ws.current_attempt_id = null;
          ws.last_attempt_completed_at = nowIso;
          ws.next_send_allowed_at = nextAllowedIso;
          ws.heartbeat_at = nowIso;
        }
        return { data: { success: true, next_send_allowed_at: nextAllowedIso }, error: null };
      }

      if (fnName === 'recover_abandoned_queue_attempts') {
        return { data: { recovered_count: 0 }, error: null };
      }

      if (fnName === 'requeue_failed_recipient') {
        const recip = store.campaign_recipients.find((r) => r.id === params.p_recipient_id);
        if (!recip) return { data: { success: false }, error: null };
        recip.status = 'pending';
        recip.claimed_at = null;
        recip.failure_reason = null;
        const camp = store.campaigns.find((c) => c.id === recip.campaign_id);
        if (camp) {
          camp.pending_count = (camp.pending_count || 0) + 1;
          camp.failed_count = Math.max(0, (camp.failed_count || 1) - 1);
          camp.status = 'queued';
        }
        return { data: { success: true }, error: null };
      }

      if (fnName === 'delete_email_template_permanently') {
        const { p_template_id, p_admin_id } = params;
        const tplIdx = (store.email_templates || []).findIndex((t) => t.id === p_template_id);
        if (tplIdx === -1) {
          return {
            data: {
              success: false,
              status: 404,
              code: 'TEMPLATE_NOT_FOUND',
              error: 'Email template not found or already deleted.',
            },
            error: null,
          };
        }

        const tpl = store.email_templates[tplIdx];
        const linked = (store.campaigns || []).filter((c) => c.template_id === p_template_id);
        const unsafe = linked.filter((c) => {
          const snap = c.template_snapshot;
          return !snap || !snap.subject || (!snap.html_content && !snap.text_content);
        });

        if (unsafe.length > 0) {
          return {
            data: {
              success: false,
              status: 409,
              code: 'TEMPLATE_IN_USE_WITHOUT_SNAPSHOT',
              unsafe_campaigns_count: unsafe.length,
              error: `Cannot permanently delete "${tpl.name}": ${unsafe.length} campaign(s) still reference the live template without a complete immutable snapshot.`,
            },
            error: null,
          };
        }

        for (const camp of linked) {
          camp.template_id = null;
          camp.updated_at = new Date().toISOString();
        }

        const beforeVerCount = (store.template_versions || []).length;
        store.template_versions = (store.template_versions || []).filter((v) => v.template_id !== p_template_id);
        const deletedVersionsCount = beforeVerCount - store.template_versions.length;
        store.email_templates.splice(tplIdx, 1);

        store.queue_events = store.queue_events || [];
        store.queue_events.push({
          id: crypto.randomUUID(),
          campaign_id: null,
          recipient_id: null,
          worker_id: null,
          event_type: 'template_permanently_deleted',
          event_details: {
            template_id: tpl.id,
            template_name: tpl.name,
            template_version: tpl.version || 1,
            detached_campaigns: linked.length,
            deleted_versions: deletedVersionsCount,
            actor_id: p_admin_id || null,
          },
          created_by: p_admin_id || null,
          created_at: new Date().toISOString(),
        });

        return {
          data: {
            success: true,
            deleted_id: tpl.id,
            name: tpl.name,
            version: tpl.version || 1,
            detached_campaigns: linked.length,
            deleted_versions: deletedVersionsCount,
          },
          error: null,
        };
      }

      if (fnName === 'get_reports_overview_summary') {
        const camps = store.campaigns;
        const recips = store.campaign_recipients;
        const sent = recips.filter((r) => r.status === 'sent').length;
        const failed = recips.filter((r) => r.status === 'failed').length;
        const known = sent + failed;
        return {
          data: {
            total_campaigns: camps.length,
            bulk_campaigns: camps.filter((c) => c.campaign_type === 'bulk').length,
            individual_campaigns: camps.filter((c) => c.campaign_type === 'individual').length,
            total_recipients: recips.length,
            total_sent: sent,
            total_failed: failed,
            total_pending: recips.filter((r) => r.status === 'pending').length,
            total_sending: recips.filter((r) => r.status === 'sending').length,
            total_outcome_unknown: recips.filter((r) => r.status === 'outcome_unknown').length,
            total_cancelled: recips.filter((r) => r.status === 'cancelled').length,
            total_attempts: store.email_attempts.length,
            acceptance_rate: known > 0 ? Math.round((sent / known) * 1000) / 10 : 0,
            failure_rate: known > 0 ? Math.round((failed / known) * 1000) / 10 : 0,
            generated_at: new Date().toISOString(),
          },
          error: null,
        };
      }

      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
  };

  return client;
}
