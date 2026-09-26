import Foundation

struct User: Identifiable, Codable {
    let id: String
    let displayName: String?
    let email: String?
    let photoURL: String?
    let directoryStatus: DirectoryStatus
    let roles: [String]
    
    var isAdmin: Bool {
        return roles.contains("admin")
    }
    
    var isApproved: Bool {
        return directoryStatus == .approved
    }
}

enum DirectoryStatus: String, Codable {
    case pending
    case approved
    case rejected
}

// Mock User
extension User {
    static let mock = User(
        id: "user123",
        displayName: "Taylor Lehman",
        email: "taylor@example.com",
        photoURL: nil,
        directoryStatus: .approved,
        roles: ["user", "admin"]
    )
}
