const fs = require('fs');
const content = fs.readFileSync('src/components/ArchitectForgeView.tsx', 'utf-8');
const fixed = content.replace(/style={{ width: \\`\\${artifact\.progress}%\\` }}/g, "style={{ width: `${artifact.progress}%` }}");
fs.writeFileSync('src/components/ArchitectForgeView.tsx', fixed);
