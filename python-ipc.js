'use strict';

/**
 * IPC Bridge between Electron and PyWinAuto Python Service
 * Provides communication with the Python OCR backend
 */

const http = require('node:http');
const https = require('node:https');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

class PyWinAutoService {
    /**
     * Initialize the PyWinAuto service connector
     * @param {Object} options Configuration options
     */
    constructor(options = {}) {
        this.options = {
            host: '127.0.0.1',
            port: 5555,
            backend: 'uia',
            autoStart: true,
            timeout: 10000,
            retryAttempts: 3,
            retryDelay: 1000,
            pythonPath: 'python',
            pythonScript: path.join(__dirname, 'python-backend', 'start_service.py'),
            ...options
        };

        this.pythonProcess = null;
        this.isConnected = false;
        this.healthCheckInterval = null;
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.stats = {
            requests: 0,
            successes: 0,
            failures: 0,
            totalTime: 0
        };

        this.logger = {
            info: (msg) => console.log(`[PyWinAuto] ${msg}`),
            error: (msg) => console.error(`[PyWinAuto] ${msg}`),
            debug: (msg) => console.debug(`[PyWinAuto] ${msg}`)
        };
    }

    /**
     * Start the Python backend service
     * @returns {Promise<boolean>} Success status
     */
    async startService() {
        try {
            this.logger.info('Starting PyWinAuto OCR service...');

            // Check if Python script exists
            if (!fs.existsSync(this.options.pythonScript)) {
                this.logger.error(`Python script not found: ${this.options.pythonScript}`);
                return false;
            }

            // Start Python process
            const args = [
                this.options.pythonScript,
                '--port', this.options.port.toString(),
                '--host', this.options.host,
                '--backend', this.options.backend
            ];

            this.pythonProcess = spawn(this.options.pythonPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.dirname(this.options.pythonScript)
            });

            // Handle process output
            this.pythonProcess.stdout.on('data', (data) => {
                this.logger.info(`Python stdout: ${data.toString().trim()}`);
            });

            this.pythonProcess.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (!msg.includes('GET /health')) {  // Filter health check noise
                    this.logger.error(`Python stderr: ${msg}`);
                }
            });

            this.pythonProcess.on('error', (error) => {
                this.logger.error(`Python process error: ${error.message}`);
                this.isConnected = false;
            });

            this.pythonProcess.on('exit', (code, signal) => {
                this.logger.info(`Python process exited with code ${code}, signal ${signal}`);
                this.isConnected = false;
                this.stopHealthCheck();
                
                // Attempt restart if autoStart is enabled
                if (this.options.autoStart && code !== 0) {
                    setTimeout(() => this.startService(), 5000);
                }
            });

            // Wait for service to be ready
            await this.waitForService(30000);
            
            // Start health check
            this.startHealthCheck();
            
            this.logger.info('PyWinAuto service started successfully');
            return true;
        } catch (error) {
            this.logger.error(`Failed to start service: ${error.message}`);
            return false;
        }
    }

    /**
     * Stop the Python backend service
     */
    stopService() {
        this.stopHealthCheck();
        
        if (this.pythonProcess && !this.pythonProcess.killed) {
            this.logger.info('Stopping PyWinAuto service...');
            this.pythonProcess.kill('SIGTERM');
            this.pythonProcess = null;
            this.isConnected = false;
        }
    }

    /**
     * Wait for service to become available
     * @param {number} timeoutMs Maximum wait time in milliseconds
     * @returns {Promise<boolean>} Success status
     */
    async waitForService(timeoutMs = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                if (await this.healthCheck()) {
                    this.isConnected = true;
                    return true;
                }
            } catch (error) {
                // Service not ready yet
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.logger.error('Service startup timeout');
        return false;
    }

    /**
     * Perform health check
     * @returns {Promise<boolean>} Service health status
     */
    async healthCheck() {
        try {
            const response = await this._request('GET', '/health', null, 2000);
            return response && response.status === 'healthy';
        } catch (error) {
            return false;
        }
    }

    /**
     * Start periodic health check
     */
    startHealthCheck() {
        this.stopHealthCheck();
        
        this.healthCheckInterval = setInterval(async () => {
            const healthy = await this.healthCheck();
            this.isConnected = healthy;
            
            if (!healthy) {
                this.logger.warn('Service health check failed');
            }
        }, 10000);  // Check every 10 seconds
    }

    /**
     * Stop health check interval
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Make HTTP request to Python service
     * @param {string} method HTTP method
     * @param {string} endpoint API endpoint
     * @param {Object} data Request data
     * @param {number} timeout Request timeout
     * @returns {Promise<Object>} Response data
     */
    async _request(method, endpoint, data = null, timeout = null) {
        const startTime = Date.now();
        this.stats.requests++;
        
        const requestTimeout = timeout || this.options.timeout;
        const url = `http://${this.options.host}:${this.options.port}${endpoint}`;
        
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.options.host,
                port: this.options.port,
                path: endpoint,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            };

            const req = http.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    const endTime = Date.now();
                    this.stats.totalTime += (endTime - startTime);
                    
                    try {
                        const parsed = JSON.parse(responseData);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            this.stats.successes++;
                            resolve(parsed);
                        } else {
                            this.stats.failures++;
                            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || responseData}`));
                        }
                    } catch (error) {
                        this.stats.failures++;
                        reject(new Error(`Invalid JSON response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                this.stats.failures++;
                reject(error);
            });

            req.setTimeout(requestTimeout, () => {
                req.destroy();
                this.stats.failures++;
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    /**
     * Make request with retry logic
     * @param {string} method HTTP method
     * @param {string} endpoint API endpoint
     * @param {Object} data Request data
     * @param {number} attempts Remaining attempts
     * @returns {Promise<Object>} Response data
     */
    async _requestWithRetry(method, endpoint, data = null, attempts = this.options.retryAttempts) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await this._request(method, endpoint, data);
            } catch (error) {
                if (attempt === attempts) {
                    throw error;
                }
                
                this.logger.debug(`Request failed (attempt ${attempt}/${attempts}): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
                
                // Try to restart service on connection errors
                if (error.code === 'ECONNREFUSED' && this.options.autoStart) {
                    this.logger.info('Connection refused, attempting service restart...');
                    await this.startService();
                }
            }
        }
    }

    /**
     * Get active window information
     * @returns {Promise<Object>} Window info
     */
    async getActiveWindowInfo() {
        return this._requestWithRetry('GET', '/elements/active-window');
    }

    /**
     * Get all UI elements from active window
     * @returns {Promise<Array>} List of UI elements
     */
    async getActiveWindowElements() {
        const response = await this._requestWithRetry('GET', '/elements/active-window');
        return response.elements || [];
    }

    /**
     * OCR entire screen
     * @param {Buffer|string} screenshot Optional screenshot data
     * @returns {Promise<Object>} OCR results
     */
    async ocrScreen(screenshot = null) {
        const data = screenshot ? { screenshot } : {};
        return this._requestWithRetry('POST', '/ocr/screen', data);
    }

    /**
     * OCR specific window
     * @returns {Promise<Object>} Window OCR results
     */
    async ocrWindow() {
        return this._requestWithRetry('POST', '/ocr/window');
    }

    /**
     * Locate element by text or type
     * @param {Object} options Search options
     * @param {string} options.text Text to search for
     * @param {string} options.type Element type
     * @param {string} options.screenshot Screenshot data for matching
     * @returns {Promise<Array>} Matching elements
     */
    async locateElement(options = {}) {
        const response = await this._requestWithRetry('POST', '/locate-element', options);
        return response.results || [];
    }

    /**
     * Comprehensive screen analysis
     * @param {Object} options Analysis options
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeScreen(options = {}) {
        return this._requestWithRetry('POST', '/analyze-screen', options);
    }

    /**
     * Locate text using Python Tesseract OCR
     * @param {Object} options Search options
     * @param {string} options.screenshot Base64 screenshot data
     * @param {string} options.target Text to locate
     * @param {Array} options.targetBox Optional bounding box for disambiguation
     * @param {Object} options.dimensions Image dimensions {width, height}
     * @returns {Promise<Object>} OCR location results
     */
    async locateTextInOCR(options = {}) {
        return this._requestWithRetry('POST', '/ocr/text-locate', options);
    }

    /**
     * Get service statistics
     * @returns {Object} Service stats
     */
    getStats() {
        const avgTime = this.stats.requests > 0 
            ? this.stats.totalTime / this.stats.requests 
            : 0;
        
        const successRate = this.stats.requests > 0
            ? (this.stats.successes / this.stats.requests) * 100
            : 0;
        
        return {
            ...this.stats,
            avgRequestTime: avgTime,
            successRate: successRate,
            isConnected: this.isConnected,
            isRunning: this.pythonProcess && !this.pythonProcess.killed
        };
    }

    /**
     * Queue a request for batch processing
     * @param {Function} requestFn Request function
     * @returns {Promise} Promise that resolves with result
     */
    queueRequest(requestFn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ requestFn, resolve, reject });
            this._processQueue();
        });
    }

    /**
     * Process queued requests
     */
    async _processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { requestFn, resolve, reject } = this.requestQueue.shift();
            
            try {
                const result = await requestFn();
                resolve(result);
            } catch (error) {
                reject(error);
            }
            
            // Small delay between requests to avoid overwhelming the service
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.isProcessingQueue = false;
    }
}

module.exports = { PyWinAutoService };