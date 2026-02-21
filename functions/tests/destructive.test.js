const myFunctions = require('../index');
const admin = require('firebase-admin');

describe('Destructive Operations', () => {
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

    describe('deleteUser', () => {
        it('should return 403 if requester is not admin', async () => {
            const mockDecodedToken = { uid: '123', admin: false };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);

            await myFunctions.deleteUser(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.send).toHaveBeenCalledWith('Forbidden: Admin access required');
        });

        it('should return 400 if uid is missing', async () => {
            const mockDecodedToken = { uid: '123', admin: true };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = {};

            await myFunctions.deleteUser(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith('Target UID is required');
        });

        it('should cascade delete user data successfully', async () => {
            const mockDecodedToken = { uid: '123', admin: true };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            const targetUid = 'delete-me';
            req.body = { uid: targetUid };

            const mockDb = admin.firestore();
            const mockRecDoc = {
                ref: {
                    delete: jest.fn(),
                    parent: { parent: { id: 'service-1' } }
                }
            };
            mockDb.collectionGroup().where().get.mockResolvedValueOnce({ docs: [mockRecDoc], size: 1 });

            await myFunctions.deleteUser(req, res);

            // Give the async CORS callback time to execute before asserting
            await new Promise(r => setTimeout(r, 50));

            expect(mockDb.collectionGroup).toHaveBeenCalledWith('recommendations');
            expect(mockRecDoc.ref.delete).toHaveBeenCalled();
            expect(mockDb.runTransaction).toHaveBeenCalled();
            expect(mockDb.collection).toHaveBeenCalledWith('users');
            expect(mockDb.doc).toHaveBeenCalledWith(targetUid);
            expect(mockDb.delete).toHaveBeenCalled();
            expect(admin.auth().deleteUser).toHaveBeenCalledWith(targetUid);
            expect(res.json).toHaveBeenCalledWith({ success: true, message: 'User deleted successfully' });
        });
    });

    describe('deleteService', () => {
        it('should return 403 if requester is not admin', async () => {
            const mockDecodedToken = { uid: '123', admin: false };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);

            await myFunctions.deleteService(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.send).toHaveBeenCalledWith('Forbidden: Admin access required');
        });

        it('should return 400 if serviceId is missing', async () => {
            const mockDecodedToken = { uid: '123', admin: true };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = {};

            await myFunctions.deleteService(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith('Service ID is required');
        });

        it('should delete service and its subcollections successfully', async () => {
            const mockDecodedToken = { uid: '123', admin: true };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            const targetServiceId = 'service-target';
            req.body = { serviceId: targetServiceId };

            const mockDb = admin.firestore();
            const batchMock = { delete: jest.fn(), commit: jest.fn() };
            mockDb.batch = jest.fn(() => batchMock);

            const mockServiceRef = {
                collection: jest.fn(() => ({
                    get: jest.fn().mockResolvedValueOnce({
                        docs: [{ ref: 'rec-1' }],
                        size: 1
                    })
                })),
                delete: jest.fn()
            };

            mockDb.collection().doc.mockReturnValueOnce(mockServiceRef);

            await myFunctions.deleteService(req, res);

            // Give the async CORS callback time to execute before asserting
            await new Promise(r => setTimeout(r, 50));

            expect(batchMock.delete).toHaveBeenCalledWith('rec-1');
            expect(batchMock.commit).toHaveBeenCalled();
            expect(mockServiceRef.delete).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Service deleted successfully' });
        });
    });
});
