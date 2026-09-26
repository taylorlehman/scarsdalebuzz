import SwiftUI

struct AccountView: View {
    // Mock user data
    let user = User.mock
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Profile Header
                VStack {
                    Image(systemName: "person.circle.fill")
                        .resizable()
                        .frame(width: 80, height: 80)
                        .foregroundColor(AppColors.secondaryText)
                        .padding(.top, 40)
                    
                    Text(user.displayName ?? "Neighbor")
                        .font(AppFonts.serifTitle(size: 24))
                        .foregroundColor(AppColors.primaryText)
                        .padding(.top, 8)
                    
                    Text(user.email ?? "")
                        .font(AppFonts.sansBody(size: 14))
                        .foregroundColor(AppColors.secondaryText)
                    
                    // Status Badge
                    Text(user.directoryStatus.rawValue.capitalized)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(user.isApproved ? Color.green : Color.orange)
                        .cornerRadius(12)
                        .padding(.top, 8)
                }
                
                List {
                    Section(header: Text("My Activity")) {
                        NavigationLink(destination: Text("My Recommendations List")) {
                            HStack {
                                Image(systemName: "hand.thumbsup")
                                Text("My Recommendations")
                            }
                        }
                    }
                    
                    Section(header: Text("Settings")) {
                        NavigationLink(destination: Text("Notifications Settings")) {
                            HStack {
                                Image(systemName: "bell")
                                Text("Notifications")
                            }
                        }
                        
                        Button(action: {
                            // Sign out action
                        }) {
                            HStack {
                                Image(systemName: "arrow.right.square")
                                Text("Sign Out")
                                    .foregroundColor(.red)
                            }
                        }
                    }
                }
                .listStyle(InsetGroupedListStyle())
            }
            .navigationTitle("Account")
            .background(AppColors.background)
        }
    }
}

struct AccountView_Previews: PreviewProvider {
    static var previews: some View {
        AccountView()
    }
}
