
/* =========================================================
   API DO BACKEND
========================================================= */

async function api(url, options = {}){

  const resposta = await fetch(
    url,
    {
      ...options,

      headers:{
        'Content-Type':'application/json',
        ...(options.headers || {})
      }
    }
  );


  let dados = null;


  try{

    dados = await resposta.json();

  }catch(_){

    dados = {};

  }


  if(!resposta.ok){

    throw new Error(
      dados.error ||
      dados.message ||
      `Erro HTTP ${resposta.status}`
    );

  }


  return dados;

}


/* =========================================================
   VARIÁVEIS
========================================================= */

let ocorrencias = [];

let filtroAtual = 'TODAS';

let editId = null;

let rec = null;

let gravando = false;

let wantRestart = true;

let silenceTimer = null;

let silenceCountdown = null;

let finalBuffer = '';

let pollingTimer = null;
let carregandoOcorrencias = false;
let fechamentoProcessando = false;


/* =========================================================
   NOVAS VARIÁVEIS IA
========================================================= */

let historicoChat = [];

let chatEnviando = false;

let fechamentoDados = {

  executivo:'',
  fechamento:''

};

let fechamentoAtual = 'executivo';


/* =========================================================
   TURNO
========================================================= */

function getTurnoAuto(){

  const h = new Date().getHours();


  if(h >= 6 && h < 14)
    return 'TURNO A';


  if(h >= 14 && h < 22)
    return 'TURNO B';


  return 'TURNO C';

}


/* =========================================================
   CABEÇALHO
========================================================= */

document.getElementById('dataHoje').innerText =
  new Date().toLocaleDateString(
    'pt-BR',
    {
      weekday:'long',
      day:'2-digit',
      month:'2-digit'
    }
  );


document.getElementById('turnoAuto').innerText =
  getTurnoAuto();


/* =========================================================
   DETECTAR HORÁRIO
========================================================= */

function detectarHorario(texto){

  const t = texto.toLowerCase();


  const m =
    t.match(/(\d{1,2})[:h](\d{2})/);


  if(m){

    return (
      String(m[1]).padStart(2,'0')
      + ':'
      + m[2]
    );

  }


  return null;

}


/* =========================================================
   DETECTAR FRENTE
========================================================= */

function detectarFrente(texto){

  const t = texto.toLowerCase();


  const mp = {

    'um':'1',
    'dois':'2',
    'tres':'3',
    'três':'3',
    'quatro':'4',
    'cinco':'5',
    'seis':'6'

  };


  let m =
    t.match(/quinhent\w*\s*e?\s*(\w+)/);


  if(m && mp[m[1]])
    return 'FRENTE 50' + mp[m[1]];


  m =
    t.match(/\b50\s*([1-6])\b/);


  if(m)
    return 'FRENTE 50' + m[1];


  m =
    t.match(/\b50([1-6])\b/);


  if(m)
    return 'FRENTE 50' + m[1];


  m =
    t.match(/frente\s*([1-6])\b/);


  if(m)
    return 'FRENTE 50' + m[1];


  return 'GERAL';

}


/* =========================================================
   LIMPAR CABEÇALHO
========================================================= */

function limparCabecalho(texto){

  let t = texto;


  t =
    t.replace(
      /^\s*(às|as)?\s*\d{1,2}[:h]\d{2}\s*[,.\-]?\s*/i,
      ''
    );


  t =
    t.replace(
      /frente\s*(quinh\w*\s*e?\s*\w+|50\s*[1-6]|50[1-6]|[1-6])\s*[,.\-]?/gi,
      ''
    );


  return t.trim();

}


/* =========================================================
   CORREÇÃO LEVE
========================================================= */

function correcaoLeve(texto){

  let t = texto.trim();


  const fx = [

    [/colhedera/gi,'colhedora'],
    [/caminhao/gi,'caminhão'],
    [/manutencao/gi,'manutenção']

  ];


  fx.forEach(
    ([r,p]) => t = t.replace(r,p)
  );


  if(t)
    t =
      t.charAt(0).toUpperCase()
      + t.slice(1);


  if(
    t &&
    !/[.!?]$/.test(t)
  )
    t += '.';


  return t;

}


