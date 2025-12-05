// background.js (service worker MV3)
// IMPORTANTE no manifest.json:
// "background": { "service_worker": "background.js", "type": "module" }
// "permissions": ["alarms", "notifications", "storage"]
// "host_permissions": ["https://instarain.com.br/*"]

import { DATA_SOURCES } from './dataSources.js';
import { evaluateRulesForSource } from './rules.js';

const ALARM_NAME = 'rainCheck';
const CHECK_INTERVAL_MINUTES = 5;
const DEFAULT_CEMIG_RADIUS_KM = 20;

// ⚠ Token de autorização usado pela API InstaRain.
// ATENÇÃO: isso fica exposto na extensão. Use apenas em ambiente controlado.
const INSTARAIN_AUTH_TOKEN = '496f642b-9e50-4c0d-8274-e049873ba076';

/* -----------------------------------------------------
   🔧 Funções de Persistência
------------------------------------------------------ */

function getCemigRadiusKm() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cemigRadiusKm'], (res) => {
      const value = Number(res.cemigRadiusKm);
      if (Number.isFinite(value) && value > 0 && value <= 10000) {
        resolve(value);
      } else {
        resolve(DEFAULT_CEMIG_RADIUS_KM);
      }
    });
  });
}

function getCemigStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cemigLastStatus'], (res) => {
      resolve(res.cemigLastStatus || null);
    });
  });
}

function setCemigStatus(status) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ cemigLastStatus: status }, () => resolve());
  });
}

/* -----------------------------------------------------
   🔔 Eventos do Chrome
------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RainMonitor] onInstalled - criando alarm');
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  runAllChecks();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[RainMonitor] onStartup - garantindo alarm');
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[RainMonitor] Alarm fired — rodando checagem');
    runAllChecks();
  }
});

/**
 * Handler de mensagens vindas do popup:
 * - RUN_CHECK_NOW  → força checagem geral
 * - GET_STATION_HOURLY → busca dados estatísticos da estação
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'RUN_CHECK_NOW') {
    console.log('[RainMonitor] Checagem manual requisitada');
    runAllChecks()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg?.type === 'GET_STATION_HOURLY') {
    const stationId = msg.stationId;
    console.log('[RainMonitor] GET_STATION_HOURLY para estação:', stationId);

    fetchStationHourly(stationId)
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.error('[RainMonitor] Erro em GET_STATION_HOURLY:', err);
        sendResponse({ ok: false, error: String(err) });
      });

    return true; // resposta assíncrona
  }
});

/* -----------------------------------------------------
   🔍 Comparação de mudanças
------------------------------------------------------ */

function extractStationKeyList(status) {
  if (!status || !Array.isArray(status.rainingStations)) return [];
  return status.rainingStations.map((s) => String(s.id)).sort();
}

function hasRainingChanged(prevStatus, nextStatus) {
  const prevKeys = extractStationKeyList(prevStatus);
  const nextKeys = extractStationKeyList(nextStatus);

  if (prevKeys.length !== nextKeys.length) return true;
  for (let i = 0; i < prevKeys.length; i++) {
    if (prevKeys[i] !== nextKeys[i]) return true;
  }
  return false;
}

/* -----------------------------------------------------
   🧠 Função principal de checagem
------------------------------------------------------ */

