import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js';
import { 
    doc, 
    setDoc, 
    onSnapshot, 
    updateDoc, 
    enableIndexedDbPersistence 
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

let materias = [];
let sessoes = [];

let timerInterval = null;
let segundosEstudados = 0; 
let timerAtivo = false;
let isPausado = false;
let sessaoAtualInicio = null;
let modoPomodoro = false;
let tempoRestantePomodoro = 25 * 60; 

let chartBarra = null;
let chartPizza = null;
let calendarioInstancia = null;
let filtroGrafico = 'total';

const somAlarme = document.getElementById('som-alarme');

// ==== CONFIGURAÇÃO FIREBASE E OFFLINE PERSISTENCE ====
let usuarioLogado = null;
let docRefUsuario = null; 

async function initFirebaseCloud() {
    try {
        // Habilitar a persistência Offline do Firestore v10
        await enableIndexedDbPersistence(db).catch(err => {
            console.warn("Aviso Persistência Firestore (Offline pode não funcionar perfeitamente):", err.code);
        });

        // Escutador de Sessão Ativa
        onAuthStateChanged(auth, (user) => {
            if (user) {
                usuarioLogado = user;
                // Cada usuário tem seu próprio JSON (Documento) na nuvem
                docRefUsuario = doc(db, 'usuarios', user.uid);
                carregarDadosNuvem();
            } else {
                window.api.navegarParaLogin(); // Expulsa pro Login se desligar
            }
        });

    } catch (e) {
        console.error("Falha ao inicializar o Firestore DB", e);
    }
}

// Inicializa a Nuvem ao carregar a página
initFirebaseCloud();


window.fazerLogout = function() {
    if(timerAtivo || isPausado) { alert("Pare o timer antes de sair da sua conta."); return; }
    signOut(auth);
}

// ==== NAVEGAÇÃO ====
window.mudarAba = function(abaNome) {
    document.querySelectorAll('.aba').forEach(el => el.classList.remove('ativa'));
    document.querySelectorAll('.conteudo-aba').forEach(el => el.classList.remove('ativa'));

    if(abaNome === 'dashboard') {
        document.querySelectorAll('.aba')[0].classList.add('ativa');
        document.getElementById('aba-dashboard').classList.add('ativa');
        atualizarGraficos(); 
    } else if(abaNome === 'materias') {
        document.querySelectorAll('.aba')[1].classList.add('ativa');
        document.getElementById('aba-materias').classList.add('ativa');
    } else if(abaNome === 'calendario') {
        document.querySelectorAll('.aba')[2].classList.add('ativa');
        document.getElementById('aba-calendario').classList.add('ativa');
        if(calendarioInstancia) setTimeout(() => calendarioInstancia.render(), 100);
    } else if(abaNome === 'historico') {
        document.querySelectorAll('.aba')[3].classList.add('ativa');
        document.getElementById('aba-historico').classList.add('ativa');
    }
}

// ==== MÓDULO CLOUD: CARREGAMENTO E SALVAMENTO (Firestore v10) ====
async function carregarDadosNuvem() {
    try {
        // Escuta ativamente mudanças no documento do usuário em tempo real
        onSnapshot(docRefUsuario, (docSnap) => {
            if (docSnap.exists()) {
                const dados = docSnap.data();
                materias = dados.materias || [];
                sessoes = dados.sessoes || [];
            } else {
                // Se for um usuário totalmente novo, criamos o DB vazio dele
                materias = [];
                sessoes = [];
                setDoc(docRefUsuario, { materias, sessoes, criadoEm: new Date().toISOString() });
            }
            
            // Re-renderiza a interface sempre que bater um dado novo 
            renderizarMaterias(); preencherSelectRodape(); renderizarHistorico();
            inicializarGraficos(); inicializarCalendario(); calcularOfensivaEDiaria();
            
            document.querySelector('#select-materia option').innerText = "Selecione uma matéria...";
        });

    } catch(err) {
        console.error("Erro ao puxar dados Firestore:", err);
    }
}

function salvarDadosNaNuvem() {
    if(!docRefUsuario) return;
    
    // Atualiza apenas os Arrays do usuário logado
    updateDoc(docRefUsuario, {
        materias: materias,
        sessoes: sessoes,
        ultimoSync: new Date().toISOString()
    }).catch(err => console.error("Falha no Sync Cloud (O cache Local tentará depois):", err));
}

// ==== MATÉRIAS (CRUD) ====
window.adicionarMateria = function() {
    const inputNome = document.getElementById('nova-materia-nome');
    const inputCor = document.getElementById('nova-materia-cor');
    
    const nome = inputNome.value.trim();
    const cor = inputCor.value; 

    if (nome === '') { alert("Digite o nome da matéria."); return; }
    if (materias.find(m => m.nome.toLowerCase() === nome.toLowerCase())) {
        alert("Essa matéria já existe!"); return;
    }

    const id = 'mat_' + new Date().getTime();
    materias.push({ id, nome, cor });
    
    salvarDadosNaNuvem();
    inputNome.value = '';
}

window.deletarMateria = function(id) {
    const temSessoes = sessoes.some(s => s.materiaId === id);
    if(temSessoes) {
        alert("Você não pode excluir uma matéria que já possui horas registradas.");
        return;
    }
    if(confirm("Deseja realmente excluir esta matéria da Nuvem?")) {
        materias = materias.filter(m => m.id !== id);
        salvarDadosNaNuvem();
    }
}

function renderizarMaterias() {
    const container = document.getElementById('container-materias');
    if(!container) return;
    container.innerHTML = '';
    materias.forEach(mat => {
        container.innerHTML += `
            <div class="materia-item" style="border-left-color: ${mat.cor}">
                <div style="display: flex; align-items:center; gap: 10px;">
                    <div style="width:15px; height:15px; border-radius:50%; background:${mat.cor}"></div>
                    <span class="materia-info">${mat.nome}</span>
                </div>
                <button class="btn-secundario" style="color:var(--cor-perigo); padding: 8px 12px; font-size: 0.8rem;" onclick="deletarMateria('${mat.id}')">Excluir</button>
            </div>`;
    });
}

function preencherSelectRodape() {
    const select = document.getElementById('select-materia');
    if(!select) return;
    const valAtual = select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione uma matéria...</option>';
    materias.forEach(mat => {
        select.innerHTML += `<option value="${mat.id}">${mat.nome}</option>`;
    });
    if(materias.find(m=>m.id === valAtual)) select.value = valAtual;
}

// ==== GAMIFICAÇÃO ====
function calcularOfensivaEDiaria() {
    let ofensiva = 0; let minsHoje = 0;

    if(sessoes.length > 0) {
        const diasEstudados = new Set(sessoes.map(s => {
            const d = new Date(s.dataISO);
            return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        }));
        const hojeObj = new Date();
        const hojeStr = `${hojeObj.getFullYear()}-${(hojeObj.getMonth()+1).toString().padStart(2,'0')}-${hojeObj.getDate().toString().padStart(2,'0')}`;
        const segsHoje = sessoes.filter(s => {
            const d = new Date(s.dataISO);
            return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}` === hojeStr;
        }).reduce((acc, obj) => acc + obj.tempoSegundos, 0);
        
        minsHoje = Math.floor(segsHoje / 60);

        let diaVerificar = new Date(hojeObj);
        if(diasEstudados.has(hojeStr)) {
            ofensiva++; diaVerificar.setDate(diaVerificar.getDate() - 1);
        } else {
            diaVerificar.setDate(diaVerificar.getDate() - 1); 
        }

        while(true) {
            const checkStr = `${diaVerificar.getFullYear()}-${(diaVerificar.getMonth()+1).toString().padStart(2,'0')}-${diaVerificar.getDate().toString().padStart(2,'0')}`;
            if(diasEstudados.has(checkStr)) {
                ofensiva++; diaVerificar.setDate(diaVerificar.getDate() - 1);
            } else { break; }
        }
    }

    const txtOfensiva = document.getElementById('txt-ofensiva');
    if(txtOfensiva) txtOfensiva.innerText = `${ofensiva} dias`;
    
    const progressoDiario = document.getElementById('progresso-diario');
    const txtMeta = document.getElementById('txt-meta-diaria');
    
    if(progressoDiario && txtMeta) {
        const metaMinutos = 120; 
        const porcentagem = Math.min((minsHoje / metaMinutos) * 100, 100);
        progressoDiario.style.width = porcentagem + '%';
        txtMeta.innerText = `${minsHoje} / ${metaMinutos} min`;
    }
}

// ==== TIMER & POMODORO ====
function formatarTempoExibicao(totalSegundos) {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segs = totalSegundos % 60;
    if(horas > 0) return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
    return `${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
}

window.alternarModoTimer = function() {
    if(timerAtivo || isPausado) {
        alert("Finalize ou Cancele a sessão antes de mudar.");
        document.getElementById('check-pomodoro').checked = modoPomodoro; 
        return;
    }
    modoPomodoro = document.getElementById('check-pomodoro').checked;
    document.getElementById('display-tempo').innerText = modoPomodoro ? "25:00" : "00:00:00";
}

window.iniciarSessao = function() {
    const select = document.getElementById('select-materia');
    const inputAssunto = document.getElementById('input-assunto');

    if(select.value === "") { alert("Selecione qual matéria você vai estudar."); return;}
    if(inputAssunto.value.trim() === "") { alert("Digite o Assunto."); return;}

    if(!timerAtivo && !isPausado) {
        segundosEstudados = 0; 
        sessaoAtualInicio = new Date().toISOString();
        if(modoPomodoro) tempoRestantePomodoro = 25 * 60;
    }

    isPausado = false; timerAtivo = true;
    select.disabled = true; inputAssunto.disabled = true;
    document.getElementById('check-pomodoro').disabled = true;
    document.getElementById('btn-iniciar').style.display = 'none';
    document.getElementById('btn-pausar').style.display = 'block';
    document.getElementById('btn-parar').style.display = 'block';
    
    const display = document.getElementById('display-tempo');
    display.classList.add('pulsar'); display.classList.remove('pausado-text');

    timerInterval = setInterval(() => {
        segundosEstudados++; 
        if(modoPomodoro) {
            tempoRestantePomodoro--;
            display.innerText = formatarTempoExibicao(tempoRestantePomodoro);
            if(tempoRestantePomodoro <= 0) {
                somAlarme.play().catch(e => console.log(e));
                window.pararSessao(true); 
            }
        } else {
            display.innerText = formatarTempoExibicao(segundosEstudados);
        }
    }, 1000);
}

window.pausarSessao = function() {
    clearInterval(timerInterval);
    isPausado = true; timerAtivo = false;

    document.getElementById('btn-pausar').style.display = 'none';
    const btnIni = document.getElementById('btn-iniciar');
    btnIni.style.display = 'block'; btnIni.innerText = '▶ Retomar';

    const display = document.getElementById('display-tempo');
    display.classList.remove('pulsar'); display.classList.add('pausado-text'); 
}

window.pararSessao = function(foiAutomatico = false) {
    clearInterval(timerInterval);
    timerAtivo = false; isPausado = false;
    
    const display = document.getElementById('display-tempo');
    display.classList.remove('pulsar'); display.classList.remove('pausado-text');
    display.innerText = modoPomodoro ? "25:00" : "00:00:00";

    const select = document.getElementById('select-materia');
    const inputAssunto = document.getElementById('input-assunto');
    
    const materiaIdEscolhida = select.value;
    const assuntoDigitado = inputAssunto.value.trim();

    select.disabled = false; inputAssunto.disabled = false;
    document.getElementById('check-pomodoro').disabled = false;
    inputAssunto.value = ''; 

    const btnIni = document.getElementById('btn-iniciar');
    btnIni.style.display = 'block'; btnIni.innerText = '▶ Iniciar'; 
    document.getElementById('btn-pausar').style.display = 'none';
    document.getElementById('btn-parar').style.display = 'none';

    if (segundosEstudados < 5) {
        alert("Sessão desprezada pois durou menos de 5 segundos.");
        segundosEstudados = 0; return;
    }

    sessoes.push({
        id: 'ses_' + new Date().getTime(),
        materiaId: materiaIdEscolhida, assunto: assuntoDigitado,
        dataISO: sessaoAtualInicio, tempoSegundos: segundosEstudados
    });

    salvarDadosNaNuvem();
    if(foiAutomatico) alert("🍅 Pomodoro Concluído e Registrado no Histórico!");
    segundosEstudados = 0;
}

// ==== HISTÓRICO ====
function renderizarHistorico() {
    const container = document.getElementById('container-historico');
    if(!container) return;
    container.innerHTML = '';
    const sessoesReversas = [...sessoes].reverse();

    if(sessoesReversas.length === 0) {
        container.innerHTML = `<p style="color: gray;">Você ainda não registrou nenhuma sessão nesta conta.</p>`; return;
    }

    sessoesReversas.forEach(ses => {
        const mat = materias.find(m => m.id === ses.materiaId);
        const nomeMateria = mat ? mat.nome : 'Excluída';
        const corBadge = mat ? mat.cor : 'gray';

        const dataLegivel = new Date(ses.dataISO).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', hour:'2-digit', minute:'2-digit'});
        const tempoLegivel = formatarTempoExibicao(ses.tempoSegundos);

        container.innerHTML += `
            <div class="sessao-item">
                <div class="sessao-dados">
                    <span style="font-weight: bold; font-size: 1.1rem;">${ses.assunto}</span>
                    <span style="color: var(--cor-texto-secundario); font-size: 0.9rem;">${dataLegivel}</span>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="badge" style="background-color: ${corBadge};">${nomeMateria}</span>
                    <span style="font-family: monospace; font-size: 1.1rem; margin-right: 15px;">⏱ ${tempoLegivel}</span>
                    <button class="btn-secundario" style="padding: 6px 10px;" onclick="editarSessao('${ses.id}')">✏️ Editar</button>
                    <button class="btn-perigo" style="padding: 6px 10px;" onclick="deletarSessao('${ses.id}')">Excluir</button>
                </div>
            </div>`;
    });
}

window.editarSessao = function(idSessao) {
    const ses = sessoes.find(s => s.id === idSessao);
    if(!ses) return;

    const novoAssunto = prompt("Atualize o Assunto de estudo:", ses.assunto);
    if(novoAssunto === null || novoAssunto.trim() === "") return;

    const minsAntigos = Math.round(ses.tempoSegundos / 60);
    const novoTempoMinStr = prompt("Quantos minutos você faturou?", minsAntigos);
    if(novoTempoMinStr === null) return;
    
    const novoTempoSeg = parseInt(novoTempoMinStr) * 60;
    if(isNaN(novoTempoSeg) || novoTempoSeg < 0) {
        alert("Por favor, digite um número de minutos válido."); return;
    }

    ses.assunto = novoAssunto.trim(); ses.tempoSegundos = novoTempoSeg;
    salvarDadosNaNuvem();
}

window.deletarSessao = function(idSessao) {
    if(confirm("Deseja realmente apagar esta sessão da Nuvem?")) {
        sessoes = sessoes.filter(s => s.id !== idSessao);
        salvarDadosNaNuvem();
    }
}

window.exportarCSV = function() {
    if(sessoes.length === 0) { alert("Sua nuvem ainda não tem sessões exportáveis."); return;}

    let csvStr = "ID,Data Formato Original,Materia,Assunto,Minutos Focados\n";
    sessoes.forEach(s => {
        const mat = materias.find(m => m.id === s.materiaId);
        const nomeM = mat ? mat.nome.replace(/"/g, '""') : 'EXCLUIDA';
        const assuntoM = s.assunto.replace(/"/g, '""'); 
        const mins = Math.round(s.tempoSegundos / 60);
        csvStr += `"${s.id}","${s.dataISO}","${nomeM}","${assuntoM}",${mins}\n`;
    });

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Export_${usuarioLogado.uid}_${new Date().getTime()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ==== CHARTS ====
window.setFiltroGrafico = function(tipo) {
    filtroGrafico = tipo;
    document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('ativo'));
    document.getElementById('filtro-' + tipo).classList.add('ativo');
    atualizarGraficos();
}

function processarDadosGraficos() {
    let totaisPorMateriaId = {}; const hoje = new Date();
    const limiteSemana = new Date(hoje); limiteSemana.setDate(hoje.getDate() - 7);
    const limiteMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1); 

    sessoes.forEach(ses => {
        const dataSes = new Date(ses.dataISO);
        if(filtroGrafico === 'semana' && dataSes < limiteSemana) return;
        if(filtroGrafico === 'mes' && dataSes < limiteMes) return;
        if(!totaisPorMateriaId[ses.materiaId]) totaisPorMateriaId[ses.materiaId] = 0;
        totaisPorMateriaId[ses.materiaId] += ses.tempoSegundos;
    });

    let labels = []; let dadosMin = []; let cores = [];
    materias.forEach(mat => {
        const segsTotais = totaisPorMateriaId[mat.id] || 0;
        if(segsTotais > 0 || filtroGrafico==='total') {
            labels.push(mat.nome); dadosMin.push(Math.round(segsTotais / 60)); cores.push(mat.cor);
        }
    });
    return { labels, dadosMin, cores };
}

function inicializarGraficos() {
     const cvBarra = document.getElementById('graficoBarra');
     const cvPizza = document.getElementById('graficoPizza');
     if(!cvBarra || !cvPizza) return;

     const { labels, dadosMin, cores } = processarDadosGraficos();
     chartBarra = new Chart(cvBarra.getContext('2d'), {
         type: 'bar', data: { labels, datasets: [{ label: 'Minutos', data: dadosMin, backgroundColor: cores, borderRadius: 4 }] },
         options: { responsive: true, plugins: { legend: { display:false } }, scales: { y: { beginAtZero: true } } }
     });
     chartPizza = new Chart(cvPizza.getContext('2d'), {
         type: 'doughnut', data: { labels, datasets: [{ data: dadosMin, backgroundColor: cores, borderWidth: 0 }] },
         options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
     });
}

function atualizarGraficos() {
    if(!chartBarra || !chartPizza) { inicializarGraficos(); return; }
    const { labels, dadosMin, cores } = processarDadosGraficos();
    chartBarra.data.labels = labels; chartBarra.data.datasets[0].data = dadosMin; chartBarra.data.datasets[0].backgroundColor = cores; chartBarra.update();
    chartPizza.data.labels = labels; chartPizza.data.datasets[0].data = dadosMin; chartPizza.data.datasets[0].backgroundColor = cores; chartPizza.update();
}

// ==== CALENDÁRIO ====
function inicializarCalendario() {
    var calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;
    calendarioInstancia = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'pt-br',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth' },
        height: '100%'
    });
    atualizarEventosDoCalendario();
    calendarioInstancia.render();
}

function atualizarEventosDoCalendario() {
    if(!calendarioInstancia) return;
    calendarioInstancia.removeAllEvents();
    sessoes.forEach(ses => {
        const mat = materias.find(m => m.id === ses.materiaId);
        if(mat) {
            calendarioInstancia.addEvent({
                title: `${mat.nome} | ${Math.round(ses.tempoSegundos/60)}m`,
                start: ses.dataISO, backgroundColor: mat.cor, allDay: false
            });
        }
    });
}
