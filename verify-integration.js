#!/usr/bin/env node
/**
 * Verify PyWinAuto integration setup
 */

const fs = require('node:fs');
const path = require('node:path');

console.log('Verifying PyWinAuto integration setup...\n');

// Check 1: Python backend directory
console.log('1. Checking Python backend structure...');
const pythonBackendDir = path.join(__dirname, 'python-backend');
const requiredFiles = [
    'ocr_service.py',
    'start_service.py',
    'requirements.txt',
    'config.json'
];

let allFilesExist = true;
for (const file of requiredFiles) {
    const filePath = path.join(pythonBackendDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✓ ${file}`);
    } else {
        console.log(`  ✗ ${file} (MISSING)`);
        allFilesExist = false;
    }
}

// Check 2: Node.js modules
console.log('\n2. Checking Node.js integration...');
const nodeModules = [
    'locator-pywinauto.js',
    'python-ipc.js',
    'install-python-deps.js',
    'test-pywinauto.js'
];

for (const file of nodeModules) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✓ ${file}`);
    } else {
        console.log(`  ✗ ${file} (MISSING)`);
        allFilesExist = false;
    }
}

// Check 3: Updated files
console.log('\n3. Checking updated core files...');
const updatedFiles = [
    'main.js',
    'ipc-channels.js',
    'package.json',
    'README.md',
    '.env.example'
];

for (const file of updatedFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        // Check if file contains pywinauto references
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('pywinauto') || content.includes('PyWinAuto')) {
            console.log(`  ✓ ${file} (has PyWinAuto integration)`);
        } else {
            console.log(`  ⚠ ${file} (no PyWinAuto references found)`);
        }
    } else {
        console.log(`  ✗ ${file} (MISSING)`);
        allFilesExist = false;
    }
}

// Check 4: Setup scripts
console.log('\n4. Checking setup scripts...');
const setupScripts = [
    'setup-pywinauto.bat',
    'verify-integration.js'
];

for (const file of setupScripts) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✓ ${file}`);
    } else {
        console.log(`  ✗ ${file} (MISSING)`);
        allFilesExist = false;
    }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('SETUP VERIFICATION SUMMARY');
console.log('='.repeat(60));

if (allFilesExist) {
    console.log('\n✅ All files are present!');
    console.log('\nNext steps:');
    console.log('1. Add PYWINAUTO_ENABLED=1 to your .env file');
    console.log('2. Run: npm start');
    console.log('3. Look for [PyWinAuto] messages in console');
    console.log('\nQuick test: node test-pywinauto.js');
    
    // Check .env file
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('PYWINAUTO_ENABLED=1')) {
            console.log('\n✅ .env file has PyWinAuto enabled!');
        } else {
            console.log('\n⚠ .env file exists but PyWinAuto is not enabled.');
            console.log('Add: PYWINAUTO_ENABLED=1');
        }
    } else {
        console.log('\n⚠ No .env file found.');
        console.log('Copy .env.example to .env and enable PyWinAuto.');
    }
} else {
    console.log('\n❌ Some files are missing!');
    console.log('\nPlease check the missing files above.');
    console.log('The integration may not work properly.');
}

console.log('\n' + '='.repeat(60));
console.log('DOCUMENTATION');
console.log('='.repeat(60));
console.log('\nFor detailed setup instructions, see README.md');
console.log('Section: "PyWinAuto OCR Integration (Enhanced Windows Automation)"');
console.log('\nTroubleshooting:');
console.log('- Run: setup-pywinauto.bat');
console.log('- Or: node install-python-deps.js');
console.log('- Check logs for [PyWinAuto] messages');