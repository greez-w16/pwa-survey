const fs = require('fs');

let code = fs.readFileSync('src/pages/AppSettings.jsx', 'utf8');

// 1. Rename Dashboard to AppSettings
code = code.replace(/export const Dashboard = \(\) => \{/g, 'export const AppSettings = () => {');

// 2. Extract the Settings Dialog Content
const startMarker = '{/* Settings Dialog */}';
const startIdx = code.indexOf(startMarker);
const dialogStart = code.indexOf('<Dialog', startIdx);
const initiateSurveyIdx = code.indexOf('{/* Initiate Survey Dialog */}');
const dialogEnd = code.lastIndexOf('</Dialog>', initiateSurveyIdx) + '</Dialog>'.length;

let settingsCode = code.substring(dialogStart, dialogEnd);

// Strip the Dialog wrapper to just return the inner content
settingsCode = settingsCode.replace(/<Dialog[\s\S]*?<DialogTitle[^>]*>/, '<div className="app-settings-container" style={{ padding: 16 }}>\n<h2>App Settings</h2>\n');
settingsCode = settingsCode.replace('</DialogTitle>', '');
settingsCode = settingsCode.replace(/<\/Dialog>$/, '</div>');

// Remove the Close button from DialogActions since it's no longer a dialog
settingsCode = settingsCode.replace(/<DialogActions>[\s\S]*?<\/DialogActions>/, '');

// 3. Find the main return statement (line 4153 approx)
const dashboardReturnStart = code.indexOf('<div className="home-page dashboard-container">');
const returnStart = code.lastIndexOf('return (', dashboardReturnStart);

// Let's replace from returnStart to the end of the file
const lastParenIdx = code.lastIndexOf(');');
code = code.substring(0, returnStart) + 'return (\n' + settingsCode + '\n  );\n' + code.substring(lastParenIdx + 2);

fs.writeFileSync('src/pages/AppSettings.jsx', code);
console.log('Successfully refactored AppSettings.jsx');