/* =========================================================
   HORA ATUAL
========================================================= */

function horaAgora(){

  return new Date().toLocaleTimeString(
    'pt-BR',
    {
      hour:'2-digit',
      minute:'2-digit'
    }
  );

}


/* =========================================================
   CARREGAR OCORRÊNCIAS
========================================================= */

async function loadSupa(){

  if(carregandoOcorrencias)
    return;

  carregandoOcorrencias = true;

  try{

    const data =
      await api('/api/ocorrencias');


    ocorrencias =
      Array.isArray(data)
        ? data.map(d => ({

            id:d.id,
            hora:d.hora,
            frente:d.frente,
            texto:d.texto,
            turno:d.turno,
            unidade:d.unidade,
            created_at:d.created_at

          }))
        : [];


    render();


  }catch(error){

    console.error(
      'Erro ao atualizar lista:',
      error
    );


    document.getElementById('lista').innerHTML =
      '<div class="empty">ERRO AO CARREGAR OCORRÊNCIAS: '
      + escapeHtml(error.message)
      + '</div>';

  }

}


/* =========================================================
   PROTEÇÃO HTML
========================================================= */

function escapeHtml(valor){

  return String(valor ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

}


/* =========================================================
   ADICIONAR OCORRÊNCIA
========================================================= */

async function addOcorrencia(bruto){

  if(!bruto || !bruto.trim())
    return;


  const hora =
    detectarHorario(bruto)
    || horaAgora();


  const frente =
    detectarFrente(bruto);


  const texto =
    correcaoLeve(
      limparCabecalho(bruto)
    );


  if(!texto || texto === '.')
    return;


  try{

    await api(
      '/api/ocorrencias',
      {
        method:'POST',

        body:JSON.stringify({

          hora,
          frente,
          texto,
          turno:getTurnoAuto(),
          unidade:'MANDU'

        })

      }
    );


    await loadSupa();


  }catch(error){

    console.error(
      'Erro ao inserir:',
      error
    );


    alert(
      'Erro ao inserir: '
      + error.message
    );

  }

}


/* =========================================================
   ADICIONAR MANUAL
========================================================= */

async function addManual(){

  const i =
    document.getElementById(
      'textoManual'
    );


  const texto =
    i.value.trim();


  if(!texto)
    return;


  i.value = '';


  await addOcorrencia(texto);

}


/* =========================================================
   ENTER NO MANUAL
========================================================= */

document
  .getElementById('textoManual')
  .addEventListener(
    'keydown',
    function(event){

      if(event.key === 'Enter'){

        event.preventDefault();

        addManual();

      }

    }
  );


/* =========================================================
   DELETAR
========================================================= */

async function deletar(id){

  if(
    !confirm(
      'Deseja excluir este registro?'
    )
  )
    return;


  try{

    await api(
      '/api/ocorrencias/' + encodeURIComponent(id),
      {
        method:'DELETE'
      }
    );


    await loadSupa();


  }catch(error){

    console.error(
      'Erro ao deletar:',
      error
    );


    alert(
      'Erro ao deletar: '
      + error.message
    );

  }

}


/* =========================================================
   NOVO TURNO
========================================================= */

async function limparTudo(){

  if(!ocorrencias.length){

    await loadSupa();

    return;

  }


  if(
    !confirm(
      'Deseja iniciar um novo turno e limpar todas as ocorrências atuais?'
    )
  )
    return;


  try{

    await api(
      '/api/ocorrencias',
      {
        method:'DELETE'
      }
    );


    historicoChat = [];

    fechamentoDados = {
      executivo:'',
      fechamento:''
    };


    await loadSupa();


  }catch(error){

    console.error(
      'Erro ao iniciar novo turno:',
      error
    );


    alert(
      'Erro ao limpar: '
      + error.message
    );

  }

}


/* =========================================================
   FILTRO
========================================================= */

function filtrar(f,b){

  filtroAtual = f;


  document
    .querySelectorAll('.filtros button')
    .forEach(
      x => x.classList.remove('ativo')
    );


  b.classList.add('ativo');


  render();

}


/* =========================================================
   EDITAR
========================================================= */

function abrirEdit(id){

  editId = id;


  const o =
    ocorrencias.find(
      x => String(x.id) === String(id)
    );


  if(!o)
    return;


  document.getElementById(
    'editTexto'
  ).value = o.texto;


  document.getElementById(
    'modalEdit'
  ).classList.add('show');

}


/* =========================================================
   SALVAR EDIÇÃO
========================================================= */

async function salvarEdit(){

  const v =
    document
      .getElementById('editTexto')
      .value
      .trim();


  if(!v)
    return;


  try{

    await api(
      '/api/ocorrencias/' +
      encodeURIComponent(editId),
      {
        method:'PUT',

        body:JSON.stringify({

          texto:correcaoLeve(v)

        })

      }
    );


    document
      .getElementById('modalEdit')
      .classList.remove('show');


    await loadSupa();


  }catch(error){

    console.error(
      'Erro ao editar:',
      error
    );


    alert(
      'Erro ao editar: '
      + error.message
    );

  }

}


/* =========================================================
   RENDER
========================================================= */

function render(){

  const lista =
    document.getElementById(
      'lista'
    );


  let f =
    filtroAtual === 'TODAS'
      ? ocorrencias
      : ocorrencias.filter(
          o => o.frente === filtroAtual
        );


  document.getElementById(
    'stTotal'
  ).innerText =
    ocorrencias.length;


  document.getElementById(
    'stFrentes'
  ).innerText =
    new Set(
      ocorrencias.map(
        o => o.frente
      )
    ).size;


  document.getElementById(
    'stUltima'
  ).innerText =
    ocorrencias.length
      ? ocorrencias[0].hora
      : '--:--';


  if(!f.length){

    lista.innerHTML =
      '<div class="empty">Nenhuma ocorrência registrada.</div>';

    return;

  }


  lista.innerHTML =
    f.map(o => `

      <div class="card">

        <div class="meta">

          <span class="hora">
            ${escapeHtml(o.hora)}
          </span>

          <span class="frente">
            ${escapeHtml(
              String(o.frente || '').replace('FRENTE ','')
            )}
          </span>

        </div>


        <p>
          ${escapeHtml(o.texto)}
        </p>


        <div class="acts">

          <button
            class="e"
            onclick="abrirEdit('${escapeHtml(o.id)}')"
            title="Editar">

            <i class="fa-solid fa-pen"></i>

          </button>


          <button
            class="d"
            onclick="deletar('${escapeHtml(o.id)}')"
            title="Excluir">

            <i class="fa-solid fa-trash"></i>

          </button>

        </div>

      </div>

    `).join('');

}


/* =========================================================
   MICROFONE
========================================================= */

const btnMic =
  document.getElementById('btnMic');


const statusMic =
  document.getElementById('statusMic');


const tempDiv =
  document.getElementById(
    'transcricaoTemp'
  );


function iniciarGravacao(){

  if(gravando)
    return;


  wantRestart = true;


  try{

    rec.start();

  }catch(e){}

}


function pararTudo(){

  if(!gravando)
    return;


  gravando = false;

  wantRestart = false;


  try{

    rec.stop();

  }catch(e){}


  btnMic.classList.remove(
    'gravando'
  );


  btnMic.innerHTML =
    '<i class="fa-solid fa-microphone"></i>';


  statusMic.innerText =
    'Mantenha pressionado para falar';


  tempDiv.style.display =
    'none';


  if(finalBuffer.trim()){

    addOcorrencia(
      finalBuffer.trim()
    );


    finalBuffer = '';

  }

}


if(
  'webkitSpeechRecognition' in window
  ||
  'SpeechRecognition' in window
){

  const SR =
    window.SpeechRecognition
    ||
    window.webkitSpeechRecognition;


  rec = new SR();


  rec.lang = 'pt-BR';

  rec.interimResults = true;

  rec.continuous = true;


  rec.onstart = () => {

    gravando = true;

    finalBuffer = '';


    btnMic.classList.add(
      'gravando'
    );


    btnMic.innerHTML =
      '<i class="fa-solid fa-stop"></i>';


    statusMic.innerText =
      'Ouvindo... solte para registrar';


    tempDiv.style.display =
      'block';


    tempDiv.innerText =
      '...';

  };


  rec.onresult = (e) => {

    let interim = '';


    for(
      let i = e.resultIndex;
      i < e.results.length;
      i++
    ){

      const tr =
        e.results[i][0].transcript;


      if(
        e.results[i].isFinal
      ){

        finalBuffer +=
          tr + ' ';

      }else{

        interim += tr;

      }

    }


    tempDiv.innerText =
      (
        finalBuffer + interim
      ).trim()
      || '...';

  };


  rec.onend = () => {

    if(
      gravando &&
      wantRestart
    ){

      try{

        rec.start();

      }catch(e){}

    }

  };


  btnMic.addEventListener(
    'mousedown',
    iniciarGravacao
  );


  btnMic.addEventListener(
    'mouseup',
    pararTudo
  );


  btnMic.addEventListener(
    'mouseleave',
    pararTudo
  );


  btnMic.addEventListener(
    'touchstart',
    (e) => {

      e.preventDefault();

      iniciarGravacao();

    }
  );


  btnMic.addEventListener(
    'touchend',
    (e) => {

      e.preventDefault();

      pararTudo();

    }
  );


}else{

  statusMic.innerText =
    'Reconhecimento de voz não suportado neste navegador.';

}


/* =========================================================
   CHAT OPERACIONAL
========================================================= */

function abrirChat(){

  document
    .getElementById('modalChat')
    .classList.add('show');


  setTimeout(
    () => {

      document
        .getElementById('chatInput')
        .focus();

    },
    250
  );

}


function fecharChat(){

  document
    .getElementById('modalChat')
    .classList.remove('show');

}


function usarAtalho(texto){

  document
    .getElementById('chatInput')
    .value = texto;


  enviarChat();

}


async function enviarChat(){

  if(chatEnviando)
    return;


  const input =
    document.getElementById(
      'chatInput'
    );


  const pergunta =
    input.value.trim();


  if(!pergunta)
    return;


  if(!ocorrencias.length){

    adicionarMensagemChat(
      'assistant',
      'Ainda não existem ocorrências registradas neste turno para eu analisar.'
    );

    input.value = '';

    return;

  }


  chatEnviando = true;


  const botao =
    document.getElementById(
      'chatEnviar'
    );


  const status =
    document.getElementById(
      'chatStatus'
    );


  botao.disabled = true;

  input.disabled = true;


  adicionarMensagemChat(
    'user',
    pergunta
  );


  input.value = '';


  status.innerText =
    '🧠 Analisando o turno...';


  try{

    const data =
      await api(
        '/chat-ia',
        {
          method:'POST',

          body:JSON.stringify({

            ocorrencias:
              ocorrencias
                .slice()
                .reverse(),

            pergunta,

            historico:
              historicoChat
                .slice(-10)

          })

        }
      );


    const resposta =
      data.resposta
      ||
      'A IA não retornou uma resposta.';


    historicoChat.push({

      role:'user',

      content:pergunta

    });


    historicoChat.push({

      role:'assistant',

      content:resposta

    });


    if(
      historicoChat.length > 12
    ){

      historicoChat =
        historicoChat.slice(-12);

    }


    adicionarMensagemChat(
      'assistant',
      resposta
    );


    status.innerText =
      'Análise concluída.';


  }catch(error){

    adicionarMensagemChat(
      'assistant',
      '❌ Erro ao consultar a IA:\n'
      + error.message
    );


    status.innerText =
      'Erro na consulta.';

  }


  chatEnviando = false;

  botao.disabled = false;

  input.disabled = false;

  input.focus();

}


function adicionarMensagemChat(
  tipo,
  texto
){

  const lista =
    document.getElementById(
      'chatLista'
    );


  const div =
    document.createElement('div');


  div.className =
    'chat-msg ' + tipo;


  const balao =
    document.createElement('div');


  balao.className =
    'chat-balao';


  balao.innerText =
    texto;


  div.appendChild(
    balao
  );


  lista.appendChild(
    div
  );


  lista.scrollTop =
    lista.scrollHeight;

}


/* =========================================================
   ENTER DO CHAT
========================================================= */

document
  .getElementById('chatInput')
  .addEventListener(
    'keydown',
    function(event){

      if(
        event.key === 'Enter'
      ){

        event.preventDefault();

        enviarChat();

      }

    }
  );


/* =========================================================
   FECHAR TURNO
========================================================= */

async function fecharTurno(){

  if(fechamentoProcessando)
    return;

  if(!ocorrencias.length){

    alert(
      'Adicione pelo menos uma ocorrência antes de fechar o turno.'
    );

    return;

  }

  const modal =
    document.getElementById(
      'modalFechamento'
    );

  const texto =
    document.getElementById(
      'textoFechamento'
    );

  const botao =
    document.getElementById(
      'btnFecharTurno'
    );

  fechamentoProcessando = true;

  if(botao){
    botao.disabled = true;
    botao.style.opacity = '.55';
    botao.style.pointerEvents = 'none';
  }

  modal.classList.add('show');

  fechamentoDados = {
    executivo:'',
    fechamento:''
  };

  fechamentoAtual = 'executivo';

  atualizarAbasFechamento();

  texto.classList.add('loading-ia');

  texto.innerText =
    '🧠 PROCESSANDO FECHAMENTO...\n\n'
    + 'A IA está analisando todas as ocorrências do turno.\n\n'
    + 'Aguarde...';

  document.getElementById(
    'fechamentoInfo'
  ).innerText =
    ocorrencias.length
    + ' ocorrência(s) sendo analisada(s).';

  try{

    /*
     * UMA ÚNICA CHAMADA.
     *
     * O endpoint /fechar-turno-ia já devolve:
     * - executivo
     * - fechamento
     *
     * Assim evitamos duas chamadas simultâneas
     * para a mesma análise.
     */

    const resultado =
      await api(
        '/fechar-turno-ia',
        {
          method:'POST',

          body:JSON.stringify({

            ocorrencias:
              ocorrencias
                .slice()
                .reverse()

          })

        }
      );

    const executivo =
      resultado.executivo
      || resultado.gerencial
      || 'Não foi possível gerar o resumo executivo.';

    const fechamento =
      resultado.fechamento
      || resultado.texto
      || 'Não foi possível gerar o fechamento detalhado.';

    fechamentoDados = {
      executivo:executivo.trim(),
      fechamento:fechamento.trim()
    };

    texto.classList.remove('loading-ia');

    selecionarFechamento('executivo');

  }catch(error){

    console.error(
      'Erro ao fechar turno:',
      error
    );

    texto.classList.remove('loading-ia');

    texto.innerText =
      '❌ ERRO AO FECHAR O TURNO\n\n'
      + error.message;

    document.getElementById(
      'fechamentoInfo'
    ).innerText =
      'Não foi possível concluir a análise. Tente novamente.';

  }finally{

    fechamentoProcessando = false;

    if(botao){
      botao.disabled = false;
      botao.style.opacity = '';
      botao.style.pointerEvents = '';
    }

  }

}


/* =========================================================
   ABAS DO FECHAMENTO
========================================================= */

function selecionarFechamento(tipo){

  if(
    tipo !== 'executivo' &&
    tipo !== 'fechamento'
  ){
    tipo = 'executivo';
  }

  fechamentoAtual =
    tipo;

  atualizarAbasFechamento();

}


function atualizarAbasFechamento(){

  const texto =
    document.getElementById(
      'textoFechamento'
    );

  const info =
    document.getElementById(
      'fechamentoInfo'
    );

  document
    .querySelectorAll('.fechamento-tab')
    .forEach(
      b => b.classList.remove('ativo')
    );

  const mapa = {

    executivo:
      'tabExecutivo',

    fechamento:
      'tabFechamento'

  };

  const botao =
    document.getElementById(
      mapa[fechamentoAtual]
    );

  if(botao)
    botao.classList.add(
      'ativo'
    );

  const conteudo =
    fechamentoDados[
      fechamentoAtual
    ];

  if(conteudo){

    texto.classList.remove(
      'loading-ia'
    );

    texto.innerText =
      conteudo;

    if(
      fechamentoAtual === 'executivo'
    ){

      info.innerText =
        'Resumo direto para gerência — pronto para WhatsApp.';

    }else{

      info.innerText =
        'Análise detalhada do turno — pronta para WhatsApp.';

    }

  }else{

    texto.innerText =
      'Aguardando processamento da IA...';

  }

}


/* =========================================================
   COPIAR ABA ATUAL
========================================================= */

function copiarFechamentoAtual(){

  const texto =
    fechamentoDados[
      fechamentoAtual
    ]
    ||
    document.getElementById(
      'textoFechamento'
    ).innerText;

  if(
    !texto ||
    texto.includes('PROCESSANDO FECHAMENTO')
  )
    return;

  copiarGenerico(
    texto,
    'Texto copiado com sucesso!'
  );

}


/* =========================================================
   FECHAR MODAL
========================================================= */

function fecharModalFechamento(){

  document
    .getElementById(
      'modalFechamento'
    )
    .classList.remove('show');

}


/* =========================================================
   COPIAR GENÉRICO
========================================================= */

function copiarGenerico(
  texto,
  mensagem
){

  if(
    navigator.clipboard &&
    navigator.clipboard.writeText
  ){

    navigator.clipboard
      .writeText(texto)
      .then(() => {

        alert(
          mensagem
        );

      })
      .catch(() => {

        copiarFallback(
          texto,
          mensagem
        );

      });

  }else{

    copiarFallback(
      texto,
      mensagem
    );

  }

}


/* =========================================================
   FALLBACK COPIAR
========================================================= */

function copiarFallback(
  texto,
  mensagem = 'Texto copiado com sucesso!'
){

  const area =
    document.createElement('textarea');


  area.value =
    texto;


  area.style.position =
    'fixed';


  area.style.left =
    '-9999px';


  document.body.appendChild(
    area
  );


  area.select();


  try{

    document.execCommand(
      'copy'
    );


    alert(
      mensagem
    );


  }catch(e){

    alert(
      'Não foi possível copiar automaticamente.'
    );

  }


  document.body.removeChild(
    area
  );

}


/* =========================================================
   ATUALIZAÇÃO AUTOMÁTICA
========================================================= */

function iniciarAtualizacao(){

  if(pollingTimer)
    clearInterval(
      pollingTimer
    );


  pollingTimer =
    setInterval(
      () => {

        if(
          document.visibilityState === 'visible'
        ){

          loadSupa();

        }

      },
      4000
    );

}


/* =========================================================
   FECHAR MODAIS COM ESC
========================================================= */

document.addEventListener(
  'keydown',
  function(event){

    if(event.key !== 'Escape')
      return;


    document
      .querySelectorAll('.modal.show')
      .forEach(
        modal =>
          modal.classList.remove('show')
      );

  }
);


/* =========================================================
   CARGA INICIAL
========================================================= */

loadSupa();

iniciarAtualizacao();
