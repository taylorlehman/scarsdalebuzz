const functions = require("firebase-functions");
const functionsV1 = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const logger = require("firebase-functions/logger");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { defineString } = require('firebase-functions/params');
const twilio = require('twilio');
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const PROMPTS = require('./prompts');
const TOOLS = require('./tools');

// Define environment variables
const GEMINI_API_KEY = defineString('GEMINI_API_KEY');

const cors = require('cors')({ origin: true });

// Helper function to verify ID token
async function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null; // Token not found or invalid format
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        logger.warn('Error verifying ID token:', error);
        return null; // Token verification failed
    }
}

// Export the internal helper function for unit testing ONLY
exports.verifyAuthToken = verifyAuthToken;

const verifyAuthAndGetClaims = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return { uid: decodedToken.uid, isAdmin: !!decodedToken.admin };
    } catch (error) {
        logger.error("Error verifying ID token:", error);
        return null;
    }
};

// --- ADMIN CONFIGURATION ---


exports.verifyAdminRole = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthenticated' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            logger.error("Error verifying ID token:", error);
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        const email = decodedToken.email;
        const uid = decodedToken.uid;
        logger.info(`Verifying admin role for email: ${email} (uid: ${uid})`);

        // Check 1: Email domain
        const isTlLabs = email && email.endsWith('@tl-labs.com');

        // Check 2: Existing admin claim (via User Record)
        let hasAdminClaim = false;
        try {
            const userRecord = await admin.auth().getUser(uid);
            hasAdminClaim = !!(userRecord.customClaims && userRecord.customClaims.admin);
        } catch (e) {
            logger.error(`Error fetching user record for ${uid}:`, e);
        }

        if (isTlLabs || hasAdminClaim) {
            // Grant/Refresh admin claim if not already present or just to be safe
            if (!hasAdminClaim) {
                try {
                    logger.info(`Attempting to grant admin privileges (setCustomUserClaims) to ${email}...`);
                    await admin.auth().setCustomUserClaims(uid, { admin: true });
                    logger.info(`Successfully granted admin privileges to ${email}`);
                    res.json({ isAdmin: true, message: 'Admin privileges granted.' });
                } catch (error) {
                    logger.error(`Failed to set custom user claims for ${email}.`, error);
                    res.status(500).json({ error: 'Failed to grant admin privileges.' });
                }
            } else {
                logger.info(`User ${email} is already an admin.`);
                res.json({ isAdmin: true, message: 'Already an admin.' });
            }
        } else {
            logger.warn(`Access denied for email: ${email}`);
            res.json({ isAdmin: false, message: 'Not authorized.' });
        }
    });
});

exports.grantAdminRole = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).send('Unauthorized');
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            logger.error("Error verifying ID token:", error);
            res.status(401).send('Invalid token');
            return;
        }

        // Enforce Admin Check
        if (decodedToken.admin !== true) {
            res.status(403).send('Forbidden: Admin access required');
            return;
        }

        const { uid } = req.body;
        if (!uid) {
            res.status(400).send('Target UID is required');
            return;
        }

        try {
            logger.info(`Granting admin role to user ${uid} by request of ${decodedToken.email}`);

            // 1. Set custom claim
            await admin.auth().setCustomUserClaims(uid, { admin: true });

            // 2. Update Firestore user doc
            await admin.firestore().collection('users').doc(uid).set({ isAdmin: true }, { merge: true });

            logger.info(`Successfully granted admin role to ${uid}`);
            res.json({ success: true, message: 'Admin role granted successfully' });

        } catch (error) {
            logger.error("Error granting admin role:", error);
            res.status(500).send("Internal Server Error: " + error.message);
        }
    });
});

exports.deleteUser = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).send('Unauthorized');
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            logger.error("Error verifying ID token:", error);
            res.status(401).send('Invalid token');
            return;
        }

        // Enforce Admin Check
        if (decodedToken.admin !== true) {
            res.status(403).send('Forbidden: Admin access required');
            return;
        }

        const { uid } = req.body;
        if (!uid) {
            res.status(400).send('Target UID is required');
            return;
        }

        try {
            const db = admin.firestore();
            logger.info(`Starting deletion process for user ${uid}`);

            // 1. Find and delete all recommendations by this user
            const recsSnapshot = await db.collectionGroup('recommendations').where('uid', '==', uid).get();
            logger.info(`Found ${recsSnapshot.size} recommendations to delete`);

            // Process recommendations
            for (const doc of recsSnapshot.docs) {
                await doc.ref.delete();
                const serviceRef = doc.ref.parent.parent;
                if (serviceRef) {
                    // Use transaction to update service stats safely
                    try {
                        await db.runTransaction(async (t) => {
                            const sDoc = await t.get(serviceRef);
                            if (!sDoc.exists) return;
                            const data = sDoc.data();
                            const newRecs = (data.recommendations || 0) - 1;
                            const newRecent = (data.recentRecommenders || []).filter(r => r.uid !== uid);
                            t.update(serviceRef, {
                                recommendations: newRecs < 0 ? 0 : newRecs,
                                recentRecommenders: newRecent
                            });
                        });
                    } catch (err) {
                        logger.warn(`Failed to update service stats for ${serviceRef.id}:`, err);
                    }
                }
            }

            // 2. Delete user doc
            await db.collection('users').doc(uid).delete();

            // 3. Delete from Auth
            await admin.auth().deleteUser(uid);

            logger.info(`Successfully deleted user ${uid}`);
            res.json({ success: true, message: 'User deleted successfully' });

        } catch (error) {
            logger.error("Error deleting user:", error);
            res.status(500).send("Internal Server Error: " + error.message);
        }
    });
});

