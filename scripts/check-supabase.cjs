const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.trim().startsWith('#')) {
    const key = line.substring(0, idx).trim();
    let val = line.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const url = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
const key = env['SUPABASE_SECRET_KEY'];

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testRpc() {
  const rpcs = ['exec_sql', 'execute_sql', 'exec', 'run_sql'];
  for (const r of rpcs) {
    const { data, error } = await supabase.rpc(r, { sql: 'SELECT 1;' });
    console.log(r, error ? error.message : 'SUCCESS: ' + JSON.stringify(data));
  }
}

testRpc();
