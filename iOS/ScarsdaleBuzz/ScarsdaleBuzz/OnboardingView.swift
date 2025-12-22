import SwiftUI

struct OnboardingView: View {
    @Binding var showMainApp: Bool
    
    var body: some View {
        ZStack {
            AppTheme.background.ignoresSafeArea()
            
            VStack(alignment: .leading) {
                Spacer()
                
                // Logo
                HStack {
                    Spacer()
                    Image("logo") // Assumes 'logo' is in Assets
                        .resizable()
                        .scaledToFit()
                        .frame(height: 80)
                    Spacer()
                }
                
                Spacer().frame(height: 60)
                
                // Hero Text
                Text("An easier way to\ntake care of\nyour home.")
                    .font(AppTheme.displayLarge())
                    .foregroundStyle(AppTheme.primaryText)
                    .lineSpacing(4) // approximate height 1.1 relative
                
                Spacer().frame(height: 24)
                
                // Subtext
                Text("Access a community-vetted directory of local providers, or let Sunny, our AI agent, handle the scheduling for you.")
                    .font(AppTheme.bodyLarge())
                    .foregroundStyle(AppTheme.secondaryText)
                    .lineSpacing(6)
                
                Spacer()
                
                // CTA Button
                Button(action: {
                    withAnimation {
                        showMainApp = true
                    }
                }) {
                    Text("Get Started")
                        .font(AppTheme.labelLarge())
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(AppTheme.primaryText)
                        .foregroundStyle(.white)
                        .cornerRadius(4)
                }
                
                Spacer().frame(height: 20)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 40)
        }
    }
}
