import { isConfigured, query } from "../src/lib/supabase-client";

type ResponderRow = {
  id: string;
  firestation_id: number;
  team_number: number;
  status: string;
};

type FirestationRow = {
  id: number;
  name: string;
  total_teams: number | null;
};

async function checkResponders() {
  console.log("Checking responders table...\n");

  if (!isConfigured()) {
    console.error("❌ Supabase is not configured.");
    console.log("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    return;
  }

  const { data: responders, error } = await query<ResponderRow>("responders", {
    select: "*",
    limit: "10",
  });

  if (error) {
    console.error("❌ Error fetching responders:", error);
    console.log("\n⚠️  The responders table might not exist yet.");
    console.log("Run the schema in the Supabase SQL editor:");
    console.log("   supabase/fire-ops.sql");
    return;
  }

  console.log(`✅ Found ${responders?.length || 0} responders (showing first 10)`);

  if (responders && responders.length > 0) {
    console.log("\nSample responders:");
    responders.slice(0, 5).forEach((r) => {
      console.log(`  - Team ${r.team_number} at Station ${r.firestation_id}: ${r.status}`);
    });
  } else {
    console.log("\n⚠️  No responders found in database.");
    console.log("Run supabase/fire-ops.sql to create and seed the tables.");
  }

  const { data: firestations } = await query<FirestationRow>("firestations", {
    select: "id,name,total_teams",
    limit: "5",
  });

  if (firestations && firestations.length > 0) {
    console.log("\n✅ Firestations with team counts:");
    firestations.forEach((fs) => {
      console.log(`  - ${fs.name}: ${fs.total_teams || 3} teams`);
    });
  }
}

checkResponders().then(() => process.exit(0));
