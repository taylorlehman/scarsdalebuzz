const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Mock firebase-admin and firebase-functions logger
jest.mock('firebase-admin', () => {
    const defaultApp = {
        auth: jest.fn().mockReturnValue({
            verifyIdToken: jest.fn()
        })
    };
    return {
        initializeApp: jest.fn(),
        auth: jest.fn(() => defaultApp.auth())
    };
});

jest.mock('firebase-functions/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

const { verifyAuthToken } = require('../index');

describe('verifyAuthToken', () => {
    let req;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return null if authorization header is missing', async () => {
        req = { headers: {} };
        const result = await verifyAuthToken(req);
        expect(result).toBeNull();
    });

    it('should return null if authorization header format is invalid', async () => {
        req = { headers: { authorization: 'InvalidFormat TokenHere' } };
        const result = await verifyAuthToken(req);
        expect(result).toBeNull();
    });

    it('should return decoded token if validation is successful', async () => {
        req = { headers: { authorization: 'Bearer VALID_TOKEN' } };
        const mockDecodedToken = { uid: '12345', email: 'test@example.com' };
        
        admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);

        const result = await verifyAuthToken(req);
        expect(result).toEqual(mockDecodedToken);
        expect(admin.auth().verifyIdToken).toHaveBeenCalledWith('VALID_TOKEN');
    });

    it('should return null if token verification fails', async () => {
        req = { headers: { authorization: 'Bearer INVALID_TOKEN' } };
        
        admin.auth().verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

        const result = await verifyAuthToken(req);
        expect(result).toBeNull();
    });
});
