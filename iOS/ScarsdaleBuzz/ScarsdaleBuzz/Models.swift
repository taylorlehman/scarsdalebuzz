import Foundation
import FirebaseFirestore

struct Request: Identifiable, Codable {
    @DocumentID var id: String?
    var userId: String
    var title: String?
    var status: String?
    var summary: String?
    var providerName: String?
    var providerPhoneNumber: String?
    var serviceDate: Date? // You might need custom decoding for Firestore Timestamp if not using FirebaseFirestoreSwift
    var chat_history: [ChatMessage]?
    var timestamp: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId
        case title
        case status
        case summary
        case providerName
        case providerPhoneNumber
        case serviceDate
        case chat_history
        case timestamp
    }
}

struct ChatMessage: Identifiable, Codable {
    var id: String = UUID().uuidString
    var sender: String?
    var role: String?
    var message: String
    var timestamp: Date?
    
    enum CodingKeys: String, CodingKey {
        case sender
        case role
        case message
        case timestamp
    }
    
    var effectiveRole: String {
        return sender ?? role ?? "Sunny"
    }
}

struct ServiceProvider: Identifiable, Codable {
    @DocumentID var id: String?
    var businessName: String?
    var firstName: String?
    var lastName: String?
    var category: String?
    var phone: String?
    var email: String?
    var website: String?
    var recommendations: Int?
    var lastRecommended: Date?
    var sunnyApproved: Bool?
    
    var displayName: String {
        if let business = businessName, !business.isEmpty {
            return business
        }
        return "\(firstName ?? "") \(lastName ?? "")".trimmingCharacters(in: .whitespaces)
    }
}
