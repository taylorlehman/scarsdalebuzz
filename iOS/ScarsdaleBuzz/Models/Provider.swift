import Foundation

struct Provider: Identifiable, Codable {
    let id: String
    let businessName: String?
    let firstName: String?
    let lastName: String?
    let categories: [String]
    let phone: String?
    let email: String?
    let recommendations: Int
    let lastRecommended: Date?
    let sunnyApproved: Bool
    let isTestProvider: Bool
    
    // Computed properties for display
    var displayName: String {
        if let business = businessName, !business.isEmpty {
            return business
        }
        let first = firstName ?? ""
        let last = lastName ?? ""
        return "\(first) \(last)".trimmingCharacters(in: .whitespaces)
    }
    
    var contactName: String? {
        if businessName != nil && (!firstName.isNilOrEmpty || !lastName.isNilOrEmpty) {
            let first = firstName ?? ""
            let last = lastName ?? ""
            return "\(first) \(last)".trimmingCharacters(in: .whitespaces)
        }
        return nil
    }
    
    var primaryCategory: String {
        return categories.first ?? "Service"
    }
}

extension Optional where Wrapped == String {
    var isNilOrEmpty: Bool {
        return self == nil || self!.isEmpty
    }
}

// Mock Data for Preview
extension Provider {
    static let mock = Provider(
        id: "1",
        businessName: "Washing Westchester",
        firstName: "Jody",
        lastName: "Alter",
        categories: ["Power Washing", "Gutter Cleaning"],
        phone: "914-555-0123",
        email: "jody@example.com",
        recommendations: 87,
        lastRecommended: Date(),
        sunnyApproved: true,
        isTestProvider: false
    )
    
    static let mock2 = Provider(
        id: "2",
        businessName: "Eastchester Fish",
        firstName: nil,
        lastName: nil,
        categories: ["Food", "Market"],
        phone: "914-555-0199",
        email: nil,
        recommendations: 65,
        lastRecommended: Date().addingTimeInterval(-86400 * 2),
        sunnyApproved: false,
        isTestProvider: false
    )
}