exports.deleteService = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).send('Unauthorized');
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            logger.error("Error verifying ID token:", error);
            res.status(401).send('Invalid token');
            return;
        }

        // Enforce Admin Check
        if (decodedToken.admin !== true) {
            res.status(403).send('Forbidden: Admin access required');
            return;
        }

        const { serviceId } = req.body;
        if (!serviceId) {
            res.status(400).send('Service ID is required');
            return;
        }

        try {
            const db = admin.firestore();
            logger.info(`Starting deletion process for service ${serviceId}`);

            const serviceRef = db.collection('services').doc(serviceId);

            // 1. Delete recommendations subcollection
            const recsSnapshot = await serviceRef.collection('recommendations').get();
            const batch = db.batch();
            recsSnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            logger.info(`Deleted ${recsSnapshot.size} recommendations for service ${serviceId}`);

            // 2. Remove serviceId from users' likedServices array - REMOVED (deprecated)
            // No longer maintaining likedServices array on user docs.
            /*
            const usersSnapshot = await db.collection('users')
                .where('likedServices', 'array-contains', serviceId)
                .get();
                
            logger.info(`Found ${usersSnapshot.size} users with this service in likedServices`);
            
            const userBatch = db.batch();
            let operationCount = 0;
            const MAX_BATCH_SIZE = 450; 

            for (const userDoc of usersSnapshot.docs) {
                userBatch.update(userDoc.ref, {
                    likedServices: admin.firestore.FieldValue.arrayRemove(serviceId)
                });
                operationCount++;
                
                if (operationCount >= MAX_BATCH_SIZE) {
                    await userBatch.commit();
                    // Reset batch is complicated in loop, better to just await and create new one if needed
                    // For simplicity in this context, assuming < 450 users per service deletion usually.
                    // If scaling needed, would implement chunking.
                }
            }
            if (operationCount > 0 && operationCount < MAX_BATCH_SIZE) {
                await userBatch.commit();
            }
            */

            // 3. Delete the service document itself
            await serviceRef.delete();

            logger.info(`Successfully deleted service ${serviceId}`);
            res.json({ success: true, message: 'Service deleted successfully' });

        } catch (error) {
            logger.error("Error deleting service:", error);
            res.status(500).send("Internal Server Error: " + error.message);
        }
    });
});

// Helper function to generate and save a summary for a request
const generateAndSaveSummary = async (requestId) => {
    const requestRef = admin.firestore().collection('requests').doc(requestId);
    try {
        const doc = await requestRef.get();
        if (!doc.exists) {
            logger.error(`Summary generation failed: Document ${requestId} does not exist.`);
            return;
        }

        const chatHistory = doc.data().chat_history || [];
        if (chatHistory.length === 0) {
            await requestRef.update({ summary: 'Request created.' });
            return;
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `${PROMPTS.SUMMARY_PROMPT}\n\nChat History:\n${JSON.stringify(chatHistory)}`;
        const result = await model.generateContent(prompt);
        const summary = result.response.text();

        await requestRef.update({ summary });
        logger.info(`Summary saved for request ${requestId}: ${summary}`);
    } catch (e) {
        logger.error(`Failed to generate and save summary for request ${requestId}:`, e);
    }
};

const extractJson = (str) => {
    const match = str.match(/```json\n(.+?)\n```/s);
    if (match && match[1]) {
        return match[1];
    }
    return str; // Return the original string if no match is found
};

// Helper function to add a message to a request's chat history
const addMessageToChatHistory = async (requestId, sender, receiver, message, phoneNumber) => {
    const requestRef = admin.firestore().collection('requests').doc(requestId);

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const doc = await transaction.get(requestRef);
            if (!doc.exists) {
                throw "Document does not exist!";
            }

            const chatHistory = doc.data().chat_history || [];

            const newMessage = {
                sender,
                receiver,
                role: sender, // Backward compatibility
                message,
                timestamp: new Date(),
                phoneNumber
            };

            chatHistory.push(newMessage);

            transaction.update(requestRef, { chat_history: chatHistory });
        });
        logger.info(`Message from ${sender} to ${receiver} added to request ${requestId}`);
    } catch (e) {
        logger.error("Transaction failed: ", e);
    }
};

