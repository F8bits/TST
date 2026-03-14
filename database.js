const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class DatabaseModule {
    constructor() {
        this.arquivoDados = path.join(app.getPath('userData'), 'study_tracker_dados.json');
        this.cache = { materias: [], sessoes: [] };
        // Flag de otimização de disco
        this.pendenteGravacao = false;
    }

    // Chamado pelo IPC Handler
    lerDadosParaFrontend() {
        try {
            if (!fs.existsSync(this.arquivoDados)) {
                this.salvarDiscoDireto(this.cache); // Inicializa arvore virgem
                return this.cache;
            }
            const conteudo = fs.readFileSync(this.arquivoDados, 'utf-8');
            this.cache = JSON.parse(conteudo);
            return this.cache;
        } catch (erro) {
            console.error("[DB Storage Error] ao ler dados JSON:", erro);
            return { materias: [], sessoes: [] };
        }
    }

    // Recebe e atualiza o estado em Memória RAM primeiro e marca para gravação
    atualizarCache(estadoJson) {
        this.cache = estadoJson;
        this.salvarDiscoDireto(estadoJson);
    }

    // Ação cirúrgica no HD (Solidifica o JSON File)
    salvarDiscoDireto(dados) {
        try {
            fs.writeFileSync(this.arquivoDados, JSON.stringify(dados, null, 2));
            this.pendenteGravacao = false;
        } catch (erro) {
            console.error("[DB Storage Error] ao salvar dados definitivos em disco:", erro);
        }
    }

    fecharBanco() {
        // Roda no process exit (Otimização Final de RAM -> HD)
        this.salvarDiscoDireto(this.cache);
    }
}

module.exports = new DatabaseModule();
