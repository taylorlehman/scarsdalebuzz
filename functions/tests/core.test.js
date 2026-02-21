const myFunctions = require('../index');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

describe('Core Business Logic', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            method: 'POST',
            headers: { authorization: 'Bearer VALID_TOKEN' },
            body: {},
            get: jest.fn((key) => key === 'content-type' ? 'application/json' : undefined)
        };
        res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
            json: jest.fn()
        };
    });

    describe('submitRequest', () => {
        it('should return 400 if description is missing', async () => {
            const mockDecodedToken = { uid: '123' };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = { description: '' };

            admin.firestore().collection.mockImplementation(() => {
                return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }) })) };
            });

            await myFunctions.submitRequest(req, res);
            await new Promise(r => setTimeout(r, 50));

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith('Description is required');
        });

        it('should successfully create a request and trigger intake', async () => {
            const mockDecodedToken = { uid: '123' };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = { description: 'I need a plumber' };

            const reqDocMock = { id: 'new-req-1' };
            const reqCollectionMock = {
                add: jest.fn().mockResolvedValueOnce(reqDocMock),
                doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValueOnce({ exists: true, data: () => ({ chat_history: [] }) }),
                    update: jest.fn()
                }))
            };

            admin.firestore().collection.mockImplementation((path) => {
                if (path === 'requests') return reqCollectionMock;
                if (path === 'users') return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValueOnce({ data: () => ({}) }) })) };
                return { doc: jest.fnReturnThis() };
            });

            GoogleGenerativeAI.mockImplementation(() => ({
                getGenerativeModel: jest.fn(() => ({
                    generateContent: jest.fn().mockResolvedValue({
                        response: {
                            text: () => "Mocked Response",
                            functionCalls: () => []
                        }
                    })
                }))
            }));

            await myFunctions.submitRequest(req, res);
            await new Promise(r => setTimeout(r, 50));

            expect(reqCollectionMock.add).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalled();
            const jsonArg = res.json.mock.calls[0][0];
            expect(jsonArg.id).toBe('new-req-1');
        });
    });

    describe('cancelRequest', () => {
        it('should return 400 if requestId is missing', async () => {
            const mockDecodedToken = { uid: '123' };
            admin.auth().verifyIdToken.mockResolvedValueOnce(mockDecodedToken);
            req.body = {};

            await myFunctions.cancelRequest(req, res);
            await new Promise(r => setTimeout(r, 50));

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith('Request ID is required.');
        });
    });
});