/**
 * NEW: Intake Processing Helper
 * Decides whether to ask more questions or proceed to finding a provider.
 */
const processIntake = async (requestRef, userContext, chatHistory, intakeCount, isAdmin) => {
    logger.info(`Processing intake for request ${requestRef.id}, count: ${intakeCount}, isAdmin: ${isAdmin}`);

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
    const tools = [TOOLS.ASK_CLARIFYING_QUESTION_TOOL, TOOLS.PROCEED_TO_PROVIDER_TOOL];

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        tools: tools
    });

    const prompt = PROMPTS.INTAKE_DECISION_PROMPT(userContext, chatHistory, intakeCount);

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const functionCalls = response.functionCalls();

        let responseMessage = "";

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            const args = call.args;
            logger.info(`Intake Tool called: ${call.name}`, args);

            if (call.name === "ask_clarifying_question") {
                // Scenario A: Ask Question
                responseMessage = args.question;

                // Add Sunny's question to history
                await addMessageToChatHistory(requestRef.id, 'Sunny', 'User', responseMessage, null);

                // Increment intake count
                await requestRef.update({
                    intakeCount: admin.firestore.FieldValue.increment(1)
                });

            } else if (call.name === "proceed_to_provider") {
                // Scenario B: Proceed
                logger.info("Intake complete. Proceeding to provider.");

                // Notify user we are moving forward
                const transitionMsg = "Thanks! I have everything I need. I'm contacting a provider now.";
                await addMessageToChatHistory(requestRef.id, 'Sunny', 'User', transitionMsg, null);

                // Call the provider logic
                responseMessage = await findAndContactProvider(requestRef, userContext, chatHistory, args.scope, args.urgency, args.availability, isAdmin);
            }
        } else {
            // Fallback: Model replied with text? Treat as question.
            responseMessage = response.text() || "Could you tell me a bit more about the issue?";
            await addMessageToChatHistory(requestRef.id, 'Sunny', 'User', responseMessage, null);
        }

        return responseMessage;

    } catch (error) {
        logger.error("Error in processIntake:", error);
        return "I'm having trouble processing your request right now.";
    }
};

/**
 * NEW: Provider Outreach Helper
 * Extracted logic for finding and messaging a plumber.
 */
