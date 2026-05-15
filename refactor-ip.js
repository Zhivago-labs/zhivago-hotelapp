const fs = require('fs');
const path = require('path');

const directory = __dirname;
const importStatement = "import { API_URL } from '@/config/api';";

function refactorFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Expressão regular para achar a declaração da API_URL
        // Acha: const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://...';
        const regex = /const API_URL\s*=\s*process\.env\.EXPO_PUBLIC_API_URL.*?;/g;
        
        if (regex.test(content) && !content.includes(importStatement)) {
            content = content.replace(regex, importStatement);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Refactored ${filePath}`);
        } else if (content.includes("import { API_URL } from '@/config/api';")) {
             // caso esteja assim
             content = content.replace(/const API_URL = 'http:\/\/10\.59\.17\.101:3333';/g, importStatement);
             fs.writeFileSync(filePath, content, 'utf8');
             console.log(`Refactored ${filePath}`);
        }
    } catch (e) {
        console.error(`Error processing ${filePath}: ${e.message}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === '.expo' || file === 'config') continue;
        
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            walkDir(filePath);
        } else if (
            filePath.endsWith('.ts') || 
            filePath.endsWith('.tsx') || 
            filePath.endsWith('.js')
        ) {
            refactorFile(filePath);
        }
    }
}

walkDir(directory);
console.log('Finished refactoring API_URL.');
