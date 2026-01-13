# Camera Permissions Setup for Capacitor Apps

## Android Permissions

After running `npx cap add android`, add these permissions to:

**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Add these permission lines inside <manifest> tag -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    
    <application>
        <!-- ... rest of your application config -->
    </application>
</manifest>
```

## iOS Permissions

After running `npx cap add ios`, add these permissions to:

**File:** `ios/App/App/Info.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Add this key-value pair inside <dict> tag -->
    <key>NSCameraUsageDescription</key>
    <string>This app needs camera access to scan QR codes for authentication</string>
    
    <!-- ... rest of your plist entries -->
</dict>
</plist>
```

## Web/PWA Permissions

For the main web app and TOTP PWA, camera permissions are handled automatically by the browser. The user will be prompted when the camera is accessed.

The `BarcodeScanner` component (using `@zxing/library`) will automatically request camera permissions when `navigator.mediaDevices.getUserMedia()` is called.

## Testing Permissions

### Android
1. After building, install the app on your device
2. Go to Settings → Apps → [Your App] → Permissions
3. Ensure Camera permission is granted

### iOS
1. After building, install the app on your device
2. When you first use the scanner, iOS will show a permission dialog
3. Grant camera access
4. If denied, go to Settings → [Your App] → Camera and enable it

## Troubleshooting

**Android:**
- If camera doesn't work, check Logcat in Android Studio for permission errors
- Ensure the permissions are added BEFORE `<application>` tag in AndroidManifest.xml

**iOS:**
- If camera doesn't work, check Xcode console for permission errors
- Ensure `NSCameraUsageDescription` string is descriptive and user-friendly
- You may need to uninstall and reinstall the app if you added permissions after initial install
