# Fix API Key Error

## Error You're Seeing
```
Groq vision API error 401: {"error":{"message":"Invalid API Key"}}
```

This means your API key is either:
- Not set correctly in `.env` file
- Invalid or expired
- Has extra spaces or quotes

---

## Quick Fix (5 Minutes)

### Step 1: Get a Valid API Key

**Choose ONE** (OpenRouter is recommended):

#### **Option A: OpenRouter** (Best for this app)
1. Go to: https://openrouter.ai/keys
2. Sign up (free)
3. Create new key
4. Copy the key (starts with `sk-or-v1-`)

#### **Option B: Groq** (Free, but sometimes has issues)
1. Go to: https://console.groq.com/keys
2. Sign up
3. Create new key
4. Copy the key (starts with `gsk_`)

#### **Option C: Gemini** (Google)
1. Go to: https://aistudio.google.com/apikey
2. Sign in with Google
3. Create API key
4. Copy the key

---

### Step 2: Check Your .env File

1. **Open** File Explorer
2. **Navigate** to: `C:\Users\user\Desktop\Freddy`
3. **Find** the `.env` file
   - If you can't see it, enable "Show hidden files" in View menu
4. **Right-click** → Open with Notepad

---

### Step 3: Fix the .env File

Your `.env` file should look like this:

#### If using OpenRouter:
```env
# OpenRouter (recommended)
OPENROUTER_API_KEY=sk-or-v1-1234567890abcdef1234567890abcdef1234567890abcdef

# Comment out or remove other keys
# GROQ_API_KEY=your_old_key
# GEMINI_API_KEY=your_old_key

# Optional: Enable PyWinAuto
PYWINAUTO_ENABLED=1
```

#### If using Groq:
```env
# Groq
GROQ_API_KEY=gsk_1234567890abcdef1234567890abcdef

# Remove or comment out other keys
# OPENROUTER_API_KEY=your_old_key
# GEMINI_API_KEY=your_old_key

# Optional: Enable PyWinAuto
PYWINAUTO_ENABLED=1
```

#### If using Gemini:
```env
# Gemini
GEMINI_API_KEY=AIzaSy1234567890abcdef1234567890abcdef

# Remove or comment out other keys
# OPENROUTER_API_KEY=your_old_key
# GROQ_API_KEY=your_old_key

# Optional: Enable PyWinAuto
PYWINAUTO_ENABLED=1
```

---

### Step 4: Common Mistakes to Avoid

❌ **Wrong**: Extra spaces
```env
OPENROUTER_API_KEY= sk-or-v1-key
OPENROUTER_API_KEY=sk-or-v1-key 
```

❌ **Wrong**: Quotes around key
```env
OPENROUTER_API_KEY="sk-or-v1-key"
OPENROUTER_API_KEY='sk-or-v1-key'
```

❌ **Wrong**: Still has placeholder
```env
OPENROUTER_API_KEY=your_openrouter_key_here
```

❌ **Wrong**: Multiple uncommented keys
```env
OPENROUTER_API_KEY=sk-or-key
GROQ_API_KEY=gsk-key
```

✅ **Correct**: Clean, no spaces, no quotes
```env
OPENROUTER_API_KEY=sk-or-v1-1234567890abcdef
```

---

### Step 5: Save and Restart

1. **Save** the `.env` file (Ctrl+S in Notepad)
2. **Close** the app if it's running (Ctrl+C in terminal or close window)
3. **Restart** the app:
   - Double-click `RUN_APP.bat`
   - OR run `npm start` in terminal

---

### Step 6: Verify It Works

When app starts, you should see:

✅ **Good**:
```
[assistant] AI provider: OpenRouter
[PyWinAuto] Starting PyWinAuto OCR service...
```

OR

```
[assistant] AI provider: Groq
[PyWinAuto] Starting PyWinAuto OCR service...
```

❌ **Bad** (still broken):
```
Groq vision API error 401: Invalid API Key
```

---

## Troubleshooting

### "I added the key but still get error"

**Checklist**:
- [ ] Key is on a NEW line (not same line as comment)
- [ ] No spaces before or after the `=` sign
- [ ] No quotes around the key
- [ ] No extra characters at end of line
- [ ] File is saved after editing
- [ ] App was restarted after saving

### "I'm not sure which key to use"

**Recommendation**: Use **OpenRouter**
- Most reliable for vision models
- Works best with this app
- Has free and paid options
- Best UI element detection

### "Where do I get credits?"

- **OpenRouter**: Requires small credit (~$5), but very cheap per request
- **Groq**: Completely free (but sometimes unstable)
- **Gemini**: Has free tier (but may have quota limits)

**For testing**: Start with Groq (free)
**For production**: Use OpenRouter (reliable)

---

## Manual Verification

Run this to check your configuration:

```bash
# Windows Command Prompt
CHECK_API_KEY.bat
```

This will show you:
- If `.env` file exists
- Which keys are present
- If keys look valid

---

## Example .env File (Complete)

Create a new `.env` file with this template:

```env
# AI Provider - Choose ONE and uncomment it
# Get keys from the URLs shown

# RECOMMENDED: OpenRouter
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
# Get from: https://openrouter.ai/keys

# OR: Groq (Free)
# GROQ_API_KEY=gsk_YOUR_KEY_HERE
# Get from: https://console.groq.com/keys

# OR: Gemini (Google)
# GEMINI_API_KEY=YOUR_KEY_HERE
# Get from: https://aistudio.google.com/apikey

# PyWinAuto Enhanced OCR (Optional)
PYWINAUTO_ENABLED=1
PYWINAUTO_PORT=5555
PYWINAUTO_BACKEND=uia
OCRLOCATION_PRIORITY=pywinauto,python-ocr,ai

# Overlay settings
# OVERLAY_INTERACTIVE=0
```

---

## Still Not Working?

### Check the actual error message:

1. Look at the console/terminal output
2. Find the exact error message
3. Check which provider it mentions (OpenRouter/Groq/Gemini)
4. Verify that's the key you set in `.env`

### Common issues:

**"Cannot find .env"**
→ Create it by copying `.env.example` to `.env`

**"Empty prompt"**
→ You didn't type anything in the chat box

**"No screen source available"**
→ Permission issue, try running as Administrator

**"Python service failed"**
→ Run `pip install -r python-backend/requirements.txt`

---

## Quick Summary

1. Get API key from one of these:
   - OpenRouter: https://openrouter.ai/keys ⭐ (recommended)
   - Groq: https://console.groq.com/keys
   - Gemini: https://aistudio.google.com/apikey

2. Edit `.env` file:
   ```
   OPENROUTER_API_KEY=your_actual_key_here
   ```

3. Save file (no spaces, no quotes)

4. Restart app: `RUN_APP.bat`

5. Test: Type "how do I save a file?" and press Enter

---

**Need more help?** Run `CHECK_API_KEY.bat` to diagnose the issue!