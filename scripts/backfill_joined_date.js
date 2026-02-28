const admin = require('../functions/node_modules/firebase-admin');
const path = require('path');
const fs = require('fs');

// Parse args
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/backfill_joined_date.js --project=PROJECT_ID');
    console.log('');
    console.log('Options:');
    console.log('  --project=PROJECT_ID   The GCP Project ID to target for backfilling');
    console.log('  --help, -h             Show this help message');
    process.exit(0);
}

const projectArg = args.find(arg => arg.startsWith('--project='));
const projectId = projectArg ? projectArg.split('=')[1] : null;

if (!projectId) {
    console.error('Error: --project=PROJECT_ID is required');
    process.exit(1);
}

console.log(`Initializing Admin SDK for project: ${projectId}`);

let serviceAccount = null;
const stagingKeyPath = path.join(__dirname, 'serviceAccountKey.staging.json');
const prodKeyPath = path.join(__dirname, 'serviceAccountKey.json');

if (projectId && projectId.includes('staging') && fs.existsSync(stagingKeyPath)) {
    console.log(`Loading staging service account key from ${stagingKeyPath}`);
    serviceAccount = require(stagingKeyPath);
} else if (projectId && !projectId.includes('staging') && fs.existsSync(prodKeyPath)) {
    console.log(`Loading production service account key from ${prodKeyPath}`);
    serviceAccount = require(prodKeyPath);
}

try {
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.log('Using Application Default Credentials');
        admin.initializeApp({
            projectId: projectId,
            credential: admin.credential.applicationDefault()
        });
    }
} catch (e) {
    console.error("Failed to initialize Admin SDK:", e.message);
    process.exit(1);
}

const db = admin.firestore();

async function backfillJoinedDate() {
    console.log('Starting backfill of joinedDate...');
    
    // Get all users
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    if (snapshot.empty) {
        console.log('No users found.');
        return;
    }
    
    console.log(`Found ${snapshot.size} users. Processing...`);
    
    const batchSize = 500;
    let batch = db.batch();
    let count = 0;
    let updatedCount = 0;
    
    // Use today's date for backfill
    const today = admin.firestore.Timestamp.now();
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Only update approved users who don't have joinedDate
        if (data.directoryStatus === 'approved' && !data.joinedDate) {
            batch.update(doc.ref, { joinedDate: today });
            updatedCount++;
            count++;
        }
        
        if (count >= batchSize) {
            await batch.commit();
            console.log(`Committed batch of ${count} updates.`);
            batch = db.batch();
            count = 0;
        }
    }
    
    if (count > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${count} updates.`);
    }
    
    console.log(`Backfill complete. Updated ${updatedCount} users.`);
}

backfillJoinedDate()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error backfilling joinedDate:', error);
        process.exit(1);
    });
