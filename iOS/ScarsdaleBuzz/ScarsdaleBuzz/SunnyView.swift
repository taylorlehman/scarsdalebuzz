import SwiftUI
import FirebaseAuth
import FirebaseFirestore
import GoogleSignIn

// Note: You must add 'FirebaseAuth', 'FirebaseFirestore', and 'GoogleSignIn' dependencies.

struct SunnyView: View {
    @State private var user: User? = Auth.auth().currentUser
    @State private var showSignInError: Bool = false
    @State private var errorMessage: String = ""
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.background.ignoresSafeArea()
                
                if let user = user {
                    RequestListView(user: user, signOut: signOut)
                } else {
                    LoginView(signIn: signInWithGoogle)
                }
            }
            .onAppear {
                // Listen to auth state changes
                Auth.auth().addStateDidChangeListener { auth, newUser in
                    self.user = newUser
                }
            }
            .alert("Sign In Failed", isPresented: $showSignInError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    private func signOut() {
        do {
            try Auth.auth().signOut()
        } catch {
            print("Error signing out: \(error)")
        }
    }
    
    private func signInWithGoogle() {
        print("Starting Google Sign-In...")
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first,
              let rootViewController = window.rootViewController else {
            print("Error: Could not find root view controller")
            return
        }
        
        GIDSignIn.sharedInstance.signIn(withPresenting: rootViewController) { signInResult, error in
            if let error = error {
                print("Google Sign-In Error: \(error.localizedDescription)")
                self.errorMessage = "Google Sign-In Error: \(error.localizedDescription)"
                self.showSignInError = true
                return
            }
            
            guard let result = signInResult else {
                print("Error: No sign-in result")
                return
            }
            
            print("Google Sign-In Successful, getting tokens...")
            // Get the ID token from Google
            let idToken = result.user.idToken?.tokenString
            let accessToken = result.user.accessToken.tokenString
            
            guard let idToken = idToken else {
                 print("Error: Could not get ID Token")
                 self.errorMessage = "Could not get ID Token"
                 self.showSignInError = true
                 return
            }
            
            let credential = GoogleAuthProvider.credential(withIDToken: idToken,
                                                           accessToken: accessToken)
            
            print("Signing in to Firebase...")
            Auth.auth().signIn(with: credential) { result, error in
                if let error = error {
                    print("Firebase Sign-In Error: \(error.localizedDescription)")
                    self.errorMessage = "Firebase Error: \(error.localizedDescription)"
                    self.showSignInError = true
                    return
                }
                print("Firebase Sign-In Successful: \(result?.user.uid ?? "No UID")")
                // Auth state listener will handle the update
            }
        }
    }
}

struct LoginView: View {
    var signIn: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "sun.max.fill") // Approx for wb_sunny
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.accent)
            
            Text("Sign in to Sunny")
                .font(AppTheme.displayMedium())
                .foregroundStyle(AppTheme.primaryText)
            
            Text("Your AI home manager needs you to sign in to access your requests.")
                .font(AppTheme.bodyLarge())
                .foregroundStyle(AppTheme.primaryText)
                .multilineTextAlignment(.center)
            
            Button(action: signIn) {
                Text("Sign In with Google")
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

struct RequestListView: View {
    let user: User
    let signOut: () -> Void
    
    @State private var requests: [Request] = []
    @State private var isLoading = true
    
    var body: some View {
        VStack(alignment: .leading) {
            // Header
            HStack {
                Text("Welcome, \(user.displayName?.components(separatedBy: " ").first ?? "User")")
                    .font(.system(size: 20, weight: .semibold, design: .serif)) // TitleLarge approx
                    .foregroundStyle(AppTheme.primaryText)
                
                Spacer()
                
                Button(action: signOut) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(AppTheme.primaryText)
                }
            }
            .padding(16)
            
            // List
            if isLoading {
                Spacer()
                Center { ProgressView() }
                Spacer()
            } else if requests.isEmpty {
                Spacer()
                VStack(spacing: 16) {
                    Text("No active matters.")
                        .font(AppTheme.bodyLarge())
                        .foregroundStyle(AppTheme.secondaryText)
                    
                    // Button to start new request
                    NavigationLink(destination: SunnyChatView(request: nil)) {
                        Text("Start New Request")
                            .font(AppTheme.labelLarge())
                            .padding()
                            .background(AppTheme.primaryText)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                }
                .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        // New Request Button at top
                         NavigationLink(destination: SunnyChatView(request: nil)) {
                            HStack {
                                Image(systemName: "plus.circle.fill")
                                Text("New Request")
                            }
                            .font(AppTheme.labelLarge())
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(AppTheme.primaryText)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        
                        ForEach(requests) { request in
                            NavigationLink(destination: SunnyChatView(request: request)) {
                                RequestItemCard(request: request)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
        .onAppear {
            fetchRequests()
        }
    }
    
    private func fetchRequests() {
        Firestore.firestore().collection("requests")
            .whereField("userId", isEqualTo: user.uid)
            .order(by: "timestamp", descending: true)
            .addSnapshotListener { snapshot, error in
                isLoading = false
                if let error = error {
                    print("Error fetching requests: \(error)")
                    return
                }
                
                guard let documents = snapshot?.documents else { return }
                
                self.requests = documents.compactMap { doc -> Request? in
                    try? doc.data(as: Request.self)
                }
            }
    }
}

// Helper to center content
struct Center<Content: View>: View {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    var body: some View {
        HStack {
            Spacer()
            content
            Spacer()
        }
    }
}

struct RequestItemCard: View {
    let request: Request
    
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Text(statusEmoji(for: request.status))
                .font(.system(size: 24))
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(request.title ?? "Untitled Request")
                        .font(AppTheme.bodyLarge())
                        .fontWeight(.bold)
                        .foregroundStyle(AppTheme.primaryText)
                    Spacer()
                    if let status = request.status {
                        Text(status.uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(AppTheme.secondaryText)
                    }
                }
                
                Text(request.summary ?? "No details available")
                    .font(AppTheme.bodyMedium())
                    .italic()
                    .foregroundStyle(AppTheme.secondaryText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .foregroundStyle(AppTheme.secondaryText)
        }
        .padding(16)
        .background(Color(hex: 0xFDF0D5))
        .cornerRadius(8)
    }
    
    func statusEmoji(for status: String?) -> String {
        guard let status = status?.lowercased() else { return "🐝" }
        if status.contains("scheduled") { return "📅" }
        if status.contains("completed") { return "✅" }
        if status.contains("cancelled") { return "🚫" }
        return "🐝"
    }
}
