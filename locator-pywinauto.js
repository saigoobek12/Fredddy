'use strict';

/**
 * Enhanced locator module using PyWinAuto for native UI element detection
 * Falls back to Python Tesseract OCR when native elements are not available
 */

const { PyWinAutoService } = require('./python-ipc');

class PyWinAutoLocator {
    /**
     * Initialize PyWinAuto locator
     * @param {Object} options Configuration options
     */
    constructor(options = {}) {
        this.options = {
            enabled: true,  // PyWinAuto enabled by default
            priority: (process.env.OCRLOCATION_PRIORITY || 'pywinauto,python-ocr,ai').split(','),
            confidenceThreshold: 0.7,
            maxElements: 100,
            cacheDuration: 5000, // 5 seconds
            ...options
        };

        this.pywinautoService = null;
        this.isPyWinAutoAvailable = false;
        this.elementCache = new Map();
        this.lastCacheClear = Date.now();

        // Initialize service if enabled
        if (this.options.enabled) {
            this._initService();
        }
    }

    /**
     * Initialize PyWinAuto service
     */
    async _initService() {
        try {
            this.pywinautoService = new PyWinAutoService();
            
            // Try to start service
            const started = await this.pywinautoService.startService();
            this.isPyWinAutoAvailable = started;
            
            if (started) {
                console.log('[PyWinAuto] Service initialized successfully');
            } else {
                console.log('[PyWinAuto] Service initialization failed, falling back to OCR-only mode');
            }
        } catch (error) {
            console.error('[PyWinAuto] Failed to initialize service:', error.message);
            this.isPyWinAutoAvailable = false;
        }
    }

    /**
     * Get service status
     * @returns {Promise<Object>} Service status
     */
    async getServiceStatus() {
        if (!this.pywinautoService) {
            return { available: false, reason: 'Service not initialized' };
        }

        try {
            const stats = this.pywinautoService.getStats();
            return {
                available: stats.isConnected,
                stats: stats,
                priority: this.options.priority,
                cacheSize: this.elementCache.size
            };
        } catch (error) {
            return { available: false, reason: error.message };
        }
    }

    /**
     * Enhanced locateSteps with PyWinAuto support
     * @param {Array} steps Tutorial steps from AI
     * @param {Buffer} pngBuffer Screenshot PNG buffer
     * @param {Object} dimensions Screenshot dimensions
     * @param {Object} options OCR options
     * @returns {Promise<Object>} Located steps with enhanced info
     */
    async locateSteps(steps, pngBuffer, dimensions, options) {
        try {
            console.log('[PyWinAuto] Attempting enhanced element location...');
            
            // Convert PNG buffer to base64
            const screenshotBase64 = pngBuffer.toString('base64');
            
            // Get active window elements via PyWinAuto
            let pywinautoElements = [];
            try {
                const analysis = await this.pywinautoService.analyzeScreen({
                    screenshot: screenshotBase64
                });
                
                if (analysis.elements && Array.isArray(analysis.elements)) {
                    pywinautoElements = analysis.elements;
                    console.log(`[PyWinAuto] Retrieved ${pywinautoElements.length} native elements`);
                    
                    // Cache elements
                    this._cacheElements(pywinautoElements);
                }
            } catch (error) {
                console.warn('[PyWinAuto] Failed to get native elements:', error.message);
            }

            // Enhanced step location
            const enhancedSteps = await this._locateStepsWithPyWinAuto(
                steps, 
                screenshotBase64, 
                dimensions, 
                pywinautoElements,
                options
            );

            // Calculate statistics
            const locatedCount = enhancedSteps.filter(s => s.located).length;
            const pywinautoLocated = enhancedSteps.filter(s => s.locatedBy === 'pywinauto').length;
            const pythonOCRLocated = enhancedSteps.filter(s => s.locatedBy === 'python-ocr').length;
            const aiLocated = enhancedSteps.filter(s => s.locatedBy === 'ai').length;

            console.log(`[PyWinAuto] Location results: ${locatedCount}/${steps.length} located`);
            console.log(`[PyWinAuto] Methods: ${pywinautoLocated} native, ${pythonOCRLocated} OCR, ${aiLocated} AI`);

            return {
                steps: enhancedSteps,
                located: locatedCount,
                methodStats: {
                    pywinauto: pywinautoLocated,
                    'python-ocr': pythonOCRLocated,
                    ai: aiLocated,
                    total: steps.length
                },
                confidence: this._calculateAverageConfidence(enhancedSteps)
            };

        } catch (error) {
            console.error('[PyWinAuto] Enhanced location failed:', error.message);
            
            // Create fallback result with AI boxes only
            const fallbackSteps = steps.map(step => ({
                ...step,
                located: false,
                locatedBy: 'ai',
                confidence: 0.3,
                method: 'ai',
                elementInfo: null,
                originalBox: step.box
            }));
            
            return {
                steps: fallbackSteps,
                located: 0,
                methodStats: {
                    pywinauto: 0,
                    'python-ocr': 0,
                    ai: steps.length,
                    total: steps.length
                },
                confidence: 0.3
            };
        }
    }

