// Fill this with your Firebase project config
// Do NOT commit secrets; these values are public web config values.
// Example shape:
// window.firebaseConfig = {
//   apiKey: "...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.appspot.com",
//   messagingSenderId: "...",
//   appId: "..."
// };

window.firebaseConfig = window.firebaseConfig || {
  apiKey: "AIzaSyDemya3LBmhAZoDbKLodJ1f03JMjydMdEU",
  authDomain: "scarsdalebuzz.com",
  projectId: "scarsdale-buzz-prod",
  storageBucket: "scarsdale-buzz-prod.appspot.com",
  messagingSenderId: "942213582160",
  appId: "1:942213582160:web:54f165829c3dbb6514b055",
  measurementId: "G-81E3DP7LET"
};

// Function URLs for Production
window.firebaseConfig.functionUrls = {
    verifyAdminRole: "https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/verifyAdminRole",
    deleteUser: "https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/deleteUser",
    deleteService: "https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/deleteService",
    findBusinessContactInfo: "https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/findBusinessContactInfo",
    submitRequest: "https://submitrequest-bnvo6soxla-uc.a.run.app",
    handleUserResponse: "https://handleuserresponse-bnvo6soxla-uc.a.run.app",
    cancelRequest: "https://cancelrequest-bnvo6soxla-uc.a.run.app"
};

// Global Helper for Phone Formatting
// converts (555) 123-4567 -> +15551234567
window.formatPhoneNumber = (input) => {
    if (!input) return '';
    
    // Remove all non-digits
    let cleaned = ('' + input).replace(/\D/g, '');
    
    // Handle US country code
    // If 10 digits, assume US and prepend 1
    if (cleaned.length === 10) {
        cleaned = '1' + cleaned;
    } 
    // If 11 digits and starts with 1, it's already good
    
    return '+' + cleaned;
};
