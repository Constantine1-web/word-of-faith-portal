const fs = require('fs');
const path = require('path');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      search(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/color:\s*['"]([^'"]+)['"]/g);
      if (matches) {
        for (const m of matches) {
          if (!m.includes('var(') && !m.includes('rgba(255,255,255') && !m.includes('white')) {
            console.log(fullPath, m);
          }
        }
      }
    }
  }
}
search('src/app');
search('src/components');
