// popup.js

const btnCheck = document.getElementById('btnCheck');
const statusEl = document.getElementById('status');
const rainAnswerEl = document.getElementById('rainAnswer');
const lastCheckEl = document.getElementById('lastCheck');
const radiusInputEl = document.getElementById('radiusInput');
const btnSaveRadius = document.getElementById('btnSaveRadius');
const stationsListEl = document.getElementById('stationsList');

const DEFAULT_RADIUS_KM = 20;

function setStatus(text, isError = false) {
  statusEl.textContent = text || '';
  statusEl.style.color = isError ? '#fca5a5' : '#9ca3af';
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('pt-BR') +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

// Cria (se necessário) e retorna o container para detalhes da API
function getApiDetailsContainer() {
  let el = document.getElementById('apiDetails');
  if (!el) {
    el = document.createElement('div');
    el.id = 'apiDetails';
    el.style.marginTop = '8px';
    el.style.padding = '6px';
    el.style.borderTop = '1px solid #e5e7eb';
    el.style.fontSize = '11px';
    el.style.maxHeight = '200px';
    el.style.overflowY = 'auto';
    // Insere depois da lista de estações
    stationsListEl.parentElement.appendChild(el);
  }
  return el;
}

/**
 * Mostra um resumo dos dados da API estatistica-hora
 * Tenta extrair:
 * - chuva máxima
 * - chuva última entrada
 * - mini "gráfico" textual com últimos valores
 */
function showApiSummary(station, apiData) {
  const container = getApiDetailsContainer();
  container.innerHTML = ''; // limpa

  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '4px';
  title.textContent = `Resumo da estação: ${station.name} (ID: ${station.stationId})`;
  container.appendChild(title);

  if (!apiData) {
    container.appendChild(
      document.createTextNode('Nenhum dado retornado pela API.')
    );
    return;
  }

  let series = [];
  if (Array.isArray(apiData)) {
    series = apiData;
  } else if (Array.isArray(apiData.dados)) {
    series = apiData.dados;
  } else if (Array.isArray(apiData.Data) || Array.isArray(apiData.data)) {
    series = apiData.Data || apiData.data;
  }

  if (series.length === 0) {
    container.appendChild(
      document.createTextNode('API retornou dados, mas nenhum ponto de série foi identificado.')
    );
    return;
  }

  // Função util para extrair valor de chuva de um item
  function getChuva(val) {
    if (!val || typeof val !== 'object') return null;
    const c =
      val.Chuva ??
      val.chuva ??
      val.ChuvaHora ??
      val.chuvaHora ??
      val.Precipitacao ??
      val.precipitacao ??
      null;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  }

  // Função para extrair data/hora, se existir
  function getTimeLabel(val) {
    if (!val || typeof val !== 'object') return '';
    const t =
      val.Data ??
      val.data ??
      val.Timestamp ??
      val.timestamp ??
      val.Hora ??
      val.hora ??
      '';
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return String(t);
  }

  let maxChuva = 0;
  let maxChuvaTime = '';
  const pontos = [];

  for (const item of series) {
    const chuva = getChuva(item);
    if (chuva == null) continue;
    const label = getTimeLabel(item);

    if (chuva > maxChuva) {
      maxChuva = chuva;
      maxChuvaTime = label;
    }

    pontos.push({ chuva, label });
  }

  if (pontos.length === 0) {
    container.appendChild(
      document.createTextNode(
        'Não foi possível identificar valores de chuva nos dados retornados.'
      )
    );
    return;
  }

  const last = pontos[pontos.length - 1];

  const resumo = document.createElement('div');
  resumo.innerHTML =
    `🌧️ Último valor de chuva: <b>${last.chuva}</b> (hora: ${last.label || '—'})<br>` +
    `📈 Máximo da série: <b>${maxChuva}</b>${maxChuvaTime ? ` (hora: ${maxChuvaTime})` : ''}`;
  container.appendChild(resumo);

  // Mini "gráfico" textual com até os últimos 12 pontos
  const grafTitle = document.createElement('div');
  grafTitle.style.marginTop = '6px';
  grafTitle.textContent = 'Últimos valores (chuva):';
  container.appendChild(grafTitle);

  const graf = document.createElement('div');
  graf.style.fontFamily = 'monospace';
  graf.style.whiteSpace = 'pre';

  const ultimos = pontos.slice(-12);
  const maxForScale = ultimos.reduce(
    (acc, p) => (p.chuva > acc ? p.chuva : acc),
    0
  ) || 1;

  const lines = ultimos.map((p) => {
    const barLen = Math.round((p.chuva / maxForScale) * 10);
    const bar = '▇'.repeat(barLen || 1);
    const lbl = (p.label || '').padEnd(5, ' ');
    return `${lbl} | ${bar} ${p.chuva}`;
  });

  graf.textContent = lines.join('\n');
  container.appendChild(graf);

  // Pequeno rodapé
  const note = document.createElement('div');
  note.style.marginTop = '4px';
  note.style.color = '#9ca3af';
  note.textContent = 'Obs.: interpretação dos campos baseada em nomes comuns (Chuva, Precipitação, etc.).';
  container.appendChild(note);
}

/**
 * Renderiza lista de estações com chuva:
 * - Nome
 * - Distância
 * - Clima
 * - ID
 * - Cidade
 * - Botão "Ver dados da API"
 */
function renderStationsList(status) {
  stationsListEl.innerHTML = '';

  const list = status?.rainingStations || [];
  if (!Array.isArray(list) || list.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma estação com chuva dentro do raio.';
    stationsListEl.appendChild(li);
    return;
  }

  for (const s of list) {
    const li = document.createElement('li');

    const dist = s.distanceKm != null ? s.distanceKm.toFixed(2) + ' km' : '';
    const clima = s.clima ? ` • ${s.clima}` : '';
    const idTxt = s.stationId ? ` • ID: ${s.stationId}` : '';
    const cityTxt = s.city ? ` • Cidade: ${s.city}` : '';

    const infoSpan = document.createElement('span');
    infoSpan.textContent = `${s.name} (${dist})${clima}${idTxt}${cityTxt}`;
    li.appendChild(infoSpan);

    // Botão "Ver dados da API" se tivermos stationId
    if (s.stationId != null) {
      const btnDetails = document.createElement('button');
      btnDetails.textContent = 'Ver dados da API';
      btnDetails.style.marginLeft = '6px';
      btnDetails.style.fontSize = '11px';
      btnDetails.style.padding = '2px 6px';

      btnDetails.addEventListener('click', () => {
        setStatus(`Buscando dados da estação ${s.stationId}...`);

        chrome.runtime.sendMessage(
          { type: 'GET_STATION_HOURLY', stationId: s.stationId },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                '[RainMonitor Popup] Erro ao enviar mensagem:',
                chrome.runtime.lastError
              );
              setStatus('Erro ao buscar dados da API.', true);
              return;
            }

            if (!response || !response.ok) {
              console.error(
                '[RainMonitor Popup] Erro na API:',
                response
              );
              setStatus('Erro ao buscar dados da API.', true);
              return;
            }

            setStatus('Dados da API carregados.');
            console.log('[RainMonitor Popup] Dados da API:', response.data);
            showApiSummary(s, response.data);
          }
        );
      });

      li.appendChild(btnDetails);
    }

    stationsListEl.appendChild(li);
  }
}

