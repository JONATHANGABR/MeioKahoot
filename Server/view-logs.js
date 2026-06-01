#!/usr/bin/env node
/**
 * MeioKahoot - Visualizador de Logs em Tempo Real
 * Uso: node view-logs.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOGS_DIR = path.join(__dirname, '../Data/Logs');

function color(text, code) {
    return `\x1b[${code}m${text}\x1b[0m`;
}

const LEVEL_COLORS = {
    'INFO': '36',
    'SUCCESS': '32',
    'WARN': '33',
    'ERROR': '31',
    'CONNECT': '92',
    'DISCONNECT': '91',
    'ROOM': '35',
    'MATCH': '34',
    'DEBUG': '90'
};

const LEVEL_ICONS = {
    'INFO': 'ℹ',
    'SUCCESS': '✓',
    'WARN': '⚠',
    'ERROR': '✗',
    'CONNECT': '🟢',
    'DISCONNECT': '🔴',
    'ROOM': '🏠',
    'MATCH': '🎮',
    'DEBUG': '🐛'
};

function getLatestLogFile() {
    if (!fs.existsSync(LOGS_DIR)) return null;
    const files = fs.readdirSync(LOGS_DIR)
        .filter(f => f.startsWith('server-') && f.endsWith('.log'))
        .sort()
        .reverse();
    return files[0] ? path.join(LOGS_DIR, files[0]) : null;
}

function parseLogLine(line) {
    const match = line.match(/\[(.*?)\] \[(.*?)\] (.*)/);
    if (!match) return null;
    return {
        timestamp: match[1],
        level: match[2],
        message: match[3]
    };
}

function formatLog(log) {
    const time = new Date(log.timestamp).toLocaleTimeString('pt-BR');
    const icon = LEVEL_ICONS[log.level] || '•';
    const colorCode = LEVEL_COLORS[log.level] || '37';
    return color(`${icon} [${time}] [${log.level.padEnd(8)}] ${log.message}`, colorCode);
}

function displayHeader() {
    console.clear();
    console.log(color('╔══════════════════════════════════════════════════════════════╗', '36;1'));
    console.log(color('║', '36;1') + color('  📜 MEIOKAHOOT - VISUALIZADOR DE LOGS', '37;1').padEnd(61) + color('║', '36;1'));
    console.log(color('╚══════════════════════════════════════════════════════════════╝', '36;1'));
    console.log('');
}

function tailLogs() {
    const logFile = getLatestLogFile();
    
    if (!logFile) {
        displayHeader();
        console.log(color('⚠ Nenhum arquivo de log encontrado', '33'));
        console.log(color(`   Esperado em: ${LOGS_DIR}`, '90'));
        return;
    }

    displayHeader();
    console.log(color(`📂 Arquivo: ${path.basename(logFile)}`, '90'));
    console.log(color('─'.repeat(62), '90'));
    console.log('');

    // Mostrar últimas 30 linhas
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const recentLines = lines.slice(-30);

    recentLines.forEach(line => {
        const log = parseLogLine(line);
        if (log) {
            console.log(formatLog(log));
        }
    });

    console.log('');
    console.log(color('─'.repeat(62), '90'));
    console.log(color('👀 Monitorando em tempo real... (Ctrl+C para sair)', '90'));

    // Watch for changes
    let lastSize = fs.statSync(logFile).size;
    
    fs.watchFile(logFile, { interval: 500 }, () => {
        const stats = fs.statSync(logFile);
        if (stats.size > lastSize) {
            const stream = fs.createReadStream(logFile, {
                start: lastSize,
                end: stats.size
            });
            
            const rl = readline.createInterface({ input: stream });
            rl.on('line', (line) => {
                const log = parseLogLine(line);
                if (log) {
                    console.log(formatLog(log));
                }
            });
            
            lastSize = stats.size;
        }
    });
}

// Filtros por argumento
const filter = process.argv[2]?.toUpperCase();

if (filter && LEVEL_COLORS[filter]) {
    const logFile = getLatestLogFile();
    if (logFile) {
        displayHeader();
        console.log(color(`🔍 Filtrando por: ${filter}`, '33;1'));
        console.log('');
        const content = fs.readFileSync(logFile, 'utf8');
        content.split('\n').forEach(line => {
            const log = parseLogLine(line);
            if (log && log.level === filter) {
                console.log(formatLog(log));
            }
        });
    }
} else {
    tailLogs();
}

process.on('SIGINT', () => {
    console.log('\n' + color('👋 Visualizador encerrado', '36'));
    process.exit(0);
});