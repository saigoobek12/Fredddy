#!/usr/bin/env python3
"""
PyWinAuto OCR Service for Electron Assistant Overlay
Provides enhanced UI element detection using Windows accessibility APIs
"""

import sys
import json
import time
import base64
import logging
from io import BytesIO
from typing import Dict, List, Optional, Tuple, Any

# Windows-specific imports
try:
    import win32gui
    import win32process
    import win32con
    import win32api
    import pytesseract
    from PIL import ImageGrab, Image, ImageDraw
    import pywinauto
    from pywinauto.application import Application
    from pywinauto.findwindows import find_window, ElementNotFoundError
    from pywinauto.controls.uiawrapper import UIAWrapper
    from pywinauto.timings import Timings
except ImportError as e:
    print(f"Missing required module: {e}")
    print("Please install: pip install pywinauto pytesseract pillow pywin32")
    sys.exit(1)
    from PIL import ImageGrab, Image, ImageDraw
    import pywinauto
    from pywinauto.application import Application
    from pywinauto.findwindows import find_window, ElementNotFoundError
    from pywinauto.controls.uiawrapper import UIAWrapper
    from pywinauto.timings import Timings
except ImportError as e:
    print(f"Missing required module: {e}")
    print("Please install: pip install pywinauto pillow pywin32")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure pywinauto timings
Timings.fast()


