//
//  ScarsdaleBuzzApp.swift
//  ScarsdaleBuzz
//
//  Created by Taylor Lehman on 12/17/25.
//

import SwiftUI
import FirebaseCore
import GoogleSignIn

// Helper to bridge the delegate to SwiftUI lifecycle
class AppDelegate: NSObject, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    FirebaseApp.configure()
    return true
  }
}

@main
struct ScarsdaleBuzzApp: App {
    // Register app delegate for Firebase setup
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    
    @State private var showMainApp = false
    
    var body: some Scene {
        WindowGroup {
            if showMainApp {
                MainLayoutView()
                    .onOpenURL { url in
                        GIDSignIn.sharedInstance.handle(url)
                    }
            } else {
                OnboardingView(showMainApp: $showMainApp)
                    .onOpenURL { url in
                        GIDSignIn.sharedInstance.handle(url)
                    }
            }
        }
    }
}
