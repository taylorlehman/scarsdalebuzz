import SwiftUI

struct ProviderCardView: View {
    let provider: Provider
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header: Rank/Index (placeholder) & Categories
            HStack {
                Text("01") // Placeholder index
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(AppColors.secondaryText)
                    .opacity(0.6)
                
                Spacer()
                
                ForEach(provider.categories.prefix(2), id: \.self) { category in
                    Text(category.uppercased())
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(AppColors.secondaryText)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(AppColors.background)
                        .cornerRadius(2)
                }
            }
            
            // Title
            Text(provider.displayName)
                .font(AppFonts.serifTitle(size: 22))
                .foregroundColor(AppColors.primaryText)
                .lineLimit(2)
            
            // Contact Name (if different)
            if let contactName = provider.contactName {
                Text(contactName)
                    .font(AppFonts.serifTitle(size: 14))
                    .italic()
                    .foregroundColor(AppColors.secondaryText)
            }
            
            Divider()
                .background(AppColors.lightGray)
            
            // Bottom Row: Recommendations & Action
            HStack {
                // Recommendations Count
                HStack(spacing: 4) {
                    Text("\(provider.recommendations)")
                        .font(AppFonts.serifTitle(size: 18))
                        .fontWeight(.bold)
                        .foregroundColor(AppColors.accentOrange)
                    
                    Text("RECS")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(AppColors.secondaryText)
                        .opacity(0.7)
                        .padding(.top, 4)
                }
                
                Spacer()
                
                // Sunny Booking Button (if approved)
                if provider.sunnyApproved {
                    Button(action: {
                        // Placeholder for Sunny action
                    }) {
                        HStack(spacing: 4) {
                            Text("Book with Sunny")
                                .font(.system(size: 10, weight: .bold))
                                .textCase(.uppercase)
                            Image(systemName: "sparkles")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(AppColors.accentOrange)
                        .cornerRadius(4)
                    }
                    .padding(.trailing, 8)
                }
                
                // Like Button (Visual only for now)
                Button(action: {}) {
                    Image(systemName: "hand.thumbsup")
                        .font(.system(size: 14))
                        .foregroundColor(AppColors.secondaryText)
                        .padding(8)
                        .background(AppColors.background)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(AppColors.lightGray, lineWidth: 1)
                        )
                }
            }
        }
        .padding()
        .background(Color.white)
        .cornerRadius(4) // Slightly rounded corners as per web design
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

struct ProviderCardView_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            AppColors.background
            ProviderCardView(provider: Provider.mock)
                .padding()
        }
    }
}
