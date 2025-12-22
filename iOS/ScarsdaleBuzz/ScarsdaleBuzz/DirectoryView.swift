import SwiftUI
import FirebaseFirestore

struct DirectoryView: View {
    @State private var passcode: String = ""
    @State private var isAuthenticated: Bool = false
    @State private var showSnackbar: Bool = false
    @State private var services: [ServiceProvider] = []
    @State private var searchText: String = ""
    @State private var selectedCategory: String = "All"
    @State private var isLoading: Bool = false
    
    private let correctPasscode = "raiders"
    
    var categories: [String] {
        var cats = Set(services.compactMap { $0.category })
        var sorted = cats.sorted()
        sorted.insert("All", at: 0)
        return sorted
    }
    
    var filteredServices: [ServiceProvider] {
        var result = services
        
        // Filter by Category
        if selectedCategory != "All" {
            result = result.filter { $0.category == selectedCategory }
        }
        
        // Filter by Search
        if !searchText.isEmpty {
            result = result.filter { service in
                let query = searchText.lowercased()
                return (service.businessName?.lowercased().contains(query) ?? false) ||
                       (service.firstName?.lowercased().contains(query) ?? false) ||
                       (service.lastName?.lowercased().contains(query) ?? false) ||
                       (service.category?.lowercased().contains(query) ?? false)
            }
        }
        
        // Sort by recommendations (desc) then date (desc)
        return result.sorted {
            if ($0.recommendations ?? 0) != ($1.recommendations ?? 0) {
                return ($0.recommendations ?? 0) > ($1.recommendations ?? 0)
            }
            return ($0.lastRecommended ?? Date()) > ($1.lastRecommended ?? Date())
        }
    }
    
    var body: some View {
        ZStack {
            AppTheme.background.ignoresSafeArea()
            
            if !isAuthenticated {
                AuthenticationView(
                    passcode: $passcode,
                    verifyAction: verifyPasscode
                )
            } else {
                VStack(spacing: 0) {
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(AppTheme.secondaryText)
                        TextField("Search services...", text: $searchText)
                            .submitLabel(.done)
                            .onSubmit {
                                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                            }
                    }
                    .padding()
                    .background(Color.white)
                    .overlay(
                        Rectangle().frame(height: 1).foregroundColor(AppTheme.border),
                        alignment: .bottom
                    )
                    
                    // Category Filter
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(categories, id: \.self) { category in
                                Button(action: { selectedCategory = category }) {
                                    Text(category)
                                        .font(AppTheme.labelLarge())
                                        .padding(.vertical, 8)
                                        .padding(.horizontal, 16)
                                        .background(selectedCategory == category ? AppTheme.primaryText : Color.clear)
                                        .foregroundColor(selectedCategory == category ? .white : AppTheme.secondaryText)
                                        .cornerRadius(20)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 20)
                                                .stroke(AppTheme.border, lineWidth: selectedCategory == category ? 0 : 1)
                                        )
                                }
                            }
                        }
                        .padding()
                    }
                    .background(AppTheme.background)
                    
                    // List
                    if isLoading {
                        Spacer()
                        ProgressView()
                        Spacer()
                    } else if filteredServices.isEmpty {
                        Spacer()
                        Text("No results found.")
                            .font(AppTheme.bodyLarge())
                            .foregroundColor(AppTheme.secondaryText)
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(filteredServices) { service in
                                    ServiceCard(service: service)
                                }
                            }
                            .padding()
                        }
                    }
                }
            }
            
            // Snackbar
            if showSnackbar {
                VStack {
                    Spacer()
                    Text("Incorrect passcode")
                        .padding()
                        .background(Color.black.opacity(0.8))
                        .foregroundStyle(.white)
                        .cornerRadius(8)
                        .padding(.bottom, 20)
                }
                .transition(.move(edge: .bottom))
                .zIndex(1)
            }
        }
    }
    
    private func verifyPasscode() {
        if passcode.lowercased() == correctPasscode.lowercased() {
            withAnimation {
                isAuthenticated = true
                fetchServices()
            }
        } else {
            withAnimation {
                showSnackbar = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                withAnimation {
                    showSnackbar = false
                }
            }
        }
    }
    
    private func fetchServices() {
        isLoading = true
        Firestore.firestore().collection("services")
            .getDocuments { snapshot, error in
                isLoading = false
                if let error = error {
                    print("Error fetching services: \(error)")
                    return
                }
                
                guard let documents = snapshot?.documents else { return }
                
                self.services = documents.compactMap { doc -> ServiceProvider? in
                    try? doc.data(as: ServiceProvider.self)
                }
            }
    }
}

