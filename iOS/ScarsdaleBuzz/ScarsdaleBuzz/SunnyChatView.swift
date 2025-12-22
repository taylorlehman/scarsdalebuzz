import SwiftUI
import FirebaseAuth
import FirebaseFirestore

struct SunnyChatView: View {
    let request: Request?
    
    @State private var messageText: String = ""
    @State private var messages: [ChatMessage] = []
    @State private var isLoading = false
    @State private var activeRequestId: String?
    @State private var isNewRequest: Bool = false
    
    // Cloud Function URLs
    private let submitUrl = "https://submitrequest-bnvo6soxla-uc.a.run.app"
    private let respondUrl = "https://handleuserresponse-bnvo6soxla-uc.a.run.app"
    
    var body: some View {
        VStack(spacing: 0) {
            // Chat List
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 16) {
                        // Intro message for new requests
                        if isNewRequest && messages.isEmpty {
                            IntroMessageBubble()
                        }
                        
                        ForEach(messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                        
                        if isLoading {
                            LoadingBubble()
                                .id("loading")
                        }
                    }
                    .padding(16)
                }
                .onChange(of: messages.count) { _ in
                    if let lastId = messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: isLoading) { loading in
                    if loading {
                        withAnimation {
                            proxy.scrollTo("loading", anchor: .bottom)
                        }
                    }
                }
            }
            
            // Input Area
            VStack(spacing: 0) {
                Divider()
                    .background(AppTheme.border)
                
                HStack(spacing: 12) {
                    TextField(isNewRequest && messages.isEmpty ? "Describe your issue! Include urgency..." : "Type a message...", text: $messageText)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 24)
                                .stroke(AppTheme.border, lineWidth: 1)
                        )
                        .submitLabel(.send)
                        .onSubmit {
                            sendMessage()
                        }
                    
                    Button(action: sendMessage) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(AppTheme.primaryText)
                            .clipShape(Circle())
                    }
                    .disabled(messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
                }
                .padding(16)
                .background(Color.white)
            }
        }
        .navigationTitle(request?.title ?? "New Matter")
        .navigationBarTitleDisplayMode(.inline)
        .background(AppTheme.background.ignoresSafeArea())
        .onAppear {
            setupView()
        }
    }
    
    private func setupView() {
        if let req = request, let id = req.id {
            self.activeRequestId = id
            self.isNewRequest = false
            // Initial load from passed object, then listen
            if let history = req.chat_history {
                self.messages = history
            }
            listenForUpdates(requestId: id)
        } else {
            self.isNewRequest = true
        }
    }
    
    private func listenForUpdates(requestId: String) {
        Firestore.firestore().collection("requests").document(requestId)
            .addSnapshotListener { snapshot, error in
                guard let snapshot = snapshot, snapshot.exists else { return }
                
                if let updatedRequest = try? snapshot.data(as: Request.self),
                   let history = updatedRequest.chat_history {
                    self.messages = history
                }
            }
    }
    
    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        
        let tempMessage = ChatMessage(sender: "User", message: text, timestamp: Date())
        messages.append(tempMessage)
        messageText = ""
        isLoading = true
        
        Task {
            do {
                if isNewRequest {
                    try await submitNewRequest(text: text)
                } else {
                    try await sendReply(text: text)
                }
            } catch {
                print("Error sending message: \(error)")
                // Handle error (show alert etc)
                isLoading = false
            }
        }
    }
    
    private func submitNewRequest(text: String) async throws {
        guard let token = try? await Auth.auth().currentUser?.getIDToken() else { return }
        
        let url = URL(string: submitUrl)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let body = ["description": text]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        
        // Parse response to get ID and reply
        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let newId = json["id"] as? String {
            
            DispatchQueue.main.async {
                self.activeRequestId = newId
                self.isNewRequest = false
                self.isLoading = false
                self.listenForUpdates(requestId: newId)
            }
        }
    }
    
    private func sendReply(text: String) async throws {
        guard let requestId = activeRequestId else { return }
        guard let token = try? await Auth.auth().currentUser?.getIDToken() else { return }
        
        let url = URL(string: respondUrl)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let body = ["requestId": requestId, "response": text]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        
        DispatchQueue.main.async {
            self.isLoading = false
        }
    }
}

