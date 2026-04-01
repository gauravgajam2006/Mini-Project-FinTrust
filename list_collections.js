import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('fintrust-86088-firebase-adminsdk-fbsvc-8c4adc42cb.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const collections = await db.listCollections();
  console.log('Available collections:', collections.map(c => c.id));
  process.exit(0);
}

run();
