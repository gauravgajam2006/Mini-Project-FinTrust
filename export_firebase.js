import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Fix for __dirname in ESM
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'fintrust-86088-firebase-adminsdk-fbsvc-8c4adc42cb.json'), 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportCollection(collectionName) {
  console.log(`Exporting ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();
  const data = [];
  snapshot.forEach(doc => {
    data.push({ id: doc.id, ...doc.data() });
  });
  fs.writeFileSync(path.join(__dirname, `${collectionName}.json`), JSON.stringify(data, null, 2));
  console.log(`Exported ${data.length} documents from ${collectionName}.`);
}

async function run() {
  try {
    await exportCollection('users');
    await exportCollection('loans');
    await exportCollection('payments');
    await exportCollection('activities');
    await exportCollection('connections');
    await exportCollection('vouches');
    console.log('Export complete!');
    process.exit(0);
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

run();
