import SwiftUI

struct AppColors {
    static let background = Color(hex: "F9F8F4")
    static let primaryText = Color(hex: "2C2C2C")
    static let secondaryText = Color(hex: "555555")
    static let accentGold = Color(hex: "D4AF37")
    static let accentOrange = Color(hex: "E59F48")
    static let secondaryCream = Color(hex: "FDF0D5")
    static let lightGray = Color(hex: "E8E6E1")
}

struct AppFonts {
    static func serifTitle(size: CGFloat) -> Font {
        return .system(size: size, weight: .regular, design: .serif)
    }
    
    static func sansBody(size: CGFloat) -> Font {
        return .system(size: size, weight: .regular, design: .default)
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// Common UI Components

struct PrimaryButton: View {
    let title: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(AppFonts.sansBody(size: 16).weight(.medium))
                .foregroundColor(AppColors.background)
                .frame(maxWidth: .infinity)
                .padding()
                .background(AppColors.primaryText)
                .cornerRadius(4)
        }
    }
}

struct SecondaryButton: View {
    let title: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(AppFonts.sansBody(size: 16).weight(.medium))
                .foregroundColor(AppColors.primaryText)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(AppColors.primaryText, lineWidth: 1)
                )
        }
    }
}