class PyWinAutoOCRService:
    """Service for detecting UI elements using PyWinAuto and OCR"""
    
    def __init__(self, backend: str = "uia"):
        """
        Initialize the OCR service
        
        Args:
            backend: "uia" (recommended) or "win32"
        """
        self.backend = backend
        self._current_app: Optional[Application] = None
        self._current_window: Optional[UIAWrapper] = None
        self._last_screenshot: Optional[Image.Image] = None
        
        # Cache for element detection
        self._element_cache: Dict[str, Any] = {}
        self._cache_ttl = 5.0  # seconds
        
        logger.info(f"PyWinAuto OCR Service initialized with backend: {backend}")
    
    def get_active_window_info(self) -> Dict[str, Any]:
        """Get information about the currently active window"""
        try:
            hwnd = win32gui.GetForegroundWindow()
            if hwnd == 0:
                return {"error": "No active window found"}
            
            # Get window text
            window_text = win32gui.GetWindowText(hwnd)
            
            # Get window class
            window_class = win32gui.GetClassName(hwnd)
            
            # Get window rect
            rect = win32gui.GetWindowRect(hwnd)
            
            # Get process ID
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            
            # Get executable path
            try:
                process = win32api.OpenProcess(
                    win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ,
                    False,
                    pid
                )
                exe_path = win32process.GetModuleFileNameEx(process, 0)
                win32api.CloseHandle(process)
            except:
                exe_path = "Unknown"
            
            return {
                "hwnd": hwnd,
                "title": window_text,
                "class": window_class,
                "rect": rect,  # (left, top, right, bottom)
                "pid": pid,
                "exe_path": exe_path,
                "width": rect[2] - rect[0],
                "height": rect[3] - rect[1],
                "active": True
            }
        except Exception as e:
            logger.error(f"Error getting active window info: {e}")
            return {"error": str(e)}
    
    def connect_to_active_window(self) -> bool:
        """Connect to the currently active window using PyWinAuto"""
        try:
            window_info = self.get_active_window_info()
            if "error" in window_info:
                return False
            
            hwnd = window_info["hwnd"]
            
            # Try to connect to the window
            app = Application(backend=self.backend).connect(handle=hwnd)
            window = app.window(handle=hwnd)
            
            self._current_app = app
            self._current_window = window
            self._current_window_info = window_info
            
            logger.info(f"Connected to window: {window_info['title']} (HWND: {hwnd})")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to active window: {e}")
            self._current_app = None
            self._current_window = None
            return False
    
    def get_all_elements(self) -> List[Dict[str, Any]]:
        """Get all UI elements from the current window"""
        if not self._current_window:
            if not self.connect_to_active_window():
                return []
        
        try:
            elements = []
            self._collect_elements_recursive(self._current_window, elements, depth=0)
            
            # Update cache
            cache_key = f"elements_{time.time() // self._cache_ttl}"
            self._element_cache[cache_key] = {
                "timestamp": time.time(),
                "elements": elements
            }
            
            return elements
        except Exception as e:
            logger.error(f"Error getting elements: {e}")
            return []
    
    def _collect_elements_recursive(self, element, elements_list: List, depth: int = 0):
        """Recursively collect UI elements"""
        try:
            # Skip if element is not visible or not enabled
            if hasattr(element, 'is_visible') and not element.is_visible():
                return
            if hasattr(element, 'is_enabled') and not element.is_enabled():
                return
            
            # Get element properties
            element_info = {
                "depth": depth,
                "control_type": element.friendly_class_name() if hasattr(element, 'friendly_class_name') else type(element).__name__,
                "class_name": element.class_name() if hasattr(element, 'class_name') else "",
                "automation_id": element.automation_id() if hasattr(element, 'automation_id') else "",
                "name": element.window_text() if hasattr(element, 'window_text') else "",
                "rectangle": self._get_element_rect(element),
                "children_count": 0,
                "is_focusable": getattr(element, 'can_be_focused', False) if hasattr(element, 'can_be_focused') else False,
                "is_editable": self._is_editable_element(element),
                "is_button": self._is_button_element(element),
                "is_menu": self._is_menu_element(element),
                "is_text": self._is_text_element(element),
            }
            
            # Get bounding box in screen coordinates
            rect = element_info["rectangle"]
            if rect:
                element_info["screen_rect"] = rect  # Already in screen coordinates
                element_info["normalized_box"] = self._normalize_rect(rect)
            
            # Count children
            try:
                children = element.children()
                element_info["children_count"] = len(children)
                elements_list.append(element_info)
                
                # Process children recursively (limit depth to avoid recursion issues)
                if depth < 10:  # Reasonable depth limit
                    for child in children:
                        self._collect_elements_recursive(child, elements_list, depth + 1)
            except Exception as e:
                logger.debug(f"Error getting children for element: {e}")
                elements_list.append(element_info)
                
        except Exception as e:
            logger.debug(f"Skipping element at depth {depth}: {e}")
    
    def _get_element_rect(self, element) -> Optional[Tuple[int, int, int, int]]:
        """Get element rectangle in screen coordinates"""
        try:
            if hasattr(element, 'rectangle'):
                rect = element.rectangle()
                return (rect.left, rect.top, rect.right, rect.bottom)
            elif hasattr(element, 'get_properties') and 'rectangle' in element.get_properties():
                rect = element.get_properties()['rectangle']
                return (rect.left, rect.top, rect.right, rect.bottom)
        except Exception as e:
            logger.debug(f"Could not get rectangle for element: {e}")
        
        return None
    
    def _normalize_rect(self, rect: Tuple[int, int, int, int], 
                       screen_width: int = 1920, screen_height: int = 1080) -> List[float]:
        """Normalize rectangle to 0-1000 range"""
        left, top, right, bottom = rect
        return [
            max(0, min(1000, (top / screen_height) * 1000)),      # ymin
            max(0, min(1000, (left / screen_width) * 1000)),      # xmin
            max(0, min(1000, (bottom / screen_height) * 1000)),   # ymax
            max(0, min(1000, (right / screen_width) * 1000)),     # xmax
        ]
    
    def _is_editable_element(self, element) -> bool:
        """Check if element is editable (textbox, combobox, etc.)"""
        control_type = element.friendly_class_name().lower() if hasattr(element, 'friendly_class_name') else ""
        return any(editable in control_type for editable in [
            "edit", "text", "combobox", "textarea", "richedit", "richedit"
        ])
    
    def _is_button_element(self, element) -> bool:
        """Check if element is a button"""
        control_type = element.friendly_class_name().lower() if hasattr(element, 'friendly_class_name') else ""
        return any(button in control_type for button in [
            "button", "togglebutton", "checkbox", "radiobutton"
        ])
    
    def _is_menu_element(self, element) -> bool:
        """Check if element is a menu"""
        control_type = element.friendly_class_name().lower() if hasattr(element, 'friendly_class_name') else ""
        return any(menu in control_type for menu in [
            "menu", "menubar", "menuitem", "contextmenu"
    ])
    
    def _is_text_element(self, element) -> bool:
        """Check if element is a text element"""
        control_type = element.friendly_class_name().lower() if hasattr(element, 'friendly_class_name') else ""
        return any(text in control_type for text in [
            "text", "label", "static", "caption", "title"
        ])
    
    def _locate_text_in_ocr_data(self, ocr_data, target_text, target_box, dimensions):
        """
        Find target text in Tesseract OCR data and return normalized box
        
        Args:
            ocr_data: Dictionary from pytesseract.image_to_data
            target_text: Text to search for
            target_box: Optional AI-provided box for disambiguation [ymin, xmin, ymax, xmax] 0-1000
            dimensions: Dict with 'width' and 'height' keys
            
        Returns:
            Dictionary with 'located', 'normalizedBox', 'confidence', 'matchedText'
        """
        target_lower = target_text.lower().strip()
        if not target_lower:
            return {'located': False, 'error': 'Empty target text'}
        
        W = dimensions.get('width', 1920)
        H = dimensions.get('height', 1080)
        
        # Extract words with confidence > 40
        n_boxes = len(ocr_data['text'])
        candidates = []
        
        for i in range(n_boxes):
            text = str(ocr_data['text'][i]).strip()
            try:
                conf = int(ocr_data['conf'][i])
            except (ValueError, TypeError):
                conf = 0
            
            if conf < 40 or not text:
                continue
            
            # Check if target text is in OCR text (fuzzy match)
            if target_lower in text.lower() or text.lower() in target_lower:
                left = int(ocr_data['left'][i])
                top = int(ocr_data['top'][i])
                width = int(ocr_data['width'][i])
                height = int(ocr_data['height'][i])
                
                # Calculate normalized box [ymin, xmin, ymax, xmax] 0-1000 scale
                norm_box = [
                    max(0, min(1000, int((top / H) * 1000))),
                    max(0, min(1000, int((left / W) * 1000))),
                    max(0, min(1000, int(((top + height) / H) * 1000))),
                    max(0, min(1000, int(((left + width) / W) * 1000)))
                ]
                
                candidates.append({
                    'text': text,
                    'box': norm_box,
                    'confidence': conf / 100.0,
                    'rect': [left, top, left + width, top + height],
                    'center': [(left + width / 2), (top + height / 2)]
                })
        
        if not candidates:
            return {'located': False, 'error': 'No matching text found in OCR'}
        
        # If only one candidate, return it
        if len(candidates) == 1:
            best = candidates[0]
        else:
            # Multiple candidates - pick nearest to target box
            if target_box and len(target_box) == 4:
                # Calculate center of target box in pixels
                target_center_x = ((target_box[1] + target_box[3]) / 2 / 1000) * W
                target_center_y = ((target_box[0] + target_box[2]) / 2 / 1000) * H
                
                # Find candidate nearest to target center
                best = candidates[0]
                min_distance = float('inf')
                
                for candidate in candidates:
                    cx, cy = candidate['center']
                    distance = ((cx - target_center_x) ** 2 + (cy - target_center_y) ** 2) ** 0.5
                    
                    if distance < min_distance:
                        min_distance = distance
                        best = candidate
            else:
                # No target box, pick highest confidence
                best = max(candidates, key=lambda c: c['confidence'])
        
        return {
            'located': True,
            'normalizedBox': best['box'],
            'confidence': best['confidence'],
            'matchedText': best['text'],
            'method': 'python-ocr'
        }
    
    def find_element_by_text(self, text: str) -> List[Dict[str, Any]]:
        """Find elements containing specified text"""
        if not text:
            return []
        
        text_lower = text.lower()
        elements = self.get_all_elements()
        matching_elements = []
        
        for element in elements:
            element_text = element.get("name", "").lower()
            automation_id = element.get("automation_id", "").lower()
            
            if text_lower in element_text or text_lower in automation_id:
                matching_elements.append(element)
        
        return matching_elements
    
    def find_element_by_type(self, element_type: str) -> List[Dict[str, Any]]:
        """Find elements of specific type"""
        if not element_type:
            return []
        
        type_lower = element_type.lower()
        elements = self.get_all_elements()
        matching_elements = []
        
        for element in elements:
            control_type = element.get("control_type", "").lower()
            is_type = False
            
            if type_lower == "button" and element.get("is_button"):
                is_type = True
            elif type_lower == "text" and element.get("is_text"):
                is_type = True
            elif type_lower == "menu" and element.get("is_menu"):
                is_type = True
            elif type_lower == "editable" and element.get("is_editable"):
                is_type = True
            elif type_lower in control_type:
                is_type = True
            
            if is_type:
                matching_elements.append(element)
        
        return matching_elements
    
    def capture_screenshot(self, region: Optional[Tuple[int, int, int, int]] = None) -> Optional[str]:
        """Capture screenshot of screen or region"""
        try:
            if region:
                screenshot = ImageGrab.grab(bbox=region)
            else:
                screenshot = ImageGrab.grab()
            
            self._last_screenshot = screenshot
            
            # Convert to base64
            buffered = BytesIO()
            screenshot.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            return img_str
        except Exception as e:
            logger.error(f"Error capturing screenshot: {e}")
            return None
    
    def get_screenshot_dimensions(self) -> Optional[Tuple[int, int]]:
        """Get dimensions of the last captured screenshot"""
        if self._last_screenshot:
            return self._last_screenshot.size
        return None
    
    def locate_element_on_screenshot(self, element: Dict[str, Any], 
                                   screenshot_base64: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Locate element on screenshot and return enhanced info"""
        try:
            # Get element rectangle
            rect = element.get("screen_rect")
            if not rect:
                return None
            
            # Capture screenshot if not provided
            if screenshot_base64:
                img_data = base64.b64decode(screenshot_base64)
                screenshot = Image.open(BytesIO(img_data))
            else:
                screenshot = ImageGrab.grab()
            
            # Draw bounding box on screenshot for visualization
            draw = ImageDraw.Draw(screenshot)
            left, top, right, bottom = rect
            draw.rectangle([left, top, right, bottom], outline="red", width=3)
            
            # Convert back to base64
            buffered = BytesIO()
            screenshot.save(buffered, format="PNG")
            annotated_img = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            # Get screen dimensions for normalization
            screen_width, screen_height = screenshot.size
            
            return {
                "element": element,
                "rect": rect,
                "normalized_box": self._normalize_rect(rect, screen_width, screen_height),
                "confidence": 0.95,  # High confidence for native UI elements
                "method": "pywinauto",
                "annotated_screenshot": annotated_img,
                "screen_dimensions": (screen_width, screen_height)
            }
        except Exception as e:
            logger.error(f"Error locating element on screenshot: {e}")
            return None


# Flask API Service
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global service instance
ocr_service = PyWinAutoOCRService()


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "pywinauto-ocr",
        "python_version": sys.version,
        "backend": ocr_service.backend,
        "connected_window": ocr_service._current_window_info.get('title', 'None') if hasattr(ocr_service, '_current_window_info') else 'None'
    })


@app.route('/ocr/screen', methods=['POST'])
def ocr_screen():
    """OCR entire screen"""
    try:
        screenshot_base64 = request.json.get('screenshot')
        
        if screenshot_base64:
            img_str = screenshot_base64
        else:
            img_str = ocr_service.capture_screenshot()
        
        if not img_str:
            return jsonify({"error": "Failed to capture screenshot"}), 500
        
        return jsonify({
            "screenshot": img_str,
            "dimensions": ocr_service.get_screenshot_dimensions(),
            "method": "direct_capture"
        })
    except Exception as e:
        logger.error(f"OCR screen error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/ocr/window', methods=['POST'])
def ocr_window():
    """OCR specific window"""
    try:
        window_info = ocr_service.get_active_window_info()
        if "error" in window_info:
            return jsonify(window_info), 404
        
        rect = window_info.get("rect")
        if not rect:
            return jsonify({"error": "Window has no rectangle"}), 404
        
        screenshot = ocr_service.capture_screenshot(rect)
        
        return jsonify({
            "window_info": window_info,
            "screenshot": screenshot,
            "dimensions": ocr_service.get_screenshot_dimensions(),
            "elements": ocr_service.get_all_elements()
        })
    except Exception as e:
        logger.error(f"OCR window error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/elements/active-window', methods=['GET'])
def get_active_window_elements():
    """Get all UI elements from active window"""
    try:
        connected = ocr_service.connect_to_active_window()
        if not connected:
            return jsonify({"error": "Failed to connect to active window"}), 404
        
        elements = ocr_service.get_all_elements()
        window_info = ocr_service._current_window_info if hasattr(ocr_service, '_current_window_info') else {}
        
        return jsonify({
            "window_info": window_info,
            "element_count": len(elements),
            "elements": elements[:100],  # Limit for performance
            "method": "pywinauto"
        })
    except Exception as e:
        logger.error(f"Get elements error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/locate-element', methods=['POST'])
def locate_element():
    """Find and locate element by text/type"""
    try:
        data = request.json
        text = data.get('text', '')
        element_type = data.get('type', '')
        screenshot = data.get('screenshot')
        
        results = []
        
        # Find by text
        if text:
            text_elements = ocr_service.find_element_by_text(text)
            for element in text_elements:
                located = ocr_service.locate_element_on_screenshot(element, screenshot)
                if located:
                    results.append(located)
        
        # Find by type
        if element_type and not results:
            type_elements = ocr_service.find_element_by_type(element_type)
            for element in type_elements:
                located = ocr_service.locate_element_on_screenshot(element, screenshot)
                if located:
                    results.append(located)
        
        # Sort by confidence
        results.sort(key=lambda x: x.get('confidence', 0), reverse=True)
        
        return jsonify({
            "query": {"text": text, "type": element_type},
            "results": results,
            "result_count": len(results)
        })
    except Exception as e:
        logger.error(f"Locate element error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/analyze-screen', methods=['POST'])
def analyze_screen():
    """Comprehensive screen analysis"""
    try:
        data = request.json
        screenshot_base64 = data.get('screenshot')
        
        # Get active window info
        window_info = ocr_service.get_active_window_info()
        
        # Get elements
        connected = ocr_service.connect_to_active_window()
        elements = ocr_service.get_all_elements() if connected else []
        
        # Capture screenshot if not provided
        if not screenshot_base64:
            screenshot_base64 = ocr_service.capture_screenshot()
        
        return jsonify({
            "window_info": window_info,
            "elements": elements[:50],  # Limit for performance
            "element_count": len(elements),
            "screenshot": screenshot_base64,
            "screenshot_dimensions": ocr_service.get_screenshot_dimensions(),
            "analysis_time": time.time()
        })
    except Exception as e:
        logger.error(f"Analyze screen error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='PyWinAuto OCR Service')
    parser.add_argument('--port', type=int, default=5555, help='Port to run the service on')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    parser.add_argument('--backend', type=str, default='uia', choices=['uia', 'win32'], help='PyWinAuto backend')
    
    args = parser.parse_args()
    
    # Update service backend
    ocr_service.backend = args.backend
    
    logger.info(f"Starting PyWinAuto OCR Service on {args.host}:{args.port}")
    logger.info(f"Using backend: {args.backend}")
    
    app.run(host=args.host, port=args.port, debug=args.debug, use_reloader=False)