const findAndContactProvider = async (requestRef, userContext, chatHistory, scope, urgency, availability, isAdmin) => {
    logger.info(`Finding provider for request ${requestRef.id}, isAdmin: ${isAdmin}`);

    // Update status to searching/in progress
    await requestRef.update({ status: 'in progress' });

    // 1. Find a Plumber (Mock or DB lookup)
    let providerName = 'Unknown Provider';
    let providerPhone = null;

    try {
        const servicesRef = admin.firestore().collection('services');
        const snapshot = await servicesRef
            .where('category', '==', 'Plumbing')
            .where('sunnyApproved', '==', true)
            .limit(5) // Fetch more to allow for filtering
            .get();

        if (!snapshot.empty) {
            // Filter logic:
            // If !isAdmin, filter out test providers.
            // If isAdmin, allow all (prioritize test providers? No, treating like any other as per user instruction).

            const candidates = snapshot.docs.map(d => d.data());

            let filteredCandidates = candidates;
            if (!isAdmin) {
                filteredCandidates = candidates.filter(c => !c.isTestProvider);
            }

            if (filteredCandidates.length > 0) {
                const doc = filteredCandidates[0];
                providerName = doc.businessName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
                providerPhone = doc.phone;
                logger.info(`Found sunny approved provider: ${providerName}`);
            } else {
                logger.warn("No sunny approved plumber found after filtering.");
            }
        } else {
            logger.warn("No sunny approved plumber found.");
        }
    } catch (e) {
        logger.error("Error querying provider", e);
    }

    // Save provider info
    await requestRef.update({
        providerName: providerName,
        providerPhoneNumber: providerPhone
    });

    if (!providerPhone) {
        const msg = `I reviewed your request, but I couldn't find an available Sunny Approved plumber at the moment. Please try again later.`;
        await addMessageToChatHistory(requestRef.id, 'Sunny', 'User', msg, null);
        return msg;
    }

    // 2. Generate SMS using Gemini (Standard SUBMIT_REQUEST_PROMPT or a variation)
    // We can reuse SUBMIT_REQUEST_PROMPT but pass the gathered details
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
    // Note: SUBMIT_REQUEST_PROMPT expects (userContext, description). 
    // We'll construct a rich description from our gathered info.
    const richDescription = `
    Issue: ${scope}
    Urgency: ${urgency}
    Availability: ${availability}
    Original Request History: ${JSON.stringify(chatHistory)}
    `;

    // We can't reuse SUBMIT_REQUEST_PROMPT exactly because it expects a tool call structure 
    // inside the prompt instructions that we might not want to re-execute fully 
    // (we already found the provider). 
    // BUT for simplicity, let's just generate the TEXT for the SMS directly using a simple model call.

    const smsPrompt = `
    You are Sunny, an AI assistant. You need to write a text message to a plumber named ${providerName}.
    
    CONTEXT:
    Homeowner: ${userContext}
    Issue: ${scope}
    Urgency: ${urgency}
    Availability: ${availability}
    
    GOAL:
    Write a professional, concise text to ${providerName} asking for availability.
    - Introduce yourself as "Sunny, an AI assistant for [Homeowner Name]".
    - Describe the issue and urgency.
    - Mention the homeowner's availability.
    - DO NOT share the homeowner's phone/address yet.
    - KEEP IT SHORT (under 160 chars is best, max 300).
    
    Respond with ONLY the text message body.
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(smsPrompt);
    let messageToSend = result.response.text();

    // 3. Send SMS via Twilio
    try {
        const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilioClient.messages.create({
            body: messageToSend,
            from: process.env.TWILIO_PHONE_NUMBER,
            messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
            to: providerPhone
        });
        logger.info("Text message sent successfully.");

        // Log Sunny -> Provider
        await addMessageToChatHistory(requestRef.id, 'Sunny', 'Service Provider', messageToSend, process.env.TWILIO_PHONE_NUMBER);

    } catch (twilioError) {
        logger.error("Twilio Error:", twilioError.message);
    }

    // 4. Return user confirmation
    const userMsg = `I've contacted ${providerName} with the details. I'll let you know when they reply!`;
    await addMessageToChatHistory(requestRef.id, 'Sunny', 'User', userMsg, null);

    return userMsg;
};

/**
 * AUTH TRIGGER: User Deletion Cleanup
 * Automatically cleans up Firestore data when a user is deleted from Firebase Auth.
 * This covers deletions from the Firebase Console or Admin SDK.
 */
exports.onUserDeleted = functionsV1.auth.user().onDelete(async (user) => {
    const uid = user.uid;
    logger.info(`Auth deletion trigger: Starting cleanup for user ${uid}`);

    try {
        const db = admin.firestore();

        // 1. Find and delete all recommendations by this user
        const recsSnapshot = await db.collectionGroup('recommendations').where('uid', '==', uid).get();
        logger.info(`Found ${recsSnapshot.size} recommendations to delete`);

        for (const doc of recsSnapshot.docs) {
            await doc.ref.delete();
            const serviceRef = doc.ref.parent.parent;
            if (serviceRef) {
                try {
                    await db.runTransaction(async (t) => {
                        const sDoc = await t.get(serviceRef);
                        if (!sDoc.exists) return;
                        const data = sDoc.data();
                        const newRecs = (data.recommendations || 0) - 1;
                        const newRecent = (data.recentRecommenders || []).filter(r => r.uid !== uid);
                        t.update(serviceRef, {
                            recommendations: newRecs < 0 ? 0 : newRecs,
                            recentRecommenders: newRecent
                        });
                    });
                } catch (err) {
                    logger.warn(`Failed to update service stats for ${serviceRef.id}:`, err);
                }
            }
        }

        // 2. Delete user doc in Firestore
        // Check if it still exists (it might if deleted via Console)
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
            await userDocRef.delete();
            logger.info(`Deleted user profile document for ${uid}`);
        }

        // 3. Optional: Delete user's requests
        const requestsSnapshot = await db.collection('requests').where('userId', '==', uid).get();
        const batch = db.batch();
        requestsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        if (!requestsSnapshot.empty) {
            await batch.commit();
            logger.info(`Deleted ${requestsSnapshot.size} requests for user ${uid}`);
        }

        logger.info(`Cleanup complete for user ${uid}`);

    } catch (error) {
        logger.error("Error in onUserDeleted trigger:", error);
        // Note: We cannot "cancel" the auth deletion here as it has already happened.
    }
});

/**
 * SYNC USER PROFILE TO PUBLIC
 * Listens for changes to the 'users' collection and updates a restricted public copy
 * in 'public_profiles'. This allows safe public access for the rolodex feature.
 * Uses v1 syntax for consistency with other triggers.
 */
exports.syncPublicProfile = functionsV1.firestore
    .document('users/{userId}')
    .onWrite(async (change, context) => {
        const userId = context.params.userId;
        const publicProfileRef = admin.firestore().collection('public_profiles').doc(userId);

        if (!change.after.exists) {
            // User deleted, delete public profile
            await publicProfileRef.delete();
            logger.info(`Deleted public profile for ${userId}`);
            return;
        }

        const data = change.after.data();
        const publicData = {
            displayName: data.displayName || 'Neighbor',
            photoURL: data.photoURL || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await publicProfileRef.set(publicData, { merge: true });
        logger.info(`Synced public profile for ${userId}`);
    });

exports.submitRequest = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        logger.info("HTTP Function called: submitRequest");

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const auth = await verifyAuthAndGetClaims(req);
        if (!auth) {
            res.status(401).send('Unauthorized');
            return;
        }
        const { uid: userId, isAdmin } = auth;

        // Fetch User Profile for context
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        const userData = userDoc.data() || {};
        const userContext = `
        Homeowner Name: ${userData.displayName || 'The Homeowner'}
        Homeowner Address: ${userData.address || 'Unknown Address'}
        Homeowner Phone: ${userData.phoneNumber || 'Unknown Phone'}
        `;

        let description;

        if (req.get('content-type') === 'application/json') {
            description = req.body.description;
        } else {
            description = req.body;
        }

        logger.info("Description:", description);
        logger.info("UserId:", userId);

        if (!description || description.trim() === '') {
            res.status(400).send('Description is required');
            return;
        }

        try {
            logger.info("Initializing Gemini client for Title generation");
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: ""
            });

            // 1. Generate Title
            const titlePrompt = `${PROMPTS.TITLE_PROMPT}\n\nRequest: ${description}`;
            const titleResult = await model.generateContent(titlePrompt);
            const title = titleResult.response.text();
            logger.info(`Generated title: ${title}`);

            // 2. Create the request
            // Initialize with status: 'intake' and intakeCount: 0
            const newRequestRef = await admin.firestore().collection('requests').add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'intake',
                intakeCount: 0,
                title: title,
                userId: userId,
                summary: 'Request submitted. Starting intake...',
                chat_history: [{
                    sender: 'User',
                    receiver: 'Sunny',
                    role: 'User',
                    message: description,
                    timestamp: new Date(),
                    phoneNumber: null
                }]
            });

            logger.info(`Created request ${newRequestRef.id} in intake mode`);

            // 3. Start Intake Process
            // Retrieve the fresh doc to get the formatted chat_history object if needed, 
            // but we can construct the initial history from what we just wrote.
            const initialHistory = [{
                sender: 'User',
                receiver: 'Sunny',
                role: 'User',
                message: description,
                timestamp: new Date(),
                phoneNumber: null
            }];

            const responseMessage = await processIntake(newRequestRef, userContext, initialHistory, 0, isAdmin);

            await generateAndSaveSummary(newRequestRef.id);

            res.status(200).json({ message: responseMessage, id: newRequestRef.id });

        } catch (error) {
            logger.error("Error in submitRequest:", error);
            res.status(500).send('Failed to process request');
        }
    });
});

exports.incomingSms = functions.https.onRequest(async (req, res) => {
    logger.info("Incoming SMS received");

    const from = req.body.From;
    const body = req.body.Body;
    logger.info(`From: ${from}, Body: ${body}`);

    try {
        // 1. Find the most recent 'in progress' request
        const requestsRef = admin.firestore().collection('requests');
        const snapshot = await requestsRef.where('status', '==', 'in progress').orderBy('timestamp', 'desc').limit(1).get();

        if (snapshot.empty) {
            logger.warn("No 'in progress' requests found. Ignoring message.");
            res.status(200).send('No active request.');
            return;
        }

        const requestDoc = snapshot.docs[0];
        const requestData = requestDoc.data();

        // 2. Append incoming message to chat history (Provider -> Sunny)
        await addMessageToChatHistory(requestDoc.id, 'Service Provider', 'Sunny', body, from);

        // We need to refetch the data to get the latest chat history for the prompt
        const updatedRequestDoc = await requestDoc.ref.get();
        const updatedRequestData = updatedRequestDoc.data();
        const updatedChatHistory = updatedRequestData.chat_history;

        // Fetch User Context for Incoming SMS
        const userId = updatedRequestData.userId;
        const userDoc = await admin.firestore().collection('users').doc(userId).get();

        let isAdmin = false;
        try {
            const userRecord = await admin.auth().getUser(userId);
            isAdmin = !!(userRecord.customClaims && userRecord.customClaims.admin);
        } catch (e) {
            logger.warn(`Failed to fetch user record for ${userId} to check admin status`, e);
        }

        const userData = userDoc.data() || {};
        const userContext = `
        Homeowner Name: ${userData.displayName || 'The Homeowner'}
        Homeowner Address: ${userData.address || 'Unknown Address'}
        Homeowner Phone: ${userData.phoneNumber || 'Unknown Phone'}
        `;

        // 3. Pass conversation to Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        const confirmTools = [TOOLS.CONFIRM_APPOINTMENT_TOOL];

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: confirmTools
        });

        const currentDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const prompt = PROMPTS.INCOMING_SMS_PROMPT(currentDate, userContext, updatedChatHistory);

        const result = await model.generateContent(prompt);
        const response = result.response;
        const functionCalls = response.functionCalls();

        // Check for Tool Call (Confirmation)
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            if (call.name === "confirm_appointment") {
                const args = call.args;
                logger.info("Tool called: confirm_appointment", args);

                // Update Firestore
                await requestDoc.ref.update({
                    status: 'scheduled',
                    serviceDate: args.appointmentDate,
                    providerName: args.providerName,
                    providerPhoneNumber: args.providerPhoneNumber // Ensure this is captured
                });
                logger.info("Request status updated to 'scheduled'.");

                // Generate and save summary
                await generateAndSaveSummary(requestDoc.id);

                // Notify Provider
                const confirmationMsg = `Great, the appointment is confirmed for ${new Date(args.appointmentDate).toLocaleString()}. I've updated the request.`;
                const twiml = new MessagingResponse();
                twiml.message(confirmationMsg);

                // Log Sunny -> Provider
                await addMessageToChatHistory(requestDoc.id, 'Sunny', 'Service Provider', confirmationMsg, process.env.TWILIO_PHONE_NUMBER);

                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(twiml.toString());
                return;
            }
        }

        // Fallback to JSON logic if no tool called
        const geminiResponseText = response.text();
        logger.info("Gemini analysis response:", geminiResponseText);

        const cleanJsonString = extractJson(geminiResponseText);
        const geminiJson = JSON.parse(cleanJsonString);

        // 4. Update status and save Gemini's messages
        const messageToUser = geminiJson.messageToUser;
        const messageToProvider = geminiJson.messageToProvider;

        // Heuristics fallback
        const impliesUserInput = (messageToUser || "").toLowerCase().includes("ask the homeowner");

        // Note: isScheduled check removed in favor of tool call, but keeping fallback just in case
        if (geminiJson.isScheduled) {
            // ... existing logic fallback ...
            await requestDoc.ref.update({ status: 'scheduled' });
        } else if (geminiJson.isProviderUnavailable) {
            await requestDoc.ref.update({ status: 'provider unavailable' });
            logger.info("Request status updated to 'provider unavailable'.");
        } else if (geminiJson.needsUserInput || impliesUserInput) {
            await requestDoc.ref.update({ status: 'user action required' });
            logger.info("Request status updated to 'user action required'.");
        }

        // Log Sunny -> User message
        if (messageToUser) {
            await addMessageToChatHistory(requestDoc.id, 'Sunny', 'User', messageToUser, null);
        }

        // Log Sunny -> Provider message
        if (messageToProvider) {
            await addMessageToChatHistory(requestDoc.id, 'Sunny', 'Service Provider', messageToProvider, process.env.TWILIO_PHONE_NUMBER);
        }

        // Generate and save the summary after all updates
        await generateAndSaveSummary(requestDoc.id);

        // 5. Respond via Twilio (to Provider)
        const twiml = new MessagingResponse();
        if (messageToProvider) {
            twiml.message(messageToProvider);
        }
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());

    } catch (error) {
        logger.error("Error processing incoming SMS:", error);
        res.status(500).send('Error processing message');
    }
});

