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

    if (s.url) {
      const link = document.createElement('a');
      link.href = s.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = s.name;

      li.appendChild(link);
      li.appendChild(document.createTextNode(` (${dist})${clima}`));
    } else {
      li.textContent = `${s.name} (${dist})${clima}`;
    }

    stationsListEl.appendChild(li);
  }
}

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

// Checagem manual
btnCheck.addEventListener('click', () => {
  btnCheck.disabled = true;
  setStatus('Executando checagem manual...');

  console.log('[RainMonitor Popup] Enviando mensagem RUN_CHECK_NOW');
  
  chrome.runtime.sendMessage({ type: 'RUN_CHECK_NOW' }, (response) => {
    console.log('[RainMonitor Popup] Resposta recebida:', response);
    
    btnCheck.disabled = false;

    if (chrome.runtime.lastError) {
      const errorMessage = chrome.runtime.lastError.message ||
                          JSON.stringify(chrome.runtime.lastError) ||
                          'Erro desconhecido ao enviar mensagem';
      console.error('[RainMonitor Popup] Erro ao enviar mensagem:', errorMessage);
      setStatus('Erro ao enviar comando ao background.', true);
      return;
    }

    if (!response) {
      console.error('[RainMonitor Popup] Nenhuma resposta recebida do background');
      setStatus('Nenhuma resposta do background script.', true);
      return;
    }

    if (!response.ok) {
      const errorDetails = response.error || 'Erro desconhecido';
      console.error('[RainMonitor Popup] Erro na checagem manual:', errorDetails);
      setStatus(`Erro na checagem: ${errorDetails}`, true);
      return;
    }

    const now = new Date();
    setStatus(
      'Checagem concluída às ' + now.toLocaleTimeString('pt-BR') + '.'
    );

    loadState();
  });
});

// Salvar raio
btnSaveRadius.addEventListener('click', () => {
  const value = Number(radiusInputEl.value);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    setStatus('Informe um raio válido entre 1 e 1000 km.', true);
    return;
  }

  chrome.storage.local.set({ cemigRadiusKm: value }, () => {
    if (chrome.runtime.lastError) {
      const errorMessage = chrome.runtime.lastError.message ||
                          JSON.stringify(chrome.runtime.lastError) ||
                          'Erro desconhecido ao salvar raio';
      console.error('[RainMonitor Popup] Erro ao salvar raio:', errorMessage);
      setStatus('Erro ao salvar raio.', true);
      return;
    }

    setStatus(`Raio atualizado para ${value} km.`);
  });
});

// Ao abrir o popup
loadState();
