#!/usr/bin/env node
/**
 * Python Dependencies Installer for PyWinAuto
 * Run this script to install required Python packages
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

async function installPythonDependencies() {
    console.log('Installing Python dependencies for PyWinAuto...');
    
    const pythonBackendDir = path.join(__dirname, 'python-backend');
    const requirementsFile = path.join(pythonBackendDir, 'requirements.txt');
    
    // Check if requirements file exists
    if (!fs.existsSync(requirementsFile)) {
        console.error('requirements.txt not found in python-backend directory');
        return false;
    }
    
    // Try different Python executables
    const pythonExecutables = ['python', 'python3', 'py'];
    
    for (const pythonExe of pythonExecutables) {
        try {
            console.log(`Trying ${pythonExe}...`);
            
            const pipInstall = spawn(pythonExe, [
                '-m', 'pip', 'install', '-r', requirementsFile
            ], {
                stdio: 'inherit',
                cwd: pythonBackendDir
            });
            
            await new Promise((resolve, reject) => {
                pipInstall.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`pip install exited with code ${code}`));
                    }
                });
                
                pipInstall.on('error', reject);
            });
            
            console.log('Python dependencies installed successfully!');
            return true;
            
        } catch (error) {
            console.log(`${pythonExe} failed: ${error.message}`);
            continue;
        }
    }
    
    console.error('Failed to install Python dependencies. Please install manually:');
    console.error(`cd ${pythonBackendDir}`);
    console.error('python -m pip install -r requirements.txt');
    return false;
}

async function checkPythonInstallation() {
    console.log('Checking Python installation...');
    
    const pythonExecutables = ['python', 'python3', 'py'];
    
    for (const pythonExe of pythonExecutables) {
        try {
            const versionCheck = spawn(pythonExe, ['--version'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            await new Promise((resolve, reject) => {
                let output = '';
                versionCheck.stdout.on('data', (data) => output += data);
                versionCheck.stderr.on('data', (data) => output += data);
                
                versionCheck.on('close', (code) => {
                    if (code === 0) {
                        console.log(`Found ${pythonExe}: ${output.trim()}`);
                        resolve(pythonExe);
                    } else {
                        reject(new Error(`${pythonExe} not available`));
                    }
                });
                
                versionCheck.on('error', reject);
            });
            
            return pythonExe;
            
        } catch (error) {
            // Continue to next executable
        }
    }
    
    console.error('Python not found. Please install Python 3.8 or later.');
    return null;
}

async function testPyWinAutoInstallation(pythonExe) {
    console.log('Testing PyWinAuto installation...');
    
    try {
        const testScript = path.join(__dirname, 'python-backend', 'start_service.py');
        const testProcess = spawn(pythonExe, [testScript, '--help'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        await new Promise((resolve, reject) => {
            let output = '';
            testProcess.stdout.on('data', (data) => output += data);
            testProcess.stderr.on('data', (data) => output += data);
            
            testProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('PyWinAuto setup looks good!');
                    resolve();
                } else {
                    reject(new Error('PyWinAuto test failed'));
                }
            });
            
            testProcess.on('error', reject);
        });
        
        return true;
    } catch (error) {
        console.error('PyWinAuto test failed:', error.message);
        return false;
    }
}

async function setupEnvironment() {
    console.log('Setting up PyWinAuto environment...\n');
    
    // Check Python
    const pythonExe = await checkPythonInstallation();
    if (!pythonExe) {
        console.error('Python is required for PyWinAuto integration.');
        console.error('Download Python from: https://www.python.org/downloads/');
        return false;
    }
    
    // Install dependencies
    const depsInstalled = await installPythonDependencies();
    if (!depsInstalled) {
        console.error('\nFailed to install Python dependencies.');
        console.error('Please install them manually:');
        console.error('1. Open Command Prompt as Administrator');
        console.error('2. cd ' + path.join(__dirname, 'python-backend'));
        console.error('3. python -m pip install -r requirements.txt');
        return false;
    }
    
    // Test installation
    const testPassed = await testPyWinAutoInstallation(pythonExe);
    if (!testPassed) {
        console.error('\nPyWinAuto test failed. Some dependencies may be missing.');
        console.error('Common issues:');
        console.error('1. Run Command Prompt as Administrator');
        console.error('2. Install Visual C++ Build Tools');
        console.error('3. Install Windows SDK');
        return false;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nTo enable PyWinAuto enhanced detection, add to your .env file:');
    console.log('PYWINAUTO_ENABLED=1');
    console.log('PYWINAUTO_PORT=5555');
    console.log('PYWINAUTO_BACKEND=uia');
    console.log('\nThe service will start automatically when you run the app.');
    console.log('Check logs for PyWinAuto status messages.\n');
    
    return true;
}

// Run setup if called directly
if (require.main === module) {
    setupEnvironment().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

module.exports = {
    setupEnvironment,
    installPythonDependencies,
    checkPythonInstallation
};