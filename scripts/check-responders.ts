import { supabase } from '../lib/supabase-client';

async function checkResponders() {
  console.log('Checking responders table...\n');
  
  // Check if responders exist
  const { data: responders, error } = await supabase
    .from('responders')
    .select('*')
    .limit(10);
  
  if (error) {
    console.error('❌ Error fetching responders:', error.message);
    console.log('\n⚠️  The responders table might not exist yet.');
    console.log('Run the migration in Supabase SQL Editor:');
    console.log('   supabase/migrations/20240101000000_create_responders.sql');
    return;
  }
  
  console.log(`✅ Found ${responders?.length || 0} responders (showing first 10)`);
  
  if (responders && responders.length > 0) {
    console.log('\nSample responders:');
    responders.slice(0, 5).forEach(r => {
      console.log(`  - Team ${r.team_number} at Station ${r.firestation_id}: ${r.status}`);
    });
  } else {
    console.log('\n⚠️  No responders found in database.');
    console.log('Run the migration to seed responders.');
  }
  
  // Check firestations
  const { data: firestations } = await supabase
    .from('firestations')
    .select('id, name, total_teams')
    .limit(5);
  
  if (firestations && firestations.length > 0) {
    console.log('\n✅ Firestations with team counts:');
    firestations.forEach(fs => {
      console.log(`  - ${fs.name}: ${fs.total_teams || 3} teams`);
    });
  }
}

checkResponders().then(() => process.exit(0));

