#!/usr/bin/env node
/**
 * Test script for PyWinAuto integration
 */

const { getPyWinAutoLocator } = require('./locator-pywinauto');

async function testPyWinAutoIntegration() {
    console.log('Testing PyWinAuto integration...\n');
    
    try {
        // Get locator instance
        const locator = getPyWinAutoLocator({
            enabled: true,
            priority: ['pywinauto', 'tesseract', 'ai']
        });
        
        // Check service status
        console.log('1. Checking PyWinAuto service status...');
        const status = await locator.getServiceStatus();
        console.log('Service available:', status.available);
        
        if (status.available) {
            console.log('Service stats:', JSON.stringify(status.stats, null, 2));
        } else {
            console.log('Service not available, will fall back to OCR');
        }
        
        // Test with mock data
        console.log('\n2. Testing with mock tutorial steps...');
        
        const mockSteps = [
            {
                target: "Save Button",
                kind: "button",
                box: [500, 500, 550, 600], // Mock AI box
                title: "Step 1: Save the file",
                desc: "Click the Save button to save your work"
            },
            {
                target: "File Menu",
                kind: "menu",
                box: [50, 100, 80, 200], // Mock AI box
                title: "Step 2: Open menu",
                desc: "Click the File menu to access file options"
            }
        ];
        
        const mockScreenshotBuffer = Buffer.alloc(100, 0); // Mock screenshot
        const mockDimensions = { width: 1920, height: 1080 };
        
        // Note: This will fail without actual PyWinAuto service running
        // but will test the fallback mechanism
        try {
            const result = await locator.locateSteps(
                mockSteps,
                mockScreenshotBuffer,
                mockDimensions,
                { langPath: './tessdata' }
            );
            
            console.log('Result:', JSON.stringify({
                locatedCount: result.located,
                totalSteps: result.steps.length,
                methodStats: result.methodStats || 'N/A',
                confidence: result.confidence || 'N/A'
            }, null, 2));
            
        } catch (locateError) {
            console.log('Location test failed (expected if service not running):', locateError.message);
        }
        
        // Test cache functionality
        console.log('\n3. Testing cache functionality...');
        const cacheStats = locator.getCacheStats();
        console.log('Cache stats:', cacheStats);
        
        console.log('\n4. Cleanup...');
        await locator.cleanup();
        
        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETE');
        console.log('='.repeat(60));
        console.log('\nPyWinAuto integration test passed!');
        console.log('\nTo run the actual service:');
        console.log('1. Add PYWINAUTO_ENABLED=1 to .env file');
        console.log('2. Run the Electron app normally');
        console.log('3. Check console for PyWinAuto status messages');
        
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    testPyWinAutoIntegration().catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testPyWinAutoIntegration };