exports.cancelRequest = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        logger.info("cancelRequest function called");

        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        const userId = await verifyAuthToken(req);
        if (!userId) {
            return res.status(401).send('Unauthorized');
        }

        const { requestId } = req.body;
        if (!requestId) {
            return res.status(400).send('Request ID is required.');
        }

        try {
            const requestRef = admin.firestore().collection('requests').doc(requestId);
            const doc = await requestRef.get();

            if (!doc.exists) {
                return res.status(404).send('Request not found.');
            }

            const requestData = doc.data();

            if (requestData.userId !== userId) {
                return res.status(403).send('Forbidden');
            }

            // Find provider phone using the new or old schema
            // New schema: look for messages where sender is 'Service Provider'
            const providerMessage = requestData.chat_history.find(m => m.sender === 'Service Provider' || m.role === 'Service Provider');
            const providerPhoneNumber = requestData.providerPhoneNumber || (providerMessage ? providerMessage.phoneNumber : null);

            // Send cancellation text if we have a provider phone number
            if (providerPhoneNumber) {
                const cancellationMessage = "This request has been cancelled and is no longer needed. Thank you so much for your time, we really appreciate it!";
                const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                await twilioClient.messages.create({
                    body: cancellationMessage,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                    to: providerPhoneNumber
                });
                logger.info(`Cancellation text sent to ${providerPhoneNumber} for request ${requestId}`);
            }

            // Delete the request from Firestore
            await requestRef.delete();
            logger.info(`Request ${requestId} deleted successfully.`);

            res.status(200).send({ success: true, message: 'Request cancelled successfully.' });

        } catch (error) {
            logger.error(`Error cancelling request ${requestId}:`, error);
            res.status(500).send('Failed to cancel request.');
        }
    });
});