struct MessageBubble: View {
    let message: ChatMessage
    
    var isUser: Bool {
        let role = message.effectiveRole
        return role == "User" || role == "You"
    }
    
    var body: some View {
        HStack {
            if isUser { Spacer() }
            
            VStack(alignment: isUser ? .trailing : .leading) {
                Text(isUser ? "You" : "Sunny")
                    .font(.caption)
                    .foregroundColor(isUser ? AppTheme.primaryText : AppTheme.accent)
                    .padding(.bottom, 2)
                
                Text(message.message)
                    .font(AppTheme.bodyLarge())
                    .foregroundColor(AppTheme.primaryText)
                    .padding(16)
                    .background(isUser ? AppTheme.userBubble : AppTheme.sunnyBubble)
                    .clipShape(RoundedCornerShape(
                        topLeft: 12,
                        topRight: 12,
                        bottomLeft: isUser ? 12 : 0,
                        bottomRight: isUser ? 0 : 12
                    ))
                    .overlay(
                        RoundedCornerShape(
                            topLeft: 12,
                            topRight: 12,
                            bottomLeft: isUser ? 12 : 0,
                            bottomRight: isUser ? 0 : 12
                        )
                        .stroke(AppTheme.border, lineWidth: 1)
                    )
            }
            .frame(maxWidth: UIScreen.main.bounds.width * 0.8, alignment: isUser ? .trailing : .leading)
            
            if !isUser { Spacer() }
        }
    }
}

struct IntroMessageBubble: View {
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Sunny")
                    .font(.caption)
                    .foregroundColor(AppTheme.accent)
                    .padding(.bottom, 2)
                
                Text("How can I assist with your home today? Please describe the issue.")
                    .font(AppTheme.bodyLarge())
                    .foregroundColor(AppTheme.primaryText)
                    .padding(16)
                    .background(AppTheme.sunnyBubble)
                    .clipShape(RoundedCornerShape(topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 12))
                    .overlay(
                        RoundedCornerShape(topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 12)
                        .stroke(AppTheme.border, lineWidth: 1)
                    )
            }
            Spacer()
        }
    }
}

struct LoadingBubble: View {
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Sunny")
                    .font(.caption)
                    .foregroundColor(AppTheme.accent)
                    .padding(.bottom, 2)
                
                HStack {
                    ProgressView()
                    Text("Thinking...")
                        .font(.caption)
                        .foregroundColor(AppTheme.secondaryText)
                }
                .padding(16)
                .background(AppTheme.sunnyBubble)
                .clipShape(RoundedCornerShape(topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 12))
            }
            Spacer()
        }
    }
}

// Custom Shape for specific corner rounding
struct RoundedCornerShape: Shape {
    var topLeft: CGFloat = 0
    var topRight: CGFloat = 0
    var bottomLeft: CGFloat = 0
    var bottomRight: CGFloat = 0
    
    func path(in rect: CGRect) -> Path {
        var path = Path()
        
        let w = rect.size.width
        let h = rect.size.height
        
        // Top Left
        path.move(to: CGPoint(x: 0 + topLeft, y: 0))
        path.addLine(to: CGPoint(x: w - topRight, y: 0))
        path.addArc(center: CGPoint(x: w - topRight, y: topRight), radius: topRight, startAngle: Angle(degrees: -90), endAngle: Angle(degrees: 0), clockwise: false)
        path.addLine(to: CGPoint(x: w, y: h - bottomRight))
        path.addArc(center: CGPoint(x: w - bottomRight, y: h - bottomRight), radius: bottomRight, startAngle: Angle(degrees: 0), endAngle: Angle(degrees: 90), clockwise: false)
        path.addLine(to: CGPoint(x: 0 + bottomLeft, y: h))
        path.addArc(center: CGPoint(x: 0 + bottomLeft, y: h - bottomLeft), radius: bottomLeft, startAngle: Angle(degrees: 90), endAngle: Angle(degrees: 180), clockwise: false)
        path.addLine(to: CGPoint(x: 0, y: 0 + topLeft))
        path.addArc(center: CGPoint(x: 0 + topLeft, y: 0 + topLeft), radius: topLeft, startAngle: Angle(degrees: 180), endAngle: Angle(degrees: 270), clockwise: false)
        
        return path
    }
}
