// ============================================================
// IMPORTAÇÕES PRINCIPAIS
// Carrega as variáveis de ambiente do arquivo .env (chaves do Firebase, etc.)
require('dotenv').config();

// 'app' = o próprio aplicativo Electron
// 'BrowserWindow' = a janela visível do programa
// 'ipcMain' = canal de comunicação entre o "bastidor" (main.js) e a "vitrine" (HTML)
// 'dialog' = caixas de diálogo nativas do Windows (aquelas janelinhas de "Sim/Não")
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// autoUpdater = o "robô" que checa se existe uma versão nova do app no GitHub
// e baixa automaticamente em segundo plano
const { autoUpdater } = require('electron-updater');

// ============================================================
// CONFIGURAÇÃO DO AUTO-UPDATER
// Essas configurações fazem o atualizador trabalhar de forma silenciosa,
// sem incomodar o usuário até que a atualização esteja 100% pronta
autoUpdater.autoDownload = true;        // Baixa a atualização automaticamente
autoUpdater.autoInstallOnAppQuit = true; // Instala quando o app for fechado

// ============================================================
// VARIÁVEL GLOBAL DA JANELA PRINCIPAL
let mainWindow;

// Função que cria a janela do aplicativo
function criarJanela() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // SEGURANÇA DE NÍVEL PRODUÇÃO:
            nodeIntegration: false, 
            contextIsolation: true  
        }
    });

    mainWindow.setMenuBarVisibility(false);
    
    // Inicia pelo Portão de Segurança (Login)
    // O USO DE PATH.JOIN É OBRIGATÓRIO PARA O ELECTRON-BUILDER NÃO SE PERDER NO EXE
    mainWindow.loadFile(path.join(__dirname, 'login.html'));
}

// ============================================================
// INICIALIZAÇÃO DO APLICATIVO
app.whenReady().then(() => {
    criarJanela();

    // Após a janela abrir, o "robô atualizador" entra em ação em segundo plano.
    // Ele vai até o GitHub Releases e pergunta: "Tem versão nova?"
    // Se não tiver internet ou se o repositório não existir ainda, ele simplesmente
    // ignora o erro e o app continua funcionando normalmente.
    autoUpdater.checkForUpdatesAndNotify();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// EVENTOS DO AUTO-UPDATER (o que acontece em cada etapa da atualização)

// 1. "Achei uma versão nova!" — apenas registra no log, sem incomodar o usuário
autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Nova versão encontrada: v${info.version}. Baixando em segundo plano...`);
});

// 2. "Não tem nada novo" — apenas registra no log
autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Você já está na versão mais recente.');
});

// 3. "A atualização foi 100% baixada e está pronta!" — AGORA sim, pergunta ao usuário
autoUpdater.on('update-downloaded', (info) => {
    // Exibe uma caixa de diálogo nativa do Windows (aquela janelinha bonita)
    dialog.showMessageBox(mainWindow, {
        type: 'info',                                           // Ícone de informação (i)
        title: 'Atualização Pronta!',                           // Título da janelinha
        message: `A versão ${info.version} foi baixada com sucesso!`, // Mensagem principal
        detail: 'O aplicativo precisa reiniciar para aplicar a atualização. Deseja reiniciar agora?',
        buttons: ['Reiniciar Agora', 'Depois'],                 // Botões: [0] e [1]
        defaultId: 0,                                           // Botão padrão = "Reiniciar Agora"
        cancelId: 1                                             // Botão de "cancelar" = "Depois"
    }).then((resultado) => {
        // Se o usuário clicou em "Reiniciar Agora" (botão 0):
        if (resultado.response === 0) {
            // Fecha o app e instala a atualização automaticamente na reabertura
            autoUpdater.quitAndInstall();
        }
        // Se clicou em "Depois" (botão 1): não faz nada.
        // A atualização será aplicada na próxima vez que o usuário fechar e abrir o app.
    });
});

// 4. "Deu algum erro ao tentar atualizar" — registra no log sem crashar o app
autoUpdater.on('error', (erro) => {
    console.log(`[AutoUpdater] Erro ao verificar atualizações: ${erro.message}`);
    // O app continua funcionando normalmente mesmo se a checagem falhar.
    // Isso pode acontecer se não houver internet ou se o repositório GitHub não existir ainda.
});

// ============================================================
// APIs PARA O FRONTEND CLOUD-NATIVE

// Endpoint que o HTML usa para pegar as chaves do Firebase de forma segura
ipcMain.handle('get-firebase-config', () => {
    return {
        apiKey: process.env.FIREBASE_API_KEY || "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
        projectId: process.env.FIREBASE_PROJECT_ID || "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
        appId: process.env.FIREBASE_APP_ID || ""
    };
});

// Transição fluida entre Telas usando path.join de Produção
ipcMain.on('navigate', (event, pagina) => {
    mainWindow.loadFile(path.join(__dirname, pagina));
});
