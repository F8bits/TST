const { contextBridge, ipcRenderer } = require('electron');

// Restrição Produção: Nunca expõe Electron inteiro ou o Node FS.
contextBridge.exposeInMainWorld('api', {
    // Busca do .env as credenciais secretas do Banco de Dados
    getFirebaseConfig: () => ipcRenderer.invoke('get-firebase-config'),
    
    // Controlador de Telas (SPA / Multi-page)
    navegarParaApp: () => ipcRenderer.send('navigate', 'index.html'),
    navegarParaLogin: () => ipcRenderer.send('navigate', 'login.html')
});
