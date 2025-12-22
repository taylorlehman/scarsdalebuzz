# Debugging & Setup Guide

Since you are porting from Flutter/Web to Native iOS, there are a few critical configuration steps you must perform in Xcode to make Firebase work.

## 1. Match the Bundle Identifier
The `GoogleService-Info.plist` file is tied to a specific Bundle ID.
1. Open **ScarsdaleBuzz.xcodeproj** in Xcode.
2. Click the blue **ScarsdaleBuzz** project icon in the left navigator.
3. Select the **ScarsdaleBuzz** target in the center panel.
4. Go to the **General** tab.
5. Under **Identity**, change **Bundle Identifier** to exactly:
   `com.scarsdalebuzz.flutterApp`
   *(This matches the value in your GoogleService-Info.plist)*

## 2. Configure URL Types (for Google Sign-In)
1. Still in the Target settings, go to the **Info** tab.
2. Scroll down to **URL Types**.
3. Click **+** to add a new URL Type.
4. In **URL Schemes**, paste the `REVERSED_CLIENT_ID` from your plist:
   `com.googleusercontent.apps.473670057425-p3l3iuln49r2a98555mebs514ade033t`

## 3. Add `GIDClientID` to Info.plist
Recent versions of the Google Sign-In SDK require the Client ID to be explicitly set in `Info.plist`.
1. Go to the **Info** tab of the target.
2. Add a new key named `GIDClientID`.
3. Set its value to the `CLIENT_ID` from your plist:
   `473670057425-p3l3iuln49r2a98555mebs514ade033t.apps.googleusercontent.com`

## 4. Add `GoogleService-Info.plist` to the Target
1. Ensure `GoogleService-Info.plist` is visible in the file navigator (left side).
2. Click on it.
3. In the **File Inspector** (right sidebar, paper icon), look at the **Target Membership** section.
4. **Check the box** next to `ScarsdaleBuzz`.
   *(If this is not checked, the app crashes or fails to init Firebase because it can't find the config file).*

## 4. Install Dependencies
Ensure you have added the following Swift Packages (File > Add Package Dependencies):
1. **firebase-ios-sdk** (https://github.com/firebase/firebase-ios-sdk)
   - Select modules: `FirebaseAuth`, `FirebaseFirestore`
2. **google-sign-in-ios** (https://github.com/google/google-sign-in-ios)
   - Select module: `GoogleSignIn`

## 5. Verify Background Color
I have updated `Theme.swift` to use `Color.white` as the background. Since all views use `AppTheme.background`, the app should now blend seamlessly with the logo.
