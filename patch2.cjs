const fs = require('fs');
let content = fs.readFileSync('src/components/ArchitectForgeView.tsx', 'utf-8');
content = content.replace("style={{ width: \\`\\${artifact.progress}%\\` }}", "style={{ width: `${artifact.progress}%` }}");
fs.writeFileSync('src/components/ArchitectForgeView.tsx', content);
