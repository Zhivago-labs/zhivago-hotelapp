const fs = require('fs');
const path = require('path');

const directory = __dirname;
const oldIP = '10.59.17.101';
const newIP = '10.59.17.101';

function replaceInFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(oldIP)) {
            content = content.split(oldIP).join(newIP);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${filePath}`);
        }
    } catch (e) {
        console.error(`Error processing ${filePath}: ${e.message}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === '.expo') continue;
        
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            walkDir(filePath);
        } else if (
            filePath.endsWith('.ts') || 
            filePath.endsWith('.tsx') || 
            filePath.endsWith('.js') || 
            file === '.env'
        ) {
            replaceInFile(filePath);
        }
    }
}

walkDir(directory);
console.log('Finished updating IPs.');
