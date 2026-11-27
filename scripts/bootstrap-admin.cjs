const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env manually
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

if (!url || !key) {
  console.error('Error: SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function bootstrapAdmin() {
  const email = process.argv[2] || 'admin@snpsu.edu.in';
  const password = process.argv[3] || 'SNPSU@Admin2026!';
  const displayName = process.argv[4] || 'Dr. Ananya Sharma';

  console.log('--- SNPSUNEXUS Administrator Bootstrap ---');
  console.log(`Target Email: ${email}`);
  console.log(`Display Name: ${displayName}`);

  try {
    // 1. Check if user already exists in Auth
    let userId = null;
    const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = userList.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existing) {
      console.log(`User already exists in Supabase Auth (User ID: ${existing.id}).`);
      userId = existing.id;
    } else {
      console.log('Creating new Auth user...');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, role: 'administrator' },
      });

      if (createError) throw createError;
      console.log(`Auth user successfully created (User ID: ${newUser.user.id}).`);
      userId = newUser.user.id;
    }

    // 2. Authorize in public.admin_users
    console.log('Authorizing in public.admin_users table...');
    const { error: adminError } = await supabase
      .from('admin_users')
      .upsert({
        user_id: userId,
        display_name: displayName,
        email: email.toLowerCase(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (adminError) {
      console.log('Notice: Could not insert into public.admin_users via PostgREST.');
      console.log(`Reason: ${adminError.message}`);
      console.log('\n--> If the database schema has not been applied yet, run the SQL in:');
      console.log('    supabase/consolidated_schema_migration.sql');
      console.log('    in the Supabase Dashboard SQL Editor first, then rerun this script.');
    } else {
      console.log('SUCCESS: Administrator registered in public.admin_users table!');
    }

    console.log('\nAdministrator Bootstrap Status: COMPLETED');
  } catch (err) {
    console.error('Bootstrap error:', err.message);
  }
}

bootstrapAdmin();