    /**
     * Locate steps using PyWinAuto-enhanced methods
     * @param {Array} steps Tutorial steps
     * @param {string} screenshotBase64 Base64 screenshot
     * @param {Object} dimensions Screenshot dimensions
     * @param {Array} nativeElements PyWinAuto native elements
     * @param {Object} options OCR options
     * @returns {Array} Enhanced steps
     */
    async _locateStepsWithPyWinAuto(steps, screenshotBase64, dimensions, nativeElements, options) {
        const W = dimensions.width;
        const H = dimensions.height;
        const enhancedSteps = [];

        // Normalize step targets for matching
        const normalizedSteps = steps.map(step => ({
            ...step,
            normalizedTarget: this._normalizeText(step.target),
            normalizedTitle: this._normalizeText(step.title),
            normalizedDesc: this._normalizeText(step.desc)
        }));

        for (const step of normalizedSteps) {
            let locatedInfo = null;
            let locationMethod = 'ai'; // Default fallback
            let confidence = 0.3; // Default AI fallback confidence
            
            // Try PyWinAuto location first
            if (nativeElements.length > 0 && step.target) {
                locatedInfo = await this._locateWithPyWinAuto(step, nativeElements, W, H);
                if (locatedInfo) {
                    locationMethod = 'pywinauto';
                    confidence = locatedInfo.confidence || 0.9;
                }
            }

            // Try Python OCR if PyWinAuto failed
            if (!locatedInfo && this.options.priority.includes('python-ocr')) {
                locatedInfo = await this._locateWithPythonOCR(step, screenshotBase64, dimensions);
                if (locatedInfo) {
                    locationMethod = 'python-ocr';
                    confidence = locatedInfo.confidence || 0.7;
                }
            }

            // Create enhanced step
            if (locatedInfo) {
                enhancedSteps.push({
                    ...step,
                    box: locatedInfo.box,
                    located: true,
                    locatedBy: locationMethod,
                    confidence: confidence,
                    elementInfo: locatedInfo.elementInfo || null,
                    automationId: locatedInfo.automationId || null,
                    controlType: locatedInfo.controlType || null,
                    method: locationMethod,
                    originalBox: step.box // Keep original AI box as reference
                });
            } else {
                // Keep AI box as fallback
                enhancedSteps.push({
                    ...step,
                    located: false,
                    locatedBy: 'ai',
                    confidence: 0.3,
                    method: 'ai',
                    elementInfo: null,
                    originalBox: step.box
                });
            }
        }

        return enhancedSteps;
    }

    /**
     * Locate element using PyWinAuto native elements
     * @param {Object} step Tutorial step
     * @param {Array} nativeElements PyWinAuto elements
     * @param {number} screenWidth Screen width
     * @param {number} screenHeight Screen height
     * @returns {Object|null} Location info
     */
    async _locateWithPyWinAuto(step, nativeElements, screenWidth, screenHeight) {
        if (!step.target) return null;

        const targetText = step.normalizedTarget;
        const stepKind = step.kind || 'text';
        
        // Find matching elements
        const matchingElements = nativeElements.filter(element => {
            // Match by text
            const elementName = this._normalizeText(element.name || '');
            const automationId = this._normalizeText(element.automation_id || '');
            
            // Check if element name contains target text
            const textMatch = elementName.includes(targetText) || 
                             targetText.includes(elementName) ||
                             automationId.includes(targetText);
            
            // Check element type compatibility
            const typeMatch = this._isElementTypeCompatible(element, stepKind);
            
            // Check if element is visible and enabled
            const isVisible = element.visible !== false;
            const isEnabled = element.enabled !== false;
            
            return textMatch && typeMatch && isVisible && isEnabled;
        });

        if (matchingElements.length === 0) {
            return null;
        }

        // Select best matching element
        const bestElement = this._selectBestElement(matchingElements, step.box, screenWidth, screenHeight);
        
        if (!bestElement || !bestElement.rectangle) {
            return null;
        }

        // Extract rectangle from element
        const rect = bestElement.rectangle;
        if (!Array.isArray(rect) && rect.length !== 4) {
            return null;
        }

        // Convert to normalized box [ymin, xmin, ymax, xmax]
        const [left, top, right, bottom] = rect;
        const normalizedBox = [
            Math.max(0, Math.min(1000, (top / screenHeight) * 1000)),      // ymin
            Math.max(0, Math.min(1000, (left / screenWidth) * 1000)),      // xmin
            Math.max(0, Math.min(1000, (bottom / screenHeight) * 1000)),  // ymax
            Math.max(0, Math.min(1000, (right / screenWidth) * 1000))      // xmax
        ];

        // Calculate confidence
        const textSimilarity = this._calculateTextSimilarity(step.target, bestElement.name || '');
        const positionSimilarity = this._calculatePositionSimilarity(step.box, normalizedBox);
        const confidence = (textSimilarity * 0.6) + (positionSimilarity * 0.4);

        return {
            box: normalizedBox,
            confidence: Math.min(1, Math.max(0.5, confidence)), // Cap between 0.5 and 1
            elementInfo: {
                name: bestElement.name,
                automationId: bestElement.automation_id,
                controlType: bestElement.control_type,
                rectangle: bestElement.rectangle,
                childrenCount: bestElement.children_count
            },
            automationId: bestElement.automation_id,
            controlType: bestElement.control_type
        };
    }

