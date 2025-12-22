import SwiftUI

struct MainLayoutView: View {
    @State private var selectedTab: Int = 0
    
    // Custom init to style the TabBar appearance to match the Flutter theme
    init() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(AppTheme.background)
        
        // Unselected item color
        appearance.stackedLayoutAppearance.normal.iconColor = UIColor(AppTheme.secondaryText)
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: UIColor(AppTheme.secondaryText)]
        
        // Selected item color
        appearance.stackedLayoutAppearance.selected.iconColor = UIColor(AppTheme.primaryText)
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [.foregroundColor: UIColor(AppTheme.primaryText)]
        
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
    
    var body: some View {
        // Top AppBar structure is slightly different in SwiftUI TabView, usually navigation bars are inside the tabs.
        // However, the Flutter app had a common AppBar for the Scaffold.
        // In SwiftUI, it's often cleaner to put the NavigationView inside each Tab or wrap the whole TabView.
        // Given the Flutter structure had a dynamic title (Image) and actions, let's keep it simple for now and put NavigationStacks inside the views where needed, or wrap the TabView if the header is global.
        // The Flutter app had a single Scaffold with a global AppBar. Let's try to replicate that feel by wrapping the content.
        
        NavigationStack {
            VStack(spacing: 0) {
                // Custom AppBar (replicating Flutter AppBar)
                VStack(spacing: 0) {
                    ZStack {
                        // Title (Logo)
                        HStack {
                            Spacer()
                            Image("logo") // Assumes logo in assets
                                .resizable()
                                .scaledToFit()
                                .frame(height: 32)
                            Spacer()
                        }
                        
                        // Actions (Menu)
                        HStack {
                            Spacer()
                            Menu {
                                Button("Account", action: {})
                                Button("Sign Out", action: {
                                    // Handle Logout logic if needed, possibly passing binding up
                                })
                            } label: {
                                Image(systemName: "ellipsis")
                                    .rotationEffect(.degrees(90))
                                    .foregroundStyle(AppTheme.secondaryText)
                                    .padding(.trailing, 16)
                            }
                        }
                    }
                    .frame(height: 44) // Standard AppBar height
                    .padding(.bottom, 8)
                    
                    Divider()
                        .background(AppTheme.border)
                }
                .background(AppTheme.background)
                
                // Tab Content
                TabView(selection: $selectedTab) {
                    DirectoryView()
                        .tabItem {
                            Label("Directory", systemImage: "list.bullet.rectangle.portrait")
                        }
                        .tag(0)
                    
                    SunnyView()
                        .tabItem {
                            Label("Sunny", image: "logo_bee")
                        }
                        .tag(1)
                }
                .accentColor(AppTheme.primaryText) // Selected color
            }
            .background(AppTheme.background)
        }
    }
}