exports.handleUserResponse = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        logger.info("handleUserResponse function called");

        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        const auth = await verifyAuthAndGetClaims(req);
        if (!auth) {
            return res.status(401).send('Unauthorized');
        }
        const { uid: userId, isAdmin } = auth;

        const { requestId, response } = req.body;
        if (!requestId || !response) {
            return res.status(400).json({ error: 'Request ID and response are required.' });
        }

        const db = admin.firestore();
        const requestRef = db.collection('requests').doc(requestId);

        try {
            // 1. Fetch current data
            const requestDoc = await requestRef.get();
            if (!requestDoc.exists) {
                return res.status(404).json({ error: 'Request not found.' });
            }
            const requestData = requestDoc.data();

            if (requestData.userId !== userId) {
                return res.status(403).send('Forbidden');
            }

            // Fetch User Profile for context
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.data() || {};
            const userContext = `
            Homeowner Name: ${userData.displayName || 'The Homeowner'}
            Homeowner Address: ${userData.address || 'Unknown Address'}
            Homeowner Phone: ${userData.phoneNumber || 'Unknown Phone'}
            `;

            const currentHistory = requestData.chat_history || [];

            // 2. Construct User Message object
            const userMessage = {
                sender: 'User',
                receiver: 'Sunny',
                role: 'User',
                message: response,
                timestamp: new Date(),
                phoneNumber: null
            };

            // NEW: Handle Intake Phase
            if (requestData.status === 'intake') {
                // Add user message to history first
                await requestRef.update({
                    chat_history: admin.firestore.FieldValue.arrayUnion(userMessage)
                });

                // Add the user message to our local history for the prompt
                const updatedHistory = [...currentHistory, userMessage];

                const responseMessage = await processIntake(requestRef, userContext, updatedHistory, requestData.intakeCount || 0, isAdmin);

                await generateAndSaveSummary(requestId);
                return res.status(200).json({ success: true, message: responseMessage });
            }

            // 3. Provisional History for Analysis
            const provisionalHistory = [...currentHistory, userMessage];

            // 4. Analyze and Decide Action via Gemini
            let toolCalled = false;
            let finalMessageToUser = null; // Will be returned to client

            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
                // Available tools for this step
                const tools = [TOOLS.MANAGE_REQUEST_TOOL, TOOLS.CONFIRM_APPOINTMENT_TOOL];

                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    tools: tools
                });

                const currentDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                const prompt = PROMPTS.USER_RESPONSE_HANDLER_PROMPT(currentDate, userContext, provisionalHistory);

                const result = await model.generateContent(prompt);
                const response = result.response;
                const functionCalls = response.functionCalls();

                // Initialize history updates with the user's message
                const newHistoryEntries = [userMessage];

                // Get provider phone number if available
                const providerPhoneNumber = requestData.providerPhoneNumber || (currentHistory.find(m => m.sender === 'Service Provider' || m.role === 'Service Provider')?.phoneNumber);

                if (functionCalls && functionCalls.length > 0) {
                    toolCalled = true;
                    const call = functionCalls[0];
                    const args = call.args;
                    logger.info(`Tool called: ${call.name}`, args);

                    if (call.name === "manage_request") {
                        // Handle General Management (Message User, Message Provider, Update Status)

                        // 1. Message to Provider (if any)
                        if (args.messageToProvider && providerPhoneNumber) {
                            try {
                                const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                                await twilioClient.messages.create({
                                    body: args.messageToProvider,
                                    from: process.env.TWILIO_PHONE_NUMBER,
                                    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                                    to: providerPhoneNumber
                                });

                                // Log Sunny -> Provider
                                newHistoryEntries.push({
                                    sender: 'Sunny',
                                    receiver: 'Service Provider',
                                    role: 'Sunny',
                                    message: args.messageToProvider,
                                    timestamp: new Date(),
                                    phoneNumber: process.env.TWILIO_PHONE_NUMBER
                                });
                            } catch (twilioError) {
                                logger.error("Failed to message provider:", twilioError);
                            }
                        }

                        // 2. Message to User (Required)
                        if (args.messageToUser) {
                            finalMessageToUser = args.messageToUser;
                            newHistoryEntries.push({
                                sender: 'Sunny',
                                receiver: 'User',
                                role: 'Sunny',
                                message: args.messageToUser,
                                timestamp: new Date(),
                                phoneNumber: null
                            });
                        }

                        // 3. Update Status (Optional)
                        if (args.updateStatus) {
                            await requestRef.update({ status: args.updateStatus });
                            logger.info(`Status updated to: ${args.updateStatus}`);
                        }

                        // Commit updates
                        await requestRef.update({
                            chat_history: admin.firestore.FieldValue.arrayUnion(...newHistoryEntries)
                        });

                    } else if (call.name === "confirm_appointment") {
                        // Handle Confirmation Logic
                        const confirmationMsg = `Great, the appointment is confirmed for ${new Date(args.appointmentDate).toLocaleString()}. I've updated the request.`;
                        finalMessageToUser = confirmationMsg;

                        // 1. Notify Provider
                        if (providerPhoneNumber) {
                            const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                            await twilioClient.messages.create({
                                body: confirmationMsg,
                                from: process.env.TWILIO_PHONE_NUMBER,
                                messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                                to: providerPhoneNumber
                            });
                        }

                        // 2. Log Sunny -> Provider
                        newHistoryEntries.push({
                            sender: 'Sunny',
                            receiver: 'Service Provider',
                            role: 'Sunny',
                            message: confirmationMsg,
                            timestamp: new Date(),
                            phoneNumber: process.env.TWILIO_PHONE_NUMBER
                        });

                        // 3. Update DB
                        await requestRef.update({
                            chat_history: admin.firestore.FieldValue.arrayUnion(...newHistoryEntries),
                            status: 'scheduled',
                            serviceDate: args.appointmentDate,
                            providerName: args.providerName,
                            providerPhoneNumber: args.providerPhoneNumber
                        });
                    }
                } else {
                    // Fallback: No tool called (Gemini just replied with text?)
                    // In this case, treat the text response as a reply to the user.
                    const textResponse = response.text();
                    if (textResponse) {
                        finalMessageToUser = textResponse;
                        newHistoryEntries.push({
                            sender: 'Sunny',
                            receiver: 'User',
                            role: 'Sunny',
                            message: textResponse,
                            timestamp: new Date(),
                            phoneNumber: null
                        });

                        await requestRef.update({
                            chat_history: admin.firestore.FieldValue.arrayUnion(...newHistoryEntries)
                        });
                    }
                }

            } catch (aiError) {
                logger.error("Error in AI processing:", aiError);
                // Fallback safe response if AI fails completely
                const fallbackEntry = [userMessage, {
                    sender: 'Sunny',
                    receiver: 'User',
                    role: 'Sunny',
                    message: "I received your message. I'm having trouble processing it right now, but I've logged it.",
                    timestamp: new Date(),
                    phoneNumber: null
                }];
                await requestRef.update({
                    chat_history: admin.firestore.FieldValue.arrayUnion(...fallbackEntry)
                });
                finalMessageToUser = "I received your message. I'm having trouble processing it right now, but I've logged it.";
            }

            // Generate summary
            await generateAndSaveSummary(requestId);

            // Respond to client with the message intended for them (or the last one added)
            // If the tool didn't generate a user message, we might need a default, but our prompt enforces it.
            res.status(200).json({ success: true, message: finalMessageToUser || "Message received." });

        } catch (error) {
            logger.error(`Error handling user response for request ${requestId}:`, error);
            res.status(500).json({ error: 'Failed to process response.' });
        }
    });
});

