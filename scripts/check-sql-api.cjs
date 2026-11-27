const fs = require('fs');

const env = {};
fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('=');
  if (i > 0 && !l.trim().startsWith('#')) {
    env[l.substring(0, i).trim()] = l.substring(i + 1).trim().replace(/^["']|["']$/g, '');
  }
});

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;

async function checkRest() {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } });
  const data = await res.json();
  console.log('Available OpenAPI Paths:', Object.keys(data.paths || {}));
}

checkRest();