    /**
     * Locate element using Python Tesseract OCR (fallback)
     * Calls Python service OCR endpoint instead of Node.js Tesseract.js
     * 
     * @param {Object} step Tutorial step with target text
     * @param {string} screenshotBase64 Base64 screenshot
     * @param {Object} dimensions {width, height}
     * @returns {Promise<Object|null>} Location info or null
     */
    async _locateWithPythonOCR(step, screenshotBase64, dimensions) {
        if (!this.pywinautoService || !step.target) {
            return null;
        }
        
        try {
            console.log(`[PyWinAuto] Attempting Python OCR for: "${step.target}"`);
            
            // Call Python service OCR endpoint
            const response = await this.pywinautoService._request(
                'POST',
                '/ocr/text-locate',
                {
                    screenshot: screenshotBase64,
                    target: step.target,
                    targetBox: step.box || [],
                    dimensions: {
                        width: dimensions.width || 1920,
                        height: dimensions.height || 1080
                    }
                },
                15000  // 15 second timeout for OCR
            );
            
            if (response && response.located) {
                console.log(`[PyWinAuto] Python OCR found "${step.target}" with confidence ${response.confidence}`);
                
                return {
                    box: response.normalizedBox,
                    confidence: response.confidence || 0.7,
                    elementInfo: {
                        method: 'python-ocr',
                        matchedText: response.matchedText || step.target,
                        ocrEngine: 'pytesseract'
                    }
                };
            }
            
            console.log(`[PyWinAuto] Python OCR could not locate "${step.target}"`);
            return null;
            
        } catch (error) {
            console.error('[PyWinAuto] Python OCR failed:', error.message);
            return null;
        }
    }

