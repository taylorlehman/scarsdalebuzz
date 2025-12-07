const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const logger = require("firebase-functions/logger");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { defineString } = require('firebase-functions/params');
const twilio = require('twilio');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

// Define environment variables
const GEMINI_API_KEY = defineString('GEMINI_API_KEY');

const cors = require('cors')({origin: true});

// Helper function to extract a JSON string from a Markdown code block
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

        const prompt = `${process.env.GEMINI_PROMPT_SUMMARY}\n\nChat History:\n${JSON.stringify(chatHistory)}`;
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
        throw e;
    }
};

exports.submitRequest = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        logger.info("HTTP Function called");

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const description = req.body;
        logger.info("Description from body:", description);

        if (!description || description.trim() === '') {
            res.status(400).send('Description is required');
            return;
        }

        try {
            logger.info("Initializing Gemini client");
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: ""
            });


            // 1. Generate Title
            const titlePrompt = `${process.env.GEMINI_PROMPT_TITLE}\n\nRequest: ${description}`;
            const titleResult = await model.generateContent(titlePrompt);
            const title = titleResult.response.text();
            logger.info(`Generated title: ${title}`);

            // 2. Create the request and add the first message (User -> Sunny)
            const newRequestRef = await admin.firestore().collection('requests').add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'in progress',
                title: title,
                summary: 'Request submitted. Generating initial message...',
                chat_history: [{
                    sender: 'User',
                    receiver: 'Sunny',
                    role: 'User',
                    message: description,
                    timestamp: new Date(),
                    phoneNumber: null
                }]
            });

            logger.info("Wrote user message to chat history");


            logger.info("Calling Gemini API with tools");
            
            // Define the tool
            const tools = [
                {
                    functionDeclarations: [
                        {
                            name: "get_plumber_contact_info",
                            description: "Retrieves the name and phone number of the available plumber.",
                        }
                    ]
                }
            ];

            // Re-initialize model with tools
            const toolModel = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                tools: tools
            });

            const chat = toolModel.startChat();

            const prompt = `${process.env.GEMINI_PROMPT_SUBMIT_REQUEST} ${description}
            
            IMPORTANT: You must use the 'get_plumber_contact_info' tool to find the plumber's contact details. The tool will return the name and phone number. 
            You MUST output your final response as a valid JSON object with three keys: 
            1. "message" (the text message content)
            2. "phoneNumber" (the plumber's phone number from the tool)
            3. "providerName" (the name of the plumber from the tool)
            Do not output markdown formatting for the JSON.`;

            let result = await chat.sendMessage(prompt);
            let response = result.response;
            let functionCalls = response.functionCalls();

            if (functionCalls && functionCalls.length > 0) {
                const call = functionCalls[0];
                if (call.name === "get_plumber_contact_info") {
                    logger.info("Executing tool: get_plumber_contact_info");
                    
                    let toolResult = { name: null, phoneNumber: null };
                    try {
                        const servicesRef = admin.firestore().collection('services');
                        // Query for a Sunny Approved Plumber
                        const snapshot = await servicesRef
                            .where('category', '==', 'Plumbing')
                            .where('sunnyApproved', '==', true)
                            .limit(1)
                            .get();

                        if (!snapshot.empty) {
                            const doc = snapshot.docs[0].data();
                            const providerName = doc.businessName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
                            toolResult = {
                                name: providerName,
                                phoneNumber: doc.phone
                            };
                            logger.info(`Found sunny approved provider: ${toolResult.name}`);
                        } else {
                            logger.warn("No sunny approved plumber found.");
                            // Fallback to mock or handle gracefully if desired, but for now returning nulls implies none found
                        }
                    } catch (e) {
                        logger.error("Error querying provider", e);
                    }
                    
                    // Send tool result back to model
                    result = await chat.sendMessage([{
                        functionResponse: {
                            name: "get_plumber_contact_info",
                            response: toolResult
                        }
                    }]);
                    response = result.response;
                }
            }

            let geminiResponseText = response.text();
            logger.info("Gemini response received:", geminiResponseText);

            let messageToSend = geminiResponseText;
            let phoneToSendTo = null;
            let providerName = 'Unknown Provider';

            try {
                const jsonString = extractJson(geminiResponseText);
                const parsed = JSON.parse(jsonString);
                if (parsed.message) messageToSend = parsed.message;
                if (parsed.phoneNumber) phoneToSendTo = parsed.phoneNumber;
                if (parsed.providerName) providerName = parsed.providerName;
                logger.info(`Parsed JSON - Message: ${messageToSend}, Phone: ${phoneToSendTo}, Provider: ${providerName}`);
            } catch (jsonError) {
                logger.warn("Failed to parse JSON from Gemini response, using raw text.", jsonError);
            }
            
            // Save provider info to the request document
            await newRequestRef.update({
                providerName: providerName,
                providerPhoneNumber: phoneToSendTo
            });
            logger.info(`Updated request ${newRequestRef.id} with provider info: ${providerName}, ${phoneToSendTo}`);
            
            let userConfirmation = '';

            if (phoneToSendTo) {
                if (messageToSend.length > 1599) {
                    messageToSend = messageToSend.substring(0, 1599);
                    logger.info("Gemini response truncated to 1599 characters.");
                }

                logger.info("Final message to be used:", messageToSend);

                // Send text message with Twilio
                logger.info(`Sending text message via Twilio to ${phoneToSendTo}`);
                try {
                    const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    await twilioClient.messages.create({
                        body: messageToSend,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: phoneToSendTo
                    });
                    logger.info("Text message sent successfully.");
                } catch (twilioError) {
                    logger.error("Twilio Error:", twilioError.message);
                    // Continue execution even if Twilio fails, but maybe note it?
                }

                // Log Sunny -> Provider message (Hidden from UI typically)
                await addMessageToChatHistory(newRequestRef.id, 'Sunny', 'Service Provider', messageToSend, process.env.TWILIO_PHONE_NUMBER);
                
                userConfirmation = `I'm on it! I've contacted ${providerName} to see if they can help. I'll let you know as soon as I hear back.`;
            } else {
                logger.warn("No phone number found/extracted. Skipping SMS.");
                userConfirmation = `I reviewed your request, but I couldn't find an available Sunny Approved plumber at the moment. Please try again later or check the directory manually.`;
                // We don't log a message to the provider since we didn't send one.
            }

            // NEW: Message the User (Sunny -> User)
            await addMessageToChatHistory(newRequestRef.id, 'Sunny', 'User', userConfirmation, null);

            await generateAndSaveSummary(newRequestRef.id);

            res.status(200).json({ message: userConfirmation, id: newRequestRef.id });
        } catch (error) {
            logger.error("Error message:", error.message);
            logger.error("Error stack:", error.stack);
            res.status(500).send('Failed to generate response');
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
        const updatedChatHistory = updatedRequestDoc.data().chat_history;

        // 3. Pass conversation to Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        const confirmTools = [
            {
                functionDeclarations: [
                    {
                        name: "confirm_appointment",
                        description: "Confirms the appointment when both the user and provider have agreed on a time.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                appointmentDate: { type: "STRING", description: "The confirmed date and time in ISO 8601 format." },
                                providerName: { type: "STRING", description: "The name of the service provider." }
                            },
                            required: ["appointmentDate", "providerName"]
                        }
                    }
                ]
            }
        ];

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            tools: confirmTools
        });

        const currentDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const prompt = `${process.env.GEMINI_PROMPT_INCOMING_SMS}
        
        Current Date and Time: ${currentDate}
        
        AUTONOMY INSTRUCTIONS:
        1. ANSWERING QUESTIONS: If the provider asks a question and the User has ALREADY provided the answer in the history, Sunny should answer the provider directly. In this case, set 'messageToUser' to null (do not bother the user). Only do this if you are CONFIDENT. If there is doubt, ask the user.
        2. CONFIRMING APPOINTMENTS: If the provider proposes a time that the User has ALREADY explicitly stated works for them (e.g., "Tuesday at 2pm works"), Sunny should CONFIRM the appointment immediately by calling the 'confirm_appointment' tool.
        
        IMPORTANT: If the appointment is confirmed (per rule #2 above or if both parties just agreed), you MUST call the 'confirm_appointment' tool. Do not output JSON in that case.
        If the appointment is NOT confirmed, output the JSON object as described.
        
        Chat History: ${JSON.stringify(updatedChatHistory)}`;

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
                    providerName: args.providerName
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
                
                res.writeHead(200, {'Content-Type': 'text/xml'});
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
        res.writeHead(200, {'Content-Type': 'text/xml'});
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

            // 3. Provisional History for Analysis
            const provisionalHistory = [...currentHistory, userMessage];

            // 4. Check for Confirmation via Gemini FIRST
            let isConfirmed = false;
            let confirmArgs = null;

            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
                const confirmTools = [
                    {
                        functionDeclarations: [
                            {
                                name: "confirm_appointment",
                                description: "Confirms the appointment when both the user and provider have agreed on a time.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        appointmentDate: { type: "STRING", description: "The confirmed date and time in ISO 8601 format." },
                                        providerName: { type: "STRING", description: "The name of the service provider." }
                                    },
                                    required: ["appointmentDate", "providerName"]
                                }
                            }
                        ]
                    }
                ];

                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.5-flash",
                    tools: confirmTools
                });

                const currentDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                const prompt = `Current Date and Time: ${currentDate}
                
                Analyze the conversation. If both the homeowner and provider have explicitly agreed on a time, call the 'confirm_appointment' tool. Otherwise, do nothing.
                
                Chat History: ${JSON.stringify(provisionalHistory)}`;

                const result = await model.generateContent(prompt);
                const functionCalls = result.response.functionCalls();
                
                if (functionCalls && functionCalls.length > 0) {
                    const call = functionCalls[0];
                    if (call.name === "confirm_appointment") {
                        isConfirmed = true;
                        confirmArgs = call.args;
                        logger.info("Confirmation detected:", confirmArgs);
                    }
                }
            } catch (aiError) {
                logger.error("Error in confirmation check:", aiError);
            }

            // 5. Execute Logic based on Confirmation Status
            const newHistoryEntries = [userMessage];
            const providerPhoneNumber = requestData.providerPhoneNumber || (currentHistory.find(m => m.sender === 'Service Provider' || m.role === 'Service Provider')?.phoneNumber);

            if (isConfirmed && confirmArgs) {
                // --- CONFIRMED FLOW ---
                // 1. Send Confirmation SMS to Provider (Skip forwarding raw user msg)
                const confirmationMsg = `Great, the appointment is confirmed for ${new Date(confirmArgs.appointmentDate).toLocaleString()}. I've updated the request.`;
                
                if (providerPhoneNumber) {
                    const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    await twilioClient.messages.create({
                        body: confirmationMsg,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: providerPhoneNumber
                    });
                }

                // 2. Add Confirmation Message to History
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
                    serviceDate: confirmArgs.appointmentDate,
                    providerName: confirmArgs.providerName
                });

            } else {
                // --- STANDARD FLOW ---
                // 1. Forward User Message to Provider
                if (providerPhoneNumber) {
                    const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    await twilioClient.messages.create({
                        body: response,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: providerPhoneNumber
                    });
                    
                    // Add Sunny -> Provider copy (optional, but keeps history complete)
                    newHistoryEntries.push({
                        sender: 'Sunny',
                        receiver: 'Service Provider',
                        role: 'Sunny',
                        message: response, // Copy of what we sent
                        timestamp: new Date(),
                        phoneNumber: process.env.TWILIO_PHONE_NUMBER
                    });

                    // 2. Add "Passed along" message to User
                    const providerName = requestData.providerName || "the provider";
                    newHistoryEntries.push({
                        sender: 'Sunny',
                        receiver: 'User',
                        role: 'Sunny',
                        message: `Thanks! I've passed that along to ${providerName}.`,
                        timestamp: new Date(),
                        phoneNumber: null
                    });
                } else {
                     // No provider phone? Just save user message.
                     logger.warn(`No provider phone for request ${requestId}`);
                }

                // 3. Update DB
                await requestRef.update({
                    chat_history: admin.firestore.FieldValue.arrayUnion(...newHistoryEntries),
                    status: 'in progress'
                });
            }

            // Generate summary
            await generateAndSaveSummary(requestId);

            res.status(200).json({ success: true, message: 'Response processed successfully.' });

        } catch (error) {
            logger.error(`Error handling user response for request ${requestId}:`, error);
            res.status(500).json({ error: 'Failed to process response.' });
        }
    });
});
