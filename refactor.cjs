const fs = require('fs');

let appSettingsCode = fs.readFileSync('src/pages/AppSettings.jsx', 'utf8');

// 1. Rename Dashboard to AppSettings
appSettingsCode = appSettingsCode.replace(/export const Dashboard = \(\) => \{/g, 'export const AppSettings = () => {');

// 2. Find the Settings Dialog
const startMarker = '{/* Settings Dialog */}';
const startIdx = appSettingsCode.indexOf(startMarker);
const dialogStart = appSettingsCode.indexOf('<Dialog', startIdx);
const dialogEndStr = '</Dialog>';
// Find the matching </Dialog> for the settings dialog
// It's the one before "{/* Initiate Survey Dialog */}"
const initiateSurveyIdx = appSettingsCode.indexOf('{/* Initiate Survey Dialog */}');
const dialogEnd = appSettingsCode.lastIndexOf('</Dialog>', initiateSurveyIdx) + dialogEndStr.length;

let settingsCode = appSettingsCode.substring(dialogStart, dialogEnd);

// 3. Replace the <Dialog ...> wrapper with a <div>
settingsCode = settingsCode.replace(/<Dialog[\s\S]*?<DialogTitle[^>]*>/, '<div className="app-settings-container" style={{ padding: 16 }}>\n<h2>App Settings</h2>\n');
settingsCode = settingsCode.replace('</DialogTitle>', '');
settingsCode = settingsCode.replace(/<\/Dialog>$/, '</div>');

// 4. Replace the entire Dashboard return statement with just the settingsCode
// The Dashboard return starts around line 4100
const dashboardReturnStart = appSettingsCode.indexOf('return (', appSettingsCode.indexOf('if (loading)'));
// It ends at the end of the file. The last characters are `);` and `}`
// Let's just find the last `);`
const lastParenIdx = appSettingsCode.lastIndexOf(');');

appSettingsCode = appSettingsCode.substring(0, dashboardReturnStart) + 'return (\n' + settingsCode + '\n  );\n' + appSettingsCode.substring(lastParenIdx + 2);

fs.writeFileSync('src/pages/AppSettings.jsx', appSettingsCode);
console.log('Successfully refactored AppSettings.jsx');

// Now refactor Dashboard.jsx
let dashboardCode = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8');
const dStartIdx = dashboardCode.indexOf(startMarker);
const dDialogStart = dashboardCode.indexOf('<Dialog', dStartIdx);
const dInitiateSurveyIdx = dashboardCode.indexOf('{/* Initiate Survey Dialog */}');
const dDialogEnd = dashboardCode.lastIndexOf('</Dialog>', dInitiateSurveyIdx) + dialogEndStr.length;

// Remove the settings dialog from dashboard
dashboardCode = dashboardCode.substring(0, dStartIdx) + dashboardCode.substring(dDialogEnd);

// Update the Settings icon button to navigate to /admin instead of opening the dialog
const settingsIconRegex = /<IconButton onClick=\{\(\) => setShowSettings\(true\)\} color="primary" className="action-icon-btn">/g;
dashboardCode = dashboardCode.replace(settingsIconRegex, '<IconButton onClick={() => navigate(\'/admin?tab=1\')} color="primary" className="action-icon-btn">');

fs.writeFileSync('src/pages/Dashboard.jsx', dashboardCode);
console.log('Successfully removed settings from Dashboard.jsx');
