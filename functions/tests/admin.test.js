const myFunctions = require('../index');
const admin = require('firebase-admin');

describe('Admin Role Management', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            method: 'POST',
            headers: { authorization: 'Bearer VALID_TOKEN' },
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
            json: jest.fn()
        };
    });

    describe('verifyAdminRole', () => {
        it('should return 405 if method is not POST', async () => {
            req.method = 'GET';
            await myFunctions.verifyAdminRole(req, res);
            expect(res.status).toHaveBeenCalledWith(405);
            expect(res.send).toHaveBeenCalledWith('Method Not Allowed');
        });

        it('should return 401 if missing auth header', async () => {
            req.headers = {};
            await myFunctions.verifyAdminRole(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthenticated' });
        });

        it('should grant admin privileges for tl-labs.com email', async () => {
            const mockDecodedToken = { uid: '123', email: 'test@tl-labs.com' };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            admin.auth().getUser.mockResolvedValueOnce({ customClaims: {} });

            await myFunctions.verifyAdminRole(req, res);

            expect(admin.auth().setCustomUserClaims).toHaveBeenCalledWith('123', { admin: true });
            expect(res.json).toHaveBeenCalledWith({ isAdmin: true, message: 'Admin privileges granted.' });
        });

        it('should return already admin if user has claim', async () => {
            const mockDecodedToken = { uid: '123', email: 'test@example.com' };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            admin.auth().getUser.mockResolvedValueOnce({ customClaims: { admin: true } });

            await myFunctions.verifyAdminRole(req, res);

            expect(res.json).toHaveBeenCalledWith({ isAdmin: true, message: 'Already an admin.' });
        });

        it('should deny access for non-admin email', async () => {
            const mockDecodedToken = { uid: '123', email: 'test@example.com' };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            admin.auth().getUser.mockResolvedValueOnce({ customClaims: {} });

            await myFunctions.verifyAdminRole(req, res);

            expect(res.json).toHaveBeenCalledWith({ isAdmin: false, message: 'Not authorized.' });
        });
    });

    describe('grantAdminRole', () => {
        it('should return 403 if requester is not admin', async () => {
            const mockDecodedToken = { uid: '123', admin: false };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);

            await myFunctions.grantAdminRole(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.send).toHaveBeenCalledWith('Forbidden: Admin access required');
        });

        it('should return 400 if uid is missing', async () => {
            const mockDecodedToken = { uid: '123', admin: true };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = {};

            await myFunctions.grantAdminRole(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith('Target UID is required');
        });

        it('should set custom claims and update firestore doc for target uid', async () => {
            const mockDecodedToken = { uid: '123', email: 'admin@tl-labs.com', admin: true };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = { uid: 'target-uid' };

            await myFunctions.grantAdminRole(req, res);

            expect(admin.auth().setCustomUserClaims).toHaveBeenCalledWith('target-uid', { admin: true });
            expect(admin.firestore().collection).toHaveBeenCalledWith('users');
            expect(admin.firestore().doc).toHaveBeenCalledWith('target-uid');
            expect(admin.firestore().set).toHaveBeenCalledWith({ isAdmin: true }, { merge: true });
            expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Admin role granted successfully' });
        });
    });
});