    /**
     * Normalize text for comparison
     * @param {string} text Input text
     * @returns {string} Normalized text
     */
    _normalizeText(text) {
        if (!text) return '';
        return text.toLowerCase()
            .replace(/[^a-z0-9]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Check if element type is compatible with step kind
     * @param {Object} element PyWinAuto element
     * @param {string} stepKind Step kind (text, icon, region)
     * @returns {boolean} Compatibility status
     */
    _isElementTypeCompatible(element, stepKind) {
        const controlType = (element.control_type || '').toLowerCase();
        
        switch (stepKind) {
            case 'button':
            case 'icon':
                return controlType.includes('button') || 
                       controlType.includes('icon') || 
                       controlType.includes('toggle');
            
            case 'text':
            case 'edit':
                return controlType.includes('text') || 
                       controlType.includes('edit') || 
                       controlType.includes('label') ||
                       controlType.includes('static');
            
            case 'menu':
                return controlType.includes('menu') || 
                       controlType.includes('menuitem');
            
            case 'region':
                return controlType.includes('pane') || 
                       controlType.includes('panel') || 
                       controlType.includes('group');
            
            default:
                return true; // Accept all types for unknown kinds
        }
    }

    /**
     * Select best element from matches
     * @param {Array} matchingElements Matching elements
     * @param {Array} targetBox Target bounding box [ymin, xmin, ymax, xmax]
     * @param {number} screenWidth Screen width
     * @param {number} screenHeight Screen height
     * @returns {Object} Best element
     */
    _selectBestElement(matchingElements, targetBox, screenWidth, screenHeight) {
        if (matchingElements.length === 1) {
            return matchingElements[0];
        }

        // Convert target box to pixel coordinates
        const targetCenter = targetBox ? {
            x: ((targetBox[1] + targetBox[3]) / 2 / 1000) * screenWidth,
            y: ((targetBox[0] + targetBox[2]) / 2 / 1000) * screenHeight
        } : null;

        // Find element closest to target position
        let bestElement = matchingElements[0];
        let minDistance = Infinity;

        for (const element of matchingElements) {
            if (!element.rectangle || element.rectangle.length !== 4) {
                continue;
            }

            const [left, top, right, bottom] = element.rectangle;
            const elementCenter = {
                x: (left + right) / 2,
                y: (top + bottom) / 2
            };

            if (targetCenter) {
                const distance = Math.sqrt(
                    Math.pow(elementCenter.x - targetCenter.x, 2) +
                    Math.pow(elementCenter.y - targetCenter.y, 2)
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    bestElement = element;
                }
            } else {
                // No target position, use element size as heuristic (smaller elements are usually UI controls)
                const area = (right - left) * (bottom - top);
                if (area < minDistance) {
                    minDistance = area;
                    bestElement = element;
                }
            }
        }

        return bestElement;
    }

    /**
     * Calculate text similarity between two strings
     * @param {string} text1 First text
     * @param {string} text2 Second text
     * @returns {number} Similarity score 0-1
     */
    _calculateTextSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        
        const normalized1 = this._normalizeText(text1);
        const normalized2 = this._normalizeText(text2);
        
        if (normalized1 === normalized2) return 1;
        
        // Check if one contains the other
        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
            return 0.8;
        }
        
        // Calculate Jaccard similarity
        const set1 = new Set(normalized1.split(' '));
        const set2 = new Set(normalized2.split(' '));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    /**
     * Calculate position similarity between two boxes
     * @param {Array} box1 First box [ymin, xmin, ymax, xmax]
     * @param {Array} box2 Second box
     * @returns {number} Similarity score 0-1
     */
    _calculatePositionSimilarity(box1, box2) {
        if (!box1 || !box2 || box1.length !== 4 || box2.length !== 4) {
            return 0;
        }
        
        // Calculate center points
        const center1 = {
            x: (box1[1] + box1[3]) / 2,
            y: (box1[0] + box1[2]) / 2
        };
        
        const center2 = {
            x: (box2[1] + box2[3]) / 2,
            y: (box2[0] + box2[2]) / 2
        };
        
        // Calculate distance between centers
        const distance = Math.sqrt(
            Math.pow(center1.x - center2.x, 2) +
            Math.pow(center1.y - center2.y, 2)
        );
        
        // Normalize to 0-1 (max distance is diagonal of 1000x1000 space ≈ 1414)
        const maxDistance = 1414;
        const normalizedDistance = Math.min(1, distance / maxDistance);
        
        // Convert distance to similarity (closer = more similar)
        return 1 - normalizedDistance;
    }

    /**
     * Cache PyWinAuto elements
     * @param {Array} elements Elements to cache
     */
    _cacheElements(elements) {
        const now = Date.now();
        
        // Clear old cache if needed
        if (now - this.lastCacheClear > this.options.cacheDuration) {
            this.elementCache.clear();
            this.lastCacheClear = now;
        }
        
        // Cache elements with timestamp
        elements.forEach((element, index) => {
            if (element.automation_id || element.name) {
                const key = element.automation_id || `${element.name}_${index}`;
                this.elementCache.set(key, {
                    element,
                    timestamp: now
                });
            }
        });
    }

    /**
     * Calculate average confidence of located steps
     * @param {Array} steps Enhanced steps
     * @returns {number} Average confidence
     */
    _calculateAverageConfidence(steps) {
        const locatedSteps = steps.filter(s => s.located && s.confidence);
        if (locatedSteps.length === 0) return 0;
        
        const totalConfidence = locatedSteps.reduce((sum, step) => sum + (step.confidence || 0), 0);
        return totalConfidence / locatedSteps.length;
    }

    /**
     * Get element cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        const now = Date.now();
        const staleEntries = [...this.elementCache.entries()]
            .filter(([_, value]) => now - value.timestamp > this.options.cacheDuration);
        
        return {
            totalEntries: this.elementCache.size,
            staleEntries: staleEntries.length,
            cacheDuration: this.options.cacheDuration
        };
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        if (this.pywinautoService) {
            this.pywinautoService.stopService();
        }
        this.elementCache.clear();
    }
}

// Create singleton instance
let locatorInstance = null;

function getPyWinAutoLocator(options = {}) {
    if (!locatorInstance) {
        locatorInstance = new PyWinAutoLocator(options);
    }
    return locatorInstance;
}

module.exports = {
    PyWinAutoLocator,
    getPyWinAutoLocator,
    locateSteps: async (steps, pngBuffer, dimensions, options) => {
        const locator = getPyWinAutoLocator();
        return locator.locateSteps(steps, pngBuffer, dimensions, options);
    }
};