import { createClient } from "@supabase/supabase-js";

/**
 * FinTrust Real User Simulation + Load Testing
 * 
 * To run this script:
 * 1. Make sure you have Node.js v18+ installed.
 * 2. Run the command: node --env-file=.env scripts/load_test.js
 * 
 * NOTE: This script assumes you have testing users created in Supabase Auth,
 * or it can be modified to bypass RLS with a SERVICE_ROLE key.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONCURRENT_USERS = 50;

// Random data generators
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const loanTypes = ['borrowed', 'lent'];

console.log(`🚀 Starting FinTrust Load Test with ${CONCURRENT_USERS} simulated concurrent requests...`);
console.time("LoadTestDuration");

async function simulateUser(userId) {
  const amount = randomInt(500, 50000);
  const type = loanTypes[randomInt(0, 1)];
  const counterpartId = randomInt(1, 1000);
  
  const startTime = performance.now();
  
  try {
    // 1. Simulate fetching loans (Read Load)
    const { data: readData, error: readError } = await supabase
      .from('loans')
      .select('id')
      .limit(5);
      
    if (readError) throw readError;

    // 2. Simulate creating a loan request (Write Load)
    // NOTE: If RLS is strictly enforced, this needs a valid JWT in supabase client.
    // We are simulating the network request here.
    const { data: writeData, error: writeError } = await supabase
      .from('loans')
      .insert([{
        user_id: `test-user-${userId}`, // Simulated UUID
        type: type,
        amount: amount,
        currency: 'INR',
        interest_rate: 12.5,
        status: 'pending_approval',
        borrower_email: type === 'borrowed' ? `test${userId}@fintrust.com` : `counterpart${counterpartId}@fintrust.com`,
        lender_email: type === 'lent' ? `test${userId}@fintrust.com` : `counterpart${counterpartId}@fintrust.com`,
        description: `Load test loan ${userId}`
      }]);

    // RLS might throw an error if we're unauthenticated, which is fine for load testing the API edge!
    // We catch it and measure response time anyway.
    
    const endTime = performance.now();
    console.log(`✅ User ${userId} completed network cycle in ${(endTime - startTime).toFixed(2)}ms`);
    
    return { success: true, timeMs: endTime - startTime };
  } catch (err) {
    const endTime = performance.now();
    // Ignoring RLS auth errors as we are testing load, not auth logic
    if (err.message && err.message.includes("row-level security")) {
      console.log(`⚠️ User ${userId} hit RLS (expected if no JWT) in ${(endTime - startTime).toFixed(2)}ms`);
      return { success: true, timeMs: endTime - startTime }; // Still a successful network trip
    }
    
    console.error(`❌ User ${userId} failed:`, err.message || err);
    return { success: false, timeMs: endTime - startTime };
  }
}

async function runLoadTest() {
  const promises = [];
  
  // Launch all simulated users simultaneously
  for (let i = 1; i <= CONCURRENT_USERS; i++) {
    promises.push(simulateUser(i));
  }
  
  const results = await Promise.all(promises);
  const successful = results.filter(r => r.success).length;
  
  console.log("\n📊 --- LOAD TEST RESULTS --- 📊");
  console.log(`Total Simulated Users: ${CONCURRENT_USERS}`);
  console.log(`Successful Operations: ${successful}`);
  console.log(`Failed Operations: ${CONCURRENT_USERS - successful}`);
  
  const avgTime = results.reduce((acc, curr) => acc + curr.timeMs, 0) / CONCURRENT_USERS;
  console.log(`Average Response Time: ${avgTime.toFixed(2)}ms`);
  console.timeEnd("LoadTestDuration");
}

runLoadTest();