async function runAllChecks() {
  const radiusKm = await getCemigRadiusKm();
  const prevStatus = await getCemigStatus();

  const allRaining = [];

  for (const source of DATA_SOURCES) {
    try {
      console.log(
        `[RainMonitor] Buscando dados da fonte: ${source.id} (raio atual: ${radiusKm} km)`
      );

      const headers = { Accept: 'application/json' };

      if (source.auth?.type === 'customHeader') {
        Object.assign(headers, source.auth.headers);
      }

      const response = await fetch(source.endpoint, {
        cache: 'no-cache',
        headers
      });

      console.log(
        `[RainMonitor] HTTP ${response.status} ${response.statusText} — URL final:`,
        response.url
      );

      if (!response.ok) {
        const text = await response.text();
        console.error(
          `[RainMonitor] Erro na resposta (${response.status}):`,
          text.slice(0, 500)
        );
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      let json;
      try {
        json = await response.json();
      } catch (e) {
        const txt = await response.text();
        console.error(
          '[RainMonitor] JSON inválido (trecho): ',
          txt.slice(0, 500)
        );
        throw e;
      }

      const stations = source.parser(json) || [];
      console.log(
        `[RainMonitor] Fonte ${source.id} retornou ${stations.length} estações`
      );

      const matches = await evaluateRulesForSource(source, stations, {
        cemigRadiusKm: radiusKm
      });

      for (const m of matches) {
        const raw = m.station.raw ?? {};
        const stationId = m.station.id;

        // URL da API da estação (estatística-hora) — UTILIZADA só como referência
        let stationApiUrl = null;
        if (stationId != null) {
          stationApiUrl =
            'https://instarain.com.br/InstaRainApi/v1/meteorologicas/' +
            encodeURIComponent(stationId) +
            '/estatistica-hora';
        }

        allRaining.push({
          id: m.station.id,
          stationId,
          name: m.station.name,
          distanceKm: m.distanceKm,
          clima: raw.Clima ?? null,
          chuvaDia: raw.ChuvaDia ?? null,
          tempo: raw.Tempo ?? null,
          city: raw.Cidade ?? raw.cidade ?? null,
          sourceId: source.id,
          sourceName: source.name,
          url: stationApiUrl
        });
      }
    } catch (error) {
      console.error(
        `[RainMonitor] Erro ao processar fonte ${source?.id ?? 'desconhecida'}:`,
        error,
        error?.stack
      );
    }
  }

  const isRaining = allRaining.length > 0;
  const nowIso = new Date().toISOString();

  const newStatus = {
    isRaining,
    checkedAt: nowIso,
    radiusKm,
    stationName: isRaining ? allRaining[0].name : null,
    distanceKm: isRaining ? allRaining[0].distanceKm : null,
    rainingStations: allRaining
  };

  const changed = hasRainingChanged(prevStatus, newStatus);

  await setCemigStatus(newStatus);

  if (changed) {
    if (isRaining) {
      const names = allRaining.map((s) => s.name).join(', ');
      const title = 'Atualização de chuva na área da Cemig';
      const message =
        allRaining.length === 1
          ? `1 estação com chuva dentro de ${radiusKm} km: ${names}.`
          : `${allRaining.length} estações com chuva dentro de ${radiusKm} km: ${names}.`;

      sendNotification({ title, message, data: newStatus });
    } else {
      const title = 'Chuva cessou na área da Cemig';
      const message = `Nenhuma estação está com chuva dentro de ${radiusKm} km.`;
      sendNotification({ title, message, data: newStatus });
    }
  }
}

/* -----------------------------------------------------
   🌧️ Consulta de estatística-hora de uma estação
------------------------------------------------------ */

async function fetchStationHourly(stationId) {
  if (stationId == null) {
    throw new Error('stationId inválido');
  }

  const url = `https://instarain.com.br/InstaRainApi/v1/meteorologicas/${encodeURIComponent(
    stationId
  )}/estatistica-hora`;

  const headers = {
    Accept: 'application/json',
    authorization: INSTARAIN_AUTH_TOKEN
  };

  const resp = await fetch(url, { headers });

  console.log(
    '[RainMonitor] fetchStationHourly resposta:',
    resp.status,
    resp.statusText,
    'urlFinal:',
    resp.url
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(
      '[RainMonitor] Erro da API estatistica-hora:',
      resp.status,
      text.slice(0, 500)
    );
    throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);
  }

  return resp.json();
}

/* -----------------------------------------------------
   🔔 Notificação do sistema
------------------------------------------------------ */

function sendNotification({ title, message, data }) {
  const notificationId =
    'rain-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  chrome.notifications.create(
    notificationId,
    {
      type: 'basic',
      iconUrl: 'icons/rain-128.png',
      title,
      message,
      priority: 2
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(
          '[RainMonitor] Erro ao criar notificação:',
          chrome.runtime.lastError
        );
      } else {
        console.log(
          '[RainMonitor] Notificação criada:',
          notificationId,
          data
        );
      }
    }
  );
}
