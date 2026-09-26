import SwiftUI

struct SuggestProviderView: View {
    @State private var providerName = ""
    @State private var category = ""
    @State private var contactInfo = ""
    @State private var reason = ""
    @State private var showAlert = false
    
    let categories = ["Kids Activities", "Plumbing", "HVAC", "Electrician", "Food", "Landscaper", "Other"]
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Provider Details")) {
                    TextField("Business or Person Name", text: $providerName)
                    
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) {
                            Text($0)
                        }
                    }
                    
                    TextField("Phone or Email", text: $contactInfo)
                        .keyboardType(.emailAddress)
                }
                
                Section(header: Text("Why do you recommend them?")) {
                    TextEditor(text: $reason)
                        .frame(height: 100)
                }
                
                Section {
                    Button(action: submitSuggestion) {
                        Text("Submit Suggestion")
                            .frame(maxWidth: .infinity, alignment: .center)
                            .foregroundColor(AppColors.accentOrange)
                    }
                }
            }
            .navigationTitle("Suggest Provider")
            .alert(isPresented: $showAlert) {
                Alert(title: Text("Thank You"), message: Text("Your suggestion has been received."), dismissButton: .default(Text("OK")))
            }
        }
    }
    
    func submitSuggestion() {
        // Here you would typically send data to backend
        print("Submitting: \(providerName), \(category)")
        showAlert = true
        // Reset form
        providerName = ""
        category = ""
        contactInfo = ""
        reason = ""
    }
}

struct SuggestProviderView_Previews: PreviewProvider {
    static var previews: some View {
        SuggestProviderView()
    }
}
