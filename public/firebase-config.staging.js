// STAGING CONFIGURATION
// Fill this with your Firebase project config for STAGING
window.firebaseConfig = window.firebaseConfig || {
    apiKey: "AIzaSyAGj1dj2LyNYtfyf3_lsfSF6cpc3TNpM-U",
    authDomain: "scarsdale-buzz-staging.web.app",
    projectId: "scarsdale-buzz-staging",
    storageBucket: "scarsdale-buzz-staging.firebasestorage.app",
    messagingSenderId: "758221753289",
    appId: "1:758221753289:web:2ab0c76a90fd4bc3d7f618",
    measurementId: "G-D77KJFZ94X"
};

// Function URLs for Staging
// Note: Gen 2 functions (run.app) have a random hash that needs to be updated after deployment.
window.firebaseConfig.functionUrls = {
    verifyAdminRole: "https://us-central1-scarsdale-buzz-staging.cloudfunctions.net/verifyAdminRole",
    grantAdminRole: "https://us-central1-scarsdale-buzz-staging.cloudfunctions.net/grantAdminRole",
    deleteUser: "https://us-central1-scarsdale-buzz-staging.cloudfunctions.net/deleteUser",
    deleteService: "https://us-central1-scarsdale-buzz-staging.cloudfunctions.net/deleteService",
    findBusinessContactInfo: "https://us-central1-scarsdale-buzz-staging.cloudfunctions.net/findBusinessContactInfo",
    submitRequest: "https://submitrequest-ocel5flxea-uc.a.run.app",
    handleUserResponse: "https://handleuserresponse-ocel5flxea-uc.a.run.app",
    cancelRequest: "https://cancelrequest-ocel5flxea-uc.a.run.app"
};

// Global Helper for Phone Formatting
window.formatPhoneNumber = (input) => {
    if (!input) return '';
    let cleaned = ('' + input).replace(/\D/g, '');
    if (cleaned.length === 10) {
        cleaned = '1' + cleaned;
    } 
    return '+' + cleaned;
};
