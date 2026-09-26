import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            DirectoryView()
                .tabItem {
                    Image(systemName: "magnifyingglass")
                    Text("Directory")
                }
                .tag(0)
            
            SuggestProviderView()
                .tabItem {
                    Image(systemName: "plus.circle")
                    Text("Suggest")
                }
                .tag(1)
            
            AccountView()
                .tabItem {
                    Image(systemName: "person.circle")
                    Text("Account")
                }
                .tag(2)
            
            // Placeholder for future Sunny tab
            /*
            SunnyView()
                .tabItem {
                    Image(systemName: "sparkles")
                    Text("Sunny")
                }
                .tag(3)
            */
        }
        .accentColor(AppColors.primaryText) // Use primary text color for active tab or accent
        .onAppear {
            // Customize TabBar appearance if needed
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(AppColors.background)
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
