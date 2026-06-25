#!/usr/bin/env python3
"""
Simple launcher for PyWinAuto OCR Service
"""

import sys
import os
import subprocess
import signal
import time
from pathlib import Path

def install_dependencies():
    """Install required Python packages"""
    print("Checking Python dependencies...")
    
    # Check if requirements.txt exists
    requirements_file = Path(__file__).parent / "requirements.txt"
    if not requirements_file.exists():
        print(f"Warning: {requirements_file} not found")
        return False
    
    try:
        # Check if pip is available
        import pip
        print("Installing dependencies...")
        
        # Install requirements
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ])
        print("Dependencies installed successfully!")
        return True
    except Exception as e:
        print(f"Error installing dependencies: {e}")
        print("Please install manually: pip install -r requirements.txt")
        return False

def check_dependencies():
    """Check if required modules are available"""
    required_modules = [
        "pywinauto",
        "PIL",
        "flask",
        "flask_cors",
        "win32gui",
        "win32process",
        "win32con"
    ]
    
    missing_modules = []
    for module in required_modules:
        try:
            __import__(module)
        except ImportError:
            missing_modules.append(module)
    
    if missing_modules:
        print(f"Missing modules: {', '.join(missing_modules)}")
        return False
    return True

def start_service(port=5555, host="127.0.0.1", backend="uia"):
    """Start the OCR service"""
    try:
        # Check if service is already running
        try:
            import requests
            response = requests.get(f"http://{host}:{port}/health", timeout=2)
            if response.status_code == 200:
                print(f"Service is already running on {host}:{port}")
                return True
        except:
            pass  # Service is not running
        
        # Start the service
        print(f"Starting PyWinAuto OCR Service on {host}:{port}...")
        print(f"Backend: {backend}")
        print("Press Ctrl+C to stop")
        
        # Import and run the service
        from ocr_service import app, ocr_service
        
        # Update service backend
        ocr_service.backend = backend
        
        # Run Flask app
        app.run(host=host, port=port, debug=False, use_reloader=False)
        
        return True
    except KeyboardInterrupt:
        print("\nService stopped by user")
        return True
    except Exception as e:
        print(f"Failed to start service: {e}")
        return False

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='PyWinAuto OCR Service Launcher')
    parser.add_argument('--install', action='store_true', help='Install dependencies first')
    parser.add_argument('--port', type=int, default=5555, help='Port to run on')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--backend', type=str, default='uia', choices=['uia', 'win32'], help='PyWinAuto backend')
    
    args = parser.parse_args()
    
    # Install dependencies if requested
    if args.install:
        if not install_dependencies():
            print("Failed to install dependencies")
            sys.exit(1)
    
    # Check dependencies
    if not check_dependencies():
        print("Required dependencies are missing")
        answer = input("Install dependencies now? (y/n): ")
        if answer.lower() == 'y':
            if not install_dependencies():
                sys.exit(1)
        else:
            print("Cannot start without required dependencies")
            sys.exit(1)
    
    # Start service
    success = start_service(args.port, args.host, args.backend)
    
    if not success:
        sys.exit(1)

if __name__ == '__main__':
    main()