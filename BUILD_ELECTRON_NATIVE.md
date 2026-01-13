# Electron Native Module Build Instructions with Encryption

## Overview

This guide covers building the Library Attendance System Electron app with:
- Native SQLite module (better-sqlite3)
- **AES-256-GCM encryption** for sensitive student data
- Proper Node.js ABI matching for Electron 37

---

## Prerequisites

### System Requirements
- **Node.js**: v18+ or v20+
- **npm**: v8+
- **Electron**: 37.2.3 (specified in electron-builder.json)

### Build Tools (for better-sqlite3 compilation)
- **Windows**: Visual Studio Build Tools 2019+ with C++ workload
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: build-essential, python3, make

---

## The Problem

The packaged Electron app has two main challenges:

### 1. Node.js ABI Mismatch
- **better-sqlite3** may be built for Node.js ABI 127
- **Electron 37** requires ABI 136

### 2. Data Security
- Sensitive student data (names, emails, contacts, biometrics, RFID) needs encryption at rest
- Encryption key must be securely managed

---

## The Solution Implemented

### 1. Multi-Layer Storage System
The app automatically falls back between storage engines:
1. **Electron SQLite** (preferred, fastest) with encryption
2. **IndexedDB** (browser-native, no native module needed)
3. **LocalStorage** (ultimate fallback)

The UI shows which storage engine is active (top-right of app).

### 2. Column-Level Encryption
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Management**: Auto-generated 256-bit key stored securely
- **Searchable RFID**: SHA-256 hash for encrypted RFID lookups
- **Selective Encryption**: Only sensitive fields encrypted, IDs/filters remain searchable

### 3. Enhanced Diagnostics
**Help > Diagnostics** shows:
- Node ABI version
- better-sqlite3 load status
- **Encryption key location**
- **Encryption status**
- Database file location
- All system versions

---

## Step-by-Step Build Process

### Phase 1: Initial Setup

```bash
# Clone/navigate to project
cd library-attendance-system

# Install dependencies
npm install

# Install Electron builder (as dev dependency)
npm install electron-builder --save-dev
```

### Phase 2: Add Required Scripts to package.json

**⚠️ MANUAL STEP REQUIRED**: Open `package.json` and add these scripts:

```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps",
    "rebuild-native": "electron-rebuild -f -w better-sqlite3",
    "build:electron": "vite build && npm run rebuild-native && electron-builder",
    "electron-dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron electron/main.js\""
  }
}
```

### Phase 3: Clean Build

```bash
# Clean install (removes node_modules, reinstalls)
npm ci

# Rebuild native modules for Electron 37 (ABI 136)
npm run rebuild-native

# Build and package the app
npm run build:electron
```

The packaged app will be in the `electron-dist/` folder.

---

## First Run: Encryption Setup

### Automatic Key Generation

When the built app runs **for the first time**:

1. ✅ **Encryption key auto-generated** (256-bit random key)
2. 📁 **Stored at**: `%APPDATA%\Library Attendance System\.encryption-key` (Windows)
   - macOS: `~/Library/Application Support/Library Attendance System/.encryption-key`
   - Linux: `~/.config/Library Attendance System/.encryption-key`
3. 🔒 **File permissions**: Read/write for owner only (0600)
4. ⚠️ **CRITICAL**: User must back up this key immediately

### Finding Your Encryption Key

1. Open the app
2. Go to: **Help > Show Encryption Key Location**
3. A dialog will show the exact file path
4. **Back up this file immediately** (see Key Management section)

### Console Output on First Run

```
⚠️ No encryption key found. Generating new key...
✅ New encryption key generated and saved to: C:\Users\...\AppData\Roaming\Library Attendance System\.encryption-key
⚠️ IMPORTANT: Backup this key file! Lost key = lost data!
✅ Encryption initialized successfully
```

---

## Encrypting Existing Data

### For New Installations
- All data is **automatically encrypted** from the start
- No migration needed

### For Upgrading from Non-Encrypted Version

If you're upgrading from an older version without encryption:

1. **Backup First**: The migration will prompt you to backup
2. Go to: **Help > Encrypt Existing Data**
3. Click **"Yes, backup and encrypt"**
4. Process will:
   - ✅ Create automatic backup: `library-attendance-backup-[timestamp].db`
   - ✅ Encrypt all existing student records
   - ✅ Encrypt all existing attendance records
   - ✅ Update database schema (add `data_encrypted` flags)
   - ✅ Show success confirmation
5. Verify encryption (see Verification section)

**⚠️ Warning**: This process is **irreversible** without the encryption key!

---

## Build Verification Checklist

### Desktop (Electron) - After Installing New Build

