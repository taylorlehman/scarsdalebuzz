# Scarsdale Buzz iOS App

This folder contains the source code for the iOS version of Scarsdale Buzz.

## Project Structure

- **ScarsdaleBuzzApp.swift**: The main entry point of the application.
- **ContentView.swift**: The main tab view controller.
- **Models/**: Data models for Providers and Users.
- **Views/**: SwiftUI views organized by feature.
  - **Directory/**: Directory listing and provider cards.
  - **Suggest/**: Form to suggest new providers.
  - **Account/**: User profile and settings.
  - **Shared/**: Common styles (Colors, Fonts) and components.

## How to Run

1. Open Xcode and create a new **iOS App** project named "ScarsdaleBuzz".
2. Choose **SwiftUI** as the Interface and **Swift** as the Language.
3. Replace the contents of the generated files with the files in this folder.
   - Copy `ScarsdaleBuzzApp.swift` to the project root.
   - Copy `ContentView.swift` to the project root.
   - Drag the `Models` and `Views` folders into the Xcode project navigator.
4. Ensure `Info.plist` (or the project settings) allows arbitrary loads if you plan to connect to a local backend, otherwise standard configuration is fine.
5. Build and run on the iPhone Simulator.

## Features Implemented

- **Directory**: Browse and search for local service providers. Filter by category.
- **Suggest**: Form to submit new provider recommendations.
- **Account**: View user profile and status.
- **Styles**: Matches the web application's cream/gold aesthetic (`#F9F8F4`, `#D4AF37`).

## Future Work

- **Sunny AI**: The "Sunny" tab is currently commented out in `ContentView.swift`.
- **Admin**: Admin features are not included in this user-facing app.
- **Backend Integration**: The app currently uses mock data (`Provider.mock`). Connect to Firebase Firestore for real data.