struct AuthenticationView: View {
    @Binding var passcode: String
    var verifyAction: () -> Void
    @FocusState private var isFocused: Bool
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.secondaryText)
            
            Text("Enter Passcode")
                .font(AppTheme.displayMedium())
                .foregroundStyle(AppTheme.primaryText)
            
            Text("Please enter the community passcode to access the directory.")
                .font(AppTheme.bodyLarge())
                .foregroundStyle(AppTheme.primaryText)
                .multilineTextAlignment(.center)
            
            SecureField("Passcode", text: $passcode)
                .textFieldStyle(PlainTextFieldStyle())
                .padding()
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(Color.gray.opacity(0.5), lineWidth: 1)
                )
                .keyboardType(.default) // Changed from numberPad to support 'raiders'
                .textInputAutocapitalization(.never)
                .focused($isFocused)
                .submitLabel(.go)
                .onSubmit {
                    verifyAction()
                }
                .onAppear {
                    isFocused = true
                }
            
            Button(action: verifyAction) {
                Text("Access Directory")
                    .font(AppTheme.labelLarge())
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(AppTheme.primaryText)
                    .foregroundStyle(.white)
                    .cornerRadius(4)
            }
        }
        .padding(24)
    }
}

struct ServiceCard: View {
    let service: ServiceProvider
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(service.category?.uppercased() ?? "SERVICE")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(Color(hex: 0x8A9A5B)) // Sage green approx
                    
                    Text(service.displayName)
                        .font(.system(size: 20, weight: .semibold, design: .serif))
                        .foregroundColor(AppTheme.primaryText)
                }
                
                Spacer()
                
                if service.sunnyApproved == true {
                    Text("☀️ SUNNY APPROVED")
                        .font(.system(size: 8, weight: .bold))
                        .padding(4)
                        .background(AppTheme.background)
                        .foregroundColor(AppTheme.accent)
                        .cornerRadius(4)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(AppTheme.border, lineWidth: 1))
                }
            }
            
            // Recommendations Badge
            HStack {
                Text("\(service.recommendations ?? 0)")
                    .font(.system(size: 14, weight: .bold, design: .serif))
                    .frame(width: 24, height: 24)
                    .background(AppTheme.background)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(AppTheme.border, lineWidth: 1))
                
                Text("RECOMMENDATIONS")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.secondaryText)
            }
            
            Divider().background(AppTheme.border)
            
            // Actions
            HStack {
                // Rec Status
                if let lastRec = service.lastRecommended {
                    Text("Rec: \(dateFormatter.string(from: lastRec))")
                        .font(.caption)
                        .foregroundColor(AppTheme.secondaryText)
                }
                
                Spacer()
                
                // Contact Link
                if let phone = service.phone, !phone.isEmpty {
                    Link(destination: URL(string: "tel:\(phone.components(separatedBy: CharacterSet.decimalDigits.inverted).joined())")!) {
                        Text(phone)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(AppTheme.primaryText)
                            .underline()
                    }
                } else if let email = service.email, !email.isEmpty {
                    Link(destination: URL(string: "mailto:\(email)")!) {
                        Text(email)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(AppTheme.primaryText)
                            .underline()
                    }
                }
            }
        }
        .padding(24)
        .background(Color.white)
        .cornerRadius(2)
        .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
    }
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }
}