/**
 * Carrega o estado salvo no armazenamento local
 */
function loadState() {
  chrome.storage.local.get(
    ['cemigLastStatus', 'cemigRadiusKm'],
    (res) => {
      const status = res.cemigLastStatus || null;
      let radius = Number(res.cemigRadiusKm);
      if (!Number.isFinite(radius) || radius <= 0) {
        radius = status?.radiusKm || DEFAULT_RADIUS_KM;
      }
      radiusInputEl.value = radius;

      if (!status) {
        rainAnswerEl.textContent = 'Ainda não há dados de checagem.';
        lastCheckEl.textContent =
          'A checagem automática ocorre a cada 5 minutos.';
        renderStationsList(null);
        return;
      }

      const list = Array.isArray(status.rainingStations)
        ? status.rainingStations
        : [];
      const effectiveIsRaining = list.length > 0;

      if (effectiveIsRaining) {
        rainAnswerEl.textContent =
          '🌧️ Está chovendo na área monitorada da Cemig Sede.';
      } else {
        rainAnswerEl.textContent =
          '🌤️ Não está chovendo na área monitorada da Cemig Sede.';
      }

      const dtTxt = formatDateTime(status.checkedAt);
      lastCheckEl.textContent = dtTxt
        ? `Última checagem: ${dtTxt} (raio: ${status.radiusKm} km).`
        : `Última checagem registrada (raio: ${status.radiusKm} km).`;

      renderStationsList({ rainingStations: list });
    }
  );
}

/**
 * Checagem manual
 */
btnCheck.addEventListener('click', () => {
  btnCheck.disabled = true;
  setStatus('Executando checagem manual...');

  chrome.runtime.sendMessage({ type: 'RUN_CHECK_NOW' }, (response) => {
    btnCheck.disabled = false;

    if (chrome.runtime.lastError) {
      console.error(
        '[RainMonitor Popup] Erro ao enviar mensagem:',
        chrome.runtime.lastError
      );
      setStatus('Erro ao enviar comando ao background.', true);
      return;
    }

    if (!response || !response.ok) {
      console.error('[RainMonitor Popup] Erro na checagem manual:', response);
      setStatus('Erro ao executar checagem manual.', true);
      return;
    }

    const now = new Date();
    setStatus(
      'Checagem concluída às ' + now.toLocaleTimeString('pt-BR') + '.'
    );

    loadState();
  });
});

/**
 * Salvar novo raio
 */
btnSaveRadius.addEventListener('click', () => {
  const value = Number(radiusInputEl.value);
  if (!Number.isFinite(value) || value <= 0 || value > 10000) {
    setStatus('Informe um raio válido entre 1 e 10000 km.', true);
    return;
  }

  chrome.storage.local.set({ cemigRadiusKm: value }, () => {
    if (chrome.runtime.lastError) {
      console.error(
        '[RainMonitor Popup] Erro ao salvar raio:',
        chrome.runtime.lastError
      );
      setStatus('Erro ao salvar raio.', true);
      return;
    }

    setStatus(`Raio atualizado para ${value} km.`);
  });
});

// Ao abrir o popup
loadState();
