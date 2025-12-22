import SwiftUI

struct AppTheme {
    // Colors
    static let background = Color(hex: 0xEFF1E4)
    static let primaryText = Color(hex: 0x2C2C2C)
    static let secondaryText = Color(hex: 0x666666)
    static let accent = Color(hex: 0xD4AF37) // Gold
    static let sunnyBubble = Color(hex: 0xF2F0EB)
    static let userBubble = Color(hex: 0xFFFFFF)
    static let border = Color(hex: 0xE8E6E1)
    
    // Fonts
    // Using system fonts with design modifiers to approximate Playfair (Serif) and Inter (Default/Sans)
    // since custom font files might not be added to the bundle yet.
    
    static func displayLarge() -> Font {
        return .system(size: 32, weight: .bold, design: .serif)
    }
    
    static func displayMedium() -> Font {
        return .system(size: 24, weight: .semibold, design: .serif)
    }
    
    static func appBarTitle() -> Font {
        return .system(size: 20, weight: .semibold, design: .serif)
    }
    
    static func bodyLarge() -> Font {
        return .system(size: 16, weight: .regular, design: .default)
    }
    
    static func bodyMedium() -> Font {
        return .system(size: 14, weight: .regular, design: .default)
    }
    
    static func labelLarge() -> Font {
        return .system(size: 16, weight: .medium, design: .default)
    }
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 08) & 0xff) / 255,
            blue: Double((hex >> 00) & 0xff) / 255,
            opacity: alpha
        )
    }
}
