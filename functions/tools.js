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

module.exports = {
    GET_PLUMBER_CONTACT_INFO_TOOL,
    CONFIRM_APPOINTMENT_TOOL
};
