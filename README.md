# KipuSucks Chrome Extension

A Chrome extension project with a complete folder structure and boilerplate code.

## Project Structure

```
KipuSucks/
├── manifest.json          # Extension configuration
├── package.json          # Node.js dependencies and scripts
├── popup/               # Extension popup interface
│   ├── popup.html      # Popup HTML structure
│   ├── popup.css       # Popup styling
│   └── popup.js        # Popup functionality
├── pages/               # Main extension pages
│   ├── main.html       # Main extension interface
│   ├── main.css        # Main page styling
│   └── main.js         # Client extraction logic
├── background/          # Background scripts
│   └── background.js   # Service worker (Manifest V3)
├── content_scripts/     # Scripts injected into web pages
│   ├── content.js      # Content script logic
│   └── content.css     # Styles injected into pages
└── icons/              # Extension icons (add your icons here)
    ├── icon16.png      # 16x16 icon (to be added)
    ├── icon32.png      # 32x32 icon (to be added)
    ├── icon48.png      # 48x48 icon (to be added)
    └── icon128.png     # 128x128 icon (to be added)
```

## Getting Started

1. **Install dependencies** (optional for development):
   ```bash
   npm install
   ```

2. **Add icons**: Place your extension icons in the `icons/` folder with the following sizes:
   - 16x16 pixels (icon16.png)
   - 32x32 pixels (icon32.png)
   - 48x48 pixels (icon48.png)
   - 128x128 pixels (icon128.png)

3. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select this folder
   - The extension should now appear in your extensions list

## Features

- **Popup Interface**: Click the extension icon to open a popup with "Open" button
- **Main Extension Page**: Full-featured interface for client data extraction
- **Kipu Integration**: Automatically navigates to Kipu occupancy reports
- **Client Data Extraction**: Uses KipuAssigned.extract() to pull client information
- **Data Export**: Export extracted data as JSON or copy to clipboard
- **Background Script**: Service worker for handling extension lifecycle and background tasks
- **Storage**: Uses Chrome's storage API to persist data
- **Modern Structure**: Uses Manifest V3 (latest Chrome extension format)

## Development

- **manifest.json**: Configure permissions, content scripts, and extension metadata
- **popup/**: Customize the extension's popup interface
- **content_scripts/**: Add functionality to interact with web pages
- **background/**: Handle background tasks and extension lifecycle events

## How to Use

1. **Load the extension**: Follow the "Getting Started" steps above
2. **Click the extension icon**: In your Chrome toolbar to open the popup
3. **Click "Open"**: This opens the main extension interface in a new tab
4. **Click "Get Client List"**: This will:
   - Navigate to the Kipu occupancy page
   - Inject the extraction script
   - Extract client data using KipuAssigned.extract()
   - Display the results in a formatted list
   - Close the Kipu tab automatically
5. **Export data**: Use the "Export as JSON" or "Copy to Clipboard" buttons

## Technical Details

- **Target URL**: `https://foundrytreatmentcenter.kipuworks.com/occupancy?p_building=6`
- **Extraction Method**: Injects and runs the KipuAssigned.extract() function
- **Data Format**: Returns array of objects with `{name, p, patientId}` structure
- **Permissions**: Requires access to Kipu domain for script injection

## Next Steps

1. Add your extension icons to the `icons/` folder (16x16, 32x32, 48x48, 128x128 pixels)
2. Test the extension with your Kipu credentials
3. Customize the styling or add additional features as needed
4. Consider adding error handling for different page states