#### 1. Basic System Checks
- [ ] **Open Diagnostics**: Help > Diagnostics
- [ ] **Node ABI (modules)** shows: **136**
- [ ] **better-sqlite3 Status** shows: **Loaded successfully**
- [ ] **Storage indicator** (top-right) shows: **Storage: SQLite**

#### 2. Encryption Checks
- [ ] **Encryption Status** in Diagnostics shows: **Initialized**
- [ ] **Encryption key file exists** at location shown in Diagnostics
- [ ] **Encryption key backed up** to secure location (USB, password manager, etc.)

#### 3. Database Verification
- [ ] Database file created at: `%APPDATA%\Library Attendance System\library-attendance.db`
- [ ] File exists after first check-in/out
- [ ] Data persists after app restart

#### 4. Encrypted Data Verification
Using a SQLite browser (DB Browser for SQLite):
- [ ] Open `library-attendance.db`
- [ ] Check `students` table:
  - `name`, `email`, `contact_number`, `rfid`, `biometric_data` columns should show **gibberish** (encrypted)
  - `student_id`, `library`, `user_type` columns should be **readable** (unencrypted)
  - `data_encrypted` column should be **1**
- [ ] Check `attendance_records` table:
  - `student_name`, `contact` columns should show **gibberish** (encrypted)
  - `student_id`, `type`, `library` columns should be **readable** (unencrypted)
  - `data_encrypted` column should be **1**

#### 5. Functionality Tests
- [ ] Student registration works
- [ ] Check-in/out works normally
- [ ] Search by student ID works
- [ ] Search by RFID works (uses rfid_hash)
- [ ] Attendance reports display correctly (data decrypted on-the-fly)
- [ ] No console errors related to encryption/decryption

---

## What Gets Encrypted

### Students Table
**Encrypted Fields** (stored as Base64 encoded ciphertext):
- ✅ `name` - Full name
- ✅ `email` - Email address
- ✅ `contact_number` - Phone number
- ✅ `biometric_data` - Biometric information (if stored)
- ✅ `rfid` - RFID tag data

**Unencrypted Fields** (for search/filtering):
- ❌ `id` - Primary key
- ❌ `student_id` - Student ID (used for search)
- ❌ `library` - Library location (used for filtering)
- ❌ `user_type` - User type (used for filtering)
- ❌ `level` - Education level (used for filtering)
- ❌ `created_at`, `updated_at` - Timestamps
- ❌ `data_encrypted` - Encryption flag

**Special Fields**:
- `rfid_hash` - SHA-256 hash of RFID for searchable encrypted lookups

### Attendance Records Table
**Encrypted Fields**:
- ✅ `student_name` - Student name
- ✅ `contact` - Contact information

**Unencrypted Fields**:
- ❌ `id` - Primary key
- ❌ `student_id` - Student ID (for joins/filtering)
- ❌ `type` - Check-in/Check-out (for filtering)
- ❌ `library` - Library location (for filtering)
- ❌ `timestamp` - Record timestamp (for date filtering)
- ❌ `data_encrypted` - Encryption flag

---

## Key Management

### Backing Up Encryption Key

**⚠️ CRITICAL**: Without this key, encrypted data is **permanently unrecoverable**!

#### Method 1: Via App Menu
1. **Help > Show Encryption Key Location**
2. Note the file path shown
3. Navigate to that location in File Explorer
4. Copy `.encryption-key` file to secure locations:
   - USB drive (offline storage)
   - Password manager (1Password, Bitwarden, etc.)
   - Encrypted cloud storage (not regular cloud!)
   - Secure network location

#### Method 2: Manual Backup
**Windows**:
```
Copy from: %APPDATA%\Library Attendance System\.encryption-key
To: Your secure backup location
```

**macOS**:
```bash
cp ~/Library/Application\ Support/Library\ Attendance\ System/.encryption-key /secure/backup/location/
```

**Linux**:
```bash
cp ~/.config/Library\ Attendance\ System/.encryption-key /secure/backup/location/
```

### Restoring Encryption Key

If you need to restore the key (new machine, lost key file, etc.):

1. **Locate backed-up** `.encryption-key` file
2. Copy to application data directory:
   - **Windows**: `%APPDATA%\Library Attendance System\.encryption-key`
   - **macOS**: `~/Library/Application Support/Library Attendance System/.encryption-key`
   - **Linux**: `~/.config/Library Attendance System/.encryption-key`
3. Restart the application
4. Verify encryption status in Diagnostics

### Key Format

- **Format**: 64 hexadecimal characters
- **Length**: 32 bytes (256 bits)
- **Example**: `a1b2c3d4e5f6...` (64 chars total)

---

## Security Best Practices

### DO ✅
- ✅ **Back up encryption key immediately** after first run
- ✅ Store key backups in **multiple secure locations**
- ✅ Use **environment variable** `DB_ENCRYPTION_KEY` for production/server deployments
- ✅ Keep key backups **separate from database backups**
- ✅ Use **strong file permissions** (0600 on Linux/macOS)
- ✅ Test key restoration process periodically

### DON'T ❌
- ❌ **Never commit** `.encryption-key` to git/version control
- ❌ **Never share** key via email/chat
- ❌ **Never store** key in plain text cloud storage (Dropbox, Google Drive, etc.)
- ❌ **Never lose** the key (data will be permanently inaccessible)
- ❌ **Never reuse** keys across different databases/deployments

### Production Deployments

For production/server environments, use environment variable instead of file:

```bash
# Set environment variable before running app
export DB_ENCRYPTION_KEY=a1b2c3d4e5f6...  # Your 64-char hex key

# Then run the app
./Library\ Attendance\ System
```

**Priority Order**:
1. Environment variable `DB_ENCRYPTION_KEY` (highest priority)
2. Key file `.encryption-key`
3. Auto-generate new key (first run only)

---

## Development vs Production

### Development Mode
- Key auto-generated on first run
- Stored in local file (`.encryption-key`)
- Suitable for testing and development

### Production Mode (Recommended)
- Set environment variable: `DB_ENCRYPTION_KEY=<64-char-hex-key>`
- Key not stored in file system
- More secure for multi-user/server deployments
- Can be managed via system secrets management (e.g., Azure Key Vault, AWS Secrets Manager)

---

## If SQLite Fails (Automatic Fallback)

The app has **robust fallback storage** if native SQLite fails to load:

### Fallback Sequence
1. **SQLite** (with encryption) - Preferred
2. **IndexedDB** (browser-native, no encryption) - Automatic fallback
3. **LocalStorage** (ultimate fallback) - For basic data

### When Fallback Occurs
1. 🔔 Toast notification appears: **"SQLite Unavailable. Using IndexedDB..."**
2. 📊 Storage indicator shows: **Storage: IndexedDB**
3. ✅ App remains **fully functional**
4. 💾 Data persists across restarts
5. ⚠️ **Note**: IndexedDB fallback does **not** use encryption (JavaScript limitation)

### Fallback Verification
- [ ] Toast appears about IndexedDB fallback
- [ ] Storage shows "IndexedDB"
- [ ] Check-in/out works normally
- [ ] Data persists after app restart
- [ ] No console errors

---

## Troubleshooting

### Native Module Issues

#### "Module did not self-register"
```bash
# Solution: Rebuild native modules for Electron
npm run rebuild-native

# If that fails, clean reinstall:
rm -rf node_modules package-lock.json
npm install
npm run rebuild-native
npm run build:electron
```

#### Native Module Wrong ABI
- Delete `node_modules` and `package-lock.json`
- Run: `npm install`
- Run: `npm run rebuild-native`
- Build again: `npm run build:electron`

#### SQLite Compiles from Source (No Prebuilds)
If prebuilds aren't available for your platform, you need:
- **Windows**: Visual Studio Build Tools 2019+ with C++ workload
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `sudo apt install build-essential python3 make`

### Encryption Issues

#### "Encryption key not found"
**Symptom**: App shows error about missing encryption key

**Solutions**:
1. Check key file location via **Help > Show Encryption Key Location**
2. Key should exist at: `%APPDATA%\Library Attendance System\.encryption-key`
3. If missing, restore from backup (see Key Management)
4. If no backup exists, you'll need to start with a new database (old encrypted data is unrecoverable)

#### "Failed to decrypt data"
**Symptom**: Error when trying to view student/attendance data

**Causes**:
- Wrong encryption key (key file was replaced/modified)
- Database was encrypted with different key
- Database corruption

**Solutions**:
1. Restore correct encryption key from backup
2. Check Diagnostics: Encryption status should be "Initialized"
3. If you have database backup from before encryption, restore it
4. Last resort: Clear database and re-import data

#### "Cannot read encrypted database"
**Symptom**: Database opens but data is gibberish/unreadable

**Solutions**:
1. Ensure encryption key file exists and is correct
2. Use **Help > Show Encryption Key Location** to verify path
3. Restore encryption key from backup
4. Verify encryption status in Diagnostics

#### Data Shows as Encrypted in Reports
**Symptom**: Reports/lists show Base64 gibberish instead of names

**Cause**: Encryption initialized but app is not decrypting properly

**Solutions**:
1. Check browser console for decryption errors
2. Verify encryption status in Diagnostics
3. Restart application
4. Check if `data_encrypted` flag is set correctly in database

---

## Migration Paths

### Scenario 1: New Installation
✅ **No action needed** - Encryption is automatic from first run

### Scenario 2: Upgrading from Non-Encrypted Version
Follow these steps:

1. **Backup current database**:
   - Copy `library-attendance.db` to safe location
   - Keep this unencrypted backup temporarily for rollback

2. **Deploy new version** with encryption code

3. **First run**:
   - Encryption key auto-generates
   - **Immediately backup** `.encryption-key` file

4. **Encrypt existing data**:
   - Go to: **Help > Encrypt Existing Data**
   - Process encrypts all records in place
   - Automatic backup created before encryption

5. **Verify encryption**:
   - Check data in SQLite browser (should be gibberish)
   - Test app functionality (check-in, reports, search)
   - Verify Diagnostics shows "Encryption: Initialized"

6. **Secure cleanup**:
   - Keep encrypted database backup
   - Securely delete unencrypted backup (if confident)
   - Verify key backup in multiple locations

### Scenario 3: Migrating to New Machine

1. **On old machine**:
   - Backup `.encryption-key` file
   - Backup `library-attendance.db` file

2. **On new machine**:
   - Install new build
   - **Before first run**, restore `.encryption-key` file to correct location
   - Copy `library-attendance.db` file
   - Start app - should decrypt data automatically

---

## File Structure

```
%APPDATA%\Library Attendance System\
├── .encryption-key              ← Encryption key (backup this!)
├── library-attendance.db        ← Main database (encrypted data)
├── library-attendance-backup-*.db  ← Auto backups
└── logs\                        ← Application logs

Project Directory:
electron-dist/                   ← Packaged installers (.exe, .dmg, .AppImage)
dist/                           ← Compiled web assets
electron/
├── main.js                     ← Main process (includes encryption init)
├── database.js                 ← Database with encryption/decryption
├── encryption.js               ← AES-256-GCM encryption module
├── keyManagement.js            ← Key generation and storage
├── migration.js                ← Data migration and encryption migration
├── backup.js                   ← Backup functionality
└── preload.js                  ← Secure IPC bridge
```

---

## Testing Checklist

### Pre-Build Tests
- [ ] `npm run dev` works in browser
- [ ] IndexedDB storage works in browser
- [ ] All features work without Electron

### Post-Build Tests (Fresh Install)
- [ ] Installer runs without errors
- [ ] App launches successfully
- [ ] Encryption key auto-generated on first run
- [ ] Key file exists at correct location
- [ ] Diagnostics show correct ABI (136)
- [ ] Diagnostics show encryption initialized
- [ ] SQLite storage active
- [ ] Student registration encrypts data
- [ ] Check-in/out creates encrypted attendance records
- [ ] Search/filtering works (uses unencrypted fields)
- [ ] RFID search works (uses rfid_hash)
- [ ] Data persists after app restart
- [ ] Encrypted fields are gibberish in database file

### Post-Build Tests (Encryption Migration)
- [ ] Upgrade from old version succeeds
- [ ] "Encrypt Existing Data" menu item appears
- [ ] Migration creates backup before encrypting
- [ ] Migration completes without errors
- [ ] All existing records show `data_encrypted = 1`
- [ ] Encrypted fields are gibberish in database
- [ ] App displays decrypted data correctly
- [ ] All functionality still works after migration

### Fallback Tests
- [ ] Rename `better_sqlite3.node` to force fallback
- [ ] IndexedDB fallback activates
- [ ] Toast notification appears
- [ ] Storage indicator shows "IndexedDB"
- [ ] App remains functional
- [ ] Data persists in IndexedDB

---

## Summary

The app now has:
- ✅ **Native SQLite** with proper ABI matching (136)
- ✅ **AES-256-GCM encryption** for sensitive data
- ✅ **Secure key management** with auto-generation and backup
- ✅ **Searchable encrypted fields** (RFID hash)
- ✅ **Automatic fallback** to IndexedDB if SQLite fails
- ✅ **Migration tools** for encrypting existing data
- ✅ **Enhanced diagnostics** for troubleshooting

Users can:
- 🔒 Work with encrypted sensitive data automatically
- 🔄 Migrate existing databases to encrypted format
- 💾 Back up and restore encryption keys securely
- ✅ Continue working even if SQLite module fails (fallback)
- 🛠️ Debug issues with comprehensive diagnostics

**Next Steps**:
1. Follow build instructions above
2. **Backup encryption key immediately** after first run
3. Test thoroughly with checklist
4. Deploy to users with key backup instructions
