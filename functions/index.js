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
const addMessageToChatHistory = async (requestId, role, message, phoneNumber) => {
    const requestRef = admin.firestore().collection('requests').doc(requestId);

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const doc = await transaction.get(requestRef);
            if (!doc.exists) {
                throw "Document does not exist!";
            }

            const chatHistory = doc.data().chat_history || [];
            
            const newMessage = {
                role,
                message,
                timestamp: new Date(), // Use a client-side timestamp
                phoneNumber
            };

            chatHistory.push(newMessage);

            transaction.update(requestRef, { chat_history: chatHistory });
        });
        logger.info(`Message from ${role} added to request ${requestId}`);
    } catch (e) {
        logger.error("Transaction failed: ", e);
        throw e; // Re-throw the error to be caught by the calling function
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

            // 2. Create the request and add the first message
            const newRequestRef = await admin.firestore().collection('requests').add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'in progress',
                title: title,
                summary: 'Request submitted. Generating initial message...',
                chat_history: [{
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
                    // Mock implementation
                    const toolResult = {
                        name: "Plumber Pete",
                        phoneNumber: "+18777804236"
                    };
                    
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
            let phoneToSendTo = '+18777804236'; // Default fallback
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
                // Continue execution even if Twilio fails
            }

            await addMessageToChatHistory(newRequestRef.id, 'Sunny', messageToSend, process.env.TWILIO_PHONE_NUMBER);
            await generateAndSaveSummary(newRequestRef.id);

            res.status(200).send(messageToSend);
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

        // 2. Append incoming message to chat history using the helper function
        await addMessageToChatHistory(requestDoc.id, 'Service Provider', body, from);

        // We need to refetch the data to get the latest chat history for the prompt
        const updatedRequestDoc = await requestDoc.ref.get();
        const updatedChatHistory = updatedRequestDoc.data().chat_history;

        // 3. Pass conversation to Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `${process.env.GEMINI_PROMPT_INCOMING_SMS}${JSON.stringify(updatedChatHistory)}`;

        const result = await model.generateContent(prompt);
        const geminiResponseText = result.response.text();
        logger.info("Gemini analysis response:", geminiResponseText);

        const cleanJsonString = extractJson(geminiResponseText);
        const geminiJson = JSON.parse(cleanJsonString);

        // 4. Update status and save Gemini's message
        const followUpLower = (geminiJson.followUpMessage || "").toLowerCase();
        const impliesUserInput = followUpLower.includes("ask the homeowner") || followUpLower.includes("check with the homeowner");

        if (geminiJson.isScheduled) {
            await requestDoc.ref.update({ status: 'scheduled' });
            logger.info("Request status updated to 'scheduled'.");
        } else if (geminiJson.isProviderUnavailable) {
            await requestDoc.ref.update({ status: 'provider unavailable' });
            logger.info("Request status updated to 'provider unavailable'.");
        } else if (geminiJson.needsUserInput || impliesUserInput) {
            await requestDoc.ref.update({ status: 'user action required' });
            logger.info(`Request status updated to 'user action required'. (needsUserInput: ${geminiJson.needsUserInput}, impliesUserInput: ${impliesUserInput})`);
        }

        if (geminiJson.followUpMessage) {
            await addMessageToChatHistory(requestDoc.id, 'Sunny', geminiJson.followUpMessage, process.env.TWILIO_PHONE_NUMBER);
        }

        // Generate and save the summary after all updates
        await generateAndSaveSummary(requestDoc.id);

        // 5. Respond via Twilio
        const twiml = new MessagingResponse();
        if (geminiJson.followUpMessage) {
            twiml.message(geminiJson.followUpMessage);
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
            const providerMessage = requestData.chat_history.find(m => m.role === 'Service Provider');
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
            await db.runTransaction(async (transaction) => {
                const requestDoc = await transaction.get(requestRef);
                if (!requestDoc.exists) {
                    throw new Error('Request not found.');
                }

                const requestData = requestDoc.data();

                // 1. Add user's response to history
                const newHistoryEntry = {
                    role: 'User',
                    message: response,
                    timestamp: new Date(),
                    phoneNumber: null // From the web app, not a phone
                };

                // 2. Update status and chat history
                transaction.update(requestRef, {
                    chat_history: admin.firestore.FieldValue.arrayUnion(newHistoryEntry),
                    status: 'in progress',
                });

                // 3. Notify service provider
                const providerMessage = requestData.chat_history.find(m => m.role === 'Service Provider');
                if (providerMessage && providerMessage.phoneNumber) {
                    const providerNotification = response;
                    const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    await twilioClient.messages.create({
                        body: providerNotification,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: providerMessage.phoneNumber
                    });
                    logger.info(`User response sent to ${providerMessage.phoneNumber} for request ${requestId}`);
                } else {
                    logger.warn(`Could not find service provider phone number for request ${requestId}. SMS not sent.`);
                }
            });

            // Generate a new summary after the update
            await generateAndSaveSummary(requestId);

            res.status(200).json({ success: true, message: 'Response processed successfully.' });

        } catch (error) {
            logger.error(`Error handling user response for request ${requestId}:`, error);
            res.status(500).json({ error: 'Failed to process response.' });
        }
    });
});
