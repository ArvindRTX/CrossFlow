require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function seed() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_KEY must be set in your .env file.');
    process.exit(1);
  }

  console.log('Connecting to Supabase at:', supabaseUrl);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const dbPath = path.join(__dirname, 'database.json');
  if (!fs.existsSync(dbPath)) {
    console.error('ERROR: database.json not found at:', dbPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(dbPath, 'utf8');
  const cache = JSON.parse(raw);

  console.log('Seeding database.json state data...');
  const { data, error } = await supabase
    .from('state')
    .upsert({ id: 1, data: cache, updated_at: new Date() });

  if (error) {
    console.error('Seeding FAILED:', error.message);
    process.exit(1);
  } else {
    console.log('SUCCESS: database.json successfully seeded into Supabase state table!');
    process.exit(0);
  }
}

seed();
