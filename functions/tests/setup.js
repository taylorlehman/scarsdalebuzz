const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Global mocks for firebase-admin and other dependencies
jest.mock('firebase-admin', () => {
    const firestoreMock = {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        where: jest.fn().mockReturnThis(),
        add: jest.fn(),
        runTransaction: jest.fn(),
        collectionGroup: jest.fn().mockReturnThis(),
        batch: jest.fn()
    };
    const defaultApp = {
        auth: jest.fn().mockReturnValue({
            verifyIdToken: jest.fn(),
            getUser: jest.fn(),
            setCustomUserClaims: jest.fn(),
            deleteUser: jest.fn()
        }),
        firestore: jest.fn(() => firestoreMock)
    };
    return {
        initializeApp: jest.fn(),
        auth: jest.fn(() => defaultApp.auth()),
        firestore: Object.assign(jest.fn(() => defaultApp.firestore()), {
            FieldValue: {
                serverTimestamp: jest.fn(),
                increment: jest.fn(),
                arrayRemove: jest.fn()
            }
        })
    };
});

jest.mock('firebase-functions/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

jest.mock('cors', () => {
    return () => (req, res, next) => next();
});

jest.mock('firebase-functions/params', () => ({
    defineString: jest.fn(() => ({ value: jest.fn(() => 'MOCK_API_KEY') }))
}));

jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn()
}));

jest.mock('twilio', () => {
    const mTwilio = jest.fn();
    mTwilio.twiml = {
        MessagingResponse: jest.fn()
    };
    return mTwilio;
});
