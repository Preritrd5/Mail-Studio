const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('=');
  if (i > 0 && !l.trim().startsWith('#')) {
    env[l.substring(0, i).trim()] = l.substring(i + 1).trim().replace(/^["']|["']$/g, '');
  }
});

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

async function test() {
  const { data, error } = await client.from('admin_users').select('*');
  console.log('Result for admin_users:', { data, error });
}

test();
