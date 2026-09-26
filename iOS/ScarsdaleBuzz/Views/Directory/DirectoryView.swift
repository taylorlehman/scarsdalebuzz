import SwiftUI

struct DirectoryView: View {
    @State private var searchText = ""
    @State private var selectedCategory = "All"
    @State private var providers: [Provider] = [Provider.mock, Provider.mock2] // Mock data for now
    
    let categories = ["All", "Kids Activities", "Plumbing", "HVAC", "Electrician", "Food", "Landscaper"]
    
    var filteredProviders: [Provider] {
        providers.filter { provider in
            let matchesCategory = selectedCategory == "All" || provider.categories.contains(selectedCategory)
            let matchesSearch = searchText.isEmpty || 
                (provider.businessName?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                (provider.firstName?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                (provider.lastName?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                provider.categories.contains { $0.localizedCaseInsensitiveContains(searchText) }
            
            return matchesCategory && matchesSearch
        }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                AppColors.background.edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 0) {
                    // Header
                    HStack {
                        Text("Directory")
                            .font(AppFonts.serifTitle(size: 32))
                            .foregroundColor(AppColors.primaryText)
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.top, 10)
                    .padding(.bottom, 10)
                    
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(AppColors.secondaryText)
                        TextField("Search providers...", text: $searchText)
                            .foregroundColor(AppColors.primaryText)
                    }
                    .padding()
                    .background(Color.white)
                    .cornerRadius(8)
                    .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 2)
                    .padding(.horizontal)
                    .padding(.bottom, 10)
                    
                    // Category Filter
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(categories, id: \.self) { category in
                                CategoryButton(title: category, isSelected: selectedCategory == category) {
                                    selectedCategory = category
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.bottom, 10)
                    }
                    
                    // Provider List
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(filteredProviders) { provider in
                                ProviderCardView(provider: provider)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationBarHidden(true)
        }
    }
}

struct CategoryButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(AppFonts.sansBody(size: 14).weight(isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? AppColors.background : AppColors.secondaryText)
                .padding(.vertical, 8)
                .padding(.horizontal, 16)
                .background(isSelected ? AppColors.primaryText : Color.white)
                .cornerRadius(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(AppColors.lightGray, lineWidth: isSelected ? 0 : 1)
                )
        }
    }
}

struct DirectoryView_Previews: PreviewProvider {
    static var previews: some View {
        DirectoryView()
    }
}