exports.findBusinessContactInfo = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthenticated' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            logger.error("Error verifying ID token:", error);
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        if (decodedToken.admin !== true) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        // Parse Body - onRequest receives parsed JSON in req.body usually,
        // but 'onCall' clients wrap it in { data: ... }.
        // Our updated admin.js sends { data: ... } explicitly.
        const bodyData = req.body.data || req.body;
        const { businessName, category, address } = bodyData;

        if (!businessName) {
            res.status(400).json({ error: 'Business Name is required' });
            return;
        }

        logger.info(`Searching contact info for: ${businessName} (${category}) in ${address}`);

        const apiKey = GEMINI_API_KEY.value();
        if (!apiKey) {
            logger.error("GEMINI_API_KEY is missing or empty.");
            res.status(500).json({ error: "Server configuration error: API key missing." });
            return;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);

            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                tools: [{
                    googleSearch: {}
                }]
            });

            const prompt = PROMPTS.FIND_CONTACT_INFO_PROMPT(businessName, category, address);

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            const cleanJson = extractJson(text);
            let parsedData;
            try {
                parsedData = JSON.parse(cleanJson);
            } catch (e) {
                logger.error("Failed to parse Gemini JSON response", text);
                res.status(500).json({ error: 'AI response was not valid JSON' });
                return;
            }

            // Return { result: ... } to match onCall format if we want consistency,
            // or just the data. Since we updated admin.js to expect { result: ... }, let's do that.
            res.json({ result: parsedData });

        } catch (error) {
            logger.error("Error in findBusinessContactInfo:", error);
            res.status(500).json({ error: 'Failed to find contact info: ' + error.message });
        }
    });
});
