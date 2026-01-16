const admin = require('../functions/node_modules/firebase-admin');

// Parse args
const args = process.argv.slice(2);
const projectArg = args.find(arg => arg.startsWith('--project='));
const projectId = projectArg ? projectArg.split('=')[1] : null;

if (!projectId) {
    console.error('Error: --project=PROJECT_ID is required');
    process.exit(1);
}

console.log(`Initializing Admin SDK for project: ${projectId}`);

// Initialize Admin SDK
// Check for environment-specific key files first
const path = require('path');
const fs = require('fs');

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

async function deleteAllUsers(nextPageToken) {
  // List batch of users, 1000 at a time.
  const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
  
  const uids = listUsersResult.users.map((userRecord) => userRecord.uid);
  if (uids.length > 0) {
      const deleteUsersResult = await admin.auth().deleteUsers(uids);
      console.log(`Successfully deleted ${deleteUsersResult.successCount} users`);
      if (deleteUsersResult.failureCount > 0) {
          console.log(`Failed to delete ${deleteUsersResult.failureCount} users`);
          deleteUsersResult.errors.forEach((err) => {
              console.error(err.error.toJSON());
          });
      }
  }
  
  if (listUsersResult.pageToken) {
    // List next batch of users.
    await deleteAllUsers(listUsersResult.pageToken);
  }
}

deleteAllUsers()
  .then(() => {
    console.log('Successfully deleted all users');
    process.exit(0);
  })
  .catch((error) => {
    console.log('Error deleting users:', error);
    process.exit(1);
  });
