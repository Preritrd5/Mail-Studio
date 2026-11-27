const fs = require('fs');

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
const projectRef = 'spbxafucskpsjsapkdnt';

async function testManagementApi() {
  console.log('Testing Management API...');
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Management API status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Project Name:', data.name, 'Region:', data.region, 'Status:', data.status);
    } else {
      const text = await res.text();
      console.log('Management API response:', text.substring(0, 150));
    }
  } catch (e) {
    console.log('Management API error:', e.message);
  }
}

testManagementApi();
