// ... (previous code)

exports.findBusinessContactInfo = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    
    // Check for admin claim
    if (context.auth.token.admin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const { businessName, category, address } = data;
    if (!businessName) {
        throw new functions.https.HttpsError('invalid-argument', 'Business Name is required.');
    }

    logger.info(`Searching contact info for: ${businessName} (${category}) in ${address}`);

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        
        // Configure model with Google Search tool
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro", // Using 1.5 Pro for better reasoning and search integration
            tools: [{
                googleSearchRetrieval: {
                    dynamicRetrievalConfig: {
                        mode: "MODE_DYNAMIC",
                        dynamicThreshold: 0.7,
                    }
                }
            }]
        });

        const prompt = PROMPTS.FIND_CONTACT_INFO_PROMPT(businessName, category, address);

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        // Extract JSON
        const cleanJson = extractJson(text);
        let parsedData;
        try {
            parsedData = JSON.parse(cleanJson);
        } catch (e) {
            logger.error("Failed to parse Gemini JSON response", text);
            throw new functions.https.HttpsError('internal', 'AI response was not valid JSON');
        }

        return parsedData;

    } catch (error) {
        logger.error("Error in findBusinessContactInfo:", error);
        throw new functions.https.HttpsError('internal', 'Failed to find contact info: ' + error.message);
    }
});
