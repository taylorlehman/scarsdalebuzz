/**
 * Consolidated Tool Definitions for Sunny AI
 */

const GET_PLUMBER_CONTACT_INFO_TOOL = {
    functionDeclarations: [
        {
            name: "get_plumber_contact_info",
            description: "Retrieves the name and phone number of the available plumber.",
        }
    ]
};

const CONFIRM_APPOINTMENT_TOOL = {
    functionDeclarations: [
        {
            name: "confirm_appointment",
            description: "Confirms the appointment when both the user and provider have agreed on a time.",
            parameters: {
                type: "OBJECT",
                properties: {
                    appointmentDate: { type: "STRING", description: "The confirmed date and time in ISO 8601 format." },
                    providerName: { type: "STRING", description: "The name of the service provider." },
                    providerPhoneNumber: { type: "STRING", description: "The phone number of the service provider." },
                    userAddress: { type: "STRING", description: "The homeowner's address to share with the provider." },
                    userPhone: { type: "STRING", description: "The homeowner's phone number to share with the provider." }
                },
                required: ["appointmentDate", "providerName", "providerPhoneNumber", "userAddress", "userPhone"]
            }
        }
    ]
};

const MANAGE_REQUEST_TOOL = {
    functionDeclarations: [
        {
            name: "manage_request",
            description: "Takes action on the request based on the user's input.",
            parameters: {
                type: "OBJECT",
                properties: {
                    messageToProvider: { type: "STRING", description: "The message to send to the service provider (if necessary). Leave empty if no message is needed." },
                    messageToUser: { type: "STRING", description: "The message to send to the user/homeowner." },
                    updateStatus: { type: "STRING", description: "The new status of the request (e.g. 'in progress', 'user action required', 'provider unavailable'). Leave empty if status should not change." }
                },
                required: ["messageToUser"]
            }
        }
    ]
};

const ASK_CLARIFYING_QUESTION_TOOL = {
    functionDeclarations: [
        {
            name: "ask_clarifying_question",
            description: "Asks the homeowner a single specific question to gather missing critical information.",
            parameters: {
                type: "OBJECT",
                properties: {
                    question: { type: "STRING", description: "The question to ask the homeowner." }
                },
                required: ["question"]
            }
        }
    ]
};

const PROCEED_TO_PROVIDER_TOOL = {
    functionDeclarations: [
        {
            name: "proceed_to_provider",
            description: "Signals that sufficient information has been gathered and we can now contact the service provider.",
            parameters: {
                type: "OBJECT",
                properties: {
                    scope: { type: "STRING", description: "Summary of the issue/scope." },
                    urgency: { type: "STRING", description: "Assessment of urgency." },
                    availability: { type: "STRING", description: "Homeowner's stated availability." }
                },
                required: ["scope", "urgency", "availability"]
            }
        }
    ]
};

module.exports = {
    GET_PLUMBER_CONTACT_INFO_TOOL,
    CONFIRM_APPOINTMENT_TOOL,
    MANAGE_REQUEST_TOOL,
    ASK_CLARIFYING_QUESTION_TOOL,
    PROCEED_TO_PROVIDER_TOOL